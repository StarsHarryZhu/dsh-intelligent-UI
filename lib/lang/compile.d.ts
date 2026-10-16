/**
 * Compile model-authored source into a validated {@link UIProgram}.
 *
 * The compiler is the trust boundary. It never passes model text through: every
 * accepted value is re-emitted from the catalog's vocabulary, every expression is
 * structurally validated, and every rejection carries a repair instruction
 * written for the model, because the compiled result travels back to it as the
 * tool result it repairs from.
 *
 * It is also deliberately forgiving about form. A bad optional prop is dropped on
 * its own, a component without a parent joins the nearest card, and a duplicate
 * id is renamed: each of those is reported, and none of them costs the reader the
 * rest of the interface. Only an empty or unreadable program fails.
 * @module dsh-intelligent-ui/lang/compile
 */
import { type Envelope } from './dil.ts';
import type { Diagnostic, JsonValue, UIProgram } from './types.ts';
/** Result of one compile attempt. */
export type CompileResult = {
    ok: true;
    program: UIProgram;
} | {
    ok: false;
    diagnostics: Diagnostic[];
};
/** Compile options. */
export interface CompileOptions {
    /**
     * The source is still streaming. The trailing line of DIL is skipped, JSON is
     * read only once it parses whole, and nothing is reported: a preview either
     * renders or waits for more text.
     */
    partial?: boolean;
}
/**
 * Compile one source string, choosing the grammar from its first character: a
 * JSON envelope starts with `{`, anything else is DIL.
 * @param source - the model-authored program.
 * @param options - compile options.
 * @returns the program, or the diagnostics that must go back to the model.
 */
export declare function compileSource(source: string, options?: CompileOptions): CompileResult;
/**
 * Compile an already-parsed envelope. Exported because both grammars converge
 * here, and tests drive the validator directly.
 * @param envelope - candidate envelope from either parser.
 * @param inherited - diagnostics already collected by the parser.
 * @returns the program, or every diagnostic gathered so far.
 */
export declare function compileEnvelope(envelope: Envelope, inherited?: Diagnostic[]): CompileResult;
/** Whether a string is an inline raster image the browser can show without a request. */
export declare function isDataImage(value: string): boolean;
/**
 * Build the plain-text stand-in for a program.
 *
 * Every consumer that cannot render the node list gets this instead, and the
 * model reads it to see what a text-only reader sees. It resolves derived values
 * through the same evaluator, so the numbers are the ones the card shows.
 * @param program - compiled program.
 * @returns newline-separated readable text, never empty.
 */
export declare function buildFallback(program: UIProgram): string;
/**
 * State and derived values at their declared initial state.
 * @param program - compiled program.
 * @returns each declared key mapped to its initial or computed value.
 */
export declare function initialValues(program: Pick<UIProgram, 'state' | 'calc'>): Map<string, JsonValue>;
/**
 * Render one readable line per meaningful node, in tree order.
 * @param program - compiled program.
 * @param values - current state and derived values, normally from {@link initialValues}.
 * @returns the fallback lines, before empty-line filtering.
 */
export declare function fallbackLines(program: Pick<UIProgram, 'nodes' | 'constants' | 'state'>, values: ReadonlyMap<string, JsonValue>): string[];
