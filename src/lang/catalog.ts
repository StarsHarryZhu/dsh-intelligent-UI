/**
 * The component catalog: the single definition source for the model-facing
 * contract, the compiler's validator, and the client's renderer allowlist.
 *
 * Metadata and behaviour live in one table on purpose. A separate schema file
 * drifts the moment a component gains a prop; here a descriptor cannot exist
 * without both halves, so the validator and the renderer can never disagree.
 * @module dsh-intelligent-ui/lang/catalog
 */

import type { StateKind } from './types.ts'

/** Bumped whenever a descriptor's props or kinds change. */
export const CATALOG_VERSION = '1'

/** Tone tokens map to theme aliases, never to literal colours. */
export const TONES = ['primary', 'secondary', 'muted', 'success', 'warn', 'error'] as const

/** A tone name from {@link TONES}. */
export type Tone = (typeof TONES)[number]

/** Size tokens shared by text-bearing components. */
export const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const

/** A size name from {@link SIZES}. */
export type Size = (typeof SIZES)[number]

/**
 * A prop spec. `kind` is the validator's switch and the renderer's hint; the
 * two are one field so a new kind cannot be half-implemented.
 *
 * A required prop that fails validation drops its component, because a
 * component that lost its figure is not the component the model described. An
 * optional prop that fails is dropped on its own and reported, so a bad
 * `padding` never costs the reader the whole card.
 */
export type PropSpec = PropKind & {
  /** The program version that introduced this prop; see `OPERATOR_SINCE` in types.ts. */
  since: number
}

/** The kind-specific half of a {@link PropSpec}. */
export type PropKind =
  | { kind: 'expr'; required?: boolean; of: 'number' | 'string' | 'boolean' }
  | { kind: 'text'; required?: boolean }
  | { kind: 'string'; required?: boolean; maxLength?: number; enum?: readonly string[]; default?: string; format?: 'url' | 'image' }
  | { kind: 'number'; required?: boolean; min?: number; max?: number; integer?: boolean; default?: number }
  | { kind: 'space'; required?: boolean; default?: number }
  | { kind: 'tone'; required?: boolean; default?: string }
  | { kind: 'size'; required?: boolean; default?: string }
  | { kind: 'rows'; required?: boolean }
  | { kind: 'series'; required?: boolean }
  | { kind: 'items'; required?: boolean }
  | { kind: 'options'; required?: boolean }
  | { kind: 'bind'; required?: boolean; state: StateKind }
  /** One to four numeric expressions over the component's variable, such as a plot's curves. */
  | { kind: 'fns'; required?: boolean }
  /** An expression of any type, kept whole for typesetting. */
  | { kind: 'math'; required?: boolean }
  /** A name the component binds inside its `fns`; never a declared key's value. */
  | { kind: 'variable'; required?: boolean; default?: string }

