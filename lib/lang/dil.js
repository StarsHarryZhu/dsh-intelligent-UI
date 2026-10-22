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
 * that have arrived. Indentation nests a component inside the container above it,
 * and is the only way to nest one. The one exception to one-line statements is a
 * text block: a component line that ends in `"""` takes the lines after it, up
 * to a line holding only `"""`, as one multi-line value, written as is:
 *
 * ```
 * code lang=python """
 *   total = 0
 *   for i in range(4):
 *       total += i
 * """
 * ```
 *
 * The parser only produces the JSON envelope; the compiler validates it against
 * the catalog.
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
    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const number = index + 1;
        const indent = indentation(rawLine);
        let line = rawLine.trim();
        if (line === '' || line.startsWith('//') || line.startsWith('```') || line === '#' || line.startsWith('# '))
            continue;
        // A text block: the statement ends in """, and the lines up to a closing """ are one value.
        let block;
        const opened = openBlock(line);
        if (opened !== undefined) {
            line = opened.statement;
            if (opened.inline !== undefined)
                block = { prop: opened.prop, value: opened.inline };
            else {
                const read = readBlock(lines, index + 1);
                block = { prop: opened.prop, value: read.value };
                if (!read.closed && !partial) {
                    diagnostics.push({
                        code: 'unterminated_line',
                        line: number,
                        message: `line ${number}: the text block opened with \"\"\" never closes, so it runs to the end of the source`,
                        repair: 'End a text block with a line holding only """.',
                    });
                }
                index = read.next - 1;
            }
            // A block opened on a line of its own belongs to the component above it,
            // the way a docstring sits under its definition.
            if (line === '') {
                attachLooseBlock(nodes.at(-1), block, number, diagnostics);
                continue;
            }
            if (line.startsWith('@')) {
                diagnostics.push({
                    code: 'unknown_prop',
                    line: number,
                    message: `line ${number}: a text block belongs to a component's text, not to a declaration; it was ignored`,
                    repair: 'Write a multi-line value after a component, as in code lang=python """ … """.',
                });
                block = undefined;
            }
        }
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
        if (block !== undefined)
            attachBlock(node, block, number, diagnostics);
        const id = freshId(ids, node.type);
        node.id = id;
        ids.add(id);
        while (stack.length > 0 && stack.at(-1).indent >= indent)
            stack.pop();
        const container = CATALOG_BY_TYPE.get(node.type)?.container === true;
        const enclosing = [...stack].reverse().find(entry => entry.container);
        // Without indentation the reading order still decides: an unindented line
        // after a card belongs to that card. Only another card starts a new root.
        if (enclosing !== undefined)
            node.parent = enclosing.id;
        else if (lastRoot !== undefined && node.type !== 'card')
            node.parent = lastRoot;
        else
            node.parent = null;
        if (container && node.parent === null)
            lastRoot = id;
        stack.push({ indent, id, container });
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
/**
 * Whether a statement ends in a text block, and what remains of it.
 *
 * `code lang=python """` opens a block on the following lines; `name="""`
 * names the prop it fills; `code """x = 1"""` is a block written on one line.
 * The opener must stand apart from the text before it, so a quoted string that
 * merely ends in quotes is never read as one.
 */
