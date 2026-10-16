/**
 * The readable expression syntax: `seats * 29`, `plan == "Pro" ? 29 : 12`,
 * `3x^2 - 2x + 1`, `integral(sin(x), x, 0, pi)`.
 *
 * Models write arithmetic far more reliably than nested JSON arrays, so every
 * place that takes an expression accepts this form and lowers it to the closed
 * {@link ExprNode} union. The parser only produces operators that
 * {@link checkExpr} already understands, so the readable surface can never widen
 * what an expression may do.
 *
 * Precedence, loosest first: `?:`, `||`, `&&`, `== !=`, `< <= > >=`, `+ -`,
 * `* / %` and implicit multiplication (`2x`, `(a+b)(a-b)`), unary `- + !`, `^`
 * (right-associative, so `-x^2` is `-(x^2)` and `2^3^2` is `2^9`), postfix `!`.
 * @module dsh-intelligent-ui/lang/infix
 */
import { MAX_PICK_OPTIONS } from "./expr.js";
import { isMathConstant, mathFunctionName } from "./math.js";
/** Longest expression text accepted, so a pathological line cannot stall the parser. */
const MAX_EXPRESSION_LENGTH = 2000;
/** Word operators, read as their symbolic forms. */
const WORD_OPERATORS = { and: '&&', or: '||', not: '!' };
/**
 * Parse one readable expression.
 * @param text - expression text, without surrounding braces.
 * @returns the expression tree, or undefined when the text is outside the vocabulary.
 */
