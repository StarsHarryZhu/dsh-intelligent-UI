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

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { SIZES, TONES } from '../lang/catalog.ts'
import { isDataImage } from '../lang/compile.ts'
import { formatNumber } from '../lang/expr.ts'
import { MAX_SPACE } from '../lang/limits.ts'
import { formatSignificant } from '../lang/math.ts'
import type { JsonValue } from '../lang/types.ts'
import { renderChart } from './chart.tsx'
import { renderFormula } from './formula.tsx'
import type { CopyKey } from './locales.ts'
import { PlotFigure } from './plot.tsx'
import type { NodeRow, Program, StateRow } from './program.ts'

/** Everything a renderer needs to draw one node. */
export interface RenderScope {
  program: Program
  /** Current state and derived values. */
  values: ReadonlyMap<string, JsonValue>
  /** Change one bound state value. */
  setValue(key: string, value: JsonValue): void
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
  table: (node, _children, scope) => {
    const columns = list(node.props.columns, scope)
    const rows = Array.isArray(node.props.rows) ? node.props.rows as unknown[] : []
    return (
      <figure className="dsh-iui-figure">
        {node.props.caption === undefined ? null : <figcaption className="dsh-iui-caption">{scope.text(node.props.caption)}</figcaption>}
        <div className="dsh-iui-table-wrap">
          <table className="dsh-iui-table">
            {columns.length === 0 ? null : (
              <thead><tr>{columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead>
            )}
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {(Array.isArray(row) ? row as unknown[] : []).map((cell, cellIndex) => <td key={cellIndex}>{scope.text(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    )
  },
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
  list: (node, _children, scope) => (
    <ul className="dsh-iui-list">{list(node.props.items, scope).map((item, index) => <li key={index}>{item}</li>)}</ul>
  ),
  steps: (node, _children, scope) => (
    <ol className="dsh-iui-steps">{list(node.props.items, scope).map((item, index) => <li key={index}>{item}</li>)}</ol>
  ),
  chart: (node, _children, scope) => renderChart(node, scope),
  plot: (node, _children, scope) => <PlotFigure node={node} scope={scope} />,
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

/** A list prop resolved to strings. */
function list(value: unknown, scope: RenderScope): string[] {
  return Array.isArray(value) ? (value as unknown[]).map(entry => scope.text(entry)) : []
}

/** Split "Label: value" at its first colon, full-width or not. */
function splitPair(entry: string): [string, string] {
  const match = /^(.*?)[:：]\s*(.*)$/su.exec(entry)
  return match === null ? [entry, ''] : [match[1] as string, match[2] as string]
}
