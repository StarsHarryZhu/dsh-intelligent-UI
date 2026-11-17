/**
 * The runtime inside a widget frame.
 *
 * The page writes the frame's document with this script in its head, then
 * sends it messages: the theme, the widget's source as it streams, the shipped
 * libraries the widget names, and its saved values. While the source streams,
 * the runtime brings the body in line with each prefix without running any of
 * its scripts, so the widget appears as it is written and does not flicker.
 * Once the whole widget has arrived and been checked, it restores the saved
 * values and runs the scripts in document order, the way a page load would,
 * then fires `DOMContentLoaded` and `load`.
 *
 * It also gives the widget its helpers — `sendPrompt`, `openLink`, `dsh.state`,
 * `dsh.math` — and reports the frame's height and the widget's errors. It runs
 * in the same frame as the widget's code, so it guards nothing from that code:
 * the page checks every message it receives.
 * @module dsh-intelligent-ui/frame/runtime
 */

import { LIMITS } from '../widget/policy.ts'
import { CHANNEL, type FromFrame, type Json, type ShippedText, type Unmarked } from '../widget/messages.ts'
import { scriptBlocks } from '../widget/scan.ts'
import * as math from './math.ts'

/** A message to the page, without its channel mark. */
type Outgoing = Unmarked<FromFrame>

/** The frame's window, as the runtime uses it. */
type FrameWindow = Window & typeof globalThis & Record<string, unknown>

/** Most errors one widget reports. */
const MAX_ERRORS = 5

/** Elements whose value the frame keeps by id. */
function isControl(element: unknown): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
}

/** Input types whose values are never kept. */
const UNKEPT_TYPES = new Set(['password', 'file', 'hidden', 'submit', 'button', 'reset', 'image'])

/** The runtime of one frame. */
export interface Runtime {
  /** Handle one message from the page. */
  receive(data: unknown): void
}

/**
 * Start the runtime in a frame.
 * @param win - the frame's window.
 * @returns the runtime, already listening for the page's messages.
 */