export function parseInfix(text) {
    if (text.length > MAX_EXPRESSION_LENGTH)
        return undefined;
    const tokens = tokenize(normalize(text));
    if (tokens === undefined || tokens.length === 0)
        return undefined;
    let index = 0;
    const parsed = parseTernary();
    if (parsed === undefined || index !== tokens.length)
        return undefined;
    return asNode(parsed);
    function peek(offset = 0) {
        return tokens?.[index + offset];
    }
    function isOp(value) {
        const token = peek();
        return token?.t === 'op' && token.v === value;
    }
    function parseTernary() {
        const test = parseOr();
        if (test === undefined || !isOp('?'))
            return test;
        index += 1;
        const whenTrue = parseTernary();
        if (whenTrue === undefined || !isOp(':'))
            return undefined;
        index += 1;
        const whenFalse = parseTernary();
        if (whenFalse === undefined)
            return undefined;
        return ['if', test, whenTrue, whenFalse];
    }
    function parseOr() {
        let left = parseAnd();
        while (left !== undefined && isOp('||')) {
            index += 1;
            const right = parseAnd();
            if (right === undefined)
                return undefined;
            left = ['or', left, right];
        }
        return left;
    }
    function parseAnd() {
        let left = parseEquality();
        while (left !== undefined && isOp('&&')) {
            index += 1;
            const right = parseEquality();
            if (right === undefined)
                return undefined;
            left = ['and', left, right];
        }
        return left;
    }
    function parseEquality() {
        let left = parseComparison();
        for (;;) {
            if (left === undefined)
                return undefined;
            const token = peek();
            if (token?.t !== 'op' || (token.v !== '==' && token.v !== '!=' && token.v !== '='))
                return left;
            index += 1;
            const right = parseComparison();
            if (right === undefined)
                return undefined;
            left = [token.v === '!=' ? 'ne' : 'eq', left, right];
        }
    }
    function parseComparison() {
        let left = parseSum();
        for (;;) {
            if (left === undefined)
                return undefined;
            const token = peek();
            const operator = token?.t === 'op' ? COMPARISONS[token.v] : undefined;
            if (operator === undefined)
                return left;
            index += 1;
            const right = parseSum();
            if (right === undefined)
                return undefined;
            left = [operator, left, right];
        }
    }
    function parseSum() {
        let left = parseProduct();
        for (;;) {
            if (left === undefined)
                return undefined;
            const token = peek();
            if (token?.t !== 'op' || (token.v !== '+' && token.v !== '-'))
                return left;
            index += 1;
            const right = parseProduct();
            if (right === undefined)
                return undefined;
            left = [token.v === '+' ? 'add' : 'sub', left, right];
        }
    }
    function parseProduct() {
        let left = parseUnary();
        for (;;) {
            if (left === undefined)
                return undefined;
            const token = peek();
            if (token?.t === 'op' && (token.v === '*' || token.v === '/' || token.v === '%')) {
                index += 1;
                const right = parseUnary();
                if (right === undefined)
                    return undefined;
                left = [token.v === '*' ? 'mul' : token.v === '/' ? 'div' : 'mod', left, right];
                continue;
            }
            // Juxtaposition multiplies: `2x`, `3(x + 1)`, `(a + b)(a - b)`. Nothing else
            // in the grammar puts one operand straight after another, so this never
            // reinterprets an expression that already had a meaning.
            if (token !== undefined && (token.t === 'num' || token.t === 'id' || (token.t === 'op' && token.v === '('))) {
                const right = parsePower();
                if (right === undefined)
                    return undefined;
                left = ['mul', left, right];
                continue;
            }
            return left;
        }
    }
    function parseUnary() {
        if (isOp('-')) {
            index += 1;
            const inner = parseUnary();
            if (inner === undefined)
                return undefined;
            return typeof inner === 'number' ? -inner : ['neg', inner];
        }
        if (isOp('+')) {
            index += 1;
            return parseUnary();
        }
        if (isOp('!')) {
            index += 1;
            const inner = parseUnary();
            return inner === undefined ? undefined : ['not', inner];
        }
        return parsePower();
    }
    function parsePower() {
        const base = parsePostfix();
        if (base === undefined || !isOp('^'))
            return base;
        index += 1;
        // The exponent may carry its own sign (`2^-1`) and associates to the right.
        const exponent = parseUnary();
        return exponent === undefined ? undefined : ['pow', base, exponent];
    }
    function parsePostfix() {
        let operand = parseAtom();
        while (operand !== undefined && isOp('!')) {
            index += 1;
            operand = ['fn', 'fact', operand];
        }
        return operand;
    }
    function parseAtom() {
        const token = peek();
        if (token === undefined)
            return undefined;
        index += 1;
        if (token.t === 'num')
            return token.v;
        if (token.t === 'str')
            return ['lit', token.v];
        if (token.t === 'op') {
            if (token.v !== '(')
                return undefined;
            const inner = parseTernary();
            if (inner === undefined || !isOp(')'))
                return undefined;
            index += 1;
            return inner;
        }
        if (token.v === 'true')
            return true;
        if (token.v === 'false')
            return false;
        if (!isOp('('))
            return isMathConstant(token.v) ? ['const', token.v] : ['ref', token.v];
        index += 1;
        const parts = [];
        if (!isOp(')')) {
            for (;;) {
                const part = parseTernary();
                if (part === undefined)
                    return undefined;
                parts.push(part);
                if (!isOp(','))
                    break;
                index += 1;
            }
        }
        if (!isOp(')'))
            return undefined;
        index += 1;
        return call(token.v, parts);
    }
}
/** Comparison symbols and the operators they lower to. */
const COMPARISONS = {
    '<': 'lt', '>': 'gt', '<=': 'le', '>=': 'ge',
};
/** Calculus spellings, mapped onto their operators. */
const CALCULUS = {
    integral: 'integral', integrate: 'integral',
    deriv: 'deriv', derivative: 'deriv', diff: 'deriv',
    limit: 'limit', lim: 'limit',
    sum: 'sum',
    prod: 'prod', product: 'prod',
    solve: 'solve', findroot: 'solve',
    taylor: 'taylor',
};
/** Argument counts of each calculus operator, variable included. */
const CALCULUS_ARITY = {
    integral: [4, 4], deriv: [3, 4], limit: [3, 4], sum: [4, 4], prod: [4, 4], solve: [4, 4], taylor: [5, 5],
};
/** Lower one function call to its operator, or reject a name outside the vocabulary. */
function call(name, parts) {
    const [first, second, third] = parts;
    switch (name) {
        case 'if':
            return parts.length === 3 ? ['if', first, second, third] : undefined;
        case 'min':
        case 'max':
            return parts.length >= 2 && parts.length <= 8 ? [name, ...parts] : undefined;
        case 'abs':
        case 'floor':
        case 'ceil':
            return parts.length === 1 ? [name, first] : undefined;
        case 'round':
            if (parts.length === 1)
                return ['round', first, 0];
            return parts.length === 2 && typeof second === 'number' ? ['round', first, second] : undefined;
        case 'fmt':
        case 'fmtNum':
            if (parts.length === 1)
                return ['fmtNum', first];
            return parts.length === 2 && typeof second === 'number' ? ['fmtNum', first, second] : undefined;
        case 'pow':
            return parts.length === 2 ? ['pow', first, second] : undefined;
        case 'pick':
            return parts.length >= 3 && parts.length <= MAX_PICK_OPTIONS + 1 ? ['pick', ...parts] : undefined;
        default:
            break;
    }
    const calculus = Object.hasOwn(CALCULUS, name) ? CALCULUS[name] : undefined;
    if (calculus !== undefined)
        return binder(calculus, parts);
    const table = mathFunctionName(name);
    return table === undefined ? undefined : ['fn', table, ...parts];
}
/**
 * Lower a calculus call. The second argument names the variable, so it must
 * have been read as a bare name; `solve` also accepts an equation as its body.
 */
