/**
 * The component catalog: the single definition source for the model-facing
 * contract, the compiler's validator, and the client's renderer allowlist.
 *
 * Metadata and behaviour live in one table on purpose. A separate schema file
 * drifts the moment a component gains a prop; here a descriptor cannot exist
 * without both halves, so the validator and the renderer can never disagree.
 * @module dsh-intelligent-ui/lang/catalog
 */

import { CODE_LANGUAGE_ALIASES, CODE_LANGUAGES } from './highlight.ts'
import type { StateKind } from './types.ts'

/** Tone tokens map to theme aliases, never to literal colours. */
export const TONES = ['primary', 'secondary', 'muted', 'success', 'warn', 'error'] as const

/** A tone name from {@link TONES}. */
export type Tone = (typeof TONES)[number]

/** Size tokens shared by text-bearing components. */
export const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const

/** A size name from {@link SIZES}. */
export type Size = (typeof SIZES)[number]

/** Shapes a chart draws. */
export const CHART_SHAPES = ['bar', 'line', 'area', 'pie'] as const

/** Series one chart holds; the four colours a plot's curves use. */
export const MAX_CHART_SERIES = 4

/** Slices a pie keeps; a pie with more is drawn as bars. */
export const MAX_PIE_SLICES = 8

/** What a shape can be. */
export const SHAPE_KINDS = ['line', 'rect', 'circle', 'polygon', 'polyline', 'path', 'curve', 'text', 'point', 'hotspot', 'use'] as const

/** The props each kind of shape cannot be drawn without. */
export const SHAPE_NEEDS: Readonly<Record<(typeof SHAPE_KINDS)[number], readonly string[]>> = {
  line: ['x', 'y', 'x2', 'y2'],
  rect: ['x', 'y', 'w', 'h'],
  circle: ['x', 'y', 'r'],
  polygon: ['points'],
  polyline: ['points'],
  path: ['d'],
  curve: ['fn'],
  text: ['text', 'x', 'y'],
  point: ['x', 'y'],
  hotspot: ['x', 'y', 'w', 'h', 'bind'],
  use: ['ref'],
}

/**
 * Shapes drawn around their own 0 0: `x=` and `y=` move them, and they turn and
 * scale about where that origin lands. Every other kind turns about its `x y`.
 */
export const SHAPES_MOVED: ReadonlySet<string> = new Set(['polygon', 'polyline', 'path', 'curve', 'use'])

/**
 * A prop spec. `kind` is the validator's switch and the renderer's hint; the
 * two are one field so a new kind cannot be half-implemented.
 *
 * A required prop that fails validation drops its component, because a
 * component that lost its figure is not the component the model described. An
 * optional prop that fails is dropped on its own and reported, so a bad
 * `padding` never costs the reader the whole card.
 */
export type PropSpec =
  | { kind: 'expr'; required?: boolean; of: 'number' | 'string' | 'boolean' }
  | { kind: 'text'; required?: boolean }
  | { kind: 'string'; required?: boolean; maxLength?: number; enum?: readonly string[]; aliases?: Readonly<Record<string, string>>; default?: string; format?: 'url' | 'image' }
  /** Text shown exactly as written: no `{…}` interpolation, line breaks kept, cut at the code limits. */
  | { kind: 'code'; required?: boolean }
  | { kind: 'number'; required?: boolean; min?: number; max?: number; integer?: boolean; default?: number }
  | { kind: 'space'; required?: boolean; default?: number }
  | { kind: 'tone'; required?: boolean; default?: string }
  | { kind: 'size'; required?: boolean; default?: string }
  | { kind: 'rows'; required?: boolean }
  /** Numbers or numeric expressions; `literal` admits plain numbers only. */
  | { kind: 'series'; required?: boolean; literal?: boolean }
  | { kind: 'items'; required?: boolean }
  | { kind: 'options'; required?: boolean }
  /** A state the component writes: the prop named `bind` becomes the node's binding, any other is kept as the state's key. */
  | { kind: 'bind'; required?: boolean; state: StateKind | 'any' }
  /** One SVG drawing, read into a checked tree; see `svg.ts`. */
  | { kind: 'svg'; required?: boolean }
  /** A literal number, true/false, or text, as a value to store in a state. */
  | { kind: 'scalar'; required?: boolean }
  /**
   * One to four numeric expressions over the component's variable, such as a plot's
   * curves; with `pair`, one curve y = f(x) or a pair [x(t), y(t)] that traces one.
   */
  | { kind: 'fns'; required?: boolean; pair?: boolean }
  /** An expression of any type, kept whole for typesetting. */
  | { kind: 'math'; required?: boolean }
  /** A name the component binds inside its `fns`; never a declared key's value. */
  | { kind: 'variable'; required?: boolean; default?: string }
  /** Arrows between the entries of the component's `nodes`, named by text or 1-based number. */
  | { kind: 'edges'; required?: boolean }