export function boot(win: FrameWindow): Runtime {
  const doc = win.document
  const parent = win.parent
  const post = (message: Outgoing): void => {
    try {
      parent.postMessage({ channel: CHANNEL, ...message }, '*')
    } catch {
      // A page that went away receives nothing.
    }
  }
  let saved: Json | undefined
  let controls: Record<string, Json> = {}
  let ran = false
  let activating = false
  let html = ''
  let errors = 0
  let current = 0
  let scriptLines: number[] = []
  const blobs = new Map<string, string>()
  const aliases = new Map<string, string>()
  const kinds = new Map<string, ShippedText['kind']>()

  const remap = (url: string): string => blobs.get(url.trim()) ?? url

  const report = (message: string): void => {
    if (errors >= MAX_ERRORS) return
    errors += 1
    post({ t: 'error', message: message.slice(0, LIMITS.maxErrorChars) })
  }

  // --- helpers the widget calls ------------------------------------------
  win.sendPrompt = (text: unknown): void => { post({ t: 'send', text: String(text ?? '') }) }
  win.openLink = (url: unknown): void => { post({ t: 'open', url: String(url ?? '') }) }
  const state = {
    get: (): Json | undefined => (saved === undefined ? undefined : JSON.parse(JSON.stringify(saved)) as Json),
    set: (value: unknown): boolean => {
      let text: string | undefined
      try {
        text = JSON.stringify(value)
      } catch {
        text = undefined
      }
      if (text === undefined || text.length > LIMITS.maxStateChars) {
        report(`dsh.state.set: the value must be JSON of at most ${LIMITS.maxStateChars} characters`)
        return false
      }
      saved = JSON.parse(text) as Json
      post({ t: 'state', value: saved })
      return true
    },
  }
  win.dsh = {
    state,
    math: {
      integrate: (f: (x: number) => number, a: number, b: number) => math.integrate(f, a, b),
      derivative: (f: (x: number) => number, x: number, order?: number) => math.differentiate(f, x, order === 2 ? 2 : 1),
      limit: (f: (x: number) => number, x: number, side?: number) => math.limit(f, x, side === -1 ? -1 : side === 1 ? 1 : 0),
      root: (f: (x: number) => number, lo: number, hi: number) => math.findRoot(f, lo, hi),
      gamma: math.gamma,
      erf: math.erf,
      factorial: math.factorial,
      binomial: math.binomial,
    },
    theme: 'light',
  }

  // --- shipped libraries stand in for their code-host addresses ----------
  patchAddresses(win, remap)

  // --- errors -------------------------------------------------------------
  win.addEventListener('error', (event: Event) => {
    // While the widget streams in, a stylesheet or an image may fail on its way
    // to a shipped copy; only what fails once it runs is the widget's error.
    if (!activating) return
    if (event instanceof ErrorEvent) {
      const start = current > 0 ? scriptLines[current - 1] : undefined
      const where = start !== undefined && event.lineno > 0 ? ` (line ${start + event.lineno - 1})` : event.lineno > 0 ? ` (line ${event.lineno} of a script)` : ''
      report(`${event.message}${where}`)
      return
    }
    const target = event.target
    if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement || target instanceof HTMLImageElement) {
      const address = target instanceof HTMLLinkElement ? target.href : target.src
      report(`Could not load ${address.startsWith('blob:') ? 'a shipped library' : address}`)
    }
  }, true)
  win.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason as { message?: unknown } | undefined
    report(`Unhandled promise rejection: ${String(reason?.message ?? reason)}`)
  })

  // --- links, prompts, forms, and kept controls ---------------------------
  win.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    const link = target?.closest('a[href]')
    if (link instanceof HTMLAnchorElement) {
      const href = link.getAttribute('href') ?? ''
      if (href.startsWith('#')) return
      event.preventDefault()
      if (/^https?:/iu.test(link.href)) post({ t: 'open', url: link.href })
      return
    }
    const sender = target?.closest('[data-prompt]')
    if (sender !== null && sender !== undefined && !(sender instanceof HTMLFormElement)) {
      const text = sender.getAttribute('data-prompt') ?? ''
      if (text.trim() !== '') post({ t: 'send', text: text.trim() })
    }
  }, true)
  doc.addEventListener('submit', (event) => {
    const form = event.target
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-send')) return
    event.preventDefault()
    const text = formMessage(form)
    if (text !== '') post({ t: 'send', text })
  }, true)
  let controlsQueued = false
  const keep = (event: Event): void => {
    const element = event.target
    if (!isControl(element) || element.id === '' || !keepable(element)) return
    const value = controlValue(element)
    if (value === undefined) return
    if (element instanceof HTMLInputElement && element.type === 'radio') {
      // A radio group is kept as each button's own checked state.
      for (const other of doc.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(element.name)}"]`)) {
        if (other.id !== '' && other !== element) controls[other.id] = other.checked
      }
    }
    controls[element.id] = value
    if (controlsQueued) return
    controlsQueued = true
    win.requestAnimationFrame(() => {
      controlsQueued = false
      if (JSON.stringify(controls).length <= LIMITS.maxControlsChars) post({ t: 'controls', value: { ...controls } })
    })
  }
  doc.addEventListener('input', keep, true)
  doc.addEventListener('change', keep, true)

  // --- height -------------------------------------------------------------
  let heightQueued = false
  let lastHeight = -1
  const measure = (): void => {
    heightQueued = false
    const body = doc.body
    if (body === null) return
    const height = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height))
    if (height === lastHeight) return
    lastHeight = height
    post({ t: 'height', h: height })
  }
  const scheduleHeight = (): void => {
    if (heightQueued) return
    heightQueued = true
    win.requestAnimationFrame(measure)
  }
  let observed = false
  const observe = (): void => {
    if (observed || doc.body === null) return
    observed = true
    if (typeof win.ResizeObserver === 'function') new win.ResizeObserver(scheduleHeight).observe(doc.body)
  }

  // --- the widget itself ----------------------------------------------------
  const restore = (): void => {
    for (const [id, value] of Object.entries(controls)) {
      const element = doc.getElementById(id)
      if (!isControl(element) || !keepable(element)) continue
      setControl(element, value)
    }
  }
  const replay = (): void => {
    for (const id of Object.keys(controls)) {
      const element = doc.getElementById(id)
      if (!isControl(element) || !keepable(element)) continue
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }
  const activate = async (): Promise<void> => {
    activating = true
    restore()
    setReadyState(doc, 'loading')
    installImportMap(doc, remap, blobs, kinds, aliases)
    scriptLines = scriptBlocks(html).map(block => block.line)
    const scripts = Array.from(doc.body.querySelectorAll('script'))
    for (const [index, old] of scripts.entries()) {
      if (old.getAttribute('type')?.trim().toLowerCase() === 'importmap') {
        old.remove()
        continue
      }
      const fresh = doc.createElement('script')
      for (const attr of Array.from(old.attributes)) fresh.setAttribute(attr.name, attr.value)
      fresh.text = old.text
      current = index + 1
      // A script made by code runs as soon as it loads unless told otherwise; one
      // written without async runs in order, as the parser would have run it.
      const written = !old.hasAttribute('async')
      if (written) fresh.async = false
      const external = fresh.hasAttribute('src') && written && fresh.type.trim().toLowerCase() !== 'module'
      if (external) {
        await new Promise<void>((resolve) => {
          fresh.addEventListener('load', () => { resolve() })
          fresh.addEventListener('error', () => { resolve() })
          old.replaceWith(fresh)
        })
      } else {
        old.replaceWith(fresh)
      }
      current = 0
    }
    setReadyState(doc, 'interactive')
    doc.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }))
    setReadyState(doc, 'complete')
    win.dispatchEvent(new Event('load'))
    replay()
    post({ t: 'ran' })
    scheduleHeight()
  }

  const receive = (data: unknown): void => {
    if (typeof data !== 'object' || data === null || (data as { channel?: unknown }).channel !== CHANNEL) return
    const message = data as Record<string, unknown>
    if (message.t === 'theme') {
      applyTheme(doc, message.vars, message.dark === true, typeof message.lang === 'string' ? message.lang : '')
      ;(win.dsh as { theme: string }).theme = message.dark === true ? 'dark' : 'light'
      win.dispatchEvent(new CustomEvent('dsh:theme', { detail: { dark: message.dark === true } }))
      scheduleHeight()
      return
    }
    if (message.t === 'libs' && Array.isArray(message.files)) {
      for (const file of message.files as ShippedText[]) addShipped(win, file, blobs, kinds, aliases)
      for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[href]'))) {
        const mapped = blobs.get(link.getAttribute('href')?.trim() ?? '')
        if (mapped !== undefined) link.setAttribute('href', mapped)
      }
      return
    }
    if (message.t !== 'render' || typeof message.html !== 'string') return
    if (message.state !== undefined) saved = message.state as Json
    if (typeof message.controls === 'object' && message.controls !== null) controls = { ...(message.controls as Record<string, Json>) }
    if (ran || doc.body === null) return
    observe()
    if (message.html !== html || message.final === true) {
      html = message.html
      morph(doc, doc.body, html, remap, message.final !== true)
    }
    if (message.final === true) {
      ran = true
      void activate()
    }
    scheduleHeight()
  }
  win.addEventListener('message', (event) => {
    if (event.source !== parent) return
    receive(event.data)
  })
  return { receive }
}

