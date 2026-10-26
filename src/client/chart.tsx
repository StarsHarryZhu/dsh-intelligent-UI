/**
 * Charts as inline SVG: bars, lines, areas, and pies, of one series or several.
 *
 * Geometry is computed from the values, never measured from the DOM, so a chart
 * draws identically in a test, a server render, and the page. Values may be
 * expressions over state, which is what makes a chart respond to its sliders.
 * A chart of one `values=` series draws as it always has: marks over a row of
 * labels with their figures. A chart of indented series adds a legend whose
 * entries hide and show their series, and a readout of one column, which the
 * pointer or the arrow keys move. A pie's legend carries each slice's share.
 * @module dsh-intelligent-ui/client/chart
 */

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { MAX_CHART_SERIES, MAX_PIE_SLICES } from '../lang/catalog.ts'
import { formatNumber } from '../lang/expr.ts'
import { formatSignificant } from '../lang/math.ts'
import type { JsonValue } from '../lang/types.ts'
import type { RenderScope } from './components.tsx'
import { flag, list } from './parts.tsx'
import type { NodeRow } from './program.ts'

/** Plot box in viewBox units; the SVG stretches to the card's width. */
const WIDTH = 320
const HEIGHT = 120
/** Headroom above the tallest mark. */
const TOP = 8
/** A pie's viewBox side and radius. */
const PIE_SIZE = 120
const PIE_RADIUS = 56

/** One series as drawn: its name, its colour slot, and a value per column (undefined is a gap). */
interface Series {
  name: string
  slot: number
  values: Array<number | undefined>
}

/**
 * Draw one chart node.
 * @param props - the chart node and the card's scope.
 * @returns the chart figure.
 */
