/**
 * Print an expression tree back as readable infix text.
 *
 * The text view of a card and the summary the model reads both need to name a
 * formula, not just its value: "Area = integral(x^2, x, 0, a) = 0.333333". The
 * printer writes the same syntax `infix.ts` reads, so a printed formula can be
 * pasted back into a program. It is total: an unknown shape prints as `?`.
 * @module dsh-intelligent-ui/lang/print
 */
/**
 * Print one expression.
 * @param node - an expression tree, a number, or a boolean.
 * @returns infix text.
 */
export declare function printExpr(node: unknown): string;