function binder(operator, parts) {
    const [least, most] = CALCULUS_ARITY[operator];
    if (parts.length < least || parts.length > most)
        return undefined;
    const [body, variable, ...rest] = parts;
    if (!Array.isArray(variable) || variable[0] !== 'ref' || typeof variable[1] !== 'string')
        return undefined;
    const name = variable[1];
    let inner = body;
    if (operator === 'solve' && Array.isArray(inner) && inner[0] === 'eq')
        inner = ['sub', inner[1], inner[2]];
    return [operator, name, inner, ...rest];
}
/**
 * Map the symbols models paste from typeset math onto the ASCII grammar:
 * − × · ÷ ≤ ≥ ≠ π ∞ √( and superscript squares and cubes.
 */
function normalize(text) {
    return text
        .replace(/[\u2212\u2013]/gu, '-')
        .replace(/[\u00d7\u00b7\u22c5\u2217]/gu, '*')
        .replace(/\u00f7/gu, '/')
        .replace(/\u2264/gu, '<=')
        .replace(/\u2265/gu, '>=')
        .replace(/\u2260/gu, '!=')
        .replace(/\u03c0/gu, ' pi ')
        .replace(/\u221e/gu, ' inf ')
        .replace(/\u221a\s*\(/gu, 'sqrt(')
        .replace(/\u00b2/gu, '^2')
        .replace(/\u00b3/gu, '^3')
        .replace(/\*\*/gu, '^');
}
/** Wrap a bare literal so every stored expression is an operator array. */
export function asNode(value) {
    return typeof value === 'number' || typeof value === 'boolean' ? ['lit', value] : value;
}
/** Split an expression into tokens, or undefined on an unreadable character. */
function tokenize(text) {
    const tokens = [];
    let index = 0;
    while (index < text.length) {
        const character = text[index];
        if (/\s/u.test(character)) {
            index += 1;
            continue;
        }
        if (character === '"' || character === '\'') {
            const read = readString(text, index);
            if (read === undefined)
                return undefined;
            tokens.push({ t: 'str', v: read.value });
            index = read.end;
            continue;
        }
        const rest = text.slice(index);
        const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/u.exec(rest);
        if (number !== null) {
            tokens.push({ t: 'num', v: Number(number[0]) });
            index += number[0].length;
            continue;
        }
        const word = /^[A-Za-z_$][\w$]*/u.exec(rest);
        if (word !== null) {
            const operator = WORD_OPERATORS[word[0]];
            tokens.push(operator === undefined ? { t: 'id', v: word[0] } : { t: 'op', v: operator });
            index += word[0].length;
            continue;
        }
        const operator = /^(?:<=|>=|==|!=|&&|\|\||[-+*/%^()<>,!?:=])/u.exec(rest);
        if (operator !== null) {
            tokens.push({ t: 'op', v: operator[0] });
            index += operator[0].length;
            continue;
        }
        return undefined;
    }
    return tokens;
}
/**
 * Read one quoted string with backslash escapes.
 * @param text - the whole expression.
 * @param start - index of the opening quote.
 * @returns the decoded value and the index after the closing quote, or undefined when unterminated.
 */
export function readString(text, start) {
    const quote = text[start];
    let value = '';
    for (let index = start + 1; index < text.length; index += 1) {
        const character = text[index];
        if (character === '\\' && index + 1 < text.length) {
            const next = text[index + 1];
            value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
            index += 1;
            continue;
        }
        if (character === quote)
            return { value, end: index + 1 };
        value += character;
    }
    return undefined;
}
