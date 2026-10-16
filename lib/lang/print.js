/**
 * Print an expression tree back as readable infix text.
 *
 * The text view of a card and the summary the model reads both need to name a
 * formula, not just its value: "Area = integral(x^2, x, 0, a) = 0.333333". The
 * printer writes the same syntax `infix.ts` reads, so a printed formula can be
 * pasted back into a program. It is total: an unknown shape prints as `?`.
 * @module dsh-intelligent-ui/lang/print
 */
/** Binding strength of each printed form; higher binds tighter. */
const PRECEDENCE = {
    ternary: 1, or: 2, and: 3, equality: 4, comparison: 5, sum: 6, product: 7, unary: 8, power: 9, postfix: 10, atom: 11,
};
/** Infix spellings of the binary operators, with their precedence. */
const BINARY = {
    add: ['+', PRECEDENCE.sum], sub: ['-', PRECEDENCE.sum],
    mul: ['*', PRECEDENCE.product], div: ['/', PRECEDENCE.product], mod: ['%', PRECEDENCE.product],
    lt: ['<', PRECEDENCE.comparison], gt: ['>', PRECEDENCE.comparison], le: ['<=', PRECEDENCE.comparison], ge: ['>=', PRECEDENCE.comparison],
    eq: ['==', PRECEDENCE.equality], ne: ['!=', PRECEDENCE.equality],
};
/** Deepest tree printed; deeper subtrees print as `…`. */
const MAX_PRINT_DEPTH = 40;
/**
 * Print one expression.
 * @param node - an expression tree, a number, or a boolean.
 * @returns infix text.
 */
export function printExpr(node) {
    return print(node, 0).text;
}
function print(node, depth) {
    if (depth > MAX_PRINT_DEPTH)
        return atom('…');
    if (typeof node === 'number')
        return number(node);
    if (typeof node === 'boolean')
        return atom(String(node));
    if (!Array.isArray(node) || typeof node[0] !== 'string')
        return atom('?');
    const [operator, ...args] = node;
    const child = (value) => print(value, depth + 1);
    const list = (values) => values.map(value => child(value).text).join(', ');
    switch (operator) {
        case 'lit':
        case 'num':
            return typeof args[0] === 'string' ? atom(JSON.stringify(args[0])) : typeof args[0] === 'number' ? number(args[0]) : atom(String(args[0]));
        case 'ref':
        case 'const':
            return atom(String(args[0]));
        case 'neg':
            return { text: `-${wrap(child(args[0]), PRECEDENCE.unary)}`, level: PRECEDENCE.unary };
        case 'not':
            return { text: `!${wrap(child(args[0]), PRECEDENCE.unary)}`, level: PRECEDENCE.unary };
        case 'pow': {
            // Right-associative: the base needs brackets at equal strength, the exponent does not.
            const base = child(args[0]);
            const exponent = child(args[1]);
            return { text: `${wrap(base, PRECEDENCE.power + 1)}^${wrap(exponent, PRECEDENCE.unary)}`, level: PRECEDENCE.power };
        }
        case 'and':
        case 'or': {
            const level = operator === 'and' ? PRECEDENCE.and : PRECEDENCE.or;
            return { text: args.map(part => wrap(child(part), level + 1)).join(operator === 'and' ? ' && ' : ' || '), level };
        }
        case 'if':
            return {
                text: `${wrap(child(args[0]), PRECEDENCE.ternary + 1)} ? ${wrap(child(args[1]), PRECEDENCE.ternary + 1)} : ${child(args[2]).text}`,
                level: PRECEDENCE.ternary,
            };
        case 'fn':
            if (args[0] === 'fact' && args.length === 2)
                return { text: `${wrap(child(args[1]), PRECEDENCE.postfix)}!`, level: PRECEDENCE.postfix };
            return atom(`${String(args[0])}(${list(args.slice(1))})`);
        case 'round':
            return atom(args[1] === 0 ? `round(${child(args[0]).text})` : `round(${list(args)})`);
        case 'fmtNum':
            return atom(`fmt(${list(args)})`);
        case 'integral':
        case 'deriv':
        case 'limit':
        case 'sum':
        case 'prod':
        case 'solve':
        case 'taylor':
            return atom(`${operator}(${child(args[1]).text}, ${String(args[0])}${args.length > 2 ? `, ${list(args.slice(2))}` : ''})`);
        case 'min':
        case 'max':
        case 'abs':
        case 'floor':
        case 'ceil':
        case 'concat':
            return atom(`${operator}(${list(args)})`);
        default: {
            const binary = Object.hasOwn(BINARY, operator) ? BINARY[operator] : undefined;
            if (binary === undefined || args.length !== 2)
                return atom('?');
            const [symbol, level] = binary;
            // Left-associative: the right side needs brackets at equal strength.
            return { text: `${wrap(child(args[0]), level)} ${symbol} ${wrap(child(args[1]), level + 1)}`, level };
        }
    }
}
function atom(text) {
    return { text, level: PRECEDENCE.atom };
}
/** Negative literals print in brackets wherever an operand could misread them. */
function number(value) {
    const text = Number.isFinite(value) ? String(value) : '?';
    return value < 0 ? { text, level: PRECEDENCE.unary } : atom(text);
}
/** Bracket a subtree that binds looser than its position needs. */
function wrap(printed, needed) {
    return printed.level < needed ? `(${printed.text})` : printed.text;
}