function openBlock(line) {
    const inline = /(^|\s)(?:([A-Za-z_$][\w$-]*)=)?"""(.*?)"""$/u.exec(line);
    if (inline !== null && !inline[3].includes('"""')) {
        return { statement: line.slice(0, inline.index + inline[1].length).trimEnd(), prop: inline[2], inline: inline[3] };
    }
    const open = /(^|\s)(?:([A-Za-z_$][\w$-]*)=)?"""$/u.exec(line);
    if (open === null)
        return undefined;
    return { statement: line.slice(0, open.index + open[1].length).trimEnd(), prop: open[2] };
}
/**
 * Read a block's lines up to its closing line, without the indentation they share.
 * @param lines - every source line.
 * @param start - index of the first line inside the block.
 * @returns the value, whether a closing line was found, and the index after the block.
 */
function readBlock(lines, start) {
    const body = [];
    let index = start;
    while (index < lines.length && lines[index].trim() !== '"""') {
        body.push(lines[index]);
        index += 1;
    }
    const closed = index < lines.length;
    const margins = body.filter(text => text.trim() !== '').map(text => /^[ \t]*/u.exec(text)?.[0].length ?? 0);
    const margin = margins.length === 0 ? 0 : Math.min(...margins);
    const value = body.map(text => (text.trim() === '' ? '' : text.slice(margin).trimEnd())).join('\n');
    return { value, closed, next: closed ? index + 1 : index };
}
/** Attach a block written on a line of its own to the component above it, and say so. */
function attachLooseBlock(node, block, number, diagnostics) {
    if (node === undefined) {
        diagnostics.push({
            code: 'unknown_prop',
            line: number,
            message: `line ${number}: the text block has no component above it; it was ignored`,
            repair: 'End the component line with """, as in code lang=python """, and write the text on the lines below.',
        });
        return;
    }
    diagnostics.push({
        code: 'unknown_prop',
        line: number,
        message: `line ${number}: the text block opened on a line of its own; it was given to <${String(node.type)}> on line ${String(node.line)}`,
        repair: 'End the component line itself with """, as in code lang=python """.',
    });
    attachBlock(node, block, number, diagnostics);
}
/** Put a block's value into the prop it names, or the component's primary text. */
function attachBlock(node, block, number, diagnostics) {
    const descriptor = CATALOG_BY_TYPE.get(node.type);
    if (descriptor === undefined)
        return;
    const prop = block.prop ?? descriptor.primary;
    const props = node.props;
    if (prop === undefined) {
        diagnostics.push({
            code: 'unknown_prop',
            line: number,
            message: `line ${number}: the text block is not attached to a prop`,
            repair: `Name the prop before the block, as in text="""; <${node.type}> takes ${Object.keys(descriptor.props).join(', ') || 'no props'}.`,
        });
        return;
    }
    if (prop in props) {
        diagnostics.push({
            code: 'unknown_prop',
            line: number,
            message: `line ${number}: ${prop} was given twice; the text block replaced the value on the line`,
            repair: `Give ${prop} either on the line or in the block, not both.`,
        });
    }
    props[prop] = block.value;
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
 * an `options=` list. Nothing else may follow the value but `min=`, `max=`,
 * `step=`, and `options=`.
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
        if (token.name === 'min' || token.name === 'max' || token.name === 'step')
            raw[token.name] = scalar(token);
        else if (token.name === 'options')
            raw.options = optionList(token);
        else {
            diagnostics.push({
                code: 'unknown_prop',
                line: number,
                message: `line ${number}: "${token.name === undefined ? token.value : `${token.name}=`}" is not part of a state declaration; it was ignored`,
                repair: 'The kind follows from the value; a state line takes only min=, max=, step=, and options=, as in "@state seats = 8 min=1 max=50".',
            });
        }
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
 * `card "Team plan" padding=3`, `metric "Monthly" value=price unit=USD`.
 *
 * A bare quoted string fills the component's primary text prop. Values keep the
 * shape the JSON envelope uses: quoted text stays text (the compiler reads its
 * `{…}` interpolations), JSON arrays and objects are parsed in place, numbers and
 * true/false are literals, and a bare word stays a string for the compiler to
 * read by the prop's kind.
 */
function parseNode(line, number, keys, diagnostics) {
    const tokens = tokenizeLine(line);
    const head = tokens.shift();
    if (head === undefined || head.name !== undefined || head.quoted || !/^[A-Za-z][\w-]*$/u.test(head.value)) {
        return reject(number, 'Start a component line with its name, without an id or angle brackets: card "Title", slider "Seats" bind=seats.', diagnostics);
    }
    const type = head.value;
    const descriptor = CATALOG_BY_TYPE.get(type);
    // No prototype: a model-written prop named `__proto__` is just an unknown prop.
    const props = Object.create(null);
    const node = { type, props, line: number };
    for (const token of tokens) {
        if (token.name === undefined) {
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
            diagnostics.push({
                code: 'unknown_prop',
                line: number,
                message: `line ${number}: in= is not part of DIL; the line was placed by its indentation`,
                repair: 'Nest a component by indenting it under its container, and leave out in=.',
            });
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
        const end = bareEnd(line, at);
        const word = line.slice(at, end);
        tokens.push({ ...(name === undefined ? {} : { name }), value: word, quoted: false });
        index = end;
        if (word === '' && named === null)
            index += 1;
    }
    return glueExpressions(tokens);
}
/**
 * End of a bare value: the first whitespace outside brackets and quotes, so
 * `value=integral(x^2, x, 0, a)` stays one token.
 */
function bareEnd(line, start) {
    let depth = 0;
    for (let index = start; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"' || character === '\'') {
            const read = readString(line, index);
            if (read === undefined)
                return line.length;
            index = read.end - 1;
            continue;
        }
        if (character === '(')
            depth += 1;
        else if (character === ')')
            depth = Math.max(0, depth - 1);
        else if (depth === 0 && /\s/u.test(character))
            return index;
    }
    return line.length;
}
/** Characters that start or end an arithmetic operator. */
const OPERATOR_EDGE = /^[-+*/^%<>=!?:&|]|[-+*/^%<>=!?:&|]$/u;
/**
 * Rejoin an expression the model spaced out: `value=mins / 60` arrives as
 * `value=mins`, `/`, `60`. A bare token that starts with an operator, or that
 * follows one, continues the named value before it.
 */
function glueExpressions(tokens) {
    const out = [];
    let open;
    for (const token of tokens) {
        const continues = open !== undefined && token.name === undefined && !token.quoted && token.json === undefined
            && (OPERATOR_EDGE.test(token.value[0] ?? '') || OPERATOR_EDGE.test(open.value.at(-1) ?? ''));
        if (continues && open !== undefined) {
            open.value = `${open.value} ${token.value}`;
            continue;
        }
        out.push(token);
        open = token.name !== undefined && !token.quoted && token.json === undefined ? token : undefined;
    }
    return out;
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