export function ChartFigure(props: { node: NodeRow; scope: RenderScope }): ReactNode {
  const { node, scope } = props
  const [focus, setFocus] = useState<number | undefined>(undefined)
  const labels = list(node.props.labels, scope)
  const unit = typeof node.props.unit === 'string' && node.props.unit !== '' ? ` ${node.props.unit}` : ''
  const caption = node.props.caption === undefined ? null : <figcaption className="dsh-iui-caption">{scope.text(node.props.caption)}</figcaption>
  const children = (scope.program.children.get(node.id) ?? [])
    .map(id => scope.program.byId.get(id))
    .filter((child): child is NodeRow => child?.type === 'series')
    .slice(0, MAX_CHART_SERIES)
  const shape = node.props.shape === 'line' || node.props.shape === 'area' || node.props.shape === 'pie' ? node.props.shape : 'bar'
  const hidden = readHidden(scope.ui(node.id))
  const toggle = (index: number, count: number): void => {
    const next = new Set(hidden)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    // One entry always stays drawn, so the chart never empties itself.
    if ([...Array(count).keys()].every(entry => next.has(entry))) return
    scope.setUi(node.id, [...next].sort((a, b) => a - b))
  }

  if (shape === 'pie') {
    const source = children[0]?.props.values ?? node.props.values
    const values = readValues(source, scope).slice(0, MAX_PIE_SLICES)
    return <PieChart labels={labels} values={values} unit={unit} caption={caption} hidden={hidden} toggle={toggle} scope={scope} />
  }

  if (children.length === 0) {
    // One `values=` series: marks over a row of labels and figures, as before series existed.
    const values = readValues(node.props.values, scope).map(value => value ?? 0)
    const count = Math.max(values.length, 1)
    const series: Series[] = [{ name: '', slot: 0, values }]
    return (
      <figure className="dsh-iui-figure dsh-iui-chart">
        {caption}
        <svg className="dsh-iui-chart-plot" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={labels.join(', ')}>
          {cartesian(series, count, shape, false, labels, unit)}
        </svg>
        <div className="dsh-iui-chart-labels" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
          {values.map((value, index) => (
            <span key={index}>
              <span className="dsh-iui-chart-label">{labels[index] ?? ''}</span>
              <span className="dsh-iui-chart-value">{`${formatNumber(value)}${unit}`}</span>
            </span>
          ))}
        </div>
      </figure>
    )
  }

  const all: Series[] = children.map((child, index) => ({
    name: child.props.name === undefined ? String(index + 1) : scope.text(child.props.name),
    slot: index,
    values: readValues(child.props.values, scope),
  }))
  const count = Math.max(labels.length, 1)
  const shown = all.filter(entry => !hidden.has(entry.slot))
  const stacked = (shape === 'bar' || shape === 'area') && shown.length > 1 && flag(node, 'stacked', scope)
  const column = focus === undefined ? count - 1 : Math.min(focus, count - 1)
  const move = (event: KeyboardEvent<SVGSVGElement>): void => {
    const next = event.key === 'ArrowLeft' ? column - 1 : event.key === 'ArrowRight' ? column + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : undefined
    if (next === undefined) return
    event.preventDefault()
    setFocus(Math.max(0, Math.min(next, count - 1)))
  }
  const point = (event: PointerEvent<SVGSVGElement>): void => {
    // Reading where the pointer is needs the box; the drawing itself never does.
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return
    setFocus(Math.max(0, Math.min(Math.floor((event.clientX - box.left) / box.width * count), count - 1)))
  }
  return (
    <figure className="dsh-iui-figure dsh-iui-chart">
      {caption}
      <Legend
        entries={all.map(entry => ({ name: entry.name, slot: entry.slot, off: hidden.has(entry.slot) }))}
        toggle={index => { toggle(index, all.length) }}
        scope={scope}
      />
      <svg
        className="dsh-iui-chart-plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        tabIndex={0}
        aria-label={`${scope.tr('chart.label')}: ${all.map(entry => entry.name).join(', ')}`}
        onKeyDown={move}
        onPointerMove={point}
        onPointerLeave={() => { setFocus(undefined) }}
        onBlur={() => { setFocus(undefined) }}
      >
        {focus === undefined ? null : <rect className="dsh-iui-chart-focus" x={column * WIDTH / count} y={0} width={WIDTH / count} height={HEIGHT} />}
        {cartesian(shown, count, shape, stacked, labels, unit)}
      </svg>
      <div className="dsh-iui-chart-labels" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {Array.from({ length: count }, (_, index) => (
          <span key={index} data-focus={index === column && focus !== undefined ? '' : undefined}>
            <span className="dsh-iui-chart-label">{labels[index] ?? ''}</span>
          </span>
        ))}
      </div>
      <div className="dsh-iui-chart-readout" aria-live="polite">
        <span className="dsh-iui-chart-readout-label">{labels[column] ?? ''}</span>
        {shown.map(entry => (
          <span key={entry.slot} className="dsh-iui-chart-readout-entry">
            <span className="dsh-iui-chart-swatch" data-series={entry.slot} aria-hidden="true" />
            {`${entry.name} ${figure(entry.values[column], unit)}`}
          </span>
        ))}
      </div>
    </figure>
  )
}

/**
 * The marks of a bar, line, or area chart: grouped or stacked bars, one line per
 * series with a dot per value, or filled areas under their lines.
 */
