/**
 * The component catalog: the single definition source for the model-facing
 * contract, the compiler's validator, and the client's renderer allowlist.
 *
 * Metadata and behaviour live in one table on purpose. A separate schema file
 * drifts the moment a component gains a prop; here a descriptor cannot exist
 * without both halves, so the validator and the renderer can never disagree.
 * @module dsh-intelligent-ui/lang/catalog
 */
import type { StateKind } from './types.ts';
/** Tone tokens map to theme aliases, never to literal colours. */
export declare const TONES: readonly ["primary", "secondary", "muted", "success", "warn", "error"];
/** A tone name from {@link TONES}. */
export type Tone = (typeof TONES)[number];
/** Size tokens shared by text-bearing components. */
export declare const SIZES: readonly ["xs", "sm", "md", "lg", "xl"];
/** A size name from {@link SIZES}. */
export type Size = (typeof SIZES)[number];
/** Shapes a chart draws. */
export declare const CHART_SHAPES: readonly ["bar", "line", "area", "pie"];
/** Series one chart holds; the four colours a plot's curves use. */
export declare const MAX_CHART_SERIES = 4;
/** Slices a pie keeps; a pie with more is drawn as bars. */
export declare const MAX_PIE_SLICES = 8;
/**
 * A prop spec. `kind` is the validator's switch and the renderer's hint; the
 * two are one field so a new kind cannot be half-implemented.
 *
 * A required prop that fails validation drops its component, because a
 * component that lost its figure is not the component the model described. An
 * optional prop that fails is dropped on its own and reported, so a bad
 * `padding` never costs the reader the whole card.
 */
export type PropSpec = {
    kind: 'expr';
    required?: boolean;
    of: 'number' | 'string' | 'boolean';
} | {
    kind: 'text';
    required?: boolean;
} | {
    kind: 'string';
    required?: boolean;
    maxLength?: number;
    enum?: readonly string[];
    aliases?: Readonly<Record<string, string>>;
    default?: string;
    format?: 'url' | 'image';
}
/** Text shown exactly as written: no `{…}` interpolation, line breaks kept, cut at the code limits. */
 | {
    kind: 'code';
    required?: boolean;
} | {
    kind: 'number';
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
    default?: number;
} | {
    kind: 'space';
    required?: boolean;
    default?: number;
} | {
    kind: 'tone';
    required?: boolean;
    default?: string;
} | {
    kind: 'size';
    required?: boolean;
    default?: string;
} | {
    kind: 'rows';
    required?: boolean;
} | {
    kind: 'series';
    required?: boolean;
} | {
    kind: 'items';
    required?: boolean;
} | {
    kind: 'options';
    required?: boolean;
} | {
    kind: 'bind';
    required?: boolean;
    state: StateKind;
}
/** One to four numeric expressions over the component's variable, such as a plot's curves. */
 | {
    kind: 'fns';
    required?: boolean;
}
/** An expression of any type, kept whole for typesetting. */
 | {
    kind: 'math';
    required?: boolean;
}
/** A name the component binds inside its `fns`; never a declared key's value. */
 | {
    kind: 'variable';
    required?: boolean;
    default?: string;
}
/** Arrows between the entries of the component's `nodes`, named by text or 1-based number. */
 | {
    kind: 'edges';
    required?: boolean;
};
/** One catalog entry. */
export interface ComponentDescriptor {
    /** Tag name the model writes. */
    type: string;
    /** One-line model-facing purpose. Kept short: the whole catalog travels in the tool description. */
    description: string;
    /** Whether the component may contain children. */
    container: boolean;
    /**
     * The only component types a container holds, when it is that narrow. Such a
     * container belongs inside another one, like any leaf: a chart holds series.
     */
    holds?: readonly string[];
    /** Prop that a bare quoted string on a DIL line fills: `title "Total"`. */
    primary?: string;
    /** Props the compiler accepts. An unknown prop is dropped with `unknown_prop`. */
    props: Record<string, PropSpec>;
}
/**
 * The catalog table, in documentation order. Keep `space`-scaled padding and
 * gap on the 4px grid so generated interfaces keep the host's rhythm.
 */
export declare const CATALOG: readonly ComponentDescriptor[];
/** Descriptor lookup by tag name. */
export declare const CATALOG_BY_TYPE: ReadonlyMap<string, ComponentDescriptor>;
/**
 * Stable hash of the catalog's semantics: component names, containment, and prop
 * names, kinds, and requiredness.
 * Descriptions are excluded, so rewording the model-facing text never makes a
 * persisted program look foreign.
 * @returns a short hex digest.
 */
export declare function catalogHash(): string;
