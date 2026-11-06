/**
 * A drawing as inline SVG: an optional SVG drawing, with shape lines above it.
 *
 * Shapes are computed from their expressions on every change of state, so sliders
 * and a player move them with no wiring. A shape's coordinates are mapped by
 * arithmetic to a box as wide as the canvas is on the page, so a line weight, a
 * label, and a point are the same size in pixels whatever the coordinates are and
 * however narrow the screen. That width and where a pointer is during a drag are
 * the only things read from the page.
 *
 * A shape can turn, scale, and fade with `rotate=`, `scale=`, and `opacity=`, so a
 * played state animates it. A `curve` is sampled here from its expressions, and a
 * `use` shape places a part of the SVG drawing, by id, wherever its `x y` say.
 *
 * A dragged point writes the number states its `x=` and `y=` name, and a clicked
 * shape writes its `value=` into the state it binds; those go through the card's
 * own edit path, so a state's limits hold and the change is kept like any other.
 *
 * The SVG drawing is checked again here, and drawn through {@link ELEMENTS}, a
 * fixed table with one literal element per allowed name: a stored name that is not
 * in the table cannot become an element. Its ids are prefixed per copy of the card,
 * because every drawing on a page shares one id space.
 * @module dsh-intelligent-ui/client/canvas
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { SHAPES_MOVED } from '../lang/catalog.ts'
import { createBudget, evalExpr, formatNumber } from '../lang/expr.ts'
import { checkDrawing, drawingIds, PATH_DATA, type SvgAttrs, type SvgChild, type SvgDrawing } from '../lang/svg.ts'
import type { JsonValue } from '../lang/types.ts'
import type { RenderScope } from './components.tsx'
import { flag } from './parts.tsx'
import type { NodeRow, StateRow } from './program.ts'

/** The canvas's width until the page has reported it, in viewBox units. */
const WIDTH = 600

/** The tallest a canvas is drawn, in pixels; the stylesheet's `max-height` says the same. */
const MAX_HEIGHT = 480

/** Coordinates of a canvas that names none, as left, right, bottom, top. */
const DEFAULT_VIEW = [0, 320, 200, 0] as const

/** A point's radius and an arrowhead's size, in viewBox units. */
const POINT_RADIUS = 6
const HEAD_LENGTH = 11
const HEAD_WIDTH = 8

/** How far a point's label sits from its centre, in viewBox units. */
const POINT_LABEL_OFFSET = 12

/** Samples along one curve. */
const CURVE_SAMPLES = 240

/** Work one curve may spend on its samples, so a heavy one degrades instead of stalling the page. */
const CURVE_BUDGET = 400_000

/** How many canvas widths beyond its edges a curve still draws; farther out it breaks, as tan(x) does at its poles. */
const CURVE_REACH = 4

/** Maps a canvas's coordinates to the viewBox and back. */
interface Frame {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
  scale: number
  /** The viewBox moves right as x grows when 1, left when -1. */
  dirX: number
  /** The viewBox moves down as y grows when 1, up when -1. */
  dirY: number
}

/**
 * The frame for one set of coordinates.
 * @param view - left, right, bottom, top.
 * @param available - how wide the canvas may be; a tall view is drawn narrower, to stay under {@link MAX_HEIGHT}.
 * @returns the frame.
 */
function frameOf(view: readonly number[], available: number): Frame {
  const [left, right, bottom, top] = view as readonly [number, number, number, number]
  const across = Math.abs(right - left)
  const down = Math.abs(bottom - top)
  const width = Math.min(available, MAX_HEIGHT * across / down)
  const scale = width / across
  return {
    left,
    right,
    top,
    bottom,
    width: tidy(width),
    height: tidy(down * scale),
    scale,
    dirX: right > left ? 1 : -1,
    dirY: bottom > top ? 1 : -1,
  }
}

const sx = (frame: Frame, x: number): number => tidy((x - frame.left) * frame.dirX * frame.scale)
const sy = (frame: Frame, y: number): number => tidy((y - frame.top) * frame.dirY * frame.scale)

/** Two decimals are finer than any screen shows, and keep the markup short. */
function tidy(value: number): number {
  return Math.round(value * 100) / 100
}

