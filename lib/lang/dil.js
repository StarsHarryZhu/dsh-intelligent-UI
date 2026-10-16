/**
 * DIL: the line-oriented interface language the model writes.
 *
 * ```
 * @state seats = 8 min=1 max=50
 * @calc price = seats * 29
 * card "Team plan"
 *   slider "Seats" bind=seats
 *   metric "Monthly" value=price unit=USD
 *   text "{seats} seats cost {price} USD a month."
 * ```
 *
 * One statement per line, so a streamed program can be compiled from the lines
 * that have arrived. Indentation nests a component inside the container above it;
 * the older explicit form, `#id type … in=#parent`, is still read. The parser only
 * produces the JSON envelope; the compiler validates it against the catalog.
 * @module dsh-intelligent-ui/lang/dil
 */
import { CATALOG_BY_TYPE } from "./catalog.js";
import { readString } from "./infix.js";
/** Spaces one tab stands for when measuring indentation. */
const TAB_WIDTH = 2;
/**
 * Parse DIL source into the JSON envelope.
 * @param source - model-authored DIL text.
 * @param diagnostics - collection to append findings to.
 * @param partial - true while the source is still streaming: the last line may be incomplete and is skipped.
 * @returns the envelope, or undefined when no line produced anything.
 */
export function parseDil(source, diagnostics, partial = false) {
    const states = [];
    const calcs = [];
    const nodes = [];
    const keys = new Set();
    const ids = new Set();
    /** Open lines, innermost last: the parent candidates for the next indented line. */
    const stack = [];
    /** The most recent top-level container, adopted by flat (unindented) lines. */
    let lastRoot;
    let unread = 0;
    const lines = source.split(/\r?\n/u);
    if (partial && !/\n$/u.test(source))
        lines.pop();
    for (const [index, rawLine] of lines.entries()) {
        const number = index + 1;
        const indent = indentation(rawLine);
        const line = rawLine.trim();
        if (line === '' || line.startsWith('//') || line.startsWith('```') || line === '#' || line.startsWith('# '))
            continue;
        if (line.startsWith('@state')) {
            const state = parseState(line, number, diagnostics);
            if (state === undefined)
                unread += 1;
            else {
                states.push(state);
                keys.add(state.key);
            }
            continue;
        }
        if (line.startsWith('@calc')) {
            const calc = parseCalc(line, number, diagnostics);
            if (calc === undefined)
                unread += 1;
            else {
                calcs.push(calc);
                keys.add(calc.key);
            }
            continue;
        }
        const node = parseNode(line, number, keys, diagnostics);
        if (node === undefined) {
            unread += 1;
            continue;
        }
        if (typeof node.id !== 'string' || node.id === '')
            node.id = freshId(ids, node.type);
        ids.add(node.id);
        while (stack.length > 0 && stack.at(-1).indent >= indent)
            stack.pop();
        const container = CATALOG_BY_TYPE.get(node.type)?.container === true;
        if (node.parent === undefined) {
            const enclosing = [...stack].reverse().find(entry => entry.container);
            // Without indentation the reading order still decides: an unindented line
            // after a card belongs to that card. Only another card starts a new root.
            if (enclosing !== undefined)
                node.parent = enclosing.id;
            else if (lastRoot !== undefined && node.type !== 'card')
                node.parent = lastRoot;
            else
                node.parent = null;
        }
        if (container && node.parent === null)
            lastRoot = node.id;
        stack.push({ indent, id: node.id, container });
        nodes.push(node);
    }
    if (unread > 0 && !partial) {
        diagnostics.push({
            code: 'unterminated_line',
            message: `${unread} line(s) could not be read`,
            repair: 'A line is "@state name = value", "@calc name = expression", or "component \\"text\\" prop=value". Rewrite the reported lines; the rest still rendered.',
        });
    }
    if (nodes.length === 0 && states.length === 0 && calcs.length === 0)
        return undefined;
    return { states, calcs, nodes };
}
/** Leading whitespace width, counting a tab as {@link TAB_WIDTH} spaces. */
function indentation(line) {
    let width = 0;
    for (const character of line) {
        if (character === ' ')
            width += 1;
        else if (character === '\t')
            width += TAB_WIDTH;
        else
            break;
    }
    return width;
}
/** An id no earlier line uses, derived from the component type. */
function freshId(ids, type) {
    let counter = ids.size + 1;
    while (ids.has(`${type}${counter}`))
        counter += 1;
    return `${type}${counter}`;
}
/**
 * `@state seats = 8 min=1 max=50 step=1`, `@state plan = "Pro" options=Basic|Pro|Team`.
 *
 * The kind follows from the initial value: a number, quoted text, true/false, or
 * an `options=` list. The older explicit kind word is still accepted anywhere on
 * the line.
 */