/** Whether a control's value is kept: it has an id, a kept type, and no `data-keep="false"` on it or around it. */
function keepable(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  if (element instanceof HTMLInputElement && UNKEPT_TYPES.has(element.type)) return false
  return element.closest('[data-keep="false"]') === null
}

/** A control's value as JSON. */
function controlValue(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): Json | undefined {
  if (element instanceof HTMLInputElement) {
    if (UNKEPT_TYPES.has(element.type)) return undefined
    return element.type === 'checkbox' || element.type === 'radio' ? element.checked : element.value
  }
  if (element instanceof HTMLSelectElement && element.multiple) return Array.from(element.selectedOptions).map(option => option.value)
  return element.value
}

/** Set a control from a kept value of the matching shape. */
function setControl(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: Json): void {
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    if (typeof value === 'boolean') element.checked = value
    return
  }
  if (element instanceof HTMLSelectElement && element.multiple) {
    if (!Array.isArray(value)) return
    for (const option of Array.from(element.options)) option.selected = value.includes(option.value)
    return
  }
  if (typeof value === 'string') element.value = value
}

/** Override `document.readyState` while the scripts run, so code that waits for the page to load still runs. */
function setReadyState(doc: Document, state: DocumentReadyState): void {
  try {
    Object.defineProperty(doc, 'readyState', { configurable: true, get: () => state })
  } catch {
    // A document that refuses the override keeps its own value.
  }
}

