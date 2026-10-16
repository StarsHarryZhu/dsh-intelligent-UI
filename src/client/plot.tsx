/**
 * Function plots as inline SVG: up to four curves, a marked point with its
 * tangent, and a shaded area under the first curve.
 *
 * Every figure is computed by the same evaluator the rest of the card uses: the
 * curves are sampled, the tangent's slope is an exact derivative, and the shaded
 * area's value comes from the integrator. All samples of one plot share one work
 * budget, so a heavy curve degrades to a partial drawing instead of stalling the
 * page. Curves are clipped to the plot box arithmetically and broken at gaps and
 * jumps, so tan(x) draws as separate branches rather than vertical strokes.
 * @module dsh-intelligent-ui/client/plot
 */

import { useId, useMemo, type ReactNode } from 'react'
import { createBudget, evalExpr, formatNumber } from '../lang/expr.ts'
import { formatSignificant } from '../lang/math.ts'
import { printExpr } from '../lang/print.ts'
import type { JsonValue } from '../lang/types.ts'
import type { RenderScope } from './components.tsx'
import type { NodeRow } from './program.ts'

/** Plot box in viewBox units; the SVG stretches to the card's width. */
const WIDTH = 320
const HEIGHT = 180

/** Samples per curve. */
const SAMPLES = 200

/** Work one plot may spend across all of its samples. */
const PLOT_BUDGET = 2_000_000

/** Most curves drawn. */
const MAX_CURVES = 4

/** A point in data coordinates; NaN marks a gap. */
interface Point { x: number; y: number }

/** Everything one plot draws, computed once per change of its inputs. */
interface Geometry {
  variable: string
  from: number
  to: number
  low: number
  high: number
  curves: Point[][]
  mark?: { x: number; y: number; slope?: number }
  shade?: { from: number; to: number; points: Point[]; area?: number }
}

/**
 * Draw one plot node.
 * @param props - the node and the card's render scope.
 * @returns the plot figure.
 */
export function PlotFigure(props: { node: NodeRow; scope: RenderScope }): ReactNode {
  const { node, scope } = props
  const clip = `dsh-iui-clip-${useId().replace(/[^\w-]/gu, '')}`
  const geometry = useMemo(() => measure(node, scope.values), [node, scope.values])
  const curves = Array.isArray(node.props.fn) ? (node.props.fn as unknown[]).slice(0, MAX_CURVES) : []
  const labels = Array.isArray(node.props.labels) ? (node.props.labels as unknown[]).map(label => scope.text(label)) : []
  const sx = (x: number): number => (x - geometry.from) / (geometry.to - geometry.from) * WIDTH
  const sy = (y: number): number => HEIGHT - (y - geometry.low) / (geometry.high - geometry.low) * HEIGHT
  const caption = node.props.caption === undefined ? undefined : scope.text(node.props.caption)
  const description = `${curves.map(curve => `y = ${printExpr(curve)}`).join('; ')}, ${geometry.variable} from ${formatNumber(geometry.from)} to ${formatNumber(geometry.to)}`
  const tangent = geometry.mark?.slope === undefined ? undefined : clipLine(geometry, geometry.mark.x, geometry.mark.y, geometry.mark.slope)
  return (
    <figure className="dsh-iui-figure dsh-iui-plot">
      {caption === undefined ? null : <figcaption className="dsh-iui-caption">{caption}</figcaption>}
      <div className="dsh-iui-plot-frame">
        <div className="dsh-iui-plot-yaxis" aria-hidden="true">
          <span>{formatNumber(geometry.high)}</span>
          <span>{formatNumber(geometry.low)}</span>
        </div>
        <svg className="dsh-iui-plot-area" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={description}>
          <defs>
            <clipPath id={clip}><rect x={0} y={0} width={WIDTH} height={HEIGHT} /></clipPath>
          </defs>
          <g clipPath={`url(#${clip})`}>
            {geometry.low < 0 && geometry.high > 0 ? <line className="dsh-iui-plot-axis" x1={0} x2={WIDTH} y1={sy(0)} y2={sy(0)} /> : null}
            {geometry.from < 0 && geometry.to > 0 ? <line className="dsh-iui-plot-axis" x1={sx(0)} x2={sx(0)} y1={0} y2={HEIGHT} /> : null}
            {geometry.shade === undefined ? null : (
              <polygon className="dsh-iui-plot-shade" points={shadePoints(geometry, sx, sy)} />
            )}
            {geometry.curves.map((points, index) => (
              <path key={index} className="dsh-iui-plot-curve" data-series={index} d={pathOf(points, geometry, sx, sy)} />
            ))}
            {tangent === undefined ? null : (
              <line className="dsh-iui-plot-tangent" x1={sx(tangent[0].x)} y1={sy(tangent[0].y)} x2={sx(tangent[1].x)} y2={sy(tangent[1].y)} />
            )}
            {geometry.mark === undefined || !inside(geometry, geometry.mark.y) ? null : (
              <path className="dsh-iui-plot-dot" d={`M${sx(geometry.mark.x)} ${sy(geometry.mark.y)}h0`} />
            )}
          </g>
        </svg>
        <span aria-hidden="true" />
        <div className="dsh-iui-plot-xaxis" aria-hidden="true">
          <span>{formatNumber(geometry.from)}</span>
          <span className="dsh-iui-plot-variable">{geometry.variable}</span>
          <span>{formatNumber(geometry.to)}</span>
        </div>
      </div>
      {curves.length > 1 || labels.length > 0 ? (
        <div className="dsh-iui-plot-legend">
          {curves.map((curve, index) => (
            <span key={index} className="dsh-iui-plot-key">
              <span className="dsh-iui-plot-swatch" data-series={index} aria-hidden="true" />
              <span>{labels[index] ?? `y = ${printExpr(curve)}`}</span>
            </span>
          ))}
        </div>
      ) : null}
      {readout(geometry)}
    </figure>
  )
}