/** One catalog entry. */
export interface ComponentDescriptor {
  /** Tag name the model writes. */
  type: string
  /** The program version that introduced this component; see `OPERATOR_SINCE` in types.ts. */
  since: number
  /** One-line model-facing purpose. Kept short: the whole catalog travels in the tool description. */
  description: string
  /** Whether the component may contain children. */
  container: boolean
  /** Prop that a bare quoted string on a DIL line fills: `title "Total"`. */
  primary?: string
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
    since: 1,
    description: 'Framed surface for one answer; usually the single root. An optional title heads it.',
    container: true,
    primary: 'title',
    props: { title: { since: 1, kind: 'text' }, padding: { since: 1, kind: 'space', default: 3 }, gap: { since: 1, kind: 'space', default: 2 }, tone: { since: 1, kind: 'tone' } },
  },
  {
    type: 'col',
    since: 1,
    description: 'Vertical stack in reading order.',
    container: true,
    props: { gap: { since: 1, kind: 'space', default: 2 } },
  },
  {
    type: 'row',
    since: 1,
    description: 'Side-by-side cells of equal width; wraps on narrow screens.',
    container: true,
    props: { gap: { since: 1, kind: 'space', default: 2 }, align: { since: 1, kind: 'string', enum: ['start', 'center', 'end'] } },
  },
  {
    type: 'grid',
    since: 1,
    description: 'Even grid of small panels such as metrics.',
    container: true,
    props: { columns: { since: 1, kind: 'number', integer: true, min: 1, max: 4, default: 2 }, gap: { since: 1, kind: 'space', default: 2 } },
  },
  {
    type: 'title',
    since: 1,
    description: 'Headline line.',
    container: false,
    primary: 'text',
    props: { text: { since: 1, kind: 'text', required: true }, size: { since: 1, kind: 'size', default: 'lg' } },
  },
  {
    type: 'text',
    since: 1,
    description: 'A sentence or short paragraph.',
    container: false,
    primary: 'text',
    props: { text: { since: 1, kind: 'text', required: true }, tone: { since: 1, kind: 'tone' }, size: { since: 1, kind: 'size' } },
  },
  {
    type: 'metric',
    since: 1,
    description: 'One prominent number with its caption: the headline figure of an answer; digits= sets significant digits.',
    container: false,
    primary: 'label',
    props: {
      label: { since: 1, kind: 'text', required: true },
      value: { since: 1, kind: 'expr', required: true, of: 'number' },
      unit: { since: 1, kind: 'string', maxLength: 24 },
      tone: { since: 1, kind: 'tone' },
      digits: { since: 1, kind: 'number', integer: true, min: 1, max: 12 },
    },
  },
  {
    type: 'progress',
    since: 1,
    description: 'Proportion bar: value out of max (default 100).',
    container: false,
    primary: 'label',
    props: {
      label: { since: 1, kind: 'text', required: true },
      value: { since: 1, kind: 'expr', required: true, of: 'number' },
      max: { since: 1, kind: 'expr', of: 'number' },
      tone: { since: 1, kind: 'tone' },
    },
  },
  {
    type: 'slider',
    since: 1,
    description: 'Range control for a number state.',
    container: false,
    primary: 'label',
    props: {
      label: { since: 1, kind: 'text', required: true },
      bind: { since: 1, kind: 'bind', required: true, state: 'number' },
      min: { since: 1, kind: 'number', default: 0 },
      max: { since: 1, kind: 'number', default: 100 },
      step: { since: 1, kind: 'number', default: 1 },
      unit: { since: 1, kind: 'string', maxLength: 24 },
    },
  },
  {
    type: 'numberInput',
    since: 1,
    description: 'Exact number entry; prefer it to a slider when precision matters.',
    container: false,
    primary: 'label',
    props: {
      label: { since: 1, kind: 'text', required: true },
      bind: { since: 1, kind: 'bind', required: true, state: 'number' },
      min: { since: 1, kind: 'number' },
      max: { since: 1, kind: 'number' },
      step: { since: 1, kind: 'number' },
      unit: { since: 1, kind: 'string', maxLength: 24 },
    },
  },
  {
    type: 'textInput',
    since: 1,
    description: 'Short text entry for a text state.',
    container: false,
    primary: 'label',
    props: {
      label: { since: 1, kind: 'text', required: true },
      bind: { since: 1, kind: 'bind', required: true, state: 'string' },
      placeholder: { since: 1, kind: 'string', maxLength: 120 },
    },
  },
  {
    type: 'select',
    since: 1,
    description: 'Dropdown for a state declared with options=.',
    container: false,
    primary: 'label',
    props: { label: { since: 1, kind: 'text', required: true }, bind: { since: 1, kind: 'bind', required: true, state: 'select' }, options: { since: 1, kind: 'options' } },
  },
  {
    type: 'checkbox',
    since: 1,
    description: 'On/off choice for a true/false state.',
    container: false,
    primary: 'label',
    props: { label: { since: 1, kind: 'text', required: true }, bind: { since: 1, kind: 'bind', required: true, state: 'boolean' } },
  },
  {
    type: 'player',
    since: 1,
    description: 'Animation control for a number state: play/pause, step back/forward, scrub; duration= seconds for one run.',
    container: false,
    primary: 'label',
    props: {
      label: { since: 1, kind: 'text', required: true },
      bind: { since: 1, kind: 'bind', required: true, state: 'number' },
      min: { since: 1, kind: 'number' },
      max: { since: 1, kind: 'number' },
      step: { since: 1, kind: 'number' },
      duration: { since: 1, kind: 'number', min: 0.5, max: 600 },
      unit: { since: 1, kind: 'string', maxLength: 24 },
    },
  },
  {
    type: 'table',
    since: 1,
    description: 'Comparison table; every row has one cell per column.',
    container: false,
    props: {
      columns: { since: 1, kind: 'items', required: true },
      rows: { since: 1, kind: 'rows', required: true },
      caption: { since: 1, kind: 'text' },
      current: { since: 1, kind: 'expr', of: 'number' },
      mono: { since: 1, kind: 'expr', of: 'boolean' },
    },
  },
  {
    type: 'keys',
    since: 1,
    description: 'Label/value pairs for exact figures, written "Label: value".',
    container: false,
    props: { items: { since: 1, kind: 'items', required: true } },
  },
  {
    type: 'list',
    since: 1,
    description: 'Bulleted list.',
    container: false,
    props: { items: { since: 1, kind: 'items', required: true }, current: { since: 1, kind: 'expr', of: 'number' }, mono: { since: 1, kind: 'expr', of: 'boolean' } },
  },
  {
    type: 'steps',
    since: 1,
    description: 'Numbered procedure the reader performs in order.',
    container: false,
    props: { items: { since: 1, kind: 'items', required: true }, current: { since: 1, kind: 'expr', of: 'number' }, mono: { since: 1, kind: 'expr', of: 'boolean' } },
  },
  {
    type: 'chart',
    since: 1,
    description: 'Bar or line chart; each value is a number or an expression over state.',
    container: false,
    props: {
      shape: { since: 1, kind: 'string', enum: ['bar', 'line'], default: 'bar' },
      labels: { since: 1, kind: 'items', required: true },
      values: { since: 1, kind: 'series', required: true },
      caption: { since: 1, kind: 'text' },
      unit: { since: 1, kind: 'string', maxLength: 24 },
    },
  },
  {
    type: 'plot',
    since: 1,
    description: 'Graph of y = f(x) over from..to: up to four curves, a point mark= with tangent=true, and shading shadeFrom..shadeTo.',
    container: false,
    primary: 'caption',
    props: {
      caption: { since: 1, kind: 'text' },
      fn: { since: 1, kind: 'fns', required: true },
      var: { since: 1, kind: 'variable', default: 'x' },
      from: { since: 1, kind: 'expr', of: 'number' },
      to: { since: 1, kind: 'expr', of: 'number' },
      ymin: { since: 1, kind: 'expr', of: 'number' },
      ymax: { since: 1, kind: 'expr', of: 'number' },
      labels: { since: 1, kind: 'items' },
      mark: { since: 1, kind: 'expr', of: 'number' },
      tangent: { since: 1, kind: 'expr', of: 'boolean' },
      shadeFrom: { since: 1, kind: 'expr', of: 'number' },
      shadeTo: { since: 1, kind: 'expr', of: 'number' },
    },
  },
  {
    type: 'formula',
    since: 1,
    description: 'Typeset formula and its live value (digits= significant digits, default 6); an equation shows no value.',
    container: false,
    primary: 'expr',
    props: {
      expr: { since: 1, kind: 'math', required: true },
      label: { since: 1, kind: 'text' },
      digits: { since: 1, kind: 'number', integer: true, min: 1, max: 12, default: 6 },
      size: { since: 1, kind: 'size', default: 'md' },
    },
  },
  {
    type: 'badge',
    since: 1,
    description: 'Short status word.',
    container: false,
    primary: 'text',
    props: { text: { since: 1, kind: 'text', required: true }, tone: { since: 1, kind: 'tone' } },
  },
  {
    type: 'callout',
    since: 1,
    description: 'One emphasized remark: an assumption, a caveat, or a next step.',
    container: false,
    primary: 'text',
    props: { text: { since: 1, kind: 'text', required: true }, tone: { since: 1, kind: 'tone', default: 'secondary' } },
  },
  {
    type: 'divider',
    since: 1,
    description: 'Hairline separator.',
    container: false,
    props: {},
  },
  {
    type: 'image',
    since: 1,
    description: 'Inline image from a data:image/… URL. Remote URLs are rejected.',
    container: false,
    props: { src: { since: 1, kind: 'string', required: true, format: 'image' }, alt: { since: 1, kind: 'string', required: true, maxLength: 200 }, caption: { since: 1, kind: 'text' } },
  },
  {
    type: 'link',
    since: 1,
    description: 'Citation link (http or https), opened only when the reader clicks it.',
    container: false,
    primary: 'text',
    props: { text: { since: 1, kind: 'text', required: true }, url: { since: 1, kind: 'string', required: true, format: 'url' } },
  },
  {
    type: 'button',
    since: 1,
    description: 'Sends its prompt as the reader\'s next message when clicked: answers and follow-ups.',
    container: false,
    primary: 'text',
    props: { text: { since: 1, kind: 'text', required: true }, prompt: { since: 1, kind: 'text', required: true }, tone: { since: 1, kind: 'tone' } },
  },
]

