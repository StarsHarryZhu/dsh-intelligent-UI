/**
 * Room kept for what changes, so a widget's layout holds still.
 *
 * A widget redraws numbers, sentences, tables, and notes as the reader moves
 * its controls. Each time one of them grows or shrinks, everything after it
 * moves: a slider slides away from the pointer, a row wraps, the frame changes
 * height and the chat around it jumps. So once the widget has run, and before
 * the browser paints it, the runtime walks every control through the values it
 * can take — each slider from end to end, each choice, each box both ways, then
 * every slider at its ends together — measures every element that changed and
 * the elements around it, and puts the controls back. Each element whose size
 * varied keeps the largest size it reached, as an inline `min-width` (where its
 * content, not its container, sets its width) and `min-height`; a short inline
 * element becomes an inline block so that it can. The walk is synchronous, so
 * the reader never sees it.
 *
 * What the walk could not foresee — a combination of controls, typed text, a
 * click — may still grow an element once. After that it never shrinks: once the
 * reader has touched the widget, an element whose content changes is held at
 * the largest size it has shown before the browser paints. Changes before that
 * touch are the widget's own first render, such as a diagram drawn late, and
 * are left alone. When the frame's width
 * changes, the room is given back and measured again.
 * @module dsh-intelligent-ui/frame/reserve
 */

/** The largest and smallest box an element has shown, and whether its text ran onto a second line. */
interface Seen {
  maxWidth: number
  maxHeight: number
  minWidth: number
  minHeight: number
  wrapped: boolean
}

/** What the reserver needs from the runtime. */
export interface ReserveHooks {
  /** Run with the widget's kept values silenced, and put back as they were. */
  quietly(run: () => void): void
  /** Whether the reader is dragging a slider now; a new measure waits until the drag ends. */
  dragging(): boolean
}

/** The room keeper of one frame. */
export interface Reserver {
  /** Measure the widget through its controls' values, reserve, and keep watching. Called once the widget has run. */
  start(): void
}

/** Displays whose width their content sets. */
const CONTENT_WIDTH = new Set(['inline-block', 'inline-flex', 'inline-grid', 'inline-table', 'table-cell'])

/** Most elements measured. */
const MAX_ELEMENTS = 3000

/** Longest the walk through the controls may take, in milliseconds. */
const WALK_BUDGET_MS = 250

/** Values tried between a slider's ends. */
const RANGE_STEPS = 20

/** Most options or radio buttons tried in one control. */
const MAX_CHOICES = 30

/** Changes the walk follows: content, and the attributes that show, hide, or restyle. */
const WATCHED = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] }

/** One control and the values the walk gives it. */
interface Walk {
  element: HTMLInputElement | HTMLSelectElement
  /** Put each value in turn: the number of values, and how to set the n-th. */
  count: number
  set(index: number): void
  /** Its ends, for a slider or a bounded number. */
  ends?: { low(): void; high(): void }
  restore(): void
}

/**
 * Start keeping room in a frame.
 * @param win - the frame's window.
 * @param doc - its document.
 * @param hooks - what the runtime lends.
 * @returns the reserver.
 */
