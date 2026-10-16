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
/**
 * The program version that introduced each operator. A compiled program records
 * the highest version among everything it uses, so a client renders exactly the
 * programs whose vocabulary it has. An operator added later takes the next
 * version and raises `PROGRAM_VERSION` with it.
 */
export const OPERATOR_SINCE = {
    lit: 1, ref: 1, num: 1, const: 1, neg: 1,
    add: 1, sub: 1, mul: 1, div: 1, mod: 1, pow: 1, min: 1, max: 1,
    lt: 1, gt: 1, le: 1, ge: 1, eq: 1, ne: 1,
    and: 1, or: 1, not: 1, if: 1, pick: 1,
    abs: 1, floor: 1, ceil: 1, round: 1, fn: 1,
    integral: 1, deriv: 1, limit: 1, sum: 1, prod: 1, solve: 1, taylor: 1,
    concat: 1, fmtNum: 1,
};
/** Every operator the evaluator accepts, as a lookup for structural validation. */
export const EXPR_OPERATORS = new Set(Object.keys(OPERATOR_SINCE));
/** Operators whose result is always a number, so `concat` may receive them. */
export const NUMERIC_OPERATORS = new Set([
    'num', 'const', 'neg', 'add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max',
    'abs', 'floor', 'ceil', 'round', 'fn', ...BINDING_OPERATORS,
]);
/** The program version that introduced each state kind; see {@link OPERATOR_SINCE}. */
export const STATE_KIND_SINCE = { number: 1, string: 1, boolean: 1, select: 1 };
