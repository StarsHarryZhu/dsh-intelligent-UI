/**
 * Expression validation, static typing, and evaluation.
 *
 * Two separate passes on purpose. Validation runs on the host against the
 * declared state and derived keys, so a bad reference is a compile diagnostic
 * the model can repair rather than a blank element the reader discovers.
 * Evaluation then runs in the browser on every control change and must be total:
 * it never throws, so one malformed program can never blank the surrounding card.
 * @module dsh-intelligent-ui/lang/expr
 */
import { type JsonValue } from './types.ts';
/** The static type an expression can produce. */
export type ExprType = 'number' | 'string' | 'boolean';
/** Returned instead of a value when an expression cannot be evaluated. */
export declare const EXPR_FAILURE: unique symbol;
/** Maximum expression nesting accepted by validation and evaluation. */
export declare const MAX_EXPR_DEPTH = 16;
/** Most parts one `concat` accepts. */
export declare const MAX_CONCAT_PARTS = 8;
/** Longest string `concat` may build, so a program cannot manufacture unbounded text. */
export declare const MAX_CONCAT_LENGTH = 2000;
/** Validation finding for one expression. */
export interface ExprProblem {
    code: 'invalid_expression' | 'unknown_ref';
    message: string;
    /** Path of the offending node, for the diagnostic. */
    path: string;
}
/** Whole-subtree validation result. */
export interface ExprCheck {
    type: ExprType | undefined;
    problems: ExprProblem[];
}
/**
 * Validate one expression against the keys it may read.
 * @param node - candidate expression tree, normally straight from parsed JSON.
 * @param scope - readable keys and the type each one already has.
 * @param path - diagnostic path of this subtree.
 * @returns the produced type (absent when the node is unusable) and every problem found.
 */
export declare function checkExpr(node: unknown, scope: ReadonlyMap<string, ExprType>, path?: string): ExprCheck;
/**
 * Evaluate one expression. Total by construction: an unexpected value yields
 * {@link EXPR_FAILURE} instead of throwing, so a single bad element can be dropped
 * without blanking the card. It is also safe on a program that was never
 * validated, which is what a persisted program read by another build is.
 * @param node - expression tree, normally accepted by {@link checkExpr}.
 * @param read - current value of a state or derived key.
 * @returns the produced number, string, boolean, or {@link EXPR_FAILURE}.
 */
export declare function evalExpr(node: unknown, read: (key: string) => JsonValue | undefined): number | string | boolean | typeof EXPR_FAILURE;
/** Truthiness for `and` / `or` / `if`: numbers count when non-zero, strings when non-empty. */
export declare function truthy(value: number | string | boolean): boolean;
/** Render a number for display: integers plainly, fractions to at most two places. */
export declare function formatNumber(value: number): string;