/** The figures a reader would otherwise read off the plot. */
function readout(geometry: Geometry): ReactNode {
  const parts: string[] = []
  if (geometry.mark !== undefined) {
    parts.push(`${geometry.variable} = ${formatSignificant(geometry.mark.x, 6)}`, `y = ${formatSignificant(geometry.mark.y, 6)}`)
    if (geometry.mark.slope !== undefined) parts.push(`slope = ${formatSignificant(geometry.mark.slope, 6)}`)
  }
  if (geometry.shade?.area !== undefined) parts.push(`area = ${formatSignificant(geometry.shade.area, 6)}`)
  return parts.length === 0 ? null : <div className="dsh-iui-plot-readout">{parts.join(' · ')}</div>
}

/**
 * Sample the curves and settle the ranges.
 * @param node - the plot node.
 * @param values - current state and derived values.
 * @returns the plot's geometry in data coordinates.
 */
export function measure(node: NodeRow, values: ReadonlyMap<string, JsonValue>): Geometry {
  const budget = createBudget(PLOT_BUDGET)
  const read = (key: string): JsonValue | undefined => values.get(key)
  const variable = typeof node.props.var === 'string' && node.props.var !== '' ? node.props.var : 'x'
  const numberOf = (value: unknown): number | undefined => {
    if (value === undefined) return undefined
    const produced = evalExpr(value, read, budget)
    return typeof produced === 'number' ? produced : undefined
  }
  let from = numberOf(node.props.from) ?? -5
  let to = numberOf(node.props.to) ?? 5
  if (from > to) [from, to] = [to, from]
  if (from === to) to = from + 1
  const curves = (Array.isArray(node.props.fn) ? (node.props.fn as unknown[]) : []).slice(0, MAX_CURVES)
  const bindings = new Map<string, number>()
  const at = (curve: unknown, x: number): number => {
    bindings.set(variable, x)
    const produced = evalExpr(curve, read, budget, bindings)
    return typeof produced === 'number' ? produced : Number.NaN
  }
  const sampled = curves.map(curve => Array.from({ length: SAMPLES }, (_, index) => {
    const x = from + (to - from) * index / (SAMPLES - 1)
    return { x, y: at(curve, x) }
  }))
  const geometry: Geometry = { variable, from, to, low: -1, high: 1, curves: sampled }
  const first = curves[0]
  const markX = numberOf(node.props.mark)
  if (first !== undefined && markX !== undefined) {
    const y = at(first, markX)
    if (Number.isFinite(y)) {
      geometry.mark = { x: markX, y }
      if (node.props.tangent !== undefined && evalExpr(node.props.tangent, read, budget) === true) {
        const slope = evalExpr(['deriv', variable, first, markX], read, budget)
        if (typeof slope === 'number') geometry.mark.slope = slope
      }
    }
  }
  const shadeFrom = numberOf(node.props.shadeFrom)
  const shadeTo = numberOf(node.props.shadeTo)
  if (first !== undefined && shadeFrom !== undefined && shadeTo !== undefined) {
    const lo = Math.max(from, Math.min(shadeFrom, shadeTo))
    const hi = Math.min(to, Math.max(shadeFrom, shadeTo))
    const area = evalExpr(['integral', variable, first, shadeFrom, shadeTo], read, budget)
    const points = hi > lo
      ? Array.from({ length: 101 }, (_, index) => { const x = lo + (hi - lo) * index / 100; return { x, y: at(first, x) } })
      : []
    geometry.shade = { from: lo, to: hi, points, ...(typeof area === 'number' ? { area } : {}) }
  }
  const [low, high] = range(sampled, numberOf(node.props.ymin), numberOf(node.props.ymax), geometry.mark?.y)
  geometry.low = low
  geometry.high = high
  return geometry
}

