/**
 * The component catalog: the single definition source for the model-facing
 * contract, the compiler's validator, and the client's renderer allowlist.
 *
 * Metadata and behaviour live in one table on purpose. A separate schema file
 * drifts the moment a component gains a prop; here a descriptor cannot exist
 * without both halves, so the validator and the renderer can never disagree.
 * @module dsh-intelligent-ui/lang/catalog
 */
/** Bumped whenever a descriptor's props or kinds change. */
export const CATALOG_VERSION = '3';
/** Tone tokens map to theme aliases, never to literal colours. */
export const TONES = ['primary', 'secondary', 'muted', 'success', 'warn', 'error'];
/** Size tokens shared by text-bearing components. */
export const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'];
/**
 * The catalog table, in documentation order. Keep `space`-scaled padding and
 * gap on the 4px grid so generated interfaces keep the host's rhythm.
 */
export const CATALOG = [
    {
        type: 'card',
        description: 'Framed surface for one answer; usually the single root. An optional title heads it.',
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
        description: 'One prominent number with its caption: the headline figure of an answer; digits= sets significant digits.',
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
        type: 'table',
        description: 'Comparison table; every row has one cell per column.',
        container: false,
        props: { columns: { kind: 'items', required: true }, rows: { kind: 'rows', required: true }, caption: { kind: 'text' } },
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
        props: { items: { kind: 'items', required: true } },
    },
    {
        type: 'steps',
        description: 'Numbered procedure the reader performs in order.',
        container: false,
        props: { items: { kind: 'items', required: true } },
    },
    {
        type: 'chart',
        description: 'Bar or line chart; each value is a number or an expression over state.',
        container: false,
        props: {
            shape: { kind: 'string', enum: ['bar', 'line'], default: 'bar' },
            labels: { kind: 'items', required: true },
            values: { kind: 'series', required: true },
            caption: { kind: 'text' },
            unit: { kind: 'string', maxLength: 24 },
        },
    },
    {
        type: 'plot',
        description: 'Graph of y = f(x) over from..to: up to four curves, a point mark= with tangent=true, and shading shadeFrom..shadeTo.',
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
        type: 'formula',
        description: 'Typeset formula and its live value (digits= significant digits, default 6); an equation shows no value.',
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
        description: 'Inline image from a data:image/… URL. Remote URLs are rejected.',
        container: false,
        props: { src: { kind: 'string', required: true, format: 'image' }, alt: { kind: 'string', required: true, maxLength: 200 }, caption: { kind: 'text' } },
    },
    {
        type: 'link',
        description: 'Citation link (http or https), opened only when the reader clicks it.',
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
];
/** Descriptor lookup by tag name. */
export const CATALOG_BY_TYPE = new Map(CATALOG.map(descriptor => [descriptor.type, descriptor]));
/**
 * Stable hash of the catalog's semantics: component names, containment, and prop
 * names, kinds, and requiredness. Descriptions are excluded, so rewording the
 * model-facing text never makes a persisted program look foreign.
 * @returns a short hex digest.
 */
export function catalogHash() {
    const canonical = CATALOG
        .map(descriptor => `${descriptor.type}|${descriptor.container ? 1 : 0}|${descriptor.primary ?? ''}|${propSignature(descriptor.props)}`)
        .join('\n');
    return digest(`${CATALOG_VERSION} ${canonical}`);
}
/** Render one prop table into a stable, order-insensitive signature. */
function propSignature(props) {
    return Object.keys(props)
        .sort()
        .map((name) => {
        const spec = props[name];
        const bound = spec.kind === 'bind' ? `:${spec.state}` : spec.kind === 'expr' ? `:${spec.of}` : '';
        return `${name}=${spec.kind}${bound}${spec.required === true ? '!' : ''}`;
    })
        .join(',');
}
/** FNV-1a over UTF-16 code units, rendered as eight hex digits. */
function digest(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