function parseState(line, number, diagnostics) {
    const body = line.slice('@state'.length).trim();
    const equals = body.indexOf('=');
    const key = (equals === -1 ? '' : body.slice(0, equals)).trim();
    if (!/^[A-Za-z_$][\w$]*$/u.test(key)) {
        return reject(number, 'Write "@state seats = 8" with a name of letters, digits, or underscores.', diagnostics);
    }
    const tokens = tokenizeLine(body.slice(equals + 1));
    const first = tokens.shift();
    if (first === undefined || first.name !== undefined) {
        return reject(number, `Give "${key}" an initial value: "@state ${key} = 8".`, diagnostics);
    }
    const raw = { key, init: scalar(first) };
    for (const token of tokens) {
        if (token.name === undefined) {
            if (!token.quoted && ['number', 'string', 'text', 'boolean', 'select'].includes(token.value))
                raw.kind = token.value;
            continue;
        }
        if (token.name === 'min' || token.name === 'max' || token.name === 'step')
            raw[token.name] = scalar(token);
        else if (token.name === 'options')
            raw.options = optionList(token);
    }
    return raw;
}
/** `@calc price = seats * 29` */
function parseCalc(line, number, diagnostics) {
    const body = line.slice('@calc'.length).trim();
    const equals = body.indexOf('=');
    const key = (equals === -1 ? '' : body.slice(0, equals)).trim();
    const expression = equals === -1 ? '' : body.slice(equals + 1).trim();
    if (!/^[A-Za-z_$][\w$]*$/u.test(key) || expression === '') {
        return reject(number, 'Write "@calc price = seats * 29".', diagnostics);
    }
    return { key, expr: expression };
}
/**
 * `card "Team plan" padding=3`, `#m metric "Monthly" value=price in=#root`.
 *
 * A bare quoted string fills the component's primary text prop. Values keep the
 * shape the JSON envelope uses: quoted text stays text (the compiler reads its
 * `{…}` interpolations), JSON arrays and objects are parsed in place, numbers and
 * true/false are literals, and a bare word stays a string for the compiler to
 * read by the prop's kind.
 */
function parseNode(line, number, keys, diagnostics) {
    const text = line.startsWith('<') ? line.slice(1).replace(/\/?>$/u, '') : line;
    const tokens = tokenizeLine(text);
    let id;
    if (tokens[0]?.name === undefined && tokens[0]?.quoted === false && tokens[0].value.startsWith('#')) {
        id = tokens.shift().value.slice(1);
    }
    const head = tokens.shift();
    if (head === undefined || head.name !== undefined || head.quoted || !/^[A-Za-z][\w-]*$/u.test(head.value)) {
        return reject(number, 'Start a component line with its name: card "Title", slider "Seats" bind=seats.', diagnostics);
    }
    const type = head.value;
    const descriptor = CATALOG_BY_TYPE.get(type);
    // No prototype: a model-written prop named `__proto__` is just an unknown prop.
    const props = Object.create(null);
    const node = { type, props, line: number };
    if (id !== undefined && id !== '')
        node.id = id;
    for (const token of tokens) {
        if (token.name === undefined) {
            if (!token.quoted && token.value.startsWith('#') && node.id === undefined) {
                node.id = token.value.slice(1);
                continue;
            }
            const primary = descriptor?.primary;
            // An unknown component is reported once, by the compiler; its text needs no second report.
            if (descriptor === undefined)
                continue;
            if (token.quoted && primary !== undefined && !(primary in props))
                props[primary] = token.value;
            else {
                diagnostics.push({
                    code: 'unknown_prop',
                    line: number,
                    message: `line ${number}: "${token.value}" is not attached to a prop`,
                    repair: primary === undefined
                        ? `Write it as prop=value; <${type}> takes ${Object.keys(descriptor?.props ?? {}).join(', ') || 'no props'}.`
                        : `Quote the text, or write ${primary}="…".`,
                });
            }
            continue;
        }
        if (token.name === 'in') {
            node.parent = token.value.startsWith('#') ? token.value.slice(1) : token.value;
            continue;
        }
        props[token.name] = propValue(token, descriptor?.props[token.name]?.kind, keys);
    }
    return node;
}
/** One attribute value as the envelope carries it. */
function propValue(token, kind, keys) {
    if (token.json !== undefined)
        return token.json;
    if (token.quoted)
        return token.value;
    if (token.value === 'true' || token.value === 'false')
        return token.value === 'true';
    if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(token.value))
        return Number(token.value);
    // A bare declared key in a text prop is that key's value, as it always was in
    // DIL: `text=price` shows the price, while `unit=USD` stays the word.
    if (kind === 'text' && keys.has(token.value))
        return `{${token.value}}`;
    return token.value;
}
/**
 * Split one line into tokens.
 *
 * Quoted runs (double or single quotes, backslash escapes) and JSON arrays or
 * objects stay single tokens, so `text="Total = 3"` and `rows=[["a", "1"]]` both
 * survive their spaces and equals signs.
 */