/** How wide an element is on the page, in whole pixels, once the page has said; a hidden copy keeps the last width. */
function useWidth(box: RefObject<Element | null>): number {
  const [width, setWidth] = useState(WIDTH)
  useEffect(() => {
    const element = box.current
    if (element === null || typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0)
      if (next > 0) setWidth(next)
    })
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [box])
  return width
}

/** The coordinates a canvas draws in: its drawing's, its own, or the default. */
function viewOf(node: NodeRow, drawing: SvgDrawing | undefined): readonly number[] {
  if (drawing !== undefined) {
    const [x, y, width, height] = drawing.viewBox
    return [x, x + width, y + height, y]
  }
  const view = node.props.view
  if (Array.isArray(view) && view.length === 4 && view.every(entry => typeof entry === 'number' && Number.isFinite(entry))) {
    const [left, right, bottom, top] = view as number[]
    if (left !== right && bottom !== top) return view as number[]
  }
  return DEFAULT_VIEW
}

/**
 * Draw one canvas.
 * @param props - the canvas node and the card's scope.
 * @returns the figure.
 */
export function CanvasFigure(props: { node: NodeRow; scope: RenderScope }): ReactNode {
  const { node, scope } = props
  const prefix = `dsh-iui-draw-${useId().replace(/[^\w-]/gu, '')}-`
  const figure = useRef<HTMLElement>(null)
  const plot = useRef<SVGSVGElement>(null)
  const available = useWidth(figure)
  const drawing = useMemo(() => checkDrawing(node.props.svg), [node.props.svg])
  const frame = useMemo(() => frameOf(viewOf(node, drawing), available), [node, drawing, available])
  const shapes = (scope.program.children.get(node.id) ?? [])
    .map(id => scope.program.byId.get(id))
    .filter((child): child is NodeRow => child?.type === 'shape')
  const caption = node.props.caption === undefined ? undefined : scope.text(node.props.caption)
  const live = shapes.some(child => child.bind !== undefined)
  const parts = useMemo<Parts | undefined>(() => (drawing === undefined ? undefined : { drawing, ids: drawingIds(drawing), prefix }), [drawing, prefix])
  return (
    <figure ref={figure} className="dsh-iui-figure dsh-iui-canvas">
      {caption === undefined ? null : <figcaption className="dsh-iui-caption">{caption}</figcaption>}
      <svg
        ref={plot}
        className="dsh-iui-canvas-plot"
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        role={live ? 'group' : 'img'}
        aria-label={caption ?? scope.tr('canvas.label')}
      >
        {drawing === undefined ? null : <Drawing drawing={drawing} frame={frame} prefix={prefix} />}
        {shapes.map(child => <ShapeMark key={child.id} node={child} scope={scope} frame={frame} plot={plot} parts={parts} />)}
      </svg>
    </figure>
  )
}

/** The drawing whose parts `use` shapes place, its ids, and this copy's id prefix. */
interface Parts {
  drawing: SvgDrawing
  ids: ReadonlySet<string>
  prefix: string
}

/** How opaque a shape is, from 0 to 1, when `opacity=` says. */
function opacityOf(node: NodeRow, scope: RenderScope): number | undefined {
  const value = node.props.opacity === undefined ? undefined : scope.number(node.props.opacity)
  return value === undefined || Number.isNaN(value) ? undefined : Math.max(0, Math.min(1, value))
}

/** Element props that any shape's outer group carries. */
function markProps(node: NodeRow, scope: RenderScope): Record<string, unknown> {
  const tone = typeof node.props.tone === 'string' ? node.props.tone : undefined
  return {
    opacity: opacityOf(node, scope),
    className: 'dsh-iui-shape',
    'data-kind': node.props.kind,
    'data-tone': tone,
    'data-size': typeof node.props.size === 'string' ? node.props.size : undefined,
    'data-fill': flag(node, 'fill', scope) ? '' : undefined,
    'data-dash': flag(node, 'dash', scope) ? '' : undefined,
  }
}

/**
 * The transform that moves, turns, and sizes a shape, in viewBox units, or undefined
 * when it does none of these. Turns follow the canvas's own axes: with y upward a
 * positive angle turns counter-clockwise, with y downward clockwise, as in SVG.
 */
