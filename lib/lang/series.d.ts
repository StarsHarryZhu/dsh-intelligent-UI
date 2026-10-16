/**
 * Exact derivatives by Taylor-mode automatic differentiation.
 *
 * An expression is evaluated over truncated power series instead of numbers:
 * each value is the list of Taylor coefficients c_k = f⁽ᵏ⁾(a)/k! at the point
 * of interest, and every operator has an exact recurrence on those lists. The
 * k-th derivative is then k!·c_k, correct to rounding for any order, with none of
 * the step-size trade-offs of finite differences.
 *
 * The walk covers the arithmetic operators and the smooth functions of the
 * table. Anything it cannot follow — an integral or a limit whose bounds move
 * with the variable, a gamma function, a jump of `floor` — reports
 * {@link UNSUPPORTED}, and the caller decides whether a numerical fallback is
 * acceptable. A non-differentiable point (|x| at 0) reports `undefined`.
 * @module dsh-intelligent-ui/lang/series
 */
/** Taylor coefficients, constant term first. */
export type Series = number[];
/** Returned when the walk meets an operator it cannot differentiate exactly. */
export declare const UNSUPPORTED: unique symbol;
/** Highest order a series may carry. */
export declare const MAX_SERIES_ORDER = 30;
/** Callbacks into the plain evaluator, which owns state reads and the work budget. */
export interface SeriesHost {
    /** Plain value of a subtree, with extra bound variables. */
    plain(node: unknown, bindings: ReadonlyMap<string, number>): number | string | boolean | undefined;
    /** Charge work against the shared budget; false once it is spent. */
    charge(steps: number): boolean;
}
/**
 * Taylor coefficients of `body` in `variable` around `at`.
 * @param body - the expression.
 * @param variable - the name being varied.
 * @param at - the expansion point.
 * @param order - highest coefficient wanted, at most {@link MAX_SERIES_ORDER}.
 * @param bindings - values of enclosing bound variables.
 * @param host - plain evaluation and the budget.
 * @returns the coefficients, undefined at a non-differentiable point, or {@link UNSUPPORTED}.
 */
export declare function taylorCoefficients(body: unknown, variable: string, at: number, order: number, bindings: ReadonlyMap<string, number>, host: SeriesHost): Series | undefined | typeof UNSUPPORTED;
