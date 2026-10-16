/**
 * Bar and line charts as inline SVG.
 *
 * Geometry is computed from the values, never measured from the DOM, so a chart
 * draws identically in a test, a server render, and the page. Values may be
 * expressions over state, which is what makes a chart respond to its sliders.
 * @module dsh-intelligent-ui/client/chart
 */

import type { ReactNode } from 'react'
import { formatNumber } from '../lang/expr.ts'
import type { RenderScope } from './components.tsx'
import type { NodeRow } from './program.ts'

/** Plot box in viewBox units; the SVG stretches to the card's width. */
const WIDTH = 320
const HEIGHT = 120
/** Headroom above the tallest mark. */
const TOP = 8

/**
 * Draw one chart node.
 * @param node - the chart node.
 * @param scope - values and helpers.
 * @returns the chart figure.
 */
export function renderChart(node: NodeRow, scope: RenderScope): ReactNode {
  const labels = Array.isArray(node.props.labels) ? (node.props.labels as unknown[]).map(label => scope.text(label)) : []
  const raw = Array.isArray(node.props.values) ? node.props.values as unknown[] : []
  const series = raw.map(entry => scope.number(entry) ?? 0)
  const count = Math.max(series.length, 1)
  const unit = typeof node.props.unit === 'string' && node.props.unit !== '' ? ` ${node.props.unit}` : ''
  const peak = Math.max(...series, 0)
  const floor = Math.min(...series, 0)
  const span = peak - floor || 1
  const slot = WIDTH / count
  const y = (value: number): number => TOP + (peak - value) / span * (HEIGHT - TOP)
  const baseline = y(0)
  const line = node.props.shape === 'line'
  const marks: ReactNode[] = []
  if (line && series.length > 1) {
    const points = series.map((value, index) => `${(index + 0.5) * slot},${y(value)}`).join(' ')
    marks.push(<polyline key="line" className="dsh-iui-chart-line" points={points} />)
  }
  for (const [index, value] of series.entries()) {
    const label = `${labels[index] ?? ''}: ${formatNumber(value)}${unit}`
    if (line) {
      marks.push(
        <circle key={`dot${index}`} className="dsh-iui-chart-dot" cx={(index + 0.5) * slot} cy={y(value)} r={3}>
          <title>{label}</title>
        </circle>,
      )
    } else {
      const top = Math.min(y(value), baseline)
      marks.push(
        <rect
          key={`bar${index}`}
          className="dsh-iui-chart-bar"
          x={index * slot + slot * 0.2}
          y={top}
          width={slot * 0.6}
          height={Math.max(Math.abs(baseline - y(value)), 1)}
          rx={2}
        >
          <title>{label}</title>
        </rect>,
      )
    }
  }
  return (
    <figure className="dsh-iui-figure dsh-iui-chart">
      {node.props.caption === undefined ? null : <figcaption className="dsh-iui-caption">{scope.text(node.props.caption)}</figcaption>}
      <svg className="dsh-iui-chart-plot" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={labels.join(', ')}>
        <line className="dsh-iui-chart-axis" x1={0} x2={WIDTH} y1={baseline} y2={baseline} />
        {marks}
      </svg>
      <div className="dsh-iui-chart-labels" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {series.map((value, index) => (
          <span key={index}>
            <span className="dsh-iui-chart-label">{labels[index] ?? ''}</span>
            <span className="dsh-iui-chart-value">{`${formatNumber(value)}${unit}`}</span>
          </span>
        ))}
      </div>
    </figure>
  )
}
