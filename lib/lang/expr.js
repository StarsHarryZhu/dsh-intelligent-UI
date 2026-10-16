/**
 * Expression validation, static typing, and evaluation.
 *
 * Two separate passes on purpose. Validation runs on the host against the
 * declared state and derived keys, so a bad reference is a compile diagnostic
 * the model can repair rather than a blank element the reader discovers.
 * Evaluation then runs in the browser on every control change and must be total:
 * it never throws, so one malformed program can never blank the surrounding card.
 *
 * Evaluation is also bounded. Calculus operators evaluate their body many times,
 * so every evaluation draws on a work budget; a program that would stall the
 * page instead yields no value.
 * @module dsh-intelligent-ui/lang/expr
 */
import { differentiate, factorial, findRoot, integrate, limit, MATH_CONSTANTS, MATH_FUNCTIONS, trimExponent, } from "./math.js";
import { MAX_SERIES_ORDER, taylorCoefficients, UNSUPPORTED } from "./series.js";
import { BINDING_OPERATORS, EXPR_OPERATORS, NUMERIC_OPERATORS } from "./types.js";
/** Returned instead of a value when an expression cannot be evaluated. */
export const EXPR_FAILURE = Symbol('dsh-intelligent-ui.expr-failure');
/** Maximum expression nesting accepted by validation and evaluation. */
export const MAX_EXPR_DEPTH = 32;
/** Most parts one `concat` accepts. */
export const MAX_CONCAT_PARTS = 8;
/** Longest string `concat` may build, so a program cannot manufacture unbounded text. */
export const MAX_CONCAT_LENGTH = 2000;
/** Node visits one evaluation may spend, so a slider drag never stalls the page. */
export const MAX_EVAL_STEPS = 400_000;
/** Calculus operators nested inside one another, at most (a double integral is two). */
export const MAX_CALCULUS_NESTING = 3;
/** Terms one `sum` or `prod` may add up. */
export const MAX_SERIES_TERMS = 10_000;
/** Highest derivative order `deriv` accepts. */
export const MAX_DERIVATIVE_ORDER = 20;
/**
 * A fresh work budget.
 * @param steps - node visits allowed.
 * @returns the budget.
 */
export function createBudget(steps = MAX_EVAL_STEPS) {
    return { remaining: steps };
}
/** Accepted argument counts per operator, or `undefined` where the operator checks its own. */
const ARITIES = {
    lit: [1, 1], ref: [1, 1], num: [1, 1], const: [1, 1], neg: [1, 1], not: [1, 1],
    abs: [1, 1], floor: [1, 1], ceil: [1, 1],
    add: [2, 2], sub: [2, 2], mul: [2, 2], div: [2, 2], mod: [2, 2], pow: [2, 2], min: [2, 8], max: [2, 8],
    lt: [2, 2], gt: [2, 2], le: [2, 2], ge: [2, 2], eq: [2, 2], ne: [2, 2],
    and: [2, 4], or: [2, 4], if: [3, 3], round: [2, 2], fmtNum: [1, 2], concat: undefined, fn: undefined,
    integral: [4, 4], deriv: [3, 4], limit: [3, 4], sum: [4, 4], prod: [4, 4], solve: [4, 4], taylor: [5, 5],
};
/** A name a calculus operator may bind. */
const VARIABLE = /^[A-Za-z_][\w]*$/u;
/**
 * Validate one expression against the keys it may read.
 * @param node - candidate expression tree, normally straight from parsed JSON.
 * @param scope - readable keys and the type each one already has.
 * @param path - diagnostic path of this subtree.
 * @returns the produced type (absent when the node is unusable) and every problem found.
 */