function placement(node: NodeRow, scope: RenderScope, frame: Frame, x: number | undefined, y: number | undefined): string | undefined {
  const turn = node.props.rotate === undefined ? 0 : scope.number(node.props.rotate) ?? 0
  const size = node.props.scale === undefined ? 1 : scope.number(node.props.scale) ?? 1
  const angle = Number.isFinite(turn) ? tidy(turn * frame.dirX * frame.dirY) : 0
  const factor = Number.isFinite(size) ? size : 1
  const px = sx(frame, x ?? 0)
  const py = sy(frame, y ?? 0)
  // A moved shape is drawn around 0 0, which the move carries to x y.
  const moved = SHAPES_MOVED.has(String(node.props.kind))
  const ox = moved ? sx(frame, 0) : px
  const oy = moved ? sy(frame, 0) : py
  if (angle === 0 && factor === 1 && ox === px && oy === py) return undefined
  return `translate(${px} ${py})${angle === 0 ? '' : ` rotate(${angle})`}${factor === 1 ? '' : ` scale(${factor})`} translate(${-ox} ${-oy})`
}

/** Draw one shape, or nothing when it is hidden or a figure it needs cannot be computed. */
function ShapeMark(props: { node: NodeRow; scope: RenderScope; frame: Frame; plot: RefObject<SVGSVGElement | null>; parts: Parts | undefined }): ReactNode {
  const { node, scope, frame, plot, parts } = props
  if (node.props.show !== undefined && !flag(node, 'show', scope)) return null
  const at = (name: string): number | undefined => {
    const value = node.props[name] === undefined ? undefined : scope.number(node.props[name])
    return value !== undefined && Number.isFinite(value) ? value : undefined
  }
  const x = at('x')
  const y = at('y')
  const kind = node.props.kind
  if (kind === 'point') {
    if (x === undefined || y === undefined) return null
    const radius = at('r')
    return <PointMark node={node} scope={scope} frame={frame} plot={plot} x={x} y={y} radius={radius === undefined ? POINT_RADIUS : Math.abs(radius) * frame.scale} />
  }
  if (kind === 'use') return <PartMark node={node} scope={scope} frame={frame} parts={parts} x={x ?? 0} y={y ?? 0} />
  const body = shapeBody(node, scope, frame, at, x, y)
  if (body === null) return null
  return <g {...markProps(node, scope)} transform={placement(node, scope, frame, x, y)} {...tapProps(node, scope)}>{body}</g>
}

/**
 * A part of the SVG drawing placed by a `use` shape: its own 0 0 goes to `x y`, and
 * it turns and scales about that point. It keeps the drawing's colours, so it
 * carries none of a shape's tones.
 */
function PartMark(props: { node: NodeRow; scope: RenderScope; frame: Frame; parts: Parts | undefined; x: number; y: number }): ReactNode {
  const { node, scope, frame, parts, x, y } = props
  const ref = typeof node.props.ref === 'string' ? node.props.ref : ''
  if (parts === undefined || !parts.ids.has(ref)) return null
  const turn = node.props.rotate === undefined ? 0 : scope.number(node.props.rotate) ?? 0
  const size = node.props.scale === undefined ? 1 : scope.number(node.props.scale) ?? 1
  const angle = Number.isFinite(turn) ? tidy(turn) : 0
  const factor = (Number.isFinite(size) ? size : 1) * frame.scale
  // The root's colours reach the part as they reach the drawing; its id stays with the drawing.
  const inherited = elementProps(parts.drawing.attrs, parts.prefix)
  delete inherited.id
  return (
    <g className="dsh-iui-canvas-drawing dsh-iui-shape-part" data-kind="use" opacity={opacityOf(node, scope)} {...tapProps(node, scope)}>
      <g {...inherited} transform={`translate(${sx(frame, x)} ${sy(frame, y)})${angle === 0 ? '' : ` rotate(${angle})`} scale(${factor})`}>
        <use href={`#${parts.prefix}${ref}`} />
      </g>
    </g>
  )
}