function tokenizeLine(line) {
    const tokens = [];
    let index = 0;
    while (index < line.length) {
        if (/\s/u.test(line[index])) {
            index += 1;
            continue;
        }
        const named = /^([A-Za-z_$][\w$-]*)=/u.exec(line.slice(index));
        const name = named?.[1];
        const at = index + (named === null ? 0 : named[0].length);
        const first = line[at];
        if (first === '"' || first === '\'') {
            const read = readString(line, at);
            // An unterminated quote almost always lost its closing mark at the end of
            // the line, so the rest of the line is the text rather than a broken token.
            const value = read?.value ?? line.slice(at + 1);
            tokens.push({ ...(name === undefined ? {} : { name }), value, quoted: true });
            index = read?.end ?? line.length;
            continue;
        }
        if (first === '[' || first === '{') {
            const end = jsonEnd(line, at);
            if (end !== -1) {
                const raw = line.slice(at, end);
                const json = parseJson(raw);
                if (json !== undefined) {
                    tokens.push({ ...(name === undefined ? {} : { name }), value: raw, quoted: false, json });
                    index = end;
                    continue;
                }
            }
        }
        const word = /^\S*/u.exec(line.slice(at));
        tokens.push({ ...(name === undefined ? {} : { name }), value: word[0], quoted: false });
        index = at + word[0].length;
        if (word[0] === '' && named === null)
            index += 1;
    }
    return tokens;
}
/** Index just past the bracket that closes a JSON value, or -1 when it never closes on this line. */
function jsonEnd(line, start) {
    let depth = 0;
    let quoted = false;
    for (let index = start; index < line.length; index += 1) {
        const character = line[index];
        if (quoted) {
            if (character === '\\')
                index += 1;
            else if (character === '"')
                quoted = false;
            continue;
        }
        if (character === '"')
            quoted = true;
        else if (character === '[' || character === '{')
            depth += 1;
        else if (character === ']' || character === '}') {
            depth -= 1;
            if (depth === 0)
                return index + 1;
        }
    }
    return -1;
}
/** Parse JSON without throwing. */
function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
/** A scalar initial value: number, boolean, or text. */
function scalar(token) {
    if (token.json !== undefined)
        return token.json;
    if (token.quoted)
        return token.value;
    if (token.value === 'true' || token.value === 'false')
        return token.value === 'true';
    const numeric = Number(token.value);
    return token.value !== '' && Number.isFinite(numeric) ? numeric : token.value;
}
/** `options=Basic|Pro|Team`, `options=a,b,c`, or `options=["a","b"]`. */
function optionList(token) {
    if (Array.isArray(token.json))
        return token.json;
    return token.value.split(/[|,]/u).map(option => option.trim()).filter(option => option !== '');
}
/** Report one unreadable line and drop it. */
function reject(number, repair, diagnostics) {
    diagnostics.push({ code: 'unterminated_line', line: number, message: `line ${number} could not be read`, repair });
    return undefined;
}