/** One catalog entry. */
export interface ComponentDescriptor {
  /** Tag name the model writes. */
  type: string
  /** One-line model-facing purpose. Kept short: the whole catalog travels in the tool description. */
  description: string
  /** Whether the component may contain children. */
  container: boolean
  /**
   * The only component types a container holds, when it is that narrow. Such a
   * container belongs inside another one, like any leaf: a chart holds series.
   */
  holds?: readonly string[]
  /** Prop that a bare quoted string on a DIL line fills: `title "Total"`. */
  primary?: string
  /** Props the description's catalog line leaves out, because a paragraph of their own explains them. */
  explained?: readonly string[]
  /** Props the compiler accepts. An unknown prop is dropped with `unknown_prop`. */
  props: Record<string, PropSpec>
}

/**
 * The catalog table, in documentation order. Keep `space`-scaled padding and
 * gap on the 4px grid so generated interfaces keep the host's rhythm.
 */
export const CATALOG: readonly ComponentDescriptor[] = [
  {
    type: 'card',
    description: 'Framed surface for one answer; usually the single root.',
    container: true,
    primary: 'title',
    props: { title: { kind: 'text' }, padding: { kind: 'space', default: 3 }, gap: { kind: 'space', default: 2 }, tone: { kind: 'tone' } },
  },
  {
    type: 'col',
    description: 'Vertical stack in reading order.',
    container: true,
    props: { gap: { kind: 'space', default: 2 } },
  },
  {
    type: 'row',
    description: 'Side-by-side cells of equal width; wraps on narrow screens.',
    container: true,
    props: { gap: { kind: 'space', default: 2 }, align: { kind: 'string', enum: ['start', 'center', 'end'] } },
  },
  {
    type: 'grid',
    description: 'Even grid of small panels such as metrics.',
    container: true,
    props: { columns: { kind: 'number', integer: true, min: 1, max: 4, default: 2 }, gap: { kind: 'space', default: 2 } },
  },
  {
    type: 'tabs',
    description: 'Pages the reader switches between; holds one tab per page, the first open.',
    container: true,
    props: { gap: { kind: 'space', default: 2 } },
  },
  {
    type: 'tab',
    description: 'One page of tabs.',
    container: true,
    primary: 'title',
    props: { title: { kind: 'text', required: true }, gap: { kind: 'space', default: 2 } },
  },
  {
    type: 'title',
    description: 'Headline line.',
    container: false,
    primary: 'text',
    props: { text: { kind: 'text', required: true }, size: { kind: 'size', default: 'lg' } },
  },
  {
    type: 'text',
    description: 'A sentence or short paragraph.',
    container: false,
    primary: 'text',
    props: { text: { kind: 'text', required: true }, tone: { kind: 'tone' }, size: { kind: 'size' } },
  },
  {
    type: 'metric',
    description: 'The headline number of an answer; digits= sets significant digits.',
    container: false,
    primary: 'label',
    props: {
      label: { kind: 'text', required: true },
      value: { kind: 'expr', required: true, of: 'number' },
      unit: { kind: 'string', maxLength: 24 },
      tone: { kind: 'tone' },
      digits: { kind: 'number', integer: true, min: 1, max: 12 },
    },
  },
  {
    type: 'progress',
    description: 'Proportion bar: value out of max (default 100).',
    container: false,
    primary: 'label',
    props: {
      label: { kind: 'text', required: true },
      value: { kind: 'expr', required: true, of: 'number' },
      max: { kind: 'expr', of: 'number' },
      tone: { kind: 'tone' },
    },
  },
  {
    type: 'slider',
    description: 'Range control for a number state.',
    container: false,
    primary: 'label',
    props: {
      label: { kind: 'text', required: true },
      bind: { kind: 'bind', required: true, state: 'number' },
      min: { kind: 'number', default: 0 },
      max: { kind: 'number', default: 100 },
      step: { kind: 'number', default: 1 },
      unit: { kind: 'string', maxLength: 24 },
    },
  },
  {
    type: 'numberInput',
    description: 'Exact number entry; prefer it to a slider when precision matters.',
    container: false,
    primary: 'label',
    props: {
      label: { kind: 'text', required: true },
      bind: { kind: 'bind', required: true, state: 'number' },
      min: { kind: 'number' },
      max: { kind: 'number' },
      step: { kind: 'number' },
      unit: { kind: 'string', maxLength: 24 },
    },
  },
  {
    type: 'textInput',
    description: 'Short text entry for a text state.',
    container: false,
    primary: 'label',
    props: {
      label: { kind: 'text', required: true },
      bind: { kind: 'bind', required: true, state: 'string' },
      placeholder: { kind: 'string', maxLength: 120 },
    },
  },
  {
    type: 'select',
    description: 'Dropdown for a state declared with options=.',
    container: false,
    primary: 'label',
    props: { label: { kind: 'text', required: true }, bind: { kind: 'bind', required: true, state: 'select' }, options: { kind: 'options' } },
  },
  {
    type: 'checkbox',
    description: 'On/off choice for a true/false state.',
    container: false,
    primary: 'label',
    props: { label: { kind: 'text', required: true }, bind: { kind: 'bind', required: true, state: 'boolean' } },
  },
  {
    type: 'player',
    description: 'Plays a number state in step= steps over duration= seconds; loop=true repeats; autoplay=true starts on screen.',
    container: false,
    primary: 'label',
    props: {
      label: { kind: 'text', required: true },
      bind: { kind: 'bind', required: true, state: 'number' },
      min: { kind: 'number' },
      max: { kind: 'number' },
      step: { kind: 'number' },
      duration: { kind: 'number', min: 0.5, max: 600 },
      unit: { kind: 'string', maxLength: 24 },
      loop: { kind: 'expr', of: 'boolean' },
      autoplay: { kind: 'expr', of: 'boolean' },
    },
  },
  {
    type: 'table',
    description: 'Comparison table; every row has one cell per column.',
    container: false,
    props: {
      columns: { kind: 'items', required: true },
      rows: { kind: 'rows', required: true },
      caption: { kind: 'text' },
      current: { kind: 'expr', of: 'number' },
      mono: { kind: 'expr', of: 'boolean' },
      sortable: { kind: 'expr', of: 'boolean' },
    },
  },
  {
    type: 'keys',
    description: 'Label/value pairs for exact figures, written "Label: value".',
    container: false,
    props: { items: { kind: 'items', required: true } },
  },
  {
    type: 'list',
    description: 'Bulleted list.',
    container: false,
    props: { items: { kind: 'items', required: true }, current: { kind: 'expr', of: 'number' }, mono: { kind: 'expr', of: 'boolean' } },
  },
  {
    type: 'steps',
    description: 'Numbered procedure the reader performs in order.',
    container: false,
    props: { items: { kind: 'items', required: true }, current: { kind: 'expr', of: 'number' }, mono: { kind: 'expr', of: 'boolean' } },
  },
  {
    type: 'code',
    description: 'Code or other preformatted text, kept as written (no {…}); or value= a text state or calc.',
    container: false,
    primary: 'text',
    props: {
      text: { kind: 'code' },
      value: { kind: 'expr', of: 'string' },
      lang: { kind: 'string', enum: CODE_LANGUAGES, aliases: CODE_LANGUAGE_ALIASES, default: 'text' },
      current: { kind: 'expr', of: 'number' },
      numbers: { kind: 'expr', of: 'boolean' },
      caption: { kind: 'text' },
    },
  },
  {
    type: 'checklist',
    description: 'Items the reader ticks; bind= gets the count, or the sum of values=; names= the ticked names.',
    container: false,
    primary: 'label',
    props: {
      label: { kind: 'text' },
      items: { kind: 'items', required: true },
      values: { kind: 'series', literal: true },
      bind: { kind: 'bind', state: 'number' },
      names: { kind: 'bind', state: 'string' },
    },
  },
  {
    type: 'chart',
    description: `values= is one series; for several (up to ${MAX_CHART_SERIES}) use series lines. stacked=true stacks bars or areas.`,
    container: true,
    holds: ['series'],
    props: {
      shape: { kind: 'string', enum: CHART_SHAPES, default: 'bar' },
      labels: { kind: 'items', required: true },
      values: { kind: 'series' },
      stacked: { kind: 'expr', of: 'boolean' },
      caption: { kind: 'text' },
      unit: { kind: 'string', maxLength: 24 },
    },
  },
  {
    type: 'series',
    description: 'One named series of the chart above it.',
    container: false,
    primary: 'name',
    props: { name: { kind: 'text' }, values: { kind: 'series', required: true } },
  },
  {
    type: 'plot',
    description: 'Graph of y = f(x) over from..to, up to four curves.',
    container: false,
    primary: 'caption',
    props: {
      caption: { kind: 'text' },
      fn: { kind: 'fns', required: true },
      var: { kind: 'variable', default: 'x' },
      from: { kind: 'expr', of: 'number' },
      to: { kind: 'expr', of: 'number' },
      ymin: { kind: 'expr', of: 'number' },
      ymax: { kind: 'expr', of: 'number' },
      labels: { kind: 'items' },
      mark: { kind: 'expr', of: 'number' },
      tangent: { kind: 'expr', of: 'boolean' },
      shadeFrom: { kind: 'expr', of: 'number' },
      shadeTo: { kind: 'expr', of: 'number' },
    },
  },
  {
    type: 'diagram',
    description: 'Flowchart: boxes and arrows; edges name boxes by text or number.',
    container: false,
    primary: 'caption',
    props: {
      caption: { kind: 'text' },
      nodes: { kind: 'items', required: true },
      edges: { kind: 'edges' },
      direction: { kind: 'string', enum: ['down', 'right'], default: 'down' },
      current: { kind: 'expr', of: 'number' },
    },
  },
  {
    type: 'canvas',
    description: 'Shape lines over any svg=, in its viewBox or view=[left,right,bottom,top] (default [0,320,200,0]).',
    container: true,
    holds: ['shape'],
    primary: 'caption',
    props: {
      caption: { kind: 'text' },
      view: { kind: 'series', literal: true },
      svg: { kind: 'svg' },
    },
  },
  {
    type: 'shape',
    description: 'Drawn in order. point drag=true moves its plain state x= or y=; a click stores value= in bind=.',
    container: false,
    primary: 'text',
    explained: ['x', 'y', 'x2', 'y2', 'w', 'h', 'r', 'points', 'd', 'fn', 'var', 'from', 'to', 'ref'],
    props: {
      text: { kind: 'text' },
      kind: {
        kind: 'string',
        required: true,
        enum: SHAPE_KINDS,
        aliases: { rectangle: 'rect', square: 'rect', label: 'text', dot: 'point', handle: 'point' },
      },
      x: { kind: 'expr', of: 'number' },
      y: { kind: 'expr', of: 'number' },
      x2: { kind: 'expr', of: 'number' },
      y2: { kind: 'expr', of: 'number' },
      w: { kind: 'expr', of: 'number' },
      h: { kind: 'expr', of: 'number' },
      r: { kind: 'expr', of: 'number' },
      points: { kind: 'series' },
      d: { kind: 'text' },
      fn: { kind: 'fns', pair: true },
      var: { kind: 'variable', default: 'x' },
      from: { kind: 'expr', of: 'number' },
      to: { kind: 'expr', of: 'number' },
      ref: { kind: 'string', maxLength: 65 },
      rotate: { kind: 'expr', of: 'number' },
      scale: { kind: 'expr', of: 'number' },
      opacity: { kind: 'expr', of: 'number' },
      tone: { kind: 'tone' },
      size: { kind: 'size' },
      anchor: { kind: 'string', enum: ['start', 'middle', 'end'], default: 'middle' },
      fill: { kind: 'expr', of: 'boolean' },
      dash: { kind: 'expr', of: 'boolean' },
      arrow: { kind: 'expr', of: 'boolean' },
      show: { kind: 'expr', of: 'boolean' },
      drag: { kind: 'expr', of: 'boolean' },
      bind: { kind: 'bind', state: 'any' },
      value: { kind: 'scalar' },
    },
  },
  {
    type: 'formula',
    description: 'Typeset formula with its live value (digits=, default 6); an equation shows none.',
    container: false,
    primary: 'expr',
    props: {
      expr: { kind: 'math', required: true },
      label: { kind: 'text' },
      digits: { kind: 'number', integer: true, min: 1, max: 12, default: 6 },
      size: { kind: 'size', default: 'md' },
    },
  },
  {
    type: 'badge',
    description: 'Short status word.',
    container: false,
    primary: 'text',
    props: { text: { kind: 'text', required: true }, tone: { kind: 'tone' } },
  },
  {
    type: 'callout',
    description: 'One emphasized remark: an assumption, a caveat, or a next step.',
    container: false,
    primary: 'text',
    props: { text: { kind: 'text', required: true }, tone: { kind: 'tone', default: 'secondary' } },
  },
  {
    type: 'divider',
    description: 'Hairline separator.',
    container: false,
    props: {},
  },
  {
    type: 'image',
    description: 'Inline data:image/… image; remote URLs are rejected.',
    container: false,
    props: { src: { kind: 'string', required: true, format: 'image' }, alt: { kind: 'string', required: true, maxLength: 200 }, caption: { kind: 'text' } },
  },
  {
    type: 'link',
    description: 'Citation link, opened only when the reader clicks it.',
    container: false,
    primary: 'text',
    props: { text: { kind: 'text', required: true }, url: { kind: 'string', required: true, format: 'url' } },
  },
  {
    type: 'button',
    description: 'Sends its prompt as the reader\'s next message when clicked: answers and follow-ups.',
    container: false,
    primary: 'text',
    props: { text: { kind: 'text', required: true }, prompt: { kind: 'text', required: true }, tone: { kind: 'tone' } },
  },
]