/**
 * Make `script.src`, `link.href`, and their `setAttribute` forms load a
 * shipped copy when one stands in for the address, including for elements the
 * widget's own code creates.
 */
function patchAddresses(win: FrameWindow, remap: (url: string) => string): void {
  const patch = (prototype: object, property: string): void => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property)
    if (descriptor?.set === undefined || descriptor.get === undefined) return
    const { get, set } = descriptor
    Object.defineProperty(prototype, property, {
      configurable: true,
      enumerable: descriptor.enumerable ?? true,
      get() { return get.call(this) as unknown },
      set(value: unknown) { set.call(this, remap(String(value))) },
    })
  }
  patch(win.HTMLScriptElement.prototype, 'src')
  patch(win.HTMLLinkElement.prototype, 'href')
  const setAttribute = win.Element.prototype.setAttribute
  win.Element.prototype.setAttribute = function (this: Element, name: string, value: string): void {
    const lower = name.toLowerCase()
    const mapped = (lower === 'src' && this instanceof win.HTMLScriptElement) || (lower === 'href' && this instanceof win.HTMLLinkElement)
      ? remap(String(value))
      : value
    setAttribute.call(this, name, mapped)
  }
}

/** Load one shipped file as a `blob:` address. */
function addShipped(win: FrameWindow, file: ShippedText, blobs: Map<string, string>, kinds: Map<string, ShippedText['kind']>, aliases: Map<string, string>): void {
  if (typeof file?.url !== 'string' || typeof file.text !== 'string' || blobs.has(file.url)) return
  if (typeof win.URL.createObjectURL !== 'function') return
  const type = file.kind === 'style' ? 'text/css' : 'text/javascript'
  const address = win.URL.createObjectURL(new Blob([file.text], { type }))
  blobs.set(file.url, address)
  kinds.set(file.url, file.kind)
  for (const alias of Array.isArray(file.aliases) ? file.aliases : []) {
    if (typeof alias === 'string' && alias !== '') aliases.set(alias, address)
  }
}

/**
 * Write one import map before any module runs: the widget's own maps, merged,
 * with shipped copies standing in for their addresses, plus every shipped
 * module under its address and its bare names.
 */