function cartesian(series: readonly Series[], count: number, shape: 'bar' | 'line' | 'area', stacked: boolean, labels: readonly string[], unit: string): ReactNode[] {
  // Stacks run up from zero for positive values and down for negative ones.
  const tops = Array.from({ length: count }, () => 0)
  const bottoms = Array.from({ length: count }, () => 0)
  const ranges: Array<Array<[number, number] | undefined>> = series.map(entry => Array.from({ length: count }, (_, index) => {
    const value = entry.values[index]
    // A stacked area runs on through a gap at its stack's height; anything else leaves it open.
    if (value === undefined) return stacked && shape === 'area' ? [tops[index] as number, tops[index] as number] : undefined
    if (!stacked) return [0, value]
    if (value >= 0) {
      const from = tops[index] as number
      tops[index] = from + value
      return [from, from + value]
    }
    const from = bottoms[index] as number
    bottoms[index] = from + value
    return [from, from + value]
  }))
  const ends = ranges.flatMap(entry => entry.flatMap(range => (range === undefined ? [] : range)))
  const peak = Math.max(...ends, 0)
  const floor = Math.min(...ends, 0)
  const span = peak - floor || 1
  const slot = WIDTH / count
  const y = (value: number): number => TOP + (peak - value) / span * (HEIGHT - TOP)
  const baseline = y(0)
  const centre = (index: number): number => (index + 0.5) * slot
  const label = (entry: Series, index: number): string => `${entry.name === '' ? '' : `${entry.name} · `}${labels[index] ?? ''}: ${figure(entry.values[index], unit)}`
  const marks: ReactNode[] = [<line key="axis" className="dsh-iui-chart-axis" x1={0} x2={WIDTH} y1={baseline} y2={baseline} />]

  if (shape === 'bar') {
    const grouped = !stacked && series.length > 1
    const width = grouped ? slot * 0.7 / series.length : slot * 0.6
    for (const [order, entry] of series.entries()) {
      for (const [index, range] of (ranges[order] ?? []).entries()) {
        if (range === undefined) continue
        const top = Math.min(y(range[0]), y(range[1]))
        const x = grouped ? index * slot + slot * 0.15 + order * width : index * slot + slot * 0.2
        marks.push(
          <rect
            key={`bar${entry.slot}-${index}`}
            className="dsh-iui-chart-bar"
            data-series={entry.slot}
            x={x}
            y={top}
            width={width}
            height={Math.max(Math.abs(y(range[0]) - y(range[1])), 1)}
            rx={stacked ? 0 : 2}
          >
            <title>{label(entry, index)}</title>
          </rect>,
        )
      }
    }
    return marks
  }

  for (const [order, entry] of series.entries()) {
    const range = ranges[order] ?? []
    if (shape === 'area') {
      // An area is filled between its stack's floor and its values; an open gap sits on zero.
      const upper = range.map((value, index) => `${centre(index)},${y(value?.[1] ?? 0)}`)
      const lower = range.map((value, index) => `${centre(index)},${y(value?.[0] ?? 0)}`).reverse()
      marks.push(<polygon key={`area${entry.slot}`} className="dsh-iui-chart-area" data-series={entry.slot} points={[...upper, ...lower].join(' ')} />)
    }
    // A line breaks at a gap instead of bridging it.
    let run: string[] = []
    const flush = (key: string): void => {
      if (run.length > 1) marks.push(<polyline key={key} className="dsh-iui-chart-line" data-series={entry.slot} points={run.join(' ')} />)
      run = []
    }
    for (const [index, value] of range.entries()) {
      if (value === undefined) {
        flush(`line${entry.slot}-${index}`)
        continue
      }
      run.push(`${centre(index)},${y(value[1])}`)
    }
    flush(`line${entry.slot}-end`)
    for (const [index, value] of range.entries()) {
      if (value === undefined) continue
      marks.push(
        // A zero-length round-capped stroke stays a circle when the SVG stretches; a <circle> would not.
        <path key={`dot${entry.slot}-${index}`} className="dsh-iui-chart-dot" data-series={entry.slot} d={`M${centre(index)} ${y(value[1])}h0`}>
          <title>{label(entry, index)}</title>
        </path>,
      )
    }
  }
  return marks
}