/** The elements of a shape other than a point. */
function shapeBody(
  node: NodeRow,
  scope: RenderScope,
  frame: Frame,
  at: (name: string) => number | undefined,
  x: number | undefined,
  y: number | undefined,
): ReactNode {
  switch (node.props.kind) {
    case 'line': {
      const x2 = at('x2')
      const y2 = at('y2')
      if (x === undefined || y === undefined || x2 === undefined || y2 === undefined) return null
      return lineBody(node, scope, sx(frame, x), sy(frame, y), sx(frame, x2), sy(frame, y2))
    }
    case 'rect':
    case 'hotspot': {
      const w = at('w')
      const h = at('h')
      if (x === undefined || y === undefined || w === undefined || h === undefined) return null
      const [x1, x2] = [sx(frame, x), sx(frame, x + w)] as const
      const [y1, y2] = [sy(frame, y), sy(frame, y + h)] as const
      return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} />
    }
    case 'circle': {
      const r = at('r')
      if (x === undefined || y === undefined || r === undefined) return null
      return <circle cx={sx(frame, x)} cy={sy(frame, y)} r={tidy(Math.abs(r) * frame.scale)} />
    }
    case 'polygon':
    case 'polyline': {
      const points = pointsOf(node, scope, frame)
      if (points === undefined) return null
      return node.props.kind === 'polygon' ? <polygon points={points} /> : <polyline points={points} />
    }
    case 'curve': {
      const d = curvePath(node, scope, frame, at)
      return d === undefined ? null : <path d={d} />
    }
    case 'path': {
      const d = scope.text(node.props.d)
      if (d === '' || !PATH_DATA.test(d)) return null
      const a = frame.dirX * frame.scale
      const e = frame.dirY * frame.scale
      return <path d={d} transform={`matrix(${a} 0 0 ${e} ${tidy(-frame.left * a)} ${tidy(-frame.top * e)})`} />
    }
    case 'text': {
      if (x === undefined || y === undefined) return null
      const anchor = node.props.anchor === 'start' || node.props.anchor === 'end' ? node.props.anchor : 'middle'
      return <text x={sx(frame, x)} y={sy(frame, y)} textAnchor={anchor} dominantBaseline="middle">{scope.text(node.props.text)}</text>
    }
    default:
      return null
  }
}

/** A line, with its head when `arrow=` is true, and a wider invisible stroke when it is clicked. */
function lineBody(node: NodeRow, scope: RenderScope, x1: number, y1: number, x2: number, y2: number): ReactNode {
  const length = Math.hypot(x2 - x1, y2 - y1)
  const arrow = flag(node, 'arrow', scope) && length > 0
  const ux = arrow ? (x2 - x1) / length : 0
  const uy = arrow ? (y2 - y1) / length : 0
  const shaftX = tidy(x2 - ux * HEAD_LENGTH * 0.7)
  const shaftY = tidy(y2 - uy * HEAD_LENGTH * 0.7)
  const baseX = x2 - ux * HEAD_LENGTH
  const baseY = y2 - uy * HEAD_LENGTH
  const half = HEAD_WIDTH / 2
  return (
    <>
      {node.bind === undefined ? null : <line className="dsh-iui-shape-hit" x1={x1} y1={y1} x2={x2} y2={y2} />}
      <line x1={x1} y1={y1} x2={arrow ? shaftX : x2} y2={arrow ? shaftY : y2} />
      {arrow ? <polygon className="dsh-iui-shape-head" points={`${x2},${y2} ${tidy(baseX - uy * half)},${tidy(baseY + ux * half)} ${tidy(baseX + uy * half)},${tidy(baseY - ux * half)}`} /> : null}
    </>
  )
}

/**
 * A curve's path in viewBox units: y = fn(var) from `from` to `to` (the canvas's
 * width when they are not given), or the point [x, y] = fn(var) along the way.
 * It breaks where a value cannot be computed or runs far off the canvas.
 * @returns the path data, or undefined when fewer than two points can be computed.
 */