function installImportMap(doc: Document, remap: (url: string) => string, blobs: ReadonlyMap<string, string>, kinds: ReadonlyMap<string, ShippedText['kind']>, aliases: ReadonlyMap<string, string>): void {
  const imports: Record<string, string> = {}
  const scopes: Record<string, Record<string, string>> = {}
  for (const script of Array.from(doc.querySelectorAll('script[type="importmap" i]'))) {
    try {
      const map = JSON.parse(script.textContent ?? '{}') as { imports?: Record<string, unknown>; scopes?: Record<string, Record<string, unknown>> }
      for (const [name, address] of Object.entries(map.imports ?? {})) imports[name] = remap(String(address))
      for (const [scope, entries] of Object.entries(map.scopes ?? {})) {
        scopes[scope] = Object.fromEntries(Object.entries(entries ?? {}).map(([name, address]) => [name, remap(String(address))]))
      }
    } catch {
      // A map that is not JSON was reported by the host's check; the browser would ignore it too.
    }
  }
  for (const [address, blob] of blobs) if (kinds.get(address) === 'module') imports[address] ??= blob
  // A name mapped under a prefix, such as `three/addons/`, resolves to an
  // address the map never names whole; give each shipped module under that
  // prefix's address an exact entry, which wins over the prefix.
  const prefixes = Object.entries(imports).filter(([name, address]) => name.endsWith('/') && address.endsWith('/'))
  for (const [address, blob] of blobs) {
    if (kinds.get(address) !== 'module') continue
    for (const [name, base] of prefixes) if (address.startsWith(base)) imports[name + address.slice(base.length)] ??= blob
  }
  for (const [alias, blob] of aliases) imports[alias] ??= blob
  if (Object.keys(imports).length === 0 && Object.keys(scopes).length === 0) return
  const map = doc.createElement('script')
  map.type = 'importmap'
  map.textContent = JSON.stringify(Object.keys(scopes).length === 0 ? { imports } : { imports, scopes })
  doc.head.appendChild(map)
}

/** Write the theme variables, the colour scheme, and the language onto the frame's root. */
function applyTheme(doc: Document, vars: unknown, dark: boolean, lang: string): void {
  const entries = typeof vars === 'object' && vars !== null ? Object.entries(vars as Record<string, unknown>) : []
  const declarations = entries
    .filter(([name, value]) => /^--[\w-]+$/u.test(name) && typeof value === 'string' && !/[;{}<>]/u.test(value))
    .map(([name, value]) => `${name}:${value as string}`)
    .join(';')
  let style = doc.getElementById('dsh-theme')
  if (style === null) {
    style = doc.createElement('style')
    style.id = 'dsh-theme'
    doc.head.prepend(style)
  }
  style.textContent = `:root{${declarations}}`
  doc.documentElement.dataset.theme = dark ? 'dark' : 'light'
  doc.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  if (/^[A-Za-z]{2,3}(?:-[\w]{2,8})*$/u.test(lang)) doc.documentElement.lang = lang
}

/**
 * Bring a container's content in line with an HTML fragment, keeping every
 * node that is still the same kind in the same place. Scripts parsed this way
 * never run; links to shipped stylesheets load the shipped copy.
 */
export function morph(doc: Document, target: Element, html: string, remap: (url: string) => string = url => url, inert = false): void {
  const template = doc.createElement('template')
  template.innerHTML = html
  if (inert) {
    // Nothing of the widget runs before it has arrived whole, not even an
    // image's onload: event handler attributes wait for the final render.
    for (const element of Array.from(template.content.querySelectorAll('*'))) {
      for (const attr of Array.from(element.attributes)) if (/^on/iu.test(attr.name)) element.removeAttribute(attr.name)
    }
  }
  for (const link of Array.from(template.content.querySelectorAll('link[href]'))) {
    const href = link.getAttribute('href') ?? ''
    const mapped = remap(href.trim())
    if (mapped !== href) link.setAttribute('href', mapped)
  }
  syncChildren(target, template.content)
}

/** Make `target`'s children match `source`'s, moving new nodes out of `source`. */
function syncChildren(target: ParentNode & Node, source: ParentNode & Node): void {
  const wanted = Array.from(source.childNodes)
  for (const [index, node] of wanted.entries()) {
    const have = target.childNodes[index]
    if (have === undefined) target.appendChild(node)
    else if (have.nodeType === node.nodeType && have.nodeName === node.nodeName && !(have instanceof HTMLTemplateElement)) update(have, node)
    else target.replaceChild(node, have)
  }
  while (target.childNodes.length > wanted.length) target.lastChild?.remove()
}

