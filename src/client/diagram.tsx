/**
 * Flowcharts as inline SVG: boxes in layers, arrows between them, one box
 * highlighted by `current=`.
 *
 * The layout is computed here, deterministically, from the texts and the arrows
 * alone: arrows that close a loop are set aside, every box sits one layer below
 * the furthest box that leads to it, and each layer is ordered to keep arrows
 * short. Loops return along a lane beside the boxes. Text width is estimated
 * from the characters, not measured, so a layout never waits for the page and
 * draws the same in every copy of the card.
 * @module dsh-intelligent-ui/client/diagram
 */

import { useMemo, type ReactNode } from 'react'
import type { RenderScope } from './components.tsx'
import type { NodeRow } from './program.ts'

/** Most boxes drawn; the compiler refuses more. */
const MAX_BOXES = 40

/** Most arrows drawn; the compiler refuses more. */
const MAX_ARROWS = 80

/** Box text: font size, line height, widest line, most lines. */
const FONT = 13
const LINE = 17
const MAX_TEXT = 150
const MAX_LINES = 3

/** Box padding, the space between boxes in a layer, and the space between layers. */
const PAD_X = 12
const PAD_Y = 8
const BOX_GAP = 20
const LAYER_GAP = 40

/** Room an arrow label adds between layers. */
const LABEL_ROOM = 18

/** Edge label font size. */
const LABEL_FONT = 12

/** Arrowhead length and half width. */
const HEAD = 7
const HEAD_HALF = 4.5

/** Space around the drawing, and between the boxes and the first loop lane. */
const MARGIN = 8
const LANE = 16
const LANE_STEP = 10

/** Corner radius of a loop's lane, in viewBox units. */
const BEND = 6

/** One arrow between two boxes, by 0-based index. */
export interface DiagramEdge {
  from: number
  to: number
  label?: string
}

/** One laid-out box: its top-left corner, its size, and its wrapped text. */
export interface DiagramBox {
  x: number
  y: number
  w: number
  h: number
  lines: string[]
}

/** One laid-out arrow: the line, the head, and where its label goes. */
export interface DiagramArrow {
  path: string
  head: string
  label?: { x: number; y: number; w: number; text: string }
}

/** A finished layout in viewBox units. */
export interface DiagramLayout {
  width: number
  height: number
  boxes: DiagramBox[]
  arrows: DiagramArrow[]
}

/**
 * Draw one diagram node.
 * @param props - the node and the card's render scope.
 * @returns the diagram figure.
 */