export function checkExpr(node, scope, path = '$') {
    const problems = [];
    const type = check(node, path, 0, new Map());
    return { type, problems };
    function check(value, here, level, bound) {
        // A number or boolean operand in place is a literal: `["mul",["ref","seats"],29]`
        // reads better than wrapping 29 in `["num",29]`, and both are the same program.
        // A bare string is NOT a literal, because a bare name in that position would be
        // a reference the validator could not check.
        if (typeof value === 'number')
            return Number.isFinite(value) ? 'number' : reject(here, 'numbers must be finite');
        if (typeof value === 'boolean')
            return 'boolean';
        if (level > MAX_EXPR_DEPTH)
            return reject(here, `expression nests deeper than ${MAX_EXPR_DEPTH}`);
        if (!Array.isArray(value) || value.length === 0 || typeof value[0] !== 'string') {
            return reject(here, 'an expression is ["operator", …arguments]');
        }
        const operator = value[0];
        const args = value.slice(1);
        if (!EXPR_OPERATORS.has(operator)) {
            return reject(here, `unknown expression operator "${operator}"`);
        }
        const arity = ARITIES[operator];
        if (arity !== undefined && (args.length < arity[0] || args.length > arity[1])) {
            const expected = arity[0] === arity[1] ? String(arity[0]) : `${arity[0]}..${arity[1]}`;
            return reject(here, `${operator} takes ${expected} argument(s), got ${args.length}`);
        }
        if (BINDING_OPERATORS.has(operator))
            return binder(operator, args, here, level, bound);
        switch (operator) {
            case 'lit': {
                const literal = args[0];
                if (typeof literal === 'number' && Number.isFinite(literal))
                    return 'number';
                if (typeof literal === 'string')
                    return 'string';
                if (typeof literal === 'boolean')
                    return 'boolean';
                return reject(here, 'lit accepts a string, a finite number, or a boolean');
            }
            case 'num':
                return typeof args[0] === 'number' && Number.isFinite(args[0]) ? 'number' : reject(here, 'num takes a finite number');
            case 'const':
                return typeof args[0] === 'string' && Object.hasOwn(MATH_CONSTANTS, args[0])
                    ? 'number'
                    : reject(here, `unknown constant "${String(args[0])}"; the constants are ${Object.keys(MATH_CONSTANTS).join(', ')}`);
            case 'ref': {
                const key = args[0];
                if (typeof key !== 'string')
                    return reject(here, 'ref takes a state or derived key name');
                const known = bound.get(key) ?? scope.get(key);
                if (known === undefined) {
                    problems.push({ code: 'unknown_ref', message: `"${key}" is not a declared @state or @calc key`, path: here });
                    return undefined;
                }
                return known;
            }
            case 'not':
                return check(args[0], `${here}[1]`, level + 1, bound) === undefined ? undefined : 'boolean';
            case 'neg':
            case 'abs':
            case 'floor':
            case 'ceil':
                return numeric(args[0], `${here}[1]`, level, bound) ? 'number' : undefined;
            case 'add':
            case 'sub':
            case 'mul':
            case 'div':
            case 'mod':
            case 'pow':
            case 'min':
            case 'max':
                return allNumeric(args, here, level, bound, 0) ? 'number' : undefined;
            case 'fn': {
                const name = args[0];
                if (typeof name !== 'string' || !Object.hasOwn(MATH_FUNCTIONS, name)) {
                    return reject(here, `unknown function "${String(name)}"`);
                }
                const [least, most] = MATH_FUNCTIONS[name].arity;
                const count = args.length - 1;
                if (count < least || count > most) {
                    return reject(here, `${name} takes ${least === most ? String(least) : `${least}..${most}`} argument(s), got ${count}`);
                }
                return allNumeric(args, here, level, bound, 1) ? 'number' : undefined;
            }
            case 'round': {
                if (!numeric(args[0], `${here}[1]`, level, bound))
                    return undefined;
                const digits = args[1];
                if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0 || digits > 6) {
                    return reject(here, 'round takes a digit count from 0 to 6');
                }
                return 'number';
            }
            case 'lt':
            case 'gt':
            case 'le':
            case 'ge':
                return allNumeric(args, here, level, bound, 0) ? 'boolean' : undefined;
            case 'eq':
            case 'ne': {
                // Equality compares two values of one type: numbers, text, or true/false.
                // That is what lets a select-driven price read `plan == "Pro"`.
                const left = check(args[0], `${here}[1]`, level + 1, bound);
                const right = check(args[1], `${here}[2]`, level + 1, bound);
                if (left === undefined || right === undefined)
                    return undefined;
                if (left !== right)
                    return reject(here, `${operator} compares two values of the same type, got ${left} and ${right}`);
                return 'boolean';
            }
            case 'and':
            case 'or':
                for (const [index, argument] of args.entries()) {
                    if (check(argument, `${here}[${index + 1}]`, level + 1, bound) === undefined)
                        return undefined;
                }
                return 'boolean';
            case 'if': {
                if (check(args[0], `${here}[1]`, level + 1, bound) === undefined)
                    return undefined;
                const whenTrue = check(args[1], `${here}[2]`, level + 1, bound);
                const whenFalse = check(args[2], `${here}[3]`, level + 1, bound);
                if (whenTrue === undefined || whenFalse === undefined)
                    return undefined;
                if (whenTrue !== whenFalse)
                    return reject(here, 'if branches must produce the same type');
                return whenTrue;
            }
            case 'fmtNum':
                if (!numeric(args[0], `${here}[1]`, level, bound))
                    return undefined;
                if (args[1] !== undefined && (typeof args[1] !== 'number' || !Number.isInteger(args[1]) || args[1] < 0 || args[1] > 6)) {
                    return reject(here, 'fmtNum takes an optional digit count from 0 to 6');
                }
                return 'string';
            case 'concat':
                return concat(args, here, level, bound);
            /* v8 ignore next 2 -- EXPR_OPERATORS and this switch list the same names. */
            default:
                return reject(here, 'unsupported operator');
        }
    }
    /**
     * A calculus operator: `[op, variable, body, …]`. The body sees the variable as
     * a number, shadowing any declared key of that name; the bounds do not see it.
     */
    function binder(operator, args, here, level, bound) {
        const variable = args[0];
        if (typeof variable !== 'string' || !VARIABLE.test(variable) || Object.hasOwn(MATH_CONSTANTS, variable)) {
            return reject(`${here}[1]`, `${operator} needs a variable name as its second argument, such as x (not a constant)`);
        }
        const inner = new Map(bound);
        inner.set(variable, 'number');
        if (!numeric(args[1], `${here}[2]`, level, inner))
            return undefined;
        if (operator === 'limit' && args[3] !== undefined && args[3] !== 1 && args[3] !== -1 && args[3] !== 0) {
            return reject(`${here}[4]`, 'limit takes 1 (from above), -1 (from below), or nothing (both sides)');
        }
        const rest = operator === 'limit' ? args.slice(2, 3) : args.slice(2);
        for (const [index, argument] of rest.entries()) {
            if (!numeric(argument, `${here}[${index + 3}]`, level, bound))
                return undefined;
        }
        return 'number';
    }
    /**
     * `concat` is the oldest text-building form, kept for persisted programs. Its
     * operands are literals, `fmtNum`, and numeric operators, and it never nests.
     * New programs interpolate with text templates instead.
     */
    function concat(args, here, level, bound) {
        if (args.length < 1 || args.length > MAX_CONCAT_PARTS) {
            return reject(here, `concat takes between 1 and ${MAX_CONCAT_PARTS} parts`);
        }
        for (const [index, argument] of args.entries()) {
            const where = `${here}[${index + 1}]`;
            if (typeof argument === 'number' || typeof argument === 'string')
                continue;
            if (!Array.isArray(argument) || typeof argument[0] !== 'string') {
                return reject(where, 'concat parts are literals, ["fmtNum",…], or numeric expressions');
            }
            const operator = argument[0];
            if (operator === 'concat')
                return reject(where, 'concat does not nest; write one flat parts list');
            if (operator !== 'lit' && operator !== 'fmtNum' && !NUMERIC_OPERATORS.has(operator)) {
                return reject(where, `concat cannot use "${operator}"`);
            }
            if (check(argument, where, level + 1, bound) === undefined)
                return undefined;
        }
        return 'string';
    }
    function numeric(value, where, level, bound) {
        if (typeof value === 'number')
            return Number.isFinite(value) || reject(where, 'numbers must be finite') !== undefined;
        const produced = check(value, where, level + 1, bound);
        if (produced === undefined)
            return false;
        if (produced !== 'number')
            return reject(where, `expected a number, got ${produced}`) !== undefined;
        return true;
    }
    function allNumeric(args, here, level, bound, skip) {
        let ok = true;
        for (let index = skip; index < args.length; index += 1) {
            if (!numeric(args[index], `${here}[${index + 1}]`, level, bound))
                ok = false;
        }
        return ok;
    }
    function reject(here, why) {
        problems.push({ code: 'invalid_expression', message: why, path: here });
        return undefined;
    }
}
/** No bound variables. */
const NO_BINDINGS = new Map();
/**
 * Evaluate one expression. Total by construction: an unexpected value yields
 * {@link EXPR_FAILURE} instead of throwing, so a single bad element can be dropped
 * without blanking the card. It is also safe on a program that was never
 * validated, which is what a persisted program read by another build is.
 * @param node - expression tree, normally accepted by {@link checkExpr}.
 * @param read - current value of a state or derived key.
 * @param budget - work budget; a fresh one by default. Pass one budget to every
 *   evaluation behind one figure, such as the samples of a plot.
 * @param bindings - values of bound variables, read before declared keys.
 * @returns the produced number, string, boolean, or {@link EXPR_FAILURE}.
 */