/** Descriptor lookup by tag name. */
export const CATALOG_BY_TYPE: ReadonlyMap<string, ComponentDescriptor> = new Map(
  CATALOG.map(descriptor => [descriptor.type, descriptor]),
)

/**
 * Stable hash of the catalog's semantics: component names, containment, and prop
 * names, kinds, and requiredness.
 * Descriptions are excluded, so rewording the model-facing text never makes a
 * persisted program look foreign.
 * @returns a short hex digest.
 */
export function catalogHash(): string {
  const canonical = CATALOG
    .map(descriptor => `${descriptor.type}|${descriptor.container ? 1 : 0}${descriptor.holds === undefined ? '' : `:${descriptor.holds.join('+')}`}|${descriptor.primary ?? ''}|${propSignature(descriptor.props)}`)
    .join('\n')
  return digest(canonical)
}

/** Render one prop table into a stable, order-insensitive signature. */
function propSignature(props: Record<string, PropSpec>): string {
  return Object.keys(props)
    .sort()
    .map((name) => {
      const spec = props[name] as PropSpec
      const bound = spec.kind === 'bind' ? `:${spec.state}` : spec.kind === 'expr' ? `:${spec.of}` : spec.kind === 'series' && spec.literal === true ? ':literal' : ''
      return `${name}=${spec.kind}${bound}${spec.required === true ? '!' : ''}`
    })
    .join(',')
}

/** FNV-1a over UTF-16 code units, rendered as eight hex digits. */
function digest(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