export function createReserver(win: Window & typeof globalThis, doc: Document, hooks: ReserveHooks): Reserver {
  let seen = new WeakMap<Element, Seen>()
  const saved = new Map<HTMLElement | SVGSVGElement, Map<string, [string, string]>>()
  let observer: MutationObserver | undefined
  let width = -1
  let queued = false
  // Changes before the reader first touches the widget are its own first render (a
  // diagram drawn late, a font loading), not values; nothing is held for them.
  let engaged = false
  let walking = false

  /** The box a changed node shows in: its element, or the outermost drawing it belongs to. */
  const boxOf = (node: Node | null): Element | null => {
    const element = node instanceof Element ? node : node?.parentElement ?? null
    if (element === null || doc.body === null || !doc.body.contains(element)) return null
    let drawing = element.closest('svg')
    while (drawing?.parentElement?.closest('svg')) drawing = drawing.parentElement.closest('svg')
    return drawing ?? element
  }

  /** Add an element and everything around it, up to the body. */
  const withAround = (element: Element | null, into: Set<Element>): void => {
    for (let current = element; current !== null && current !== doc.documentElement; current = current.parentElement) {
      if (into.has(current)) return
      into.add(current)
    }
  }

  const measure = (element: Element): void => {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    const wrapped = element.getClientRects().length > 1
    const before = seen.get(element)
    seen.set(element, before === undefined
      ? { maxWidth: rect.width, maxHeight: rect.height, minWidth: rect.width, minHeight: rect.height, wrapped }
      : {
        maxWidth: Math.max(before.maxWidth, rect.width),
        maxHeight: Math.max(before.maxHeight, rect.height),
        minWidth: Math.min(before.minWidth, rect.width),
        minHeight: Math.min(before.minHeight, rect.height),
        wrapped: before.wrapped || wrapped,
      })
  }

  const set = (element: HTMLElement | SVGSVGElement, name: string, value: string): void => {
    let kept = saved.get(element)
    if (kept === undefined) {
      kept = new Map()
      saved.set(element, kept)
    }
    if (!kept.has(name)) kept.set(name, [element.style.getPropertyValue(name), element.style.getPropertyPriority(name)])
    element.style.setProperty(name, value, 'important')
  }

  /** Whether an element's width follows its content rather than its container. */
  const sizedByContent = (element: Element, style: CSSStyleDeclaration): boolean => {
    if (style.display === 'inline' || CONTENT_WIDTH.has(style.display)) return true
    if (style.float !== 'none' || style.position === 'absolute' || style.position === 'fixed') return true
    const parent = element.parentElement
    if (parent === null) return false
    const around = win.getComputedStyle(parent)
    if (around.display.includes('grid')) return true
    // A row item that grows takes what the others leave, so holding the others holds it.
    if (around.display.includes('flex') && !around.flexDirection.startsWith('column')) return (Number.parseFloat(style.flexGrow) || 0) === 0
    return false
  }

  /** Padding and border outside the box `min-width` or `min-height` sets, under `content-box`. */
  const outside = (style: CSSStyleDeclaration, axis: 'x' | 'y'): number => {
    if (style.boxSizing !== 'content-box') return 0
    const sides = axis === 'x' ? ['Left', 'Right'] : ['Top', 'Bottom']
    let total = 0
    for (const side of sides) {
      total += Number.parseFloat(style.getPropertyValue(`padding-${side.toLowerCase()}`)) || 0
      total += Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0
    }
    return total
  }

  /**
   * Hold an element at the largest size it has shown.
   * @param always - also when it is at that size now, because the walk saw it vary.
   */
  const reserve = (element: Element, always: boolean): void => {
    if (!(element instanceof HTMLElement || element instanceof SVGSVGElement)) return
    // A slider is held by the drag code; resizing it would move its thumb.
    if (element instanceof HTMLInputElement && element.type === 'range') return
    const most = seen.get(element)
    if (most === undefined) return
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    const style = win.getComputedStyle(element)
    if (style.display === 'none' || style.display === 'contents' || style.display.startsWith('table-row') || style.display === 'table-column') return
    const varies = (low: number, high: number, now: number): boolean => high - (always ? low : now) > 0.5
    let inline = style.display === 'inline'
    if (varies(most.minWidth, most.maxWidth, rect.width) && sizedByContent(element, style)) {
      if (inline && !most.wrapped) {
        set(element, 'display', 'inline-block')
        inline = false
      }
      if (!inline) {
        const own = Number.parseFloat(style.minWidth) || 0
        set(element, 'min-width', `${Math.max(own, Math.ceil(most.maxWidth - outside(style, 'x')))}px`)
      }
    }
    if (!inline && varies(most.minHeight, most.maxHeight, rect.height)) {
      const own = Number.parseFloat(style.minHeight) || 0
      set(element, 'min-height', `${Math.max(own, Math.ceil(most.maxHeight - outside(style, 'y')))}px`)
    }
  }

  /** Give back every room kept, and forget every size seen. */
  const reset = (): void => {
    for (const [element, kept] of saved) {
      for (const [name, [value, priority]] of kept) {
        if (value === '') element.style.removeProperty(name)
        else element.style.setProperty(name, value, priority)
      }
    }
    saved.clear()
    seen = new WeakMap()
  }

  /** Measure every element once, so that a later change knows the size it came from. */
  const baseline = (): void => {
    if (doc.body === null) return
    measure(doc.body)
    let count = 0
    for (const element of Array.from(doc.body.querySelectorAll('*'))) {
      if (element.parentElement?.closest('svg') || element.closest('script, style, template')) continue
      measure(element)
      count += 1
      if (count >= MAX_ELEMENTS) break
    }
  }

  /** The elements a batch of changes touched, and those around them. */
  const touchedBy = (records: MutationRecord[], attributes: boolean): Set<Element> => {
    const touched = new Set<Element>()
    for (const record of records) {
      if (record.type === 'attributes' && !attributes) continue
      withAround(boxOf(record.target), touched)
      if (touched.size >= MAX_ELEMENTS) break
    }
    return touched
  }

  /** Walk every control through its values, measuring what changes, and put them back. */
  const walk = (): void => {
    if (observer === undefined || doc.body === null) return
    const walks = walksIn(doc)
    if (walks.length === 0) return
    const touched = new Set<Element>()
    const note = (): void => {
      for (const element of touchedBy(observer?.takeRecords() ?? [], true)) touched.add(element)
      for (const element of touched) measure(element)
    }
    const deadline = win.performance.now() + WALK_BUDGET_MS
    walking = true
    hooks.quietly(() => {
      note()
      outer: for (const each of walks) {
        for (let index = 0; index < each.count; index += 1) {
          if (win.performance.now() > deadline) break outer
          each.set(index)
          fire(each.element)
          note()
        }
        each.restore()
        fire(each.element)
      }
      const bounded = walks.filter(each => each.ends !== undefined)
      if (bounded.length > 1 && win.performance.now() <= deadline) {
        for (const end of ['high', 'low'] as const) {
          for (const each of bounded) {
            each.ends?.[end]()
            fire(each.element)
          }
          note()
        }
      }
      for (const each of walks) {
        each.restore()
        fire(each.element)
      }
      note()
    })
    walking = false
    for (const element of touched) reserve(element, true)
    observer.takeRecords()
  }

  /** A change the walk did not foresee: what shrank is held at the size it had. */
  const onChange = (records: MutationRecord[]): void => {
    if (!engaged) return
    for (const element of touchedBy(records, false)) {
      const before = seen.get(element)
      measure(element)
      if (before !== undefined) reserve(element, false)
    }
    observer?.takeRecords()
  }

  const measureAgain = (): void => {
    if (queued) return
    queued = true
    win.requestAnimationFrame(function again() {
      if (hooks.dragging()) {
        win.requestAnimationFrame(again)
        return
      }
      queued = false
      reset()
      baseline()
      walk()
    })
  }

  return {
    start(): void {
      if (doc.body === null || observer !== undefined) return
      width = doc.documentElement.clientWidth
      baseline()
      const watching = new win.MutationObserver(onChange)
      watching.observe(doc.body, WATCHED)
      observer = watching
      walk()
      // The reader's first touch: measure the widget as its first render left it.
      const first = (): void => {
        if (walking || engaged) return
        engaged = true
        seen = new WeakMap()
        baseline()
      }
      for (const type of ['pointerdown', 'keydown', 'input', 'change']) win.addEventListener(type, first, true)
      if (typeof win.ResizeObserver === 'function') {
        new win.ResizeObserver(() => {
          const now = doc.documentElement.clientWidth
          if (Math.abs(now - width) < 1) return
          width = now
          measureAgain()
        }).observe(doc.documentElement)
      }
    },
  }
}