/** Descriptor lookup by tag name. */
export const CATALOG_BY_TYPE: ReadonlyMap<string, ComponentDescriptor> = new Map(
  CATALOG.map(descriptor => [descriptor.type, descriptor]),
)

/**
 * Stable hash of the catalog's semantics: component names, containment, and prop
 * names, kinds, and requiredness, each with the version that introduced it.
 * Descriptions are excluded, so rewording the model-facing text never makes a
 * persisted program look foreign.
 * @returns a short hex digest.
 */
export function catalogHash(): string {
  const canonical = CATALOG
    .map(descriptor => `${descriptor.type}@${descriptor.since}|${descriptor.container ? 1 : 0}|${descriptor.primary ?? ''}|${propSignature(descriptor.props)}`)
    .join('\n')
  return digest(`${CATALOG_VERSION} ${canonical}`)
}

/** Render one prop table into a stable, order-insensitive signature. */
function propSignature(props: Record<string, PropSpec>): string {
  return Object.keys(props)
    .sort()
    .map((name) => {
      const spec = props[name] as PropSpec
      const bound = spec.kind === 'bind' ? `:${spec.state}` : spec.kind === 'expr' ? `:${spec.of}` : ''
      return `${name}=${spec.kind}${bound}${spec.required === true ? '!' : ''}@${spec.since}`
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