function curvePath(node: NodeRow, scope: RenderScope, frame: Frame, at: (name: string) => number | undefined): string | undefined {
  const fns = Array.isArray(node.props.fn) ? node.props.fn as unknown[] : []
  const pair = fns.length === 2
  const variable = typeof node.props.var === 'string' && node.props.var !== '' ? node.props.var : 'x'
  const from = at('from') ?? (pair ? undefined : Math.min(frame.left, frame.right))
  const to = at('to') ?? (pair ? undefined : Math.max(frame.left, frame.right))
  if (fns.length === 0 || from === undefined || to === undefined || from === to) return undefined
  const budget = createBudget(CURVE_BUDGET)
  const bindings = new Map<string, number>()
  const read = (key: string): JsonValue | undefined => scope.values.get(key)
  const value = (expr: unknown, t: number): number => {
    bindings.set(variable, t)
    const produced = evalExpr(expr, read, budget, bindings)
    return typeof produced === 'number' ? produced : Number.NaN
  }
  const reachX = frame.width * CURVE_REACH
  const reachY = frame.height * CURVE_REACH
  const steps: string[] = []
  let pen = false
  let drawn = 0
  for (let index = 0; index < CURVE_SAMPLES; index += 1) {
    const t = from + (to - from) * index / (CURVE_SAMPLES - 1)
    const px = sx(frame, pair ? value(fns[0], t) : t)
    const py = sy(frame, value(pair ? fns[1] : fns[0], t))
    if (!Number.isFinite(px) || !Number.isFinite(py) || Math.abs(px) > reachX || Math.abs(py) > reachY) {
      pen = false
      continue
    }
    steps.push(`${pen ? 'L' : 'M'}${px} ${py}`)
    pen = true
    drawn += 1
  }
  return drawn < 2 ? undefined : steps.join('')
}

/** A polygon's points in viewBox units, or undefined when fewer than two can be computed. */
function pointsOf(node: NodeRow, scope: RenderScope, frame: Frame): string | undefined {
  if (!Array.isArray(node.props.points)) return undefined
  const entries = node.props.points as unknown[]
  const pairs: string[] = []
  for (let index = 0; index + 1 < entries.length; index += 2) {
    const x = scope.number(entries[index])
    const y = scope.number(entries[index + 1])
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) continue
    pairs.push(`${sx(frame, x)},${sy(frame, y)}`)
  }
  return pairs.length < 2 ? undefined : pairs.join(' ')
}

/**
 * A pointer never gives a shape focus. Chromium treats focus on an element inside
 * an SVG as keyboard focus even after a click, and the ring is for the keyboard.
 */
function keepFocus(event: MouseEvent): void {
  event.preventDefault()
}

/** What makes a shape clickable: it stores `value=`, or toggles a true/false state that names none. */
function tapProps(node: NodeRow, scope: RenderScope): Record<string, unknown> {
  const key = node.bind
  if (key === undefined || node.props.dragX !== undefined || node.props.dragY !== undefined) return {}
  const row = scope.program.state.find(entry => entry.key === key)
  const value = node.props.value as JsonValue | undefined
  const current = scope.values.get(key)
  if (row === undefined || (value === undefined && row.kind !== 'boolean')) return {}
  const toggles = value === undefined
  const fire = (): void => { scope.setValue(key, toggles ? current !== true : value) }
  return {
    'data-tap': '',
    role: 'button',
    tabIndex: 0,
    'aria-label': node.props.text === undefined ? String(value ?? key) : scope.text(node.props.text),
    'aria-pressed': toggles ? current === true : current === value,
    onClick: fire,
    onMouseDown: keepFocus,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      fire()
    },
  }
}

/** A step fine enough to place a point by hand without leaving long decimals in the state. */
function naturalStep(span: number, divisions: number): number {
  return 10 ** Math.floor(Math.log10(span / divisions))
}

/** A value on its state's steps. */
function onStep(row: StateRow | undefined, value: number, fallback: number): number {
  const step = row?.step !== undefined && row.step > 0 ? row.step : fallback
  const base = row?.min ?? 0
  const placed = base + Math.round((value - base) / step) * step
  return Math.round(placed * 1e9) / 1e9
}

/** Where a pointer is in the canvas's coordinates; the box is read only for this. */
function pointerAt(event: PointerEvent, plot: SVGSVGElement | null, frame: Frame): { x: number; y: number } | undefined {
  const box = plot?.getBoundingClientRect()
  if (box === undefined || box.width <= 0 || box.height <= 0) return undefined
  // The picture is centred in its box when the box's shape differs from its own.
  const ratio = Math.min(box.width / frame.width, box.height / frame.height)
  const px = (event.clientX - box.left - (box.width - frame.width * ratio) / 2) / ratio
  const py = (event.clientY - box.top - (box.height - frame.height * ratio) / 2) / ratio
  return { x: frame.left + px / (frame.dirX * frame.scale), y: frame.top + py / (frame.dirY * frame.scale) }
}