/** A pie of one series: a slice per label, sized by its positive value, with a legend of shares. */
function PieChart(props: {
  labels: readonly string[]
  values: ReadonlyArray<number | undefined>
  unit: string
  caption: ReactNode
  hidden: ReadonlySet<number>
  toggle(index: number, count: number): void
  scope: RenderScope
}): ReactNode {
  const { labels, values, unit, hidden, scope } = props
  const count = Math.min(Math.max(labels.length, values.length), MAX_PIE_SLICES)
  const amount = (index: number): number => Math.max(values[index] ?? 0, 0)
  const total = Array.from({ length: count }, (_, index) => index).filter(index => !hidden.has(index)).reduce((sum, index) => sum + amount(index), 0)
  const share = (index: number): string => (total > 0 && !hidden.has(index) ? `${formatSignificant(amount(index) / total * 100, 3)}%` : '—')
  const centre = PIE_SIZE / 2
  const slices: ReactNode[] = []
  let angle = -Math.PI / 2
  for (let index = 0; index < count; index += 1) {
    if (hidden.has(index) || total <= 0 || amount(index) <= 0) continue
    const sweep = amount(index) / total * Math.PI * 2
    const title = <title>{`${labels[index] ?? ''}: ${figure(values[index], unit)} (${share(index)})`}</title>
    const common = { className: 'dsh-iui-chart-slice', 'data-series': index % MAX_CHART_SERIES, 'data-dim': index >= MAX_CHART_SERIES ? '' : undefined }
    if (sweep >= Math.PI * 2 - 1e-9) {
      slices.push(<circle key={index} {...common} cx={centre} cy={centre} r={PIE_RADIUS}>{title}</circle>)
    } else {
      const start = point(centre, angle)
      const end = point(centre, angle + sweep)
      const large = sweep > Math.PI ? 1 : 0
      slices.push(
        <path key={index} {...common} d={`M${centre} ${centre}L${start}A${PIE_RADIUS} ${PIE_RADIUS} 0 ${large} 1 ${end}Z`}>{title}</path>,
      )
    }
    angle += sweep
  }
  return (
    <figure className="dsh-iui-figure dsh-iui-chart" data-shape="pie">
      {props.caption}
      <div className="dsh-iui-chart-pie">
        <svg className="dsh-iui-chart-pie-plot" viewBox={`0 0 ${PIE_SIZE} ${PIE_SIZE}`} role="img" aria-label={labels.slice(0, count).join(', ')}>
          {total > 0 ? slices : <circle className="dsh-iui-chart-axis" cx={centre} cy={centre} r={PIE_RADIUS} fill="none" />}
        </svg>
        <Legend
          entries={Array.from({ length: count }, (_, index) => ({
            name: labels[index] ?? '',
            slot: index % MAX_CHART_SERIES,
            dim: index >= MAX_CHART_SERIES,
            off: hidden.has(index),
            detail: `${figure(values[index], unit)} · ${share(index)}`,
          }))}
          toggle={index => { props.toggle(index, count) }}
          scope={scope}
          vertical
        />
      </div>
    </figure>
  )
}

/** Legend entries that hide and show their series or slice. */
function Legend(props: {
  entries: ReadonlyArray<{ name: string; slot: number; off: boolean; dim?: boolean; detail?: string }>
  toggle(index: number): void
  scope: RenderScope
  vertical?: boolean
}): ReactNode {
  return (
    <div className="dsh-iui-chart-legend" data-vertical={props.vertical === true ? '' : undefined}>
      {props.entries.map((entry, index) => (
        <button
          key={index}
          type="button"
          className="dsh-iui-chart-key"
          aria-pressed={!entry.off}
          title={props.scope.tr('chart.toggle', { name: entry.name })}
          data-off={entry.off ? '' : undefined}
          onClick={() => { props.toggle(index) }}
        >
          <span className="dsh-iui-chart-swatch" data-series={entry.slot} data-dim={entry.dim === true ? '' : undefined} aria-hidden="true" />
          <span className="dsh-iui-chart-key-name">{entry.name}</span>
          {entry.detail === undefined ? null : <span className="dsh-iui-chart-value">{entry.detail}</span>}
        </button>
      ))}
    </div>
  )
}

/** One value list read as numbers; an entry that does not read as one is a gap. */
function readValues(value: unknown, scope: RenderScope): Array<number | undefined> {
  return Array.isArray(value) ? (value as unknown[]).map(entry => scope.number(entry)) : []
}

/** The series or slices the reader hid, as 0-based indices. */
function readHidden(value: JsonValue | undefined): Set<number> {
  const hidden = new Set<number>()
  if (!Array.isArray(value)) return hidden
  for (const entry of value) if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0) hidden.add(entry)
  return hidden
}

/** A value with its unit, or "—" for a gap. */
function figure(value: number | undefined, unit: string): string {
  return value === undefined ? '—' : `${formatNumber(value)}${unit}`
}

/** A point on the pie's rim, as "x y". */
function point(centre: number, angle: number): string {
  return `${tidy(centre + PIE_RADIUS * Math.cos(angle))} ${tidy(centre + PIE_RADIUS * Math.sin(angle))}`
}

/** Round away floating-point noise in path data. */
function tidy(value: number): number {
  return Math.round(value * 1000) / 1000
}
