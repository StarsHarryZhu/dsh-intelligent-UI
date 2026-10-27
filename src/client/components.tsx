/**
 * One fixed renderer per catalog component.
 *
 * Every component is reached through {@link REGISTRY} by its exact catalog name.
 * The card never creates an element from a model-supplied name, so an unknown
 * type renders nothing at all — the allowlist is the registry itself, not a
 * check that could be forgotten. Styling is class names under `dsh-iui-` whose
 * rules use the host's theme tokens only; the only inline styles are spacing
 * steps and grid tracks computed from validated whole numbers.
 * @module dsh-intelligent-ui/client/components
 */

import { Fragment, isValidElement, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { SIZES, TONES } from '../lang/catalog.ts'
import { isDataImage } from '../lang/compile.ts'
import { evalExpr, formatNumber } from '../lang/expr.ts'
import { MAX_SPACE } from '../lang/limits.ts'
import { formatSignificant } from '../lang/math.ts'
import type { JsonValue } from '../lang/types.ts'
import { ChartFigure } from './chart.tsx'
import { CodeFigure } from './code.tsx'
import { DiagramFigure } from './diagram.tsx'
import { renderFormula } from './formula.tsx'
import type { CopyKey } from './locales.ts'
import { currentIndex, currentMark, flag, Glyph, list, mono } from './parts.tsx'
import { PlotFigure } from './plot.tsx'
import { TableFigure } from './table.tsx'
import type { NodeRow, Program, StateRow } from './program.ts'

/** Everything a renderer needs to draw one node. */
export interface RenderScope {
  program: Program
  /** Current state and derived values. */
  values: ReadonlyMap<string, JsonValue>
  /** Change one bound state value. */
  setValue(key: string, value: JsonValue): void
  /** What the reader set on one component itself, such as its open tab; shared by both copies of the card. */
  ui(id: string): JsonValue | undefined
  /** Remember what the reader set on one component. */
  setUi(id: string, value: JsonValue): void
  /** Resolve a hoisted text value. */
  text(value: unknown): string
  /** Resolve a number or a numeric expression. */
  number(value: unknown): number | undefined
  /** A button was pressed. */
  press(node: NodeRow, prompt: string): void
  /** Id of the button whose prompt was sent from this card. */
  sent: string | undefined
  /** Copy for the chrome. */
  tr(key: CopyKey, params?: Record<string, unknown>): string
  /** Title for the first root card when the program gave it none. */
  fallbackTitle: string | undefined
  /** Id of the first root, which may take {@link fallbackTitle}. */
  firstRoot: string | undefined
}

/** One renderer: children already built. */
type Renderer = (node: NodeRow, children: ReactNode[], scope: RenderScope) => ReactNode

/**
 * Render the children of one parent, in declaration order.
 * @param parent - parent id, or null for the roots.
 * @param scope - values and helpers.
 * @returns one keyed element per renderable child.
 */
export function renderChildren(parent: string | null, scope: RenderScope, depth = 0): ReactNode[] {
  if (depth > MAX_RENDER_DEPTH) return []
  const out: ReactNode[] = []
  for (const id of scope.program.children.get(parent) ?? []) {
    const node = scope.program.byId.get(id)
    if (node === undefined) continue
    const element = renderNode(node, scope, depth)
    if (element !== null) out.push(<Fragment key={id}>{element}</Fragment>)
  }
  return out
}

/** Deepest tree the renderer walks; the compiler already bounds depth far below this. */
const MAX_RENDER_DEPTH = 16

/**
 * Render one node and its subtree through the allowlist.
 * @param node - the node to draw.
 * @param scope - values and helpers.
 * @param depth - current depth, bounding a malformed persisted tree.
 * @returns the element, or null for a type this build does not know.
 */
export function renderNode(node: NodeRow, scope: RenderScope, depth = 0): ReactNode {
  const renderer = Object.hasOwn(REGISTRY, node.type) ? REGISTRY[node.type] : undefined
  if (renderer === undefined) return null
  return renderer(node, renderChildren(node.id, scope, depth + 1), scope)
}

/**
 * Count the components this build cannot draw, so the card can say so.
 * @param program - the prepared program.
 * @returns how many nodes have no renderer.
 */
export function unrenderable(program: Program): number {
  return program.nodes.filter(node => !Object.hasOwn(REGISTRY, node.type)).length
}

/** The renderer allowlist, keyed by catalog type. */
export const REGISTRY: Readonly<Record<string, Renderer>> = {
  card: (node, children, scope) => {
    // The call's own title heads the first card only when the program brings no
    // heading of its own, so a card never shows two titles one above the other.
    const firstChild = scope.program.byId.get(scope.program.children.get(node.id)?.[0] ?? '')
    const title = node.props.title !== undefined
      ? scope.text(node.props.title)
      : node.id === scope.firstRoot && firstChild?.type !== 'title' ? scope.fallbackTitle : undefined
    return (
      <div className="dsh-iui-card" data-tone={tone(node)} style={{ padding: space(node, 'padding', 3), gap: space(node, 'gap', 2) }}>
        {title === undefined || title === '' ? null : <div className="dsh-iui-card-title">{title}</div>}
        {children}
      </div>
    )
  },
  col: (node, children) => <div className="dsh-iui-col" style={{ gap: space(node, 'gap', 2) }}>{children}</div>,
  tabs: (node, children, scope) => <Tabs node={node} pages={children} scope={scope} />,
  tab: (node, children, scope) => {
    const parent = node.parent === null ? undefined : scope.program.byId.get(node.parent)
    // Inside tabs the switch shows the title; anywhere else the page heads itself.
    return (
      <div className="dsh-iui-col" style={{ gap: space(node, 'gap', 2) }}>
        {parent?.type === 'tabs' ? null : <div className="dsh-iui-tab-title">{scope.text(node.props.title)}</div>}
        {children}
      </div>
    )
  },
  row: (node, children) => (
    <div className="dsh-iui-row" data-align={stringProp(node, 'align')} style={{ gap: space(node, 'gap', 2) }}>
      {children.map((child, index) => <div className="dsh-iui-cell" key={index}>{child}</div>)}
    </div>
  ),
  grid: (node, children) => {
    const columns = Math.max(1, Math.min(4, Math.round(typeof node.props.columns === 'number' ? node.props.columns : 2)))
    return (
      <div className="dsh-iui-grid" style={{ gap: space(node, 'gap', 2), gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {children}
      </div>
    )
  },
  title: (node, _children, scope) => <div className="dsh-iui-title" data-size={size(node) ?? 'lg'}>{scope.text(node.props.text)}</div>,
  text: (node, _children, scope) => <p className="dsh-iui-text" data-tone={tone(node)} data-size={size(node)}>{scope.text(node.props.text)}</p>,
  metric: (node, _children, scope) => {
    const value = scope.number(node.props.value)
    const unit = stringProp(node, 'unit')
    const digits = numberProp(node, 'digits')
    return (
      <div className="dsh-iui-metric" data-tone={tone(node)}>
        <div className="dsh-iui-metric-label">{scope.text(node.props.label)}</div>
        <div className="dsh-iui-metric-value">
          {value === undefined ? '—' : digits === undefined ? formatNumber(value) : formatSignificant(value, digits)}
          {unit === undefined ? null : <span className="dsh-iui-metric-unit">{unit}</span>}
        </div>
      </div>
    )
  },
  progress: (node, _children, scope) => {
    const value = scope.number(node.props.value) ?? 0
    const max = node.props.max === undefined ? 100 : scope.number(node.props.max) ?? 100
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
    return (
      <div className="dsh-iui-progress" data-tone={tone(node)}>
        <div className="dsh-iui-progress-head">
          <span>{scope.text(node.props.label)}</span>
          <span className="dsh-iui-num">{`${formatNumber(value)} / ${formatNumber(max)}`}</span>
        </div>
        <div className="dsh-iui-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
          <div className="dsh-iui-progress-fill" style={{ width: `${(ratio * 100).toFixed(2)}%` }} />
        </div>
      </div>
    )
  },
  slider: (node, _children, scope) => {
    const key = node.bind ?? ''
    const row = declaration(scope.program, key)
    const min = numberProp(node, 'min') ?? row?.min ?? 0
    const max = numberProp(node, 'max') ?? row?.max ?? 100
    const step = numberProp(node, 'step') ?? row?.step ?? 1
    const current = scope.values.get(key)
    const value = typeof current === 'number' ? current : min
    const unit = stringProp(node, 'unit')
    const label = scope.text(node.props.label)
    return (
      <label className="dsh-iui-field">
        <span className="dsh-iui-field-head">
          <span>{label}</span>
          <span className="dsh-iui-field-value">{`${formatNumber(value)}${unit === undefined ? '' : ` ${unit}`}`}</span>
        </span>
        <input
          className="dsh-iui-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(event) => { scope.setValue(key, Number(event.currentTarget.value)) }}
        />
      </label>
    )
  },
  numberInput: (node, _children, scope) => {
    const key = node.bind ?? ''
    const row = declaration(scope.program, key)
    const current = scope.values.get(key)
    return (
      <NumberField
        label={scope.text(node.props.label)}
        value={typeof current === 'number' ? current : 0}
        min={numberProp(node, 'min') ?? row?.min}
        max={numberProp(node, 'max') ?? row?.max}
        step={numberProp(node, 'step') ?? row?.step}
        unit={stringProp(node, 'unit')}
        onCommit={(value) => { scope.setValue(key, value) }}
      />
    )
  },
  textInput: (node, _children, scope) => {
    const key = node.bind ?? ''
    const current = scope.values.get(key)
    return (
      <label className="dsh-iui-field">
        <span className="dsh-iui-field-head"><span>{scope.text(node.props.label)}</span></span>
        <input
          className="dsh-iui-input"
          type="text"
          value={typeof current === 'string' ? current : ''}
          placeholder={stringProp(node, 'placeholder') ?? ''}
          maxLength={2000}
          onChange={(event) => { scope.setValue(key, event.currentTarget.value) }}
        />
      </label>
    )
  },
  select: (node, _children, scope) => {
    const key = node.bind ?? ''
    const row = declaration(scope.program, key)
    const labels = Array.isArray(node.props.options) ? (node.props.options as unknown[]).map(option => scope.text(option)) : []
    const values = row?.options ?? labels
    const current = scope.values.get(key)
    return (
      <label className="dsh-iui-field">
        <span className="dsh-iui-field-head"><span>{scope.text(node.props.label)}</span></span>
        <select
          className="dsh-iui-select"
          value={typeof current === 'string' ? current : ''}
          onChange={(event) => { scope.setValue(key, event.currentTarget.value) }}
        >
          {values.map((value, index) => (
            <option key={`${index}:${value}`} value={value}>{labels.length === values.length ? labels[index] : value}</option>
          ))}
        </select>
      </label>
    )
  },
  checkbox: (node, _children, scope) => {
    const key = node.bind ?? ''
    return (
      <label className="dsh-iui-check">
        <input
          type="checkbox"
          checked={scope.values.get(key) === true}
          onChange={(event) => { scope.setValue(key, event.currentTarget.checked) }}
        />
        <span>{scope.text(node.props.label)}</span>
      </label>
    )
  },
  player: (node, _children, scope) => {
    const key = node.bind ?? ''
    const row = declaration(scope.program, key)
    const min = numberProp(node, 'min') ?? row?.min ?? 0
    const max = numberProp(node, 'max') ?? row?.max ?? 100
    const step = numberProp(node, 'step') ?? row?.step ?? 1
    const current = scope.values.get(key)
    return (
      <Player
        label={scope.text(node.props.label)}
        value={typeof current === 'number' ? current : min}
        min={min}
        max={max}
        step={step > 0 ? step : 1}
        duration={numberProp(node, 'duration') ?? defaultDuration(min, max, step)}
        unit={stringProp(node, 'unit')}
        tr={scope.tr}
        onChange={(value) => { scope.setValue(key, value) }}
      />
    )
  },
  table: (node, _children, scope) => <TableFigure node={node} scope={scope} />,
  keys: (node, _children, scope) => (
    <dl className="dsh-iui-keys">
      {list(node.props.items, scope).map((entry, index) => {
        const [label, value] = splitPair(entry)
        return (
          <div className="dsh-iui-keys-row" key={index}>
            <dt>{label}</dt>
            <dd className="dsh-iui-num">{value}</dd>
          </div>
        )
      })}
    </dl>
  ),
  list: (node, _children, scope) => {
    const current = currentIndex(node, scope)
    return (
      <ul className="dsh-iui-list" data-mono={mono(node, scope)}>
        {list(node.props.items, scope).map((item, index) => <li key={index} {...currentMark(index === current)}>{item}</li>)}
      </ul>
    )
  },
  steps: (node, _children, scope) => {
    const current = currentIndex(node, scope)
    return (
      <ol className="dsh-iui-steps" data-mono={mono(node, scope)}>
        {list(node.props.items, scope).map((item, index) => <li key={index} {...currentMark(index === current)}>{item}</li>)}
      </ol>
    )
  },
  checklist: (node, _children, scope) => {
    const items = list(node.props.items, scope)
    const ticked = readTicked(scope.ui(node.id), items.length)
    const worth = Array.isArray(node.props.values) ? node.props.values.map(entry => typeof entry === 'number' ? entry : 0) : undefined
    const toggle = (index: number, on: boolean): void => {
      const next = new Set(ticked)
      if (on) next.add(index)
      else next.delete(index)
      const value = [...next].sort((a, b) => a - b)
      scope.setUi(node.id, value)
      if (node.bind !== undefined) scope.setValue(node.bind, worth === undefined ? value.length : tidy(value.reduce((sum, at) => sum + (worth[at] ?? 0), 0)))
      if (typeof node.props.names === 'string') scope.setValue(node.props.names, joinNames(value.map(at => items[at] ?? '')))
    }
    return (
      <div className="dsh-iui-field dsh-iui-checklist">
        <span className="dsh-iui-field-head">
          <span>{node.props.label === undefined ? '' : scope.text(node.props.label)}</span>
          <span className="dsh-iui-field-value">{scope.tr('checklist.done', { done: ticked.size, total: items.length })}</span>
        </span>
        <ul className="dsh-iui-checklist-items">
          {items.map((item, index) => (
            <li key={index}>
              <label className="dsh-iui-check" data-done={ticked.has(index) ? '' : undefined}>
                <input type="checkbox" checked={ticked.has(index)} onChange={(event) => { toggle(index, event.currentTarget.checked) }} />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    )
  },
  chart: (node, _children, scope) => <ChartFigure node={node} scope={scope} />,
  // A series is drawn by the chart that holds it.
  series: () => null,
  plot: (node, _children, scope) => <PlotFigure node={node} scope={scope} />,
  diagram: (node, _children, scope) => <DiagramFigure node={node} scope={scope} />,
  code: (node, _children, scope) => <CodeFigure node={node} scope={scope} />,
  formula: (node, _children, scope) => renderFormula(node, scope),
  badge: (node, _children, scope) => <span className="dsh-iui-badge" data-tone={tone(node)}>{scope.text(node.props.text)}</span>,
  callout: (node, _children, scope) => <div className="dsh-iui-callout" data-tone={tone(node) ?? 'secondary'}>{scope.text(node.props.text)}</div>,
  divider: () => <hr className="dsh-iui-divider" />,
  image: (node, _children, scope) => {
    const src = stringProp(node, 'src')
    // Only inline raster data renders: a remote URL would be a request the reader never asked for.
    if (src === undefined || !isDataImage(src)) return null
    return (
      <figure className="dsh-iui-figure">
        <img className="dsh-iui-image" src={src} alt={stringProp(node, 'alt') ?? ''} />
        {node.props.caption === undefined ? null : <figcaption className="dsh-iui-caption">{scope.text(node.props.caption)}</figcaption>}
      </figure>
    )
  },
  link: (node, _children, scope) => {
    const url = stringProp(node, 'url')
    const text = scope.text(node.props.text)
    if (url === undefined || !/^https?:\/\//iu.test(url)) return <span className="dsh-iui-text">{text}</span>
    return <a className="dsh-iui-link" href={url} target="_blank" rel="noopener noreferrer">{text}</a>
  },
  button: (node, _children, scope) => {
    const prompt = scope.text(node.props.prompt)
    const sent = scope.sent === node.id
    return (
      <button
        type="button"
        className="dsh-iui-button"
        data-tone={tone(node)}
        data-sent={sent ? '' : undefined}
        disabled={scope.sent !== undefined || prompt.trim() === ''}
        title={scope.tr('button.sends', { text: prompt })}
        onClick={() => { scope.press(node, prompt) }}
      >
        <span>{scope.text(node.props.text)}</span>
        {sent ? <span className="dsh-iui-button-mark">{scope.tr('button.sent')}</span> : null}
      </button>
    )
  },
}

/** Playback speeds the reader cycles through, as multiples of the program's pace. */
const SPEEDS: readonly number[] = [1, 2, 0.5]

/**
 * Longest stretch one animation frame may advance. A throttled page that paints
 * once a second still plays at its true pace; a tab that slept resumes where it was.
 */
const MAX_FRAME_MS = 1000

/** Least time between two values the player hands the card, about 30 per second. */
const MIN_EMIT_MS = 32

/**
 * A run's length when the program gave none: one second per step, from two to ten seconds.
 * @returns seconds for one run from min to max.
 */
function defaultDuration(min: number, max: number, step: number): number {
  const steps = step > 0 ? (max - min) / step : 0
  return Math.max(2, Math.min(10, Number.isFinite(steps) ? steps : 0))
}

/**
 * An animation control: play and pause, one step back or forward, scrubbing, and speed.
 *
 * Playback only moves the bound value; every figure that reads it recomputes
 * locally, as it does when the reader drags a slider, and nothing reaches the
 * model. Whether it is playing and how fast belong to this copy of the card; the
 * value goes through the shared store, so both copies show the same frame.
 */
function Player(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  duration: number
  unit: string | undefined
  tr: RenderScope['tr']
  onChange(value: number): void
}): ReactNode {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const latest = useRef(props)
  latest.current = props
  useEffect(() => {
    if (!playing) return undefined
    const frames = globalThis as { requestAnimationFrame?: (callback: (now: number) => void) => number; cancelAnimationFrame?: (handle: number) => void }
    const { min, max, value } = latest.current
    if (typeof frames.requestAnimationFrame !== 'function' || !(max > min)) {
      setPlaying(false)
      return undefined
    }
    const request = frames.requestAnimationFrame.bind(globalThis)
    // Play from where the reader left it, or from the start once a run has ended.
    let position = value >= max ? min : Math.max(min, value)
    if (position !== value) latest.current.onChange(position)
    let shown = position
    let previous: number | undefined
    let emitted = -Infinity
    let handle = 0
    // The clock, not the frame count, sets the pace; a page that paints no frames, such as a hidden tab, pauses.
    const tick = (now: number): void => {
      const { step, duration } = latest.current
      const elapsed = previous === undefined ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, now - previous))
      previous = now
      position = Math.min(max, position + (elapsed / 1000) * speed * (max - min) / Math.max(0.1, duration))
      const snapped = position >= max ? max : Math.min(max, tidy(min + Math.floor((position - min) / step + 1e-9) * step))
      if (snapped !== shown && (now - emitted >= MIN_EMIT_MS || snapped === max)) {
        shown = snapped
        emitted = now
        latest.current.onChange(snapped)
      }
      if (position >= max) {
        setPlaying(false)
        return
      }
      handle = request(tick)
    }
    handle = request(tick)
    return () => { frames.cancelAnimationFrame?.(handle) }
  }, [playing, speed])
  const { label, value, min, max, step, unit, tr } = props
  const move = (delta: number): void => {
    setPlaying(false)
    props.onChange(Math.max(min, Math.min(max, tidy(value + delta))))
  }
  return (
    <div className="dsh-iui-field dsh-iui-player">
      <span className="dsh-iui-field-head">
        <span>{label}</span>
        <span className="dsh-iui-field-value">{`${formatNumber(value)}${unit === undefined ? '' : ` ${unit}`}`}</span>
      </span>
      <span className="dsh-iui-player-bar">
        <button type="button" className="dsh-iui-player-button" aria-label={tr('player.prev')} title={tr('player.prev')} disabled={value <= min} onClick={() => { move(-step) }}>
          <Glyph path="M7.5 3.5v5L4 6z" />
        </button>
        <button
          type="button"
          className="dsh-iui-player-button"
          data-primary=""
          aria-label={tr(playing ? 'player.pause' : 'player.play')}
          title={tr(playing ? 'player.pause' : 'player.play')}
          aria-pressed={playing}
          disabled={!(max > min)}
          onClick={() => { setPlaying(!playing) }}
        >
          <Glyph path={playing ? 'M3 2h2.2v8H3zM6.8 2H9v8H6.8z' : 'M3.5 1.8l6.5 4.2-6.5 4.2z'} />
        </button>
        <button type="button" className="dsh-iui-player-button" aria-label={tr('player.next')} title={tr('player.next')} disabled={value >= max} onClick={() => { move(step) }}>
          <Glyph path="M4.5 3.5v5L8 6z" />
        </button>
        <input
          className="dsh-iui-range"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(event) => {
            setPlaying(false)
            props.onChange(Number(event.currentTarget.value))
          }}
        />
        <button
          type="button"
          className="dsh-iui-player-speed"
          aria-label={tr('player.speed', { speed })}
          title={tr('player.speed', { speed })}
          onClick={() => { setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] as number) }}
        >
          {`${speed}×`}
        </button>
      </span>
    </div>
  )
}

/**
 * Pages the reader switches between. The open page is remembered by the card, so
 * both copies of it show the same page; the closed pages are not drawn at all.
 * A tabs container without tab pages draws its children as one stack.
 */
function Tabs(props: { node: NodeRow; pages: ReactNode[]; scope: RenderScope }): ReactNode {
  const { node, pages, scope } = props
  const base = `dsh-iui-tabs-${useId().replace(/[^\w-]/gu, '')}`
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const gap = space(node, 'gap', 2)
  const tabs = (scope.program.children.get(node.id) ?? [])
    .map(id => scope.program.byId.get(id))
    .filter((child): child is NodeRow => child?.type === 'tab')
  if (tabs.length === 0) return <div className="dsh-iui-col" style={{ gap }}>{pages}</div>
  const stored = scope.ui(node.id)
  const open = typeof stored === 'number' && Number.isInteger(stored) ? Math.max(0, Math.min(tabs.length - 1, stored)) : 0
  // Each child arrives keyed by its node id, which is how a page finds its tab.
  const keyed = (page: ReactNode): string | undefined => (isValidElement(page) && page.key !== null ? String(page.key) : undefined)
  const page = pages.find(entry => keyed(entry) === tabs[open]?.id)
  const others = pages.filter(entry => !tabs.some(tab => tab.id === keyed(entry)))
  const choose = (index: number, focus: boolean): void => {
    scope.setUi(node.id, index)
    if (focus) buttons.current[index]?.focus()
  }
  const keys = (event: KeyboardEvent): void => {
    const last = tabs.length - 1
    const next = event.key === 'ArrowRight' ? (open === last ? 0 : open + 1)
      : event.key === 'ArrowLeft' ? (open === 0 ? last : open - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : undefined
    if (next === undefined) return
    event.preventDefault()
    choose(next, true)
  }
  return (
    <div className="dsh-iui-tabs" style={{ gap }}>
      <div className="dsh-iui-tabs-list" role="tablist" onKeyDown={keys}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => { buttons.current[index] = element }}
            type="button"
            role="tab"
            id={`${base}-${index}`}
            className="dsh-iui-tabs-tab"
            aria-selected={index === open}
            aria-controls={`${base}-panel`}
            tabIndex={index === open ? 0 : -1}
            onClick={() => { choose(index, false) }}
          >
            {scope.text(tab.props.title)}
          </button>
        ))}
      </div>
      <div className="dsh-iui-tabs-panel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${open}`}>{page}</div>
      {others}
    </div>
  )
}

