/**
 * The numeric library behind every math expression: the closed function table,
 * the named constants, and the calculus routines.
 *
 * Everything here works on plain numbers and callbacks, never on expression
 * trees, so it can be reasoned about and tested on its own. A routine that
 * cannot reach its accuracy target returns `NaN` instead of a doubtful number;
 * the evaluator turns that into a missing value, which a card shows as "—".
 * Showing nothing is always preferred to showing a wrong figure.
 * @module dsh-intelligent-ui/lang/math
 */
/** One entry of the function table. */
export interface MathFunction {
    /** Accepted argument counts, inclusive. */
    arity: readonly [number, number];
    /** Model-facing signature, for the tool description. */
    signature: string;
    /** The function itself. Returns NaN outside its domain. */
    apply(args: readonly number[]): number;
}
/** Named constants. `inf` is only meaningful as an integral or limit bound. */
export declare const MATH_CONSTANTS: Readonly<Record<string, number>>;
/** Whether a name is a reserved constant; such a name cannot be declared as state. */
export declare function isMathConstant(name: string): boolean;
/**
 * Gamma function by the Lanczos approximation, with the reflection formula
 * below one half. Relative error is near 1e-15 across the real line.
 */
export declare function gamma(x: number): number;
/** n! for whole n (exact while the product fits a double), Γ(n+1) otherwise. */
export declare function factorial(n: number): number;
/** Binomial coefficient C(n, k); exact for whole numbers small enough to multiply out. */
export declare function binomial(n: number, k: number): number;
/**
 * The error function. A power series below 2.5 and a continued fraction for
 * the complement above it; absolute error stays below 1e-14.
 */
export declare function erf(x: number): number;
/**
 * The closed function table. A call names one of these keys or it is not a
 * call; the lookup always uses an own-property check.
 */
export declare const MATH_FUNCTIONS: Readonly<Record<string, MathFunction>>;
/** Other spellings models reach for, mapped onto table keys. */
export declare const FUNCTION_ALIASES: Readonly<Record<string, string>>;
/** Resolve a written function name to its table key, or undefined. */
export declare function mathFunctionName(written: string): string | undefined;
/** A real function of one variable. NaN means "no value here". */
export type RealFunction = (x: number) => number;
/** Exposed for the tests that pin the rule's constants. */
export declare const QUADRATURE_RULE: {
    readonly nodes: number[];
    readonly kronrod: number[];
    readonly gauss: number[];
};
/**
 * Definite integral by adaptive Gauss–Kronrod quadrature.
 *
 * The interval with the largest error estimate is bisected until the total
 * estimate meets 1e-10 relative (or 1e-12 absolute). Infinite bounds are mapped
 * onto a finite interval first. The nodes never touch an endpoint, so an
 * integrable endpoint singularity such as 1/√x on [0, 1] is resolved by
 * subdivision. A result whose error estimate stays above 1e-6 relative is
 * refused.
 * @param f - the integrand.
 * @param a - lower bound, possibly -Infinity.
 * @param b - upper bound, possibly +Infinity.
 * @returns the integral, or NaN when it cannot be computed to that accuracy.
 */
export declare function integrate(f: RealFunction, a: number, b: number): number;
/**
 * Numerical derivative by Ridders' extrapolation of central differences. Used
 * only where exact Taylor arithmetic cannot follow the expression, such as a
 * derivative of an integral with a variable bound.
 * @param f - the function.
 * @param x - the point.
 * @param order - 1 or 2.
 * @returns the derivative, or NaN when the extrapolation does not settle.
 */
export declare function differentiate(f: RealFunction, x: number, order: 1 | 2): number;
/**
 * Numerical limit of f at a point, from one side or both.
 *
 * Samples approach the point geometrically and are extrapolated to a zero step
 * (Neville's scheme in the step), which is exact in the limit for removable
 * singularities such as sin(x)/x. When the extrapolation does not settle the
 * raw samples are checked for convergence instead. A two-sided limit needs both
 * sides to agree. Limits at ±Infinity substitute x = ±1/t.
 * @param f - the function.
 * @param at - the point, possibly ±Infinity.
 * @param side - +1 from above, -1 from below, 0 for both.
 * @returns the limit, or NaN for a divergent, oscillating, or one-sided-only limit.
 */
export declare function limit(f: RealFunction, at: number, side: -1 | 0 | 1): number;
/**
 * A root of f in [lo, hi]: the interval is scanned in 64 steps for the first
 * sign change, which Brent's method then narrows to full precision.
 * @param f - the function.
 * @param lo - left end.
 * @param hi - right end.
 * @returns the leftmost root found, or NaN when f never changes sign.
 */
export declare function findRoot(f: RealFunction, lo: number, hi: number): number;
/**
 * Significant-digit display for computed results: `0.333333`, `1.23457e-7`.
 * @param value - the number.
 * @param digits - significant digits, 1 to 12.
 * @returns the text, trailing zeros trimmed.
 */
export declare function formatSignificant(value: number, digits: number): string;
/** `1.500e-7` → `1.5e-7`, `2.000e+21` → `2e21`. */
export declare function trimExponent(text: string): string;