/**
 * The vertical range: the program's when it gave both ends, otherwise the data's
 * with the outer 2% cut away when they are far from the rest (asymptotes), and
 * zero included when it is nearby so the axis is visible.
 */
function range(curves: Point[][], ymin: number | undefined, ymax: number | undefined, mark: number | undefined): [number, number] {
  const finite = curves.flat().map(point => point.y).filter(Number.isFinite)
  if (mark !== undefined && Number.isFinite(mark)) finite.push(mark)
  let low: number
  let high: number
  if (finite.length === 0) {
    low = -1
    high = 1
  } else {
    finite.sort((a, b) => a - b)
    const min = finite[0] as number
    const max = finite.at(-1) as number
    const q = (fraction: number): number => finite[Math.min(finite.length - 1, Math.max(0, Math.round(fraction * (finite.length - 1))))] as number
    const innerLow = q(0.02)
    const innerHigh = q(0.98)
    const spread = innerHigh - innerLow
    const robust = finite.length > 20 && spread > 0 && max - min > 4 * spread
    low = robust ? innerLow : min
    high = robust ? innerHigh : max
    if (low > 0 && low < 0.25 * (high - low)) low = 0
    if (high < 0 && -high < 0.25 * (high - low)) high = 0
    const pad = (high - low) * 0.08 || Math.max(1, Math.abs(high)) * 0.5
    low -= pad
    high += pad
  }
  if (ymin !== undefined) low = ymin
  if (ymax !== undefined) high = ymax
  if (!(high > low)) {
    const center = Number.isFinite(low) ? low : 0
    return [center - 1, center + 1]
  }
  return [low, high]
}

/** Whether a value is inside the vertical range. */
function inside(geometry: Geometry, y: number): boolean {
  return y >= geometry.low && y <= geometry.high
}

/**
 * SVG path data for one curve: segments clipped to the box by interpolation,
 * broken at gaps and at jumps larger than the whole range.
 */
function pathOf(points: readonly Point[], geometry: Geometry, sx: (x: number) => number, sy: (y: number) => number): string {
  const span = geometry.high - geometry.low
  const commands: string[] = []
  let drawing = false
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1] as Point
    const b = points[index] as Point
    if (!Number.isFinite(a.y) || !Number.isFinite(b.y) || Math.abs(b.y - a.y) > span) {
      drawing = false
      continue
    }
    const segment = clipSegment(a, b, geometry.low, geometry.high)
    if (segment === undefined) {
      drawing = false
      continue
    }
    const [start, end] = segment
    if (!drawing || start !== a) commands.push(`M${round(sx(start.x))} ${round(sy(start.y))}`)
    commands.push(`L${round(sx(end.x))} ${round(sy(end.y))}`)
    drawing = end === b
  }
  return commands.join('')
}

/** Clip one segment to low ≤ y ≤ high; the original endpoint objects are kept where unclipped. */
function clipSegment(a: Point, b: Point, low: number, high: number): [Point, Point] | undefined {
  if ((a.y < low && b.y < low) || (a.y > high && b.y > high)) return undefined
  const cut = (from: Point, to: Point): Point => {
    const edge = from.y < low ? low : high
    const t = (edge - from.y) / (to.y - from.y)
    return { x: from.x + (to.x - from.x) * t, y: edge }
  }
  const start = a.y < low || a.y > high ? cut(a, b) : a
  const end = b.y < low || b.y > high ? cut(b, a) : b
  return [start, end]
}

/** The tangent line across the plot, clipped to the box. */
function clipLine(geometry: Geometry, x: number, y: number, slope: number): [Point, Point] | undefined {
  const a = { x: geometry.from, y: y + slope * (geometry.from - x) }
  const b = { x: geometry.to, y: y + slope * (geometry.to - x) }
  return clipSegment(a, b, geometry.low, geometry.high)
}

/** Polygon points of the shaded area between the first curve and y = 0. */
function shadePoints(geometry: Geometry, sx: (x: number) => number, sy: (y: number) => number): string {
  const shade = geometry.shade
  if (shade === undefined || shade.points.length === 0) return ''
  const clamp = (y: number): number => Math.min(geometry.high, Math.max(geometry.low, Number.isFinite(y) ? y : 0))
  const base = clamp(0)
  const outline = shade.points.map(point => `${round(sx(point.x))},${round(sy(clamp(point.y)))}`)
  return [`${round(sx(shade.from))},${round(sy(base))}`, ...outline, `${round(sx(shade.to))},${round(sy(base))}`].join(' ')
}

/** Two decimals keep the path small without visible error. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}