/** Update one node in place from its counterpart. */
function update(have: Node, want: Node): void {
  if (have.nodeType !== Node.ELEMENT_NODE) {
    if (have.nodeValue !== want.nodeValue) have.nodeValue = want.nodeValue
    return
  }
  const element = have as Element
  const next = want as Element
  for (const attr of Array.from(element.attributes)) {
    if (!next.hasAttributeNS(attr.namespaceURI, attr.localName)) element.removeAttributeNS(attr.namespaceURI, attr.localName)
  }
  for (const attr of Array.from(next.attributes)) {
    if (element.getAttributeNS(attr.namespaceURI, attr.localName) !== attr.value) element.setAttributeNS(attr.namespaceURI, attr.name, attr.value)
  }
  syncChildren(element, next)
}

/**
 * The message a `<form data-send>` sends: its `data-send` text, then each
 * answered field as `Label: value`, joined with a middle dot. Fields are read
 * in document order, one entry per name; a password is never sent.
 */
export function formMessage(form: HTMLFormElement): string {
  const lead = (form.getAttribute('data-send') ?? '').trim()
  const answers = new Map<string, string[]>()
  for (const element of Array.from(form.elements)) {
    const field = element as HTMLInputElement
    if (typeof field.name !== 'string' || field.name === '' || field.matches(':disabled')) continue
    const values = fieldValues(field)
    if (values.length === 0) continue
    answers.set(field.name, [...(answers.get(field.name) ?? []), ...values])
  }
  const parts = Array.from(answers, ([name, values]) => `${fieldLabel(form, name)}: ${values.join(', ')}`)
  return [lead, parts.join(' · ')].filter(part => part !== '').join(' — ').slice(0, LIMITS.maxPromptChars)
}

/** Input types that carry no answer, or one that must not be sent. */
const UNSENT_TYPES = new Set(['submit', 'button', 'reset', 'image', 'file', 'password'])

/** What one field answers: nothing, one value, or each chosen option. */
function fieldValues(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string[] {
  if (field instanceof HTMLInputElement) {
    if (UNSENT_TYPES.has(field.type)) return []
    if (field.type === 'checkbox' || field.type === 'radio') {
      if (!field.checked) return []
      // A choice reads as its written value, or as its label when it has none.
      const written = field.hasAttribute('value') ? field.value.trim() : ''
      return [written !== '' ? written : labelText(field) || 'yes']
    }
  } else if (field instanceof HTMLSelectElement) {
    return Array.from(field.selectedOptions)
      .map(option => (option.hasAttribute('value') ? option.value : option.text).trim())
      .filter(value => value !== '')
  } else if (!(field instanceof HTMLTextAreaElement)) {
    return []
  }
  const value = field.value.trim()
  return value === '' ? [] : [value]
}

/** The label of one named field: `data-label`, its group's legend, its own label, or its name. */
function fieldLabel(form: HTMLFormElement, name: string): string {
  const field = Array.from(form.elements).find(element => (element as HTMLInputElement).name === name) as HTMLInputElement | undefined
  const explicit = field?.getAttribute('data-label') ?? field?.closest('[data-label]')?.getAttribute('data-label')
  if (explicit !== null && explicit !== undefined && explicit.trim() !== '') return explicit.trim()
  const grouped = field !== undefined && (field.type === 'radio' || field.type === 'checkbox')
  const legend = grouped ? field.closest('fieldset')?.querySelector('legend')?.textContent : undefined
  if (legend !== undefined && legend !== null && legend.trim() !== '') return legend.trim()
  const label = !grouped ? labelText(field) : ''
  if (label !== '') return label
  const spaced = name.replace(/[_-]+/gu, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** The text of a field's label, without the text of the controls inside it. */
function labelText(field: HTMLInputElement | undefined): string {
  const label = field?.labels?.[0]
  if (label === undefined) return ''
  const copy = label.cloneNode(true) as HTMLElement
  for (const inner of Array.from(copy.querySelectorAll('input, select, textarea, button'))) inner.remove()
  return (copy.textContent ?? '').replace(/\s+/gu, ' ').trim()
}