export function evalExpr(node, read, budget = createBudget(), bindings = NO_BINDINGS) {
    let nesting = 0;
    return evaluate(node, bindings, 0);
    function evaluate(value, env, depth) {
        if (budget.remaining <= 0)
            return EXPR_FAILURE;
        budget.remaining -= 1;
        if (typeof value === 'number')
            return Number.isFinite(value) ? value : EXPR_FAILURE;
        if (typeof value === 'string' || typeof value === 'boolean')
            return value;
        if (depth > MAX_EXPR_DEPTH || !Array.isArray(value) || typeof value[0] !== 'string')
            return EXPR_FAILURE;
        const operator = value[0];
        const args = value.slice(1);
        switch (operator) {
            case 'lit':
            case 'num': {
                const literal = args[0];
                if (typeof literal === 'number')
                    return Number.isFinite(literal) ? literal : EXPR_FAILURE;
                return typeof literal === 'string' || typeof literal === 'boolean' ? literal : EXPR_FAILURE;
            }
            case 'const': {
                const name = args[0];
                const constant = typeof name === 'string' && Object.hasOwn(MATH_CONSTANTS, name) ? MATH_CONSTANTS[name] : Number.NaN;
                return Number.isFinite(constant) ? constant : EXPR_FAILURE;
            }
            case 'ref': {
                const key = String(args[0]);
                const local = env.get(key);
                if (local !== undefined)
                    return local;
                // A declared key always holds a primitive; anything else means the
                // program and its declarations disagree, so the element is dropped.
                const stored = read(key);
                if (typeof stored === 'number')
                    return Number.isFinite(stored) ? stored : EXPR_FAILURE;
                return typeof stored === 'string' || typeof stored === 'boolean' ? stored : EXPR_FAILURE;
            }
            case 'neg': return unary(args[0], env, depth, candidate => -candidate);
            case 'abs': return unary(args[0], env, depth, Math.abs);
            case 'floor': return unary(args[0], env, depth, Math.floor);
            case 'ceil': return unary(args[0], env, depth, Math.ceil);
            case 'round': {
                const digits = typeof args[1] === 'number' && Number.isInteger(args[1]) ? Math.max(0, Math.min(6, args[1])) : 0;
                return unary(args[0], env, depth, candidate => Math.round(candidate * 10 ** digits) / 10 ** digits);
            }
            case 'add': return binary(args[0], args[1], env, depth, (a, b) => a + b);
            case 'sub': return binary(args[0], args[1], env, depth, (a, b) => a - b);
            case 'mul': return binary(args[0], args[1], env, depth, (a, b) => a * b);
            case 'div': return binary(args[0], args[1], env, depth, (a, b) => (b === 0 ? Number.NaN : a / b));
            case 'mod': return binary(args[0], args[1], env, depth, (a, b) => (b === 0 ? Number.NaN : a % b));
            case 'pow': return binary(args[0], args[1], env, depth, (a, b) => a ** b);
            case 'min': return many(args, env, depth, numbers => Math.min(...numbers));
            case 'max': return many(args, env, depth, numbers => Math.max(...numbers));
            case 'fn': {
                const name = args[0];
                if (typeof name !== 'string' || !Object.hasOwn(MATH_FUNCTIONS, name))
                    return EXPR_FAILURE;
                const entry = MATH_FUNCTIONS[name];
                const count = args.length - 1;
                if (count < entry.arity[0] || count > entry.arity[1])
                    return EXPR_FAILURE;
                return many(args.slice(1), env, depth, numbers => entry.apply(numbers));
            }
            case 'lt': return compare(args[0], args[1], env, depth, (a, b) => a < b);
            case 'gt': return compare(args[0], args[1], env, depth, (a, b) => a > b);
            case 'le': return compare(args[0], args[1], env, depth, (a, b) => a <= b);
            case 'ge': return compare(args[0], args[1], env, depth, (a, b) => a >= b);
            case 'eq': return equal(args[0], args[1], env, depth, true);
            case 'ne': return equal(args[0], args[1], env, depth, false);
            case 'not': {
                const inner = evaluate(args[0], env, depth + 1);
                return inner === EXPR_FAILURE ? EXPR_FAILURE : !truthy(inner);
            }
            case 'and':
                return args.every((part) => {
                    const piece = evaluate(part, env, depth + 1);
                    return piece !== EXPR_FAILURE && truthy(piece);
                });
            case 'or':
                return args.some((part) => {
                    const piece = evaluate(part, env, depth + 1);
                    return piece !== EXPR_FAILURE && truthy(piece);
                });
            case 'if': {
                const test = evaluate(args[0], env, depth + 1);
                if (test === EXPR_FAILURE)
                    return EXPR_FAILURE;
                return evaluate(truthy(test) ? args[1] : args[2], env, depth + 1);
            }
            case 'fmtNum': {
                const inner = evaluate(args[0], env, depth + 1);
                if (inner === EXPR_FAILURE || typeof inner !== 'number')
                    return EXPR_FAILURE;
                const digits = typeof args[1] === 'number' && Number.isInteger(args[1]) ? Math.max(0, Math.min(6, args[1])) : 0;
                return inner.toFixed(digits);
            }
            case 'concat': {
                let text = '';
                for (const part of args) {
                    const piece = evaluate(part, env, depth + 1);
                    if (piece === EXPR_FAILURE)
                        return EXPR_FAILURE;
                    text += typeof piece === 'number' ? formatNumber(piece) : String(piece);
                    if (text.length > MAX_CONCAT_LENGTH)
                        return EXPR_FAILURE;
                }
                return text;
            }
            default:
                return BINDING_OPERATORS.has(operator) ? calculus(operator, args, env, depth) : EXPR_FAILURE;
        }
    }
    /** One calculus operator: its body becomes a real function of the bound variable. */
    function calculus(operator, args, env, depth) {
        const written = args[0];
        if (typeof written !== 'string' || nesting >= MAX_CALCULUS_NESTING)
            return EXPR_FAILURE;
        const variable = written;
        const body = args[1];
        const scope = new Map(env);
        const f = (x) => {
            scope.set(variable, x);
            const produced = evaluate(body, scope, depth + 1);
            return typeof produced === 'number' ? produced : Number.NaN;
        };
        nesting += 1;
        try {
            const result = run();
            return typeof result === 'number' && Number.isFinite(result) ? result : EXPR_FAILURE;
        }
        finally {
            nesting -= 1;
        }
        function run() {
            switch (operator) {
                case 'integral': {
                    const a = bound(args[2], env, depth);
                    const b = bound(args[3], env, depth);
                    return a === EXPR_FAILURE || b === EXPR_FAILURE ? EXPR_FAILURE : integrate(f, a, b);
                }
                case 'limit': {
                    const at = bound(args[2], env, depth);
                    const side = args[3] === undefined ? 0 : args[3];
                    if (at === EXPR_FAILURE || (side !== 0 && side !== 1 && side !== -1))
                        return EXPR_FAILURE;
                    return limit(f, at, side);
                }
                case 'solve': {
                    const lo = numericValue(args[2], env, depth);
                    const hi = numericValue(args[3], env, depth);
                    return lo === EXPR_FAILURE || hi === EXPR_FAILURE ? EXPR_FAILURE : findRoot(f, lo, hi);
                }
                case 'sum':
                case 'prod': return series(operator, f, args, env, depth);
                case 'deriv': {
                    const at = numericValue(args[2], env, depth);
                    const order = args[3] === undefined ? 1 : wholeValue(args[3], env, depth);
                    if (at === EXPR_FAILURE || order === EXPR_FAILURE || order < 1 || order > MAX_DERIVATIVE_ORDER)
                        return EXPR_FAILURE;
                    const coefficients = taylorCoefficients(body, variable, at, order, env, host(depth));
                    if (coefficients === UNSUPPORTED)
                        return order <= 2 ? differentiate(f, at, order) : EXPR_FAILURE;
                    if (coefficients === undefined)
                        return EXPR_FAILURE;
                    return coefficients[order] * factorial(order);
                }
                case 'taylor': {
                    const center = numericValue(args[2], env, depth);
                    const order = wholeValue(args[3], env, depth);
                    const at = numericValue(args[4], env, depth);
                    if (center === EXPR_FAILURE || order === EXPR_FAILURE || at === EXPR_FAILURE || order < 0 || order > MAX_SERIES_ORDER) {
                        return EXPR_FAILURE;
                    }
                    const coefficients = taylorCoefficients(body, variable, center, order, env, host(depth));
                    if (coefficients === UNSUPPORTED || coefficients === undefined)
                        return EXPR_FAILURE;
                    let total = 0;
                    for (let k = order; k >= 0; k -= 1)
                        total = total * (at - center) + coefficients[k];
                    return total;
                }
                /* v8 ignore next 2 -- BINDING_OPERATORS lists exactly the cases above. */
                default:
                    return EXPR_FAILURE;
            }
        }
    }
    /** `sum` and `prod` over whole numbers from..to; compensated summation keeps long sums exact. */
    function series(operator, f, args, env, depth) {
        const from = wholeValue(args[2], env, depth);
        const to = wholeValue(args[3], env, depth);
        if (from === EXPR_FAILURE || to === EXPR_FAILURE)
            return EXPR_FAILURE;
        if (to - from + 1 > MAX_SERIES_TERMS)
            return EXPR_FAILURE;
        if (operator === 'prod') {
            let product = 1;
            for (let k = from; k <= to; k += 1)
                product *= f(k);
            return product;
        }
        let total = 0;
        let carry = 0;
        for (let k = from; k <= to; k += 1) {
            const term = f(k) - carry;
            const next = total + term;
            carry = next - total - term;
            total = next;
        }
        return total;
    }
    /** The plain evaluator as the series walk sees it. */
    function host(depth) {
        return {
            plain: (node, scope) => {
                const produced = evaluate(node, scope, depth + 1);
                return produced === EXPR_FAILURE ? undefined : produced;
            },
            charge: (steps) => {
                budget.remaining -= steps;
                return budget.remaining > 0;
            },
        };
    }
    /** An integral or limit bound: a finite number, `inf`, or `-inf`. */
    function bound(value, env, depth) {
        if (isInfinity(value))
            return Number.POSITIVE_INFINITY;
        if (Array.isArray(value) && value[0] === 'neg' && isInfinity(value[1]))
            return Number.NEGATIVE_INFINITY;
        return numericValue(value, env, depth);
    }
    function numericValue(value, env, depth) {
        const inner = evaluate(value, env, depth + 1);
        return typeof inner === 'number' && Number.isFinite(inner) ? inner : EXPR_FAILURE;
    }
    /** A whole number, allowing the rounding error of a computed bound. */
    function wholeValue(value, env, depth) {
        const inner = numericValue(value, env, depth);
        if (inner === EXPR_FAILURE)
            return EXPR_FAILURE;
        const rounded = Math.round(inner);
        return Math.abs(inner - rounded) <= 1e-9 * Math.max(1, Math.abs(inner)) ? rounded : EXPR_FAILURE;
    }
    function unary(value, env, depth, apply) {
        const candidate = numericValue(value, env, depth);
        if (candidate === EXPR_FAILURE)
            return EXPR_FAILURE;
        const result = apply(candidate);
        return Number.isFinite(result) ? result : EXPR_FAILURE;
    }
    function binary(left, right, env, depth, apply) {
        const a = numericValue(left, env, depth);
        const b = numericValue(right, env, depth);
        if (a === EXPR_FAILURE || b === EXPR_FAILURE)
            return EXPR_FAILURE;
        const result = apply(a, b);
        return Number.isFinite(result) ? result : EXPR_FAILURE;
    }
    function many(parts, env, depth, apply) {
        const numbers = [];
        for (const part of parts) {
            const candidate = numericValue(part, env, depth);
            if (candidate === EXPR_FAILURE)
                return EXPR_FAILURE;
            numbers.push(candidate);
        }
        if (numbers.length === 0)
            return EXPR_FAILURE;
        const result = apply(numbers);
        return Number.isFinite(result) ? result : EXPR_FAILURE;
    }
    function compare(left, right, env, depth, apply) {
        const a = numericValue(left, env, depth);
        const b = numericValue(right, env, depth);
        if (a === EXPR_FAILURE || b === EXPR_FAILURE)
            return EXPR_FAILURE;
        return apply(a, b);
    }
    function equal(left, right, env, depth, same) {
        const a = evaluate(left, env, depth + 1);
        const b = evaluate(right, env, depth + 1);
        if (a === EXPR_FAILURE || b === EXPR_FAILURE || typeof a !== typeof b)
            return EXPR_FAILURE;
        return (a === b) === same;
    }
}
/** Whether an expression is the `inf` constant. */
function isInfinity(value) {
    return Array.isArray(value) && value[0] === 'const' && value[1] === 'inf';
}
/**
 * Whether an expression tree uses the math vocabulary, which a format-2 client
 * would not evaluate correctly.
 * @param node - any JSON value; arrays are searched recursively.
 * @param operators - the operators that mark the newer format.
 * @returns true when an operator from the set appears, or min/max takes more than two arguments.
 */
export function usesOperators(node, operators) {
    if (Array.isArray(node)) {
        const head = node[0];
        if (typeof head === 'string' && (operators.has(head) || ((head === 'min' || head === 'max') && node.length > 3)))
            return true;
        return node.some(part => usesOperators(part, operators));
    }
    if (typeof node === 'object' && node !== null)
        return Object.values(node).some(part => usesOperators(part, operators));
    return false;
}
/** Truthiness for `and` / `or` / `if`: numbers count when non-zero, strings when non-empty. */
export function truthy(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value !== 0 && !Number.isNaN(value);
    return value.length > 0;
}
/**
 * Render a number for display: integers plainly, fractions to at most two
 * places, small fractions to three significant digits, and very large or very
 * small magnitudes in exponent form — so 0.000123 never reads as 0.
 */
export function formatNumber(value) {
    if (!Number.isFinite(value))
        return '—';
    const size = Math.abs(value);
    if (size !== 0 && (size >= 1e15 || size < 1e-6))
        return trimExponent(value.toExponential(2));
    if (Number.isInteger(value))
        return String(value);
    if (size < 0.01)
        return String(Number(value.toPrecision(3)));
    return String(Number(value.toFixed(2)));
}