/** A point: a dot and its label, which the reader can drag when `drag=` is true. */
function PointMark(props: { node: NodeRow; scope: RenderScope; frame: Frame; plot: RefObject<SVGSVGElement | null>; x: number; y: number; radius: number }): ReactNode {
  const { node, scope, frame, plot, x, y, radius } = props
  const grab = useRef<{ dx: number; dy: number } | undefined>(undefined)
  const handle = useRef<SVGGElement>(null)
  const xKey = typeof node.props.dragX === 'string' ? node.props.dragX : undefined
  const yKey = typeof node.props.dragY === 'string' ? node.props.dragY : undefined
  const movable = (xKey !== undefined || yKey !== undefined) && flag(node, 'drag', scope)
  // A touch that starts on the point moves the point, not the page. touch-action does not
  // reach an element inside an SVG, and React's own touch listeners cannot cancel.
  useEffect(() => {
    const element = handle.current
    if (element === null) return undefined
    const hold = (event: TouchEvent): void => { event.preventDefault() }
    element.addEventListener('touchstart', hold, { passive: false })
    return () => { element.removeEventListener('touchstart', hold) }
  }, [movable])
  const cx = sx(frame, x)
  const cy = sy(frame, y)
  const label = node.props.text === undefined ? undefined : scope.text(node.props.text)
  const spanX = Math.abs(frame.right - frame.left)
  const spanY = Math.abs(frame.bottom - frame.top)
  const rowOf = (key: string | undefined): StateRow | undefined => scope.program.state.find(entry => entry.key === key)
  const inView = (value: number, a: number, b: number): number => Math.max(Math.min(a, b), Math.min(Math.max(a, b), value))
  const move = (nextX: number, nextY: number, fine: number): void => {
    if (xKey !== undefined) scope.setValue(xKey, onStep(rowOf(xKey), inView(nextX, frame.left, frame.right), naturalStep(spanX, fine)))
    if (yKey !== undefined) scope.setValue(yKey, onStep(rowOf(yKey), inView(nextY, frame.bottom, frame.top), naturalStep(spanY, fine)))
  }
  const tone = markProps(node, scope)
  const body = (
    <>
      {movable ? <circle className="dsh-iui-shape-hit" cx={cx} cy={cy} r={Math.max(radius, POINT_RADIUS) + 10} /> : null}
      <circle className="dsh-iui-shape-dot" cx={cx} cy={cy} r={tidy(radius)} />
      {label === undefined ? null : <text x={tidy(cx + POINT_LABEL_OFFSET)} y={tidy(cy - POINT_LABEL_OFFSET)} dominantBaseline="middle">{label}</text>}
    </>
  )
  if (!movable) return <g {...tone} {...tapProps(node, scope)}>{body}</g>
  const row = rowOf(xKey ?? yKey)
  const start = (event: PointerEvent<SVGGElement>): void => {
    const at = pointerAt(event, plot.current, frame)
    if (at === undefined) return
    grab.current = { dx: x - at.x, dy: y - at.y }
    if (typeof event.currentTarget.setPointerCapture === 'function') event.currentTarget.setPointerCapture(event.pointerId)
  }
  const drag = (event: PointerEvent<SVGGElement>): void => {
    if (grab.current === undefined) return
    const at = pointerAt(event, plot.current, frame)
    if (at !== undefined) move(at.x + grab.current.dx, at.y + grab.current.dy, 300)
  }
  const release = (): void => { grab.current = undefined }
  const nudge = (event: KeyboardEvent): void => {
    const across = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const along = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if ((across === 0 || xKey === undefined) && (along === 0 || yKey === undefined)) return
    event.preventDefault()
    const stepX = rowOf(xKey)?.step ?? naturalStep(spanX, 100)
    const stepY = rowOf(yKey)?.step ?? naturalStep(spanY, 100)
    move(x + across * frame.dirX * stepX, y + along * frame.dirY * stepY, 100)
  }
  return (
    <g
      ref={handle}
      {...tone}
      data-drag=""
      role="slider"
      tabIndex={0}
      aria-label={label ?? scope.tr('canvas.point')}
      aria-valuenow={xKey === undefined ? y : x}
      aria-valuetext={`${formatNumber(x)}, ${formatNumber(y)}`}
      {...(row?.min === undefined ? {} : { 'aria-valuemin': row.min })}
      {...(row?.max === undefined ? {} : { 'aria-valuemax': row.max })}
      onPointerDown={start}
      onPointerMove={drag}
      onPointerUp={release}
      onPointerCancel={release}
      onMouseDown={keepFocus}
      onKeyDown={nudge}
    >
      {body}
    </g>
  )
}

