/**
 * Text with live values: `"{seats} seats cost {price} USD"`.
 *
 * Interpolation is parsed once, on the host, into a template of literal and
 * expression segments; the browser only evaluates the segments. An interpolation
 * that does not read as a valid expression over declared keys stays visible as
 * literal text, so a stray brace in prose is never an error that costs the
 * reader the component.
 * @module dsh-intelligent-ui/lang/text
 */
import { type ExprType } from './expr.ts';
import type { JsonValue, TextTemplate } from './types.ts';
/** A parsed piece of text plus the interpolations that had to stay literal. */
export interface ParsedTemplate {
    template: TextTemplate;
    /** Interpolations that were not valid expressions, verbatim, for the diagnostic. */
    rejected: string[];
}
/**
 * Split text into literal and `{expression}` segments.
 *
 * `{{` and `}}` write literal braces. Quotes inside an interpolation are honoured,
 * so `{plan == "Pro" ? "yes" : "no"}` is one segment.
 * @param text - the text as the model wrote it.
 * @param scope - declared keys and their types; an interpolation must type-check against it.
 * @returns the template and the interpolations kept as literal text.
 */
export declare function parseTemplate(text: string, scope: ReadonlyMap<string, ExprType>): ParsedTemplate;
/**
 * Render one hoisted text value with the current values.
 *
 * Total: every unexpected shape renders as nothing rather than throwing, because a
 * persisted program may come from another build.
 * @param value - a hoisted template (`[{"$c":…},{"$expr":…}]`), or a plain JSON scalar.
 * @param values - current state and derived values.
 * @param constants - the program's constants table.
 * @returns the resolved text.
 */
export declare function renderText(value: unknown, values: ReadonlyMap<string, JsonValue>, constants?: Readonly<Record<string, unknown>>): string;
/**
 * Evaluate one expression for display, degrading to an em dash.
 * @param expr - expression tree, or a literal.
 * @param values - current state and derived values.
 * @returns readable text for the produced value.
 */
export declare function valueText(expr: unknown, values: ReadonlyMap<string, JsonValue>): string;
