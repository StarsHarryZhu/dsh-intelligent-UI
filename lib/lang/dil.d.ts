/**
 * DIL: the line-oriented interface language the model writes.
 *
 * ```
 * @state seats = 8 min=1 max=50
 * @calc price = seats * 29
 * card "Team plan"
 *   slider "Seats" bind=seats
 *   metric "Monthly" value=price unit=USD
 *   text "{seats} seats cost {price} USD a month."
 * ```
 *
 * One statement per line, so a streamed program can be compiled from the lines
 * that have arrived. Indentation nests a component inside the container above it,
 * and is the only way to nest one. The one exception to one-line statements is a
 * text block: a component line that ends in `"""` takes the lines after it, up
 * to a line holding only `"""`, as one multi-line value, written as is:
 *
 * ```
 * code lang=python """
 *   total = 0
 *   for i in range(4):
 *       total += i
 * """
 * ```
 *
 * The parser only produces the JSON envelope; the compiler validates it against
 * the catalog.
 * @module dsh-intelligent-ui/lang/dil
 */
import type { Diagnostic } from './types.ts';
/** One `@state` row of the envelope, before validation. */
export interface RawState {
    key?: unknown;
    init?: unknown;
    min?: unknown;
    max?: unknown;
    step?: unknown;
    options?: unknown;
}
/** One `@calc` row of the envelope, before validation. */
export interface RawCalc {
    key?: unknown;
    expr?: unknown;
}
/** One node of the envelope, before validation. */
export interface RawNode {
    id?: unknown;
    type?: unknown;
    parent?: unknown;
    props?: unknown;
    /** A control's state key. DIL writes it as a prop; the JSON form may use this sibling. */
    bind?: unknown;
    /** 1-based source line, for diagnostics. Not part of the JSON form. */
    line?: number;
}
/** The envelope both grammars produce. */
export interface Envelope {
    states?: unknown;
    calcs?: unknown;
    nodes?: unknown;
}
/**
 * Parse DIL source into the JSON envelope.
 * @param source - model-authored DIL text.
 * @param diagnostics - collection to append findings to.
 * @param partial - true while the source is still streaming: the last line may be incomplete and is skipped.
 * @returns the envelope, or undefined when no line produced anything.
 */
export declare function parseDil(source: string, diagnostics: Diagnostic[], partial?: boolean): Envelope | undefined;
