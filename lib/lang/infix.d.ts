/**
 * The readable expression syntax: `seats * 29`, `plan == "Pro" ? 29 : 12`.
 *
 * Models write arithmetic far more reliably than nested JSON arrays, so every
 * place that takes an expression accepts this form and lowers it to the closed
 * {@link ExprNode} union. The parser only produces operators that
 * {@link checkExpr} already understands, so the readable surface can never widen
 * what an expression may do.
 * @module dsh-intelligent-ui/lang/infix
 */
import type { ExprNode, ExprOperand } from './types.ts';
/**
 * Parse one readable expression.
 * @param text - expression text, without surrounding braces.
 * @returns the expression tree, or undefined when the text is outside the vocabulary.
 */
export declare function parseInfix(text: string): ExprNode | undefined;
/** Wrap a bare literal so every stored expression is an operator array. */
export declare function asNode(value: ExprOperand): ExprNode;
/**
 * Read one quoted string with backslash escapes.
 * @param text - the whole expression.
 * @param start - index of the opening quote.
 * @returns the decoded value and the index after the closing quote, or undefined when unterminated.
 */
export declare function readString(text: string, start: number): {
    value: string;
    end: number;
} | undefined;