/** Draw the SVG drawing under the shapes, in the canvas's coordinates. */
function Drawing(props: { drawing: SvgDrawing; frame: Frame; prefix: string }): ReactNode {
  const { drawing, frame, prefix } = props
  const [x, y] = drawing.viewBox
  return (
    <g className="dsh-iui-canvas-drawing" transform={`scale(${frame.scale}) translate(${-x} ${-y})`}>
      <g {...elementProps(drawing.attrs, prefix)}>{drawChildren(drawing.children, prefix)}</g>
    </g>
  )
}

/** React props for one element's attributes, with its ids and references made local to this copy. */
function elementProps(attrs: SvgAttrs, prefix: string): Record<string, string> {
  const props: Record<string, string> = {}
  for (const [name, value] of Object.entries(attrs)) {
    const local = name === 'id' ? `${prefix}${value}`
      : name === 'href' ? `#${prefix}${value.slice(1)}`
        : value.startsWith('url(#') ? `url(#${prefix}${value.slice(5)}`
          : value
    props[name.replace(/-(\w)/gu, (_, letter: string) => letter.toUpperCase())] = local
  }
  return props
}

/** Draw a drawing's children, in order. */
function drawChildren(children: readonly SvgChild[], prefix: string): ReactNode[] {
  return children.map((child, index) => {
    if (typeof child === 'string') return child
    const [tag, attrs, ...inner] = child
    const element = Object.hasOwn(ELEMENTS, tag) ? ELEMENTS[tag] : undefined
    return element === undefined ? null : <SvgNode key={index} draw={element} props={elementProps(attrs, prefix)} inner={drawChildren(inner, prefix)} />
  })
}

/** One element of a drawing. */
function SvgNode(props: { draw: SvgDraw; props: Record<string, string>; inner: ReactNode[] }): ReactNode {
  return props.draw(props.props, props.inner)
}

/** Draws one allowed element. */
type SvgDraw = (props: Record<string, string>, children: ReactNode[]) => ReactNode

/** The elements a drawing can become: one literal per name the checked lists allow. */
const ELEMENTS: Readonly<Record<string, SvgDraw>> = {
  g: (props, children) => <g {...props}>{children}</g>,
  path: (props, children) => <path {...props}>{children}</path>,
  rect: (props, children) => <rect {...props}>{children}</rect>,
  circle: (props, children) => <circle {...props}>{children}</circle>,
  ellipse: (props, children) => <ellipse {...props}>{children}</ellipse>,
  line: (props, children) => <line {...props}>{children}</line>,
  polyline: (props, children) => <polyline {...props}>{children}</polyline>,
  polygon: (props, children) => <polygon {...props}>{children}</polygon>,
  text: (props, children) => <text {...props}>{children}</text>,
  tspan: (props, children) => <tspan {...props}>{children}</tspan>,
  title: (props, children) => <title {...props}>{children}</title>,
  desc: (props, children) => <desc {...props}>{children}</desc>,
  defs: (props, children) => <defs {...props}>{children}</defs>,
  linearGradient: (props, children) => <linearGradient {...props}>{children}</linearGradient>,
  radialGradient: (props, children) => <radialGradient {...props}>{children}</radialGradient>,
  stop: (props, children) => <stop {...props}>{children}</stop>,
  clipPath: (props, children) => <clipPath {...props}>{children}</clipPath>,
  mask: (props, children) => <mask {...props}>{children}</mask>,
  pattern: (props, children) => <pattern {...props}>{children}</pattern>,
  marker: (props, children) => <marker {...props}>{children}</marker>,
  symbol: (props, children) => <symbol {...props}>{children}</symbol>,
  use: (props, children) => <use {...props}>{children}</use>,
}