/** The ticked items of a checklist, as 0-based indices inside the list. */
function readTicked(value: JsonValue | undefined, count: number): Set<number> {
  const ticked = new Set<number>()
  if (!Array.isArray(value)) return ticked
  for (const entry of value) {
    if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry < count) ticked.add(entry)
  }
  return ticked
}

/** Ticked item names as one text: joined with "、" when any is written in CJK, otherwise with ", ". */
export function joinNames(names: readonly string[]): string {
  return names.join(names.some(name => CJK.test(name)) ? '、' : ', ')
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u

/** Remove binary noise from a stepped value, so 0.1 + 0.2 shows as 0.3. */
function tidy(value: number): number {
  return Math.round(value * 1e9) / 1e9
}

/**
 * Exact number entry that tolerates in-between text such as "1." while typing.
 * The value commits whenever the text reads as a number inside the bounds.
 */
function NumberField(props: {
  label: string
  value: number
  min: number | undefined
  max: number | undefined
  step: number | undefined
  unit: string | undefined
  onCommit(value: number): void
}): ReactNode {
  const [text, setText] = useState(formatNumber(props.value))
  useEffect(() => {
    setText(previous => (Number(previous) === props.value ? previous : formatNumber(props.value)))
  }, [props.value])
  return (
    <label className="dsh-iui-field">
      <span className="dsh-iui-field-head"><span>{props.label}</span></span>
      <span className="dsh-iui-input-row">
        <input
          className="dsh-iui-input"
          type="number"
          inputMode="decimal"
          value={text}
          min={props.min}
          max={props.max}
          step={props.step ?? 'any'}
          onChange={(event) => {
            const next = event.currentTarget.value
            setText(next)
            const parsed = Number(next)
            if (next.trim() !== '' && Number.isFinite(parsed)) props.onCommit(parsed)
          }}
          onBlur={() => { setText(formatNumber(props.value)) }}
        />
        {props.unit === undefined ? null : <span className="dsh-iui-unit">{props.unit}</span>}
      </span>
    </label>
  )
}

/** The state declaration a control binds. */
function declaration(program: Program, key: string): StateRow | undefined {
  return program.state.find(row => row.key === key)
}

/** A spacing step in pixels, on the 4px grid. */
function space(node: NodeRow, name: string, fallback: number): string {
  const value = node.props[name]
  const steps = typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SPACE ? value : fallback
  return `${steps * 4}px`
}

/** A tone name, or undefined when the program gave none this build knows. */
function tone(node: NodeRow): string | undefined {
  const value = node.props.tone
  return typeof value === 'string' && (TONES as readonly string[]).includes(value) ? value : undefined
}

/** A size name, or undefined. */
function size(node: NodeRow): string | undefined {
  const value = node.props.size
  return typeof value === 'string' && (SIZES as readonly string[]).includes(value) ? value : undefined
}

/** A plain string prop. */
function stringProp(node: NodeRow, name: string): string | undefined {
  const value = node.props[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** A finite number prop. */
function numberProp(node: NodeRow, name: string): number | undefined {
  const value = node.props[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Split "Label: value" at its first colon, full-width or not. */
function splitPair(entry: string): [string, string] {
  const match = /^(.*?)[:：]\s*(.*)$/su.exec(entry)
  return match === null ? [entry, ''] : [match[1] as string, match[2] as string]
}