/** Tell the widget a control changed, as the reader's input would. */
function fire(element: Element): void {
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

/** The controls a walk can take through their values: sliders, bounded numbers, choices, and boxes. */
function walksIn(doc: Document): Walk[] {
  const walks: Walk[] = []
  const radios = new Set<string>()
  for (const element of Array.from(doc.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))) {
    if (element.disabled) continue
    if (element instanceof HTMLSelectElement) {
      if (element.multiple || element.options.length < 2) continue
      const original = element.selectedIndex
      walks.push({ element, count: Math.min(element.options.length, MAX_CHOICES), set: (index) => { element.selectedIndex = index }, restore: () => { element.selectedIndex = original } })
      continue
    }
    const original = element.value
    if (element.type === 'range' || element.type === 'number') {
      const low = Number.parseFloat(element.min === '' && element.type === 'range' ? '0' : element.min)
      const high = Number.parseFloat(element.max === '' && element.type === 'range' ? '100' : element.max)
      if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) continue
      walks.push({
        element,
        count: RANGE_STEPS + 1,
        set: (index) => { element.value = String(low + (high - low) * index / RANGE_STEPS) },
        ends: { low: () => { element.value = String(low) }, high: () => { element.value = String(high) } },
        restore: () => { element.value = original },
      })
      continue
    }
    if (element.type === 'checkbox') {
      const checked = element.checked
      walks.push({ element, count: 1, set: () => { element.checked = !checked }, restore: () => { element.checked = checked } })
      continue
    }
    if (element.type === 'radio' && element.name !== '' && !radios.has(element.name)) {
      radios.add(element.name)
      const group = Array.from(doc.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(element.name)}"]`)).filter(radio => !radio.disabled).slice(0, MAX_CHOICES)
      const chosen = group.find(radio => radio.checked)
      let target: HTMLInputElement = element
      walks.push({
        get element() { return target },
        count: group.length,
        set: (index) => {
          target = group[index] ?? element
          target.checked = true
        },
        restore: () => {
          for (const radio of group) radio.checked = radio === chosen
          target = chosen ?? element
        },
      })
    }
  }
  return walks
}
