/**
 * Text with live values: `"{seats} seats cost {price} USD"`.
 *
 * Interpolation is parsed once, on the host, into a template of literal and
 * expression segments; the browser only evaluates the segments. An interpolation
 * that does not read as a valid expression over declared keys stays visible as
 * literal text, so a stray brace in prose is never an error that costs the
 * reader the component.
 * @module dsh-intelligent-ui/lang/text
 */
import { checkExpr, evalExpr, formatNumber } from "./expr.js";
import { parseInfix } from "./infix.js";
import { LIMITS } from "./limits.js";
/**
 * Split text into literal and `{expression}` segments.
 *
 * `{{` and `}}` write literal braces. Quotes inside an interpolation are honoured,
 * so `{plan == "Pro" ? "yes" : "no"}` is one segment.
 * @param text - the text as the model wrote it.
 * @param scope - declared keys and their types; an interpolation must type-check against it.
 * @returns the template and the interpolations kept as literal text.
 */
export function parseTemplate(text, scope) {
    const template = [];
    const rejected = [];
    let literal = '';
    let interpolations = 0;
    let index = 0;
    while (index < text.length) {
        const character = text[index];
        if (character === '{' && text[index + 1] === '{') {
            literal += '{';
            index += 2;
            continue;
        }
        if (character === '}' && text[index + 1] === '}') {
            literal += '}';
            index += 2;
            continue;
        }
        if (character !== '{') {
            literal += character;
            index += 1;
            continue;
        }
        const close = closingBrace(text, index + 1);
        if (close === -1) {
            literal += text.slice(index);
            break;
        }
        const inner = text.slice(index + 1, close).trim();
        const expr = interpolations < LIMITS.maxInterpolations && inner !== '' ? parseInfix(inner) : undefined;
        const type = expr === undefined ? undefined : checkExpr(expr, scope).type;
        if (expr === undefined || type === undefined) {
            rejected.push(text.slice(index, close + 1));
            literal += text.slice(index, close + 1);
        }
        else {
            if (literal !== '')
                template.push({ text: literal });
            literal = '';
            template.push({ expr });
            interpolations += 1;
        }
        index = close + 1;
    }
    if (literal !== '' || template.length === 0)
        template.push({ text: literal });
    return { template, rejected };
}
/** Index of the brace that closes an interpolation, skipping quoted runs; -1 when unclosed. */
function closingBrace(text, start) {
    let quote;
    for (let index = start; index < text.length; index += 1) {
        const character = text[index];
        if (quote !== undefined) {
            if (character === '\\')
                index += 1;
            else if (character === quote)
                quote = undefined;
            continue;
        }
        if (character === '"' || character === '\'')
            quote = character;
        else if (character === '{')
            return -1;
        else if (character === '}')
            return index;
    }
    return -1;
}
/**
 * Render one hoisted text value with the current values.
 *
 * Total: every unexpected shape renders as nothing rather than throwing, because a
 * persisted program may come from another build.
 * @param value - a hoisted template (`[{"$c":…},{"$expr":…}]`), or a plain JSON scalar.
 * @param values - current state and derived values.
 * @param constants - the program's constants table.
 * @returns the resolved text.
 */
export function renderText(value, values, constants = {}) {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number')
        return formatNumber(value);
    if (typeof value === 'boolean')
        return String(value);
    if (!Array.isArray(value))
        return '';
    let text = '';
    for (const segment of value) {
        if (typeof segment !== 'object' || segment === null || Array.isArray(segment))
            continue;
        const record = segment;
        if (typeof record.$c === 'string') {
            const literal = Object.hasOwn(constants, record.$c) ? constants[record.$c] : undefined;
            text += typeof literal === 'string' || typeof literal === 'number' ? String(literal) : '';
            continue;
        }
        if (Array.isArray(record.$expr))
            text += valueText(record.$expr, values);
    }
    return text;
}
/**
 * Evaluate one expression for display, degrading to an em dash.
 * @param expr - expression tree, or a literal.
 * @param values - current state and derived values.
 * @returns readable text for the produced value.
 */
export function valueText(expr, values) {
    if (expr === undefined || expr === null)
        return '';
    const produced = evalExpr(expr, key => values.get(key));
    if (typeof produced === 'symbol')
        return '—';
    return typeof produced === 'number' ? formatNumber(produced) : String(produced);
}