export function DiagramFigure(props: { node: NodeRow; scope: RenderScope }): ReactNode {
  const { node, scope } = props
  const labels = (Array.isArray(node.props.nodes) ? node.props.nodes as unknown[] : []).slice(0, MAX_BOXES).map(entry => scope.text(entry))
  const edges = readEdges(node.props.edges, labels.length, scope)
  const direction = node.props.direction === 'right' ? 'right' : 'down'
  const key = JSON.stringify([labels, edges, direction])
  // The key holds every input, so the layout is recomputed only when one changes.
  const layout = useMemo(() => layoutDiagram(labels, edges, direction), [key])
  const at = node.props.current === undefined ? undefined : scope.number(node.props.current)
  const current = at === undefined ? -1 : Math.floor(at) - 1
  const caption = node.props.caption === undefined ? undefined : scope.text(node.props.caption)
  const summary = [
    caption ?? scope.tr('diagram.label'),
    ...edges.map(edge => `${labels[edge.from] ?? ''} → ${labels[edge.to] ?? ''}${edge.label === undefined ? '' : ` (${edge.label})`}`),
    ...(labels[current] === undefined ? [] : [`▶ ${labels[current] as string}`]),
  ].join('; ')
  return (
    <figure className="dsh-iui-figure dsh-iui-diagram">
      {caption === undefined ? null : <figcaption className="dsh-iui-caption">{caption}</figcaption>}
      <div className="dsh-iui-diagram-wrap">
        <svg className="dsh-iui-diagram-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} role="img" aria-label={summary}>
          {layout.arrows.map((arrow, index) => (
            <g key={`a${index}`}>
              <path className="dsh-iui-diagram-line" d={arrow.path} />
              <path className="dsh-iui-diagram-head" d={arrow.head} />
            </g>
          ))}
          {layout.arrows.map((arrow, index) => (arrow.label === undefined ? null : (
            <g key={`l${index}`}>
              <rect className="dsh-iui-diagram-label-back" x={arrow.label.x - arrow.label.w / 2} y={arrow.label.y - 8} width={arrow.label.w} height={16} rx={3} />
              <text className="dsh-iui-diagram-label" x={arrow.label.x} y={arrow.label.y} textAnchor="middle" dominantBaseline="central">{arrow.label.text}</text>
            </g>
          )))}
          {layout.boxes.map((box, index) => (
            <g key={`b${index}`} className="dsh-iui-diagram-node" data-current={index === current ? '' : undefined}>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={6} />
              <text x={box.x + box.w / 2} textAnchor="middle" dominantBaseline="central">
                {box.lines.map((line, row) => <tspan key={row} x={box.x + box.w / 2} y={box.y + PAD_Y + LINE * (row + 0.5)}>{line}</tspan>)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  )
}

/** The compiled arrows, 0-based, keeping only those between boxes that exist. */
function readEdges(value: unknown, count: number, scope: RenderScope): DiagramEdge[] {
  const edges: DiagramEdge[] = []
  for (const entry of (Array.isArray(value) ? value as unknown[] : []).slice(0, MAX_ARROWS)) {
    if (!Array.isArray(entry)) continue
    const [from, to, label] = entry as unknown[]
    if (typeof from !== 'number' || typeof to !== 'number' || !Number.isInteger(from) || !Number.isInteger(to)) continue
    if (from < 1 || to < 1 || from > count || to > count) continue
    const text = label === undefined ? '' : scope.text(label)
    edges.push(text === '' ? { from: from - 1, to: to - 1 } : { from: from - 1, to: to - 1, label: text })
  }
  return edges
}

/**
 * Lay out boxes and arrows.
 * @param labels - the box texts, in the program's order.
 * @param edges - arrows between boxes, by 0-based index.
 * @param direction - `down` stacks layers top to bottom, `right` left to right.
 * @returns the drawing in viewBox units.
 */
export function layoutDiagram(labels: readonly string[], edges: readonly DiagramEdge[], direction: 'down' | 'right'): DiagramLayout {
  const count = labels.length
  const down = direction === 'down'
  const valid = edges.filter(edge => edge.from >= 0 && edge.to >= 0 && edge.from < count && edge.to < count)
  const back = loopEdges(count, valid)
  const forward = valid.filter((_edge, index) => !back.has(index))
  const layer = layers(count, forward)
  const order = orderLayers(count, layer, forward)
  const boxes: DiagramBox[] = labels.map((label) => {
    const lines = wrap(label)
    const w = Math.max(48, Math.ceil(Math.max(...lines.map(line => measure(line, FONT)))) + PAD_X * 2)
    return { x: 0, y: 0, w, h: lines.length * LINE + PAD_Y * 2, lines }
  })
  const labelled = valid.some(edge => edge.label !== undefined)

  // Place the layers: along the flow one after another, across it centred on the widest.
  const across = (box: DiagramBox): number => (down ? box.w : box.h)
  const along = (box: DiagramBox): number => (down ? box.h : box.w)
  const spans = order.map(row => row.reduce((sum, index) => sum + across(boxes[index] as DiagramBox), 0) + BOX_GAP * Math.max(0, row.length - 1))
  const widest = Math.max(0, ...spans)
  const gap = (down ? LAYER_GAP : LAYER_GAP + 16) + (labelled ? LABEL_ROOM : 0)
  let flow = MARGIN
  for (const [rank, row] of order.entries()) {
    const thickness = Math.max(0, ...row.map(index => along(boxes[index] as DiagramBox)))
    let cursor = MARGIN + (widest - (spans[rank] ?? 0)) / 2
    for (const index of row) {
      const box = boxes[index] as DiagramBox
      if (down) {
        box.x = cursor
        box.y = flow + (thickness - box.h) / 2
      } else {
        box.x = flow + (thickness - box.w) / 2
        box.y = cursor
      }
      cursor += across(box) + BOX_GAP
    }
    flow += thickness + gap
  }
  // Below the first layer, each box moves under the boxes that lead to it, keeping its order and its gap.
  const centre = (box: DiagramBox): number => (down ? box.x + box.w / 2 : box.y + box.h / 2)
  const shift = (box: DiagramBox, start: number): void => {
    if (down) box.x = start
    else box.y = start
  }
  for (const row of order.slice(1)) {
    let cursor = -Infinity
    for (const index of row) {
      const box = boxes[index] as DiagramBox
      const parents = forward.filter(edge => edge.to === index).map(edge => boxes[edge.from] as DiagramBox)
      const wanted = parents.length === 0 ? centre(box) : parents.reduce((sum, parent) => sum + centre(parent), 0) / parents.length
      const start = Math.max(wanted - across(box) / 2, cursor)
      shift(box, start)
      cursor = start + across(box) + BOX_GAP
    }
  }
  const least = Math.min(...boxes.map(box => (down ? box.x : box.y)))
  if (Number.isFinite(least)) for (const box of boxes) shift(box, (down ? box.x : box.y) - least + MARGIN)

  let right = Math.max(MARGIN, ...boxes.map(box => box.x + box.w))
  let bottom = Math.max(MARGIN, ...boxes.map(box => box.y + box.h))
  const arrows: DiagramArrow[] = []

  // Forward arrows leave and enter through ports spread along the facing sides.
  const ports = (index: number, side: 'out' | 'in'): DiagramEdge[] => forward
    .filter(edge => (side === 'out' ? edge.from : edge.to) === index)
    .sort((a, b) => {
      const other = (edge: DiagramEdge): DiagramBox => boxes[side === 'out' ? edge.to : edge.from] as DiagramBox
      return down ? other(a).x - other(b).x : other(a).y - other(b).y
    })
  const portAt = (edge: DiagramEdge, side: 'out' | 'in'): number => {
    const index = side === 'out' ? edge.from : edge.to
    const box = boxes[index] as DiagramBox
    const list = ports(index, side)
    const slot = (list.indexOf(edge) + 1) / (list.length + 1)
    return down ? box.x + box.w * slot : box.y + box.h * slot
  }
  for (const edge of forward) {
    const source = boxes[edge.from] as DiagramBox
    const target = boxes[edge.to] as DiagramBox
    const start = portAt(edge, 'out')
    const end = portAt(edge, 'in')
    if (down) {
      const sy = source.y + source.h
      const tip = target.y
      const ey = tip - HEAD
      const bend = (ey - sy) / 2
      arrows.push({
        path: `M${f(start)} ${f(sy)}C${f(start)} ${f(sy + bend)} ${f(end)} ${f(ey - bend)} ${f(end)} ${f(ey)}`,
        head: `M${f(end)} ${f(tip)}L${f(end - HEAD_HALF)} ${f(ey)}L${f(end + HEAD_HALF)} ${f(ey)}Z`,
        ...labelAt(edge, (start + end) / 2, (sy + ey) / 2),
      })
    } else {
      const sx = source.x + source.w
      const tip = target.x
      const ex = tip - HEAD
      const bend = (ex - sx) / 2
      arrows.push({
        path: `M${f(sx)} ${f(start)}C${f(sx + bend)} ${f(start)} ${f(ex - bend)} ${f(end)} ${f(ex)} ${f(end)}`,
        head: `M${f(tip)} ${f(end)}L${f(ex)} ${f(end - HEAD_HALF)}L${f(ex)} ${f(end + HEAD_HALF)}Z`,
        ...labelAt(edge, (sx + ex) / 2, (start + end) / 2),
      })
    }
  }

  // Loops return along lanes beside the drawing, one lane per arrow, so they never cross a box.
  const edgeOfDrawing = down ? right : bottom
  let lane = 0
  for (const [index, edge] of valid.entries()) {
    if (!back.has(index)) continue
    const source = boxes[edge.from] as DiagramBox
    const target = boxes[edge.to] as DiagramBox
    if (edge.from === edge.to) {
      arrows.push(selfLoop(source, down, edge))
      if (down) right = Math.max(right, source.x + source.w + 30 + labelWidth(edge))
      else bottom = Math.max(bottom, source.y + source.h + 30 + (edge.label === undefined ? 0 : 18))
      continue
    }
    const offset = edgeOfDrawing + LANE + LANE_STEP * lane
    lane += 1
    if (down) {
      const sx = source.x + source.w
      const sy = source.y + source.h / 2
      const tip = target.x + target.w
      const ex = tip + HEAD
      const ey = target.y + target.h / 2
      arrows.push({
        path: `M${f(sx)} ${f(sy)}H${f(offset - BEND)}Q${f(offset)} ${f(sy)} ${f(offset)} ${f(sy - BEND)}V${f(ey + BEND)}Q${f(offset)} ${f(ey)} ${f(offset - BEND)} ${f(ey)}H${f(ex)}`,
        head: `M${f(tip)} ${f(ey)}L${f(ex)} ${f(ey - HEAD_HALF)}L${f(ex)} ${f(ey + HEAD_HALF)}Z`,
        ...labelAt(edge, offset, (sy + ey) / 2),
      })
      right = Math.max(right, offset + (edge.label === undefined ? 0 : labelWidth(edge) / 2))
    } else {
      const sx = source.x + source.w / 2
      const sy = source.y + source.h
      const tip = target.y + target.h
      const ey = tip + HEAD
      const ex = target.x + target.w / 2
      arrows.push({
        path: `M${f(sx)} ${f(sy)}V${f(offset - BEND)}Q${f(sx)} ${f(offset)} ${f(sx - BEND)} ${f(offset)}H${f(ex + BEND)}Q${f(ex)} ${f(offset)} ${f(ex)} ${f(offset - BEND)}V${f(ey)}`,
        head: `M${f(ex)} ${f(tip)}L${f(ex - HEAD_HALF)} ${f(ey)}L${f(ex + HEAD_HALF)} ${f(ey)}Z`,
        ...labelAt(edge, (sx + ex) / 2, offset),
      })
      bottom = Math.max(bottom, offset + (edge.label === undefined ? 0 : 8))
    }
  }

  // Labels stay inside the drawing.
  for (const arrow of arrows) {
    if (arrow.label === undefined) continue
    arrow.label.x = Math.max(MARGIN + arrow.label.w / 2, arrow.label.x)
    right = Math.max(right, arrow.label.x + arrow.label.w / 2)
    bottom = Math.max(bottom, arrow.label.y + 8)
  }
  return { width: Math.ceil(right + MARGIN), height: Math.ceil(bottom + MARGIN), boxes, arrows }
}

/** A loop from a box back to itself, on the side the flow leaves free. */
function selfLoop(box: DiagramBox, down: boolean, edge: DiagramEdge): DiagramArrow {
  if (down) {
    const x = box.x + box.w
    const cy = box.y + box.h / 2
    return {
      path: `M${f(x)} ${f(cy - 6)}C${f(x + 28)} ${f(cy - 18)} ${f(x + 28)} ${f(cy + 18)} ${f(x + HEAD)} ${f(cy + 6)}`,
      head: `M${f(x)} ${f(cy + 6)}L${f(x + HEAD)} ${f(cy + 6 - HEAD_HALF)}L${f(x + HEAD)} ${f(cy + 6 + HEAD_HALF)}Z`,
      ...labelAt(edge, x + 30 + labelWidth(edge) / 2, cy),
    }
  }
  const y = box.y + box.h
  const cx = box.x + box.w / 2
  return {
    path: `M${f(cx - 6)} ${f(y)}C${f(cx - 18)} ${f(y + 28)} ${f(cx + 18)} ${f(y + 28)} ${f(cx + 6)} ${f(y + HEAD)}`,
    head: `M${f(cx + 6)} ${f(y)}L${f(cx + 6 - HEAD_HALF)} ${f(y + HEAD)}L${f(cx + 6 + HEAD_HALF)} ${f(y + HEAD)}Z`,
    ...labelAt(edge, cx, y + 34),
  }
}

/** The label of one arrow placed at a point, when it has one. */
function labelAt(edge: DiagramEdge, x: number, y: number): Pick<DiagramArrow, 'label'> {
  return edge.label === undefined ? {} : { label: { x, y, w: labelWidth(edge), text: edge.label } }
}

/** Width of an arrow's label with its padding. */
function labelWidth(edge: DiagramEdge): number {
  return edge.label === undefined ? 0 : Math.ceil(measure(edge.label, LABEL_FONT)) + 10
}

/**
 * The arrows that close a loop: a depth-first walk from each box in order marks
 * every arrow back to a box still on the walk's path, and every arrow to itself.
 */
function loopEdges(count: number, edges: readonly DiagramEdge[]): Set<number> {
  const back = new Set<number>()
  const state = new Array<number>(count).fill(0)
  const outgoing = Array.from({ length: count }, () => [] as number[])
  for (const [index, edge] of edges.entries()) outgoing[edge.from]?.push(index)
  for (let root = 0; root < count; root += 1) {
    if (state[root] !== 0) continue
    const stack: Array<{ box: number; next: number }> = [{ box: root, next: 0 }]
    state[root] = 1
    while (stack.length > 0) {
      const top = stack[stack.length - 1] as { box: number; next: number }
      const list = outgoing[top.box] as number[]
      if (top.next >= list.length) {
        state[top.box] = 2
        stack.pop()
        continue
      }
      const index = list[top.next] as number
      top.next += 1
      const to = (edges[index] as DiagramEdge).to
      if (state[to] === 1) back.add(index)
      else if (state[to] === 0) {
        state[to] = 1
        stack.push({ box: to, next: 0 })
      }
    }
  }
  return back
}

/** Each box's layer: one past the deepest box with an arrow into it, over the loop-free arrows. */
function layers(count: number, forward: readonly DiagramEdge[]): number[] {
  const layer = new Array<number>(count).fill(0)
  const incoming = new Array<number>(count).fill(0)
  for (const edge of forward) incoming[edge.to] = (incoming[edge.to] as number) + 1
  const ready: number[] = []
  for (let index = 0; index < count; index += 1) if (incoming[index] === 0) ready.push(index)
  while (ready.length > 0) {
    const box = ready.shift() as number
    for (const edge of forward) {
      if (edge.from !== box) continue
      layer[edge.to] = Math.max(layer[edge.to] as number, (layer[box] as number) + 1)
      incoming[edge.to] = (incoming[edge.to] as number) - 1
      if (incoming[edge.to] === 0) ready.push(edge.to)
    }
  }
  return layer
}

/**
 * The boxes of each layer in drawing order: program order first, then a few
 * sweeps that move each box towards the average place of its neighbours in the
 * layers before it (going down) and after it (going up).
 */
function orderLayers(count: number, layer: readonly number[], forward: readonly DiagramEdge[]): number[][] {
  const depth = count === 0 ? 0 : Math.max(...layer) + 1
  const rows: number[][] = Array.from({ length: depth }, () => [])
  for (let index = 0; index < count; index += 1) rows[layer[index] as number]?.push(index)
  const place = new Array<number>(count).fill(0)
  const remember = (): void => {
    for (const row of rows) for (const [position, index] of row.entries()) place[index] = position
  }
  remember()
  const sweep = (rank: number, neighbours: (index: number) => number[]): void => {
    const row = rows[rank] as number[]
    const keyed = row.map((index) => {
      const near = neighbours(index)
      const centre = near.length === 0 ? place[index] as number : near.reduce((sum, other) => sum + (place[other] as number), 0) / near.length
      return { index, centre }
    })
    keyed.sort((a, b) => a.centre - b.centre || (place[a.index] as number) - (place[b.index] as number))
    rows[rank] = keyed.map(entry => entry.index)
    for (const [position, index] of (rows[rank] as number[]).entries()) place[index] = position
  }
  const before = (index: number): number[] => forward.filter(edge => edge.to === index && (layer[edge.from] as number) < (layer[index] as number)).map(edge => edge.from)
  const after = (index: number): number[] => forward.filter(edge => edge.from === index && (layer[edge.to] as number) > (layer[index] as number)).map(edge => edge.to)
  for (let pass = 0; pass < 3; pass += 1) {
    for (let rank = 1; rank < depth; rank += 1) sweep(rank, before)
    for (let rank = depth - 2; rank >= 0; rank -= 1) sweep(rank, after)
  }
  remember()
  return rows
}

/** Break a box's text into at most three lines that fit, ending in "…" when it does not. */
function wrap(text: string): string[] {
  const tokens = text.match(/[⺀-￯]|[^\s⺀-￯]+|\s+/gu) ?? ['']
  const lines: string[] = []
  let line = ''
  const push = (): void => {
    lines.push(line.trim())
    line = ''
  }
  for (const token of tokens) {
    if (measure(line + token, FONT) <= MAX_TEXT) {
      line += token
      continue
    }
    if (line.trim() !== '') push()
    if (/^\s+$/u.test(token)) continue
    // A word wider than a line breaks wherever it must.
    for (const char of token) {
      if (measure(line + char, FONT) > MAX_TEXT && line !== '') push()
      line += char
    }
  }
  if (line.trim() !== '' || lines.length === 0) push()
  if (lines.length <= MAX_LINES) return lines
  const kept = lines.slice(0, MAX_LINES)
  let last = kept[MAX_LINES - 1] as string
  while (last.length > 0 && measure(`${last}…`, FONT) > MAX_TEXT) last = last.slice(0, -1)
  kept[MAX_LINES - 1] = `${last}…`
  return kept
}

/** Estimated width of a line of text: full-width characters a font size, others a little over half. */
function measure(text: string, size: number): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) as number
    width += code >= 0x2E80 && code <= 0xFFEF ? size : char === ' ' ? size * 0.3 : /[A-Z0-9]/u.test(char) ? size * 0.64 : size * 0.56
  }
  return width
}

/** A coordinate written with at most one decimal. */
function f(value: number): string {
  return String(Math.round(value * 10) / 10)
}
