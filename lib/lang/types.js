/**
 * Language vocabulary and JSON shapes.
 *
 * Every value that reaches the client is lossless JSON: expressions are JSON
 * data (`["add",["ref","a"],1]`), never functions or source text. That is the
 * whole reason the compiled program can be persisted in the session log and
 * replayed without executing anything the client cannot verify.
 * @module dsh-intelligent-ui/lang/types
 */
/** Every operator the evaluator accepts, as a lookup for structural validation. */
export const EXPR_OPERATORS = new Set([
    'lit', 'ref', 'num', 'neg',
    'add', 'sub', 'mul', 'div', 'mod', 'min', 'max',
    'lt', 'gt', 'le', 'ge', 'eq', 'ne',
    'and', 'or', 'not', 'if',
    'abs', 'floor', 'ceil', 'round',
    'concat', 'fmtNum',
]);
/** Operators whose result is always a number, so `concat` may receive them. */
export const NUMERIC_OPERATORS = new Set([
    'num', 'neg', 'add', 'sub', 'mul', 'div', 'mod', 'min', 'max',
    'abs', 'floor', 'ceil', 'round',
]);
