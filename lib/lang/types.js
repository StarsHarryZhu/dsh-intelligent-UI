/**
 * Language vocabulary and JSON shapes.
 *
 * Every value that reaches the client is lossless JSON: expressions are JSON
 * data (`["add",["ref","a"],1]`), never functions or source text. That is the
 * whole reason the compiled program can be persisted in the session log and
 * replayed without executing anything the client cannot verify.
 * @module dsh-intelligent-ui/lang/types
 */
/** Calculus operators: `[operator, variable, body, …bounds]`. */
export const BINDING_OPERATORS = new Set(['integral', 'deriv', 'limit', 'sum', 'prod', 'solve', 'taylor']);
/** Every operator the evaluator accepts, as a lookup for structural validation. */
export const EXPR_OPERATORS = new Set([
    'lit', 'ref', 'num', 'const', 'neg',
    'add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max',
    'lt', 'gt', 'le', 'ge', 'eq', 'ne',
    'and', 'or', 'not', 'if',
    'abs', 'floor', 'ceil', 'round', 'fn',
    ...BINDING_OPERATORS,
    'concat', 'fmtNum',
]);
/** Operators whose result is always a number, so `concat` may receive them. */
export const NUMERIC_OPERATORS = new Set([
    'num', 'const', 'neg', 'add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max',
    'abs', 'floor', 'ceil', 'round', 'fn', ...BINDING_OPERATORS,
]);
/**
 * Operators a format-2 client does not know. A program that uses one is written
 * as format 3, so an older client shows its text instead of a wrong figure.
 */
export const FORMAT_3_OPERATORS = new Set(['const', 'pow', 'fn', ...BINDING_OPERATORS]);
