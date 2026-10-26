/**
 * Compile model-authored source into a validated {@link UIProgram}.
 *
 * The compiler is the trust boundary. It never passes model text through: every
 * accepted value is re-emitted from the catalog's vocabulary, every expression is
 * structurally validated, and every rejection carries a repair instruction
 * written for the model, because the compiled result travels back to it as the
 * tool result it repairs from.
 *
 * It is also deliberately forgiving about form. A bad optional prop is dropped on
 * its own, a component without a parent joins the nearest card, and a duplicate
 * id is renamed: each of those is reported, and none of them costs the reader the
 * rest of the interface. Only an empty or unreadable program fails.
 * @module dsh-intelligent-ui/lang/compile
 */
import { CATALOG_BY_TYPE, catalogHash, MAX_CHART_SERIES, MAX_PIE_SLICES, SIZES, TONES } from "./catalog.js";
import { parseDil } from "./dil.js";
import { checkExpr, evalExpr } from "./expr.js";
import { API_VERSION } from "./identity.js";
import { asNode, parseInfix } from "./infix.js";
import { LIMITS, MAX_SPACE } from "./limits.js";
import { formatSignificant, isMathConstant, MATH_CONSTANTS } from "./math.js";
import { printExpr } from "./print.js";
import { parseTemplate, renderText, valueText } from "./text.js";
import {} from "./types.js";
/** Catalog semantics hash folded into every program, for diagnostics across builds. */
const HASH = catalogHash();
/**
 * Compile one source string, choosing the grammar from its first character: a
 * JSON envelope starts with `{`, anything else is DIL.
 * @param source - the model-authored program.
 * @param options - compile options.
 * @returns the program, or the diagnostics that must go back to the model.
 */
export function compileSource(source, options = {}) {
    const partial = options.partial === true;
    if (source.length > LIMITS.maxSourceBytes) {
        return {
            ok: false,
            diagnostics: [{
                    code: 'limit_exceeded',
                    message: `the source is ${source.length} characters, over the limit of ${LIMITS.maxSourceBytes}`,
                    repair: 'Summarise the data, or split the answer into one interface per question.',
                }],
        };
    }
    const diagnostics = [];
    const text = stripFences(source, partial);
    const envelope = text.trimStart().startsWith('{')
        ? parseJsonEnvelope(text, diagnostics, partial)
        : parseDil(text, diagnostics, partial);
    if (envelope === undefined) {
        if (!diagnostics.some(entry => entry.code === 'unparseable')) {
            diagnostics.push({
                code: 'unparseable',
                message: 'the source contains no state, calc, or component line',
                repair: 'Start with a container line such as card "Title", then one indented line per component.',
            });
        }
        return { ok: false, diagnostics: partial ? [] : diagnostics };
    }
    const result = compileEnvelope(envelope, diagnostics);
    return partial && !result.ok ? { ok: false, diagnostics: [] } : result;
}
/**
 * Compile an already-parsed envelope. Exported because both grammars converge
 * here, and tests drive the validator directly.
 * @param envelope - candidate envelope from either parser.
 * @param inherited - diagnostics already collected by the parser.
 * @returns the program, or every diagnostic gathered so far.
 */
export function compileEnvelope(envelope, inherited = []) {
    const diagnostics = [...inherited];
    const state = [];
    const calc = [];
    const constants = new Constants();
    const truncated = { droppedNodes: 0, droppedLines: 0 };
    // ── declarations first: expressions and bindings both read this scope ──────
    const scope = new Map();
    const stateKinds = new Map();
    for (const raw of asArray(envelope.states ?? envelope.state)) {
        const declaration = readState(asRecord(raw), diagnostics);
        if (declaration === undefined)
            continue;
        if (scope.has(declaration.key)) {
            diagnostics.push({
                code: 'duplicate_id',
                path: `state.${declaration.key}`,
                message: `state "${declaration.key}" is declared twice; the first declaration is used`,
                repair: `Delete the second "@state ${declaration.key}".`,
            });
            continue;
        }
        if (scope.size >= LIMITS.maxState) {
            diagnostics.push(limitDiagnostic('state and calc declarations', LIMITS.maxState, `at @state ${declaration.key}`));
            break;
        }
        scope.set(declaration.key, declaration.kind === 'number' ? 'number' : declaration.kind === 'boolean' ? 'boolean' : 'string');
        stateKinds.set(declaration.key, declaration);
        state.push(declaration);
    }
    for (const raw of asArray(envelope.calcs ?? envelope.calc)) {
        const declaration = readCalc(asRecord(raw), scope, diagnostics);
        if (declaration === undefined)
            continue;
        if (scope.size >= LIMITS.maxState) {
            diagnostics.push(limitDiagnostic('state and calc declarations', LIMITS.maxState, `at @calc ${declaration.key}`));
            break;
        }
        // Registering in declaration order is what lets a calc read only earlier rows.
        scope.set(declaration.key, declaration.type);
        calc.push({ key: declaration.key, expr: declaration.expr });
    }
    // ── nodes ─────────────────────────────────────────────────────────────────
    const nodes = [];
    const ids = new Set();
    const rawNodes = flattenNodes(asArray(envelope.nodes));
    for (const [index, raw] of rawNodes.entries()) {
        if (index >= LIMITS.maxNodes) {
            truncated.droppedNodes = rawNodes.length - index;
            diagnostics.push(limitDiagnostic('components', LIMITS.maxNodes, `${truncated.droppedNodes} later component(s) were left out`));
            break;
        }
        const node = readNode(raw, { scope, stateKinds, ids, constants }, diagnostics);
        if (node !== undefined)
            nodes.push(node);
    }
    if (nodes.length === 0) {
        diagnostics.push({
            code: 'missing_root',
            message: 'the program has no usable components',
            repair: 'Add at least one component, for example: card "Title" with an indented text "…" line.',
        });
        return { ok: false, diagnostics };
    }
    connect(nodes, ids, diagnostics);
    arrangeTabs(nodes, ids, diagnostics);
    arrangeSeries(nodes, diagnostics);
    dockPlayers(nodes);
    const program = {
        version: API_VERSION,
        catalogHash: HASH,
        state,
        calc,
        nodes,
        constants: constants.table,
        fallback: '',
        diagnostics,
        ...(truncated.droppedNodes > 0 ? { truncated } : {}),
    };
    program.fallback = buildFallback(program);
    return { ok: true, program };
}
/** The diagnostic for a declaration that takes a constant's name. */
function reservedName(kind, key) {
    return invalid(`${kind}.${key}`, `"${key}" is a math constant (${Object.keys(MATH_CONSTANTS).join(', ')}), so it cannot be declared`, `Rename it, for example "@${kind} ${key}Value = …".`);
}
/** Interned literal text, so repeated labels are stored once. */
class Constants {
    table = {};
    index = new Map();
    /** The constant key holding one literal. */
    key(text) {
        const existing = this.index.get(text);
        if (existing !== undefined)
            return existing;
        const key = `c${this.index.size}`;
        this.index.set(text, key);
        this.table[key] = text;
        return key;
    }
}
/** Read one state declaration, inferring its kind from the initial value. */
function readState(raw, diagnostics) {
    const key = typeof raw.key === 'string' ? raw.key : '';
    if (!/^[A-Za-z_$][\w$]*$/u.test(key)) {
        diagnostics.push(invalid('state', 'a state declaration needs a name of letters, digits, or underscores', 'Write "@state seats = 8".'));
        return undefined;
    }
    if (isMathConstant(key)) {
        diagnostics.push(reservedName('state', key));
        return undefined;
    }
    const options = readOptionList(raw.options);
    let init = raw.init;
    // The kind follows from the initial value: an options list, a number, true/false, or text.
    const kind = options !== undefined ? 'select'
        : typeof init === 'number' ? 'number'
            : typeof init === 'boolean' ? 'boolean'
                : 'string';
    if (kind === 'number') {
        if (typeof init !== 'number' || !Number.isFinite(init)) {
            diagnostics.push(invalid(`state.${key}`, `state "${key}" is a number, so its initial value must be a number`, `Write "@state ${key} = 8".`));
            return undefined;
        }
    }
    else if (kind === 'boolean') {
        if (typeof init !== 'boolean') {
            diagnostics.push(invalid(`state.${key}`, `state "${key}" is true/false, so its initial value must be true or false`, `Write "@state ${key} = true".`));
            return undefined;
        }
    }
    else if (typeof init !== 'string') {
        if (typeof init === 'number')
            init = String(init);
        else {
            diagnostics.push(invalid(`state.${key}`, `state "${key}" is text, so its initial value must be quoted text`, `Write "@state ${key} = \\"text\\"".`));
            return undefined;
        }
    }
    const declaration = { key, kind, init: init };
    if (kind === 'number') {
        for (const field of ['min', 'max', 'step']) {
            const bound = typeof raw[field] === 'string' ? Number(raw[field]) : raw[field];
            if (bound === undefined)
                continue;
            if (typeof bound !== 'number' || !Number.isFinite(bound) || (field === 'step' && bound <= 0)) {
                diagnostics.push(invalid(`state.${key}.${field}`, `${field} must be ${field === 'step' ? 'a positive number' : 'a number'}; it was ignored`, `Write "${field}=1".`));
                continue;
            }
            declaration[field] = bound;
        }
    }
    if (kind === 'select') {
        if (options === undefined || options.length === 0) {
            diagnostics.push(invalid(`state.${key}.options`, `choice "${key}" needs at least one option`, `Write "@state ${key} = \\"a\\" options=a|b|c".`));
            return undefined;
        }
        declaration.options = options;
        if (!options.includes(declaration.init)) {
            diagnostics.push(invalid(`state.${key}`, `"${String(declaration.init)}" is not one of the options; "${options[0]}" is used`, `Start "${key}" at one of: ${options.join(', ')}.`));
            declaration.init = options[0];
        }
    }
    return declaration;
}
/** An option list from an array or an `a|b|c` string. */
function readOptionList(value) {
    if (typeof value === 'string')
        value = value.split(/[|,]/u);
    if (!Array.isArray(value))
        return undefined;
    const options = value.map(option => (typeof option === 'string' || typeof option === 'number' ? String(option).trim() : ''))
        .filter(option => option !== '');
    return [...new Set(options)].slice(0, LIMITS.maxItems);
}
/** Read one derived value: an infix string or an expression array. */
function readCalc(raw, scope, diagnostics) {
    const key = typeof raw.key === 'string' ? raw.key : '';
    if (!/^[A-Za-z_$][\w$]*$/u.test(key)) {
        diagnostics.push(invalid('calc', 'a derived value needs a name', 'Write "@calc price = seats * 29".'));
        return undefined;
    }
    if (isMathConstant(key)) {
        diagnostics.push(reservedName('calc', key));
        return undefined;
    }
    if (scope.has(key)) {
        diagnostics.push({ code: 'duplicate_id', path: `calc.${key}`, message: `"${key}" is declared twice; the first declaration is used`, repair: `Rename the second "@calc ${key}".` });
        return undefined;
    }
    const expr = readExpression(raw.expr);
    if (expr === undefined) {
        diagnostics.push({
            code: 'invalid_expression',
            path: `calc.${key}`,
            message: `"@calc ${key}" is not a readable expression`,
            repair: 'Use + - * / ^ % ( ), comparisons, && || ! ?:, functions such as sqrt sin ln, and calculus such as integral(f, x, a, b) over declared names.',
        });
        return undefined;
    }
    const check = checkExpr(expr, scope, `calc.${key}`);
    if (check.type === undefined) {
        diagnostics.push(...check.problems.map(problem => ({
            code: 'invalid_expression',
            path: problem.path,
            message: problem.message,
            repair: 'A calc may read only @state keys, calcs declared above it, the constants pi e tau, and the variable a calculus call names.',
        })));
        return undefined;
    }
    return { key, expr, type: check.type };
}
/**
 * An expression from either grammar: an infix string, a `{name}`-wrapped string,
 * an operator array, or a plain number or boolean.
 */
function readExpression(value) {
    if (typeof value === 'number' || typeof value === 'boolean')
        return asNode(value);
    if (Array.isArray(value))
        return value;
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    const unwrapped = /^\{[^{}]*\}$/u.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
    return parseInfix(unwrapped);
}
/**
 * Flatten nested JSON components into the flat list.
 *
 * A JSON component may carry its children inline (`"children":[…]`), which is how
 * most models write a tree; each child gets its parent's id.
 */
function flattenNodes(values) {
    const flat = [];
    let generated = 0;
    // Bounded twice over: the list cannot outgrow the node limit by much, and the
    // walk cannot recurse past what any renderable tree needs.
    const visit = (value, parent, depth) => {
        if (flat.length > LIMITS.maxNodes * 2 || depth > LIMITS.maxDepth * 4)
            return;
        const record = asRecord(value);
        const node = { ...record };
        if (parent !== undefined)
            node.parent = parent;
        const children = record.children;
        if (Array.isArray(children)) {
            if (typeof node.id !== 'string' || node.id === '') {
                generated += 1;
                node.id = `node${generated}`;
            }
            delete node.children;
            flat.push(node);
            for (const child of children)
                visit(child, node.id, depth + 1);
            return;
        }
        flat.push(node);
    };
    for (const value of values)
        visit(value, undefined, 0);
    return flat;
}
/** Fields of a JSON component that are not props. */
const NODE_FIELDS = new Set(['id', 'type', 'parent', 'props', 'bind', 'children', 'line']);
/** Read one node, validating every prop against its descriptor. */
function readNode(raw, context, diagnostics) {
    const type = typeof raw.type === 'string' ? raw.type : '';
    const line = typeof raw.line === 'number' ? raw.line : undefined;
    const where = (path) => (line === undefined ? { path } : { line, path });
    const descriptor = CATALOG_BY_TYPE.get(type);
    if (descriptor === undefined) {
        diagnostics.push({
            code: 'unknown_component',
            ...where(`nodes.${type || '?'}`),
            message: `"${type}" is not a component`,
            repair: `Use one of: ${[...CATALOG_BY_TYPE.keys()].join(', ')}.`,
        });
        return undefined;
    }
    let id = typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : '';
    if (id === '' || context.ids.has(id)) {
        const fresh = freshId(context.ids, type);
        if (id !== '') {
            diagnostics.push({
                code: 'duplicate_id',
                ...where(`nodes.${id}`),
                message: `id "${id}" is used twice; the second one was renamed "${fresh}"`,
                repair: 'Give every component its own id, or leave ids out.',
            });
        }
        id = fresh;
    }
    context.ids.add(id);
    // A JSON component may write its props inline next to `type`; both forms mean the same.
    const rawProps = Object.create(null);
    for (const [name, value] of Object.entries(raw)) {
        if (!NODE_FIELDS.has(name))
            rawProps[name] = value;
    }
    for (const [name, value] of Object.entries(asRecord(raw.props)))
        rawProps[name] = value;
    if (raw.bind !== undefined)
        rawProps.bind = raw.bind;
    const props = {};
    let bind;
    for (const [name, value] of Object.entries(rawProps)) {
        const spec = descriptor.props[name];
        if (spec === undefined) {
            diagnostics.push({
                code: 'unknown_prop',
                ...where(`nodes.${id}.${name}`),
                message: `<${type}> has no "${name}" prop; it was ignored`,
                repair: `<${type}> accepts ${Object.keys(descriptor.props).join(', ') || 'no props'}.`,
            });
            continue;
        }
        const outcome = readProp(name, spec, value, { descriptor, id, ...context }, rawProps);
        if (!outcome.ok) {
            const required = spec.required === true;
            diagnostics.push({
                code: outcome.code ?? 'invalid_literal',
                ...where(`nodes.${id}.${name}`),
                message: `<${type}> ${name}: ${outcome.message}${required ? '; the component was left out' : '; the prop was ignored'}`,
                repair: outcome.repair,
            });
            if (required)
                return undefined;
            continue;
        }
        for (const note of outcome.notes ?? []) {
            diagnostics.push({ code: 'invalid_expression', ...where(`nodes.${id}.${name}`), message: note, repair: 'Interpolate only declared names, for example "{price}".' });
        }
        for (const problem of outcome.problems ?? []) {
            diagnostics.push({ code: 'invalid_literal', ...where(`nodes.${id}.${name}`), message: `<${type}> ${name}: ${problem.message}`, repair: problem.repair });
        }
        if (outcome.bind !== undefined)
            bind = outcome.bind;
        else
            props[name] = outcome.value;
    }
    for (const [name, spec] of Object.entries(descriptor.props)) {
        if (spec.required !== true || name in props || (name === 'bind' && bind !== undefined))
            continue;
        diagnostics.push({
            code: 'invalid_literal',
            ...where(`nodes.${id}.${name}`),
            message: `<${type}> needs "${name}"; the component was left out`,
            repair: descriptor.primary === name ? `Write ${type} "…" or ${name}="…".` : `Add ${name}=… to the ${type} line.`,
        });
        return undefined;
    }
    if (type === 'code' && !('text' in props) && !('value' in props)) {
        diagnostics.push({
            code: 'invalid_literal',
            ...where(`nodes.${id}.text`),
            message: '<code> has neither text nor value=; the component was left out',
            repair: 'Write the text in a block (code lang=python """ … """), or name a text state or calc with value=.',
        });
        return undefined;
    }
    if (type === 'select' && bind !== undefined && bind.kind !== 'select' && !('options' in props)) {
        diagnostics.push({
            code: 'invalid_literal',
            ...where(`nodes.${id}.options`),
            message: `<select> binds "${bind.key}", which has no options; the component was left out`,
            repair: `Declare "@state ${bind.key} = \\"a\\" options=a|b|c".`,
        });
        return undefined;
    }
    const parent = raw.parent === null || raw.parent === undefined
        ? null
        : typeof raw.parent === 'string' ? raw.parent.replace(/^#/u, '') : null;
    const node = { id, type, parent, props };
    if (bind !== undefined)
        node.bind = bind;
    return node;
}
/** An id no other component uses. */
function freshId(ids, type) {
    let counter = ids.size + 1;
    while (ids.has(`${type}${counter}`))
        counter += 1;
    return `${type}${counter}`;
}
/**
 * Read a code block's text: line breaks normalised, trailing empty lines dropped,
 * and anything past the code limits cut, with the cut reported so the model can
 * shorten the listing instead of losing it silently.
 */
function readCode(written) {
    let text = written.replace(/\r\n?/gu, '\n').replace(/\n+$/u, '');
    const problems = [];
    const lines = text.split('\n');
    if (lines.length > LIMITS.maxCodeLines) {
        text = lines.slice(0, LIMITS.maxCodeLines).join('\n');
        problems.push({ message: `has ${lines.length} lines; only the first ${LIMITS.maxCodeLines} are shown`, repair: 'Show the part the answer is about, and say in prose what was left out.' });
    }
    if (text.length > LIMITS.maxCodeChars) {
        text = text.slice(0, LIMITS.maxCodeChars);
        problems.push({ message: `is longer than ${LIMITS.maxCodeChars} characters; the rest was cut`, repair: 'Show the part the answer is about, and say in prose what was left out.' });
    }
    return { ok: true, value: text, ...(problems.length > 0 ? { problems } : {}) };
}
/** Synonyms models reach for, mapped onto the tone vocabulary. */
const TONE_SYNONYMS = {
    danger: 'error', negative: 'error', bad: 'error', warning: 'warn', caution: 'warn',
    positive: 'success', good: 'success', ok: 'success', info: 'primary', accent: 'primary',
    brand: 'primary', neutral: 'secondary', default: 'secondary', subtle: 'muted', quiet: 'muted',
};
/** Synonyms models reach for, mapped onto the size vocabulary. */
const SIZE_SYNONYMS = {
    small: 'sm', medium: 'md', normal: 'md', large: 'lg', big: 'lg', huge: 'xl', tiny: 'xs',
};
/** Read and validate one prop against its spec. */
function readProp(name, spec, value, context, rawProps) {
    const bad = (message, repair, code) => ({ ok: false, message, repair, ...(code === undefined ? {} : { code }) });
    switch (spec.kind) {
        case 'string': {
            const written = typeof value === 'number' ? String(value) : value;
            if (typeof written !== 'string')
                return bad('must be text', `Write ${name}="…".`);
            const text = spec.aliases === undefined ? written : spec.aliases[written.trim().toLowerCase()] ?? written.trim().toLowerCase();
            if (spec.enum !== undefined && !spec.enum.includes(text))
                return bad(`must be one of ${spec.enum.join(', ')}`, `Write ${name}=${spec.enum[0]}.`);
            if (spec.maxLength !== undefined && text.length > spec.maxLength)
                return bad(`is longer than ${spec.maxLength} characters`, 'Shorten it.');
            if (spec.format === 'url' && !/^https?:\/\/[^\s]+$/iu.test(text))
                return bad('must be an http(s) URL', `Write ${name}="https://…".`);
            if (spec.format === 'image' && !isDataImage(text)) {
                return bad('must be a data:image/png, jpeg, gif, or webp URL; remote images are not loaded', 'Describe the image in text instead.');
            }
            return { ok: true, value: text };
        }
        case 'code': {
            const written = typeof value === 'number' ? String(value) : value;
            if (typeof written !== 'string')
                return bad('must be text', `Write ${name}=""" on its line, the text below, and """ to close it.`);
            return readCode(written);
        }
        case 'text': {
            const read = readText(value, context);
            if (read === undefined)
                return bad('must be text, optionally with {name} interpolation', `Write ${name}="…".`);
            return { ok: true, value: read.value, ...(read.notes.length > 0 ? { notes: read.notes } : {}) };
        }
        case 'expr': {
            const expr = readExpression(value);
            if (expr === undefined)
                return bad('must be a number or an expression such as price * 12', `Write ${name}=price.`, 'invalid_expression');
            const check = checkExpr(expr, context.scope, `nodes.${context.id}.${name}`);
            if (check.type === undefined) {
                const first = check.problems[0];
                return bad(first?.message ?? 'is not a valid expression', 'Use only declared @state and @calc names.', 'invalid_expression');
            }
            if (check.type !== spec.of)
                return bad(`must produce a ${spec.of}, not ${check.type}`, `Make ${name} a ${spec.of} expression.`, 'invalid_expression');
            return { ok: true, value: (typeof value === 'number' ? value : expr) };
        }
        case 'number': {
            const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
            if (typeof numeric !== 'number' || !Number.isFinite(numeric))
                return bad('must be a number', `Write ${name}=1.`);
            if (spec.integer === true && !Number.isInteger(numeric))
                return bad('must be a whole number', `Write ${name}=2.`);
            if (spec.min !== undefined && numeric < spec.min)
                return bad(`must be at least ${spec.min}`, `Write ${name}=${spec.min}.`);
            if (spec.max !== undefined && numeric > spec.max)
                return bad(`must be at most ${spec.max}`, `Write ${name}=${spec.max}.`);
            return { ok: true, value: numeric };
        }
        case 'space': {
            const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
            if (typeof numeric !== 'number' || !Number.isInteger(numeric) || numeric < 0 || numeric > MAX_SPACE) {
                return bad(`is a spacing step: a whole number from 0 to ${MAX_SPACE} (units of 4px)`, `Write ${name}=${spec.default ?? 2}.`);
            }
            return { ok: true, value: numeric };
        }
        case 'tone': {
            const word = typeof value === 'string' ? value.toLowerCase() : '';
            const tone = TONES.includes(word) ? word : TONE_SYNONYMS[word];
            if (tone === undefined)
                return bad(`must be one of ${TONES.join(', ')}`, `Write ${name}=success.`);
            return { ok: true, value: tone };
        }
        case 'size': {
            const word = typeof value === 'string' ? value.toLowerCase() : '';
            const size = SIZES.includes(word) ? word : SIZE_SYNONYMS[word];
            if (size === undefined)
                return bad(`must be one of ${SIZES.join(', ')}`, `Write ${name}=md.`);
            return { ok: true, value: size };
        }
        case 'items':
        case 'options': {
            if (!Array.isArray(value))
                return bad('must be a list such as ["first","second"]', `Write ${name}=["first","second"].`);
            if (value.length > LIMITS.maxItems)
                return bad(`has more than ${LIMITS.maxItems} entries`, 'Keep the list shorter.', 'limit_exceeded');
            if (context.descriptor.type === 'diagram' && value.length > MAX_DIAGRAM_NODES) {
                return bad(`has more than ${MAX_DIAGRAM_NODES} boxes`, 'Merge steps, or split the flow into two diagrams.', 'limit_exceeded');
            }
            const entries = [];
            const notes = [];
            for (const entry of value) {
                const read = readText(Array.isArray(entry) ? entry.map(part => String(part ?? '')).join(': ') : entry, context);
                if (read === undefined)
                    return bad('may only contain text or numbers', `Write ${name}=["first","second"].`);
                entries.push(read.value);
                notes.push(...read.notes);
            }
            return { ok: true, value: entries, ...(notes.length > 0 ? { notes } : {}) };
        }
        case 'rows': {
            if (!Array.isArray(value))
                return bad('must be a list of rows such as [["a","1"],["b","2"]]', `Write ${name}=[["a","1"],["b","2"]].`);
            if (value.length > LIMITS.maxTableRows)
                return bad(`has more than ${LIMITS.maxTableRows} rows`, 'Split the table or summarise it.', 'limit_exceeded');
            const rows = [];
            const notes = [];
            for (const row of value) {
                if (!Array.isArray(row))
                    return bad('every row must be a list of cells', `Write ${name}=[["a","1"],["b","2"]].`);
                if (row.length > LIMITS.maxTableColumns)
                    return bad(`a row has more than ${LIMITS.maxTableColumns} cells`, 'Drop a column.', 'limit_exceeded');
                const cells = [];
                for (const cell of row) {
                    const read = readText(cell === null || cell === undefined ? '' : cell, context);
                    cells.push(read === undefined ? '' : read.value);
                    if (read !== undefined)
                        notes.push(...read.notes);
                }
                rows.push(cells);
            }
            return { ok: true, value: rows, ...(notes.length > 0 ? { notes } : {}) };
        }
        case 'series': {
            if (!Array.isArray(value))
                return bad('must be a list of numbers or expressions such as [12, "a * 2"]', `Write ${name}=[1, 2, 3].`);
            if (value.length > LIMITS.maxItems)
                return bad(`has more than ${LIMITS.maxItems} values`, 'Keep the series shorter.', 'limit_exceeded');
            const series = [];
            for (const entry of value) {
                if (typeof entry === 'number' && Number.isFinite(entry)) {
                    series.push(entry);
                    continue;
                }
                const expr = readExpression(entry);
                const type = expr === undefined ? undefined : checkExpr(expr, context.scope).type;
                if (expr === undefined || type !== 'number')
                    return bad(`"${String(entry)}" is not a number or a numeric expression`, `Write ${name}=[1, 2, 3].`, 'invalid_expression');
                series.push(expr);
            }
            return { ok: true, value: series };
        }
        case 'fns': {
            const variable = plotVariable(rawProps.var);
            const entries = Array.isArray(value) ? value : [value];
            if (entries.length === 0 || entries.length > MAX_CURVES) {
                return bad(`takes one to ${MAX_CURVES} expressions`, `Write ${name}="sin(${variable})" or ${name}=["sin(${variable})","cos(${variable})"].`);
            }
            const scope = new Map(context.scope);
            scope.set(variable, 'number');
            const curves = [];
            for (const entry of entries) {
                const expr = readExpression(entry);
                if (expr === undefined)
                    return bad(`"${String(entry)}" is not a readable expression`, `Write ${name}="${variable}^2 - 1".`, 'invalid_expression');
                const check = checkExpr(expr, scope, `nodes.${context.id}.${name}`);
                if (check.type !== 'number') {
                    return bad(check.problems[0]?.message ?? 'must produce a number', `Write each curve in terms of ${variable} and declared names, such as "${variable}^2".`, 'invalid_expression');
                }
                curves.push(expr);
            }
            return { ok: true, value: curves };
        }
        case 'math': {
            const expr = readExpression(value);
            if (expr === undefined)
                return bad('must be a readable expression such as integral(x^2, x, 0, 1)', `Write ${name}="integral(x^2, x, 0, 1)".`, 'invalid_expression');
            const check = checkExpr(expr, context.scope, `nodes.${context.id}.${name}`);
            if (check.type === undefined) {
                return bad(check.problems[0]?.message ?? 'is not a valid expression', 'Use only declared @state and @calc names, constants, and calculus variables.', 'invalid_expression');
            }
            return { ok: true, value: expr };
        }
        case 'edges': {
            const entries = Array.isArray(value) ? value : [value];
            if (entries.length > MAX_DIAGRAM_EDGES)
                return bad(`has more than ${MAX_DIAGRAM_EDGES} arrows`, 'Keep the flow smaller.', 'limit_exceeded');
            const names = diagramNames(rawProps.nodes);
            const edges = [];
            const notes = [];
            const problems = [];
            for (const entry of entries) {
                const read = readEdge(entry, names);
                if (read === undefined) {
                    problems.push({
                        message: `"${typeof entry === 'string' ? entry : JSON.stringify(entry)}" does not join two of its nodes; the arrow was left out`,
                        repair: `Write each arrow as "From -> To" or "From -> To: label", naming nodes by their exact text or by number 1 to ${Array.isArray(rawProps.nodes) ? rawProps.nodes.length : 0}.`,
                    });
                    continue;
                }
                if (read.label === undefined) {
                    edges.push([read.from, read.to]);
                    continue;
                }
                const label = readText(read.label, context);
                edges.push(label === undefined ? [read.from, read.to] : [read.from, read.to, label.value]);
                if (label !== undefined)
                    notes.push(...label.notes);
            }
            return { ok: true, value: edges, ...(notes.length > 0 ? { notes } : {}), ...(problems.length > 0 ? { problems } : {}) };
        }
        case 'variable': {
            const text = typeof value === 'string' ? value.trim() : '';
            if (!PLOT_VARIABLE.test(text) || isMathConstant(text))
                return bad('must be a short name such as x or t, and not pi, e, tau, or inf', `Write ${name}=x.`);
            return { ok: true, value: text };
        }
        case 'bind': {
            const key = typeof value === 'string' ? value.replace(/^\{(.*)\}$/u, '$1').trim() : '';
            const declared = context.stateKinds.get(key);
            if (declared === undefined) {
                return bad(`names "${key}", which is not a declared @state`, `Declare "@state ${key || 'name'} = …" and bind it.`);
            }
            const compatible = declared.kind === spec.state
                || (spec.state === 'select' && declared.kind === 'string' && Array.isArray(rawProps.options));
            if (!compatible) {
                return bad(`binds ${spec.state === 'string' ? 'text' : spec.state} state, but "${key}" is ${declared.kind === 'string' ? 'text' : declared.kind}`, `Bind a ${spec.state === 'string' ? 'text' : spec.state} @state.`);
            }
            return { ok: true, bind: { key, kind: declared.kind } };
        }
        /* v8 ignore next 4 -- the switch covers every PropSpec kind. */
        default: {
            const exhaustive = spec;
            return bad(`unsupported prop spec ${String(exhaustive)}`, 'This is a plugin defect, not a model error.');
        }
    }
}
/** Most curves one plot draws. */
const MAX_CURVES = 4;
/** Most boxes one diagram lays out. */
const MAX_DIAGRAM_NODES = 40;
/** Most arrows one diagram draws. */
const MAX_DIAGRAM_EDGES = 80;
/** A diagram's node texts as written, each mapped to its 1-based number; the first of two equal texts wins. */
function diagramNames(value) {
    const names = new Map();
    if (!Array.isArray(value))
        return names;
    for (const [index, entry] of value.entries()) {
        const text = typeof entry === 'string' || typeof entry === 'number' ? String(entry).trim() : '';
        if (text !== '' && !names.has(text))
            names.set(text, index + 1);
    }
    // Numbers name nodes too, but never shadow a node whose text is that number.
    for (let number = 1; number <= value.length; number += 1) {
        if (!names.has(String(number)))
            names.set(String(number), number);
    }
    return names;
}
/**
 * Read one arrow: `"From -> To"`, `"From -> To: label"`, or `[from, to, label?]`,
 * each end a node's exact text or its 1-based number.
 */
function readEdge(entry, names) {
    const end = (part) => (typeof part === 'string' || typeof part === 'number' ? names.get(String(part).trim()) : undefined);
    if (Array.isArray(entry)) {
        const from = end(entry[0]);
        const to = end(entry[1]);
        if (from === undefined || to === undefined)
            return undefined;
        const label = typeof entry[2] === 'string' || typeof entry[2] === 'number' ? String(entry[2]).trim() : '';
        return label === '' ? { from, to } : { from, to, label };
    }
    if (typeof entry !== 'string')
        return undefined;
    const text = entry.trim();
    // Every arrow sign is a candidate split, so a node text may itself contain ">".
    for (const arrow of text.matchAll(/\s*(?:->|=>|→|>)\s*/gu)) {
        const from = end(text.slice(0, arrow.index));
        if (from === undefined)
            continue;
        const rest = text.slice(arrow.index + arrow[0].length).trim();
        const whole = end(rest);
        if (whole !== undefined)
            return { from, to: whole };
        // A label follows the first colon whose left side names a node.
        for (const colon of rest.matchAll(/[:：]/gu)) {
            const to = end(rest.slice(0, colon.index));
            if (to === undefined)
                continue;
            const label = rest.slice(colon.index + 1).trim();
            return label === '' ? { from, to } : { from, to, label };
        }
    }
    return undefined;
}
/** A name a component may bind for its curves. */
const PLOT_VARIABLE = /^[A-Za-z_]\w{0,11}$/u;
/** The variable a plot's curves use: its valid `var`, or x. */
function plotVariable(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return PLOT_VARIABLE.test(text) && !isMathConstant(text) ? text : 'x';
}
/** Whether a string is an inline raster image the browser can show without a request. */
export function isDataImage(value) {
    return /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/u.test(value);
}
/**
 * Read a text prop into its hoisted form: a string with `{…}` interpolation, or a
 * number or true/false shown as written.
 */
function readText(value, context) {
    if (typeof value === 'number' || typeof value === 'boolean')
        value = String(value);
    if (typeof value !== 'string')
        return undefined;
    const parsed = parseTemplate(value, context.scope);
    const notes = parsed.rejected.map(segment => `${segment} is not an expression over declared names, so it is shown as written`);
    return { value: hoist(parsed.template, context.constants), notes };
}
/**
 * Hoist literal text into the constants table.
 *
 * Constants keep a program's structure fixed while its content varies, and keep
 * the persisted program small when the same label repeats.
 */
function hoist(template, constants) {
    return template.map((segment) => ('expr' in segment
        ? { $expr: segment.expr }
        : { $c: constants.key(segment.text) }));
}
/**
 * Link every node to a container, repairing instead of failing.
 *
 * A node whose parent is missing or cannot hold children moves to the nearest
 * container; a component left at the top level joins the closest card before it;
 * a program with no container at all gets one. Each move is reported.
 */
function connect(nodes, ids, diagnostics) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const descriptorOf = (node) => (node === undefined ? undefined : CATALOG_BY_TYPE.get(node.type));
    /** Whether one node can hold another: a container, and one that holds its type. */
    const holds = (parent, child) => {
        const descriptor = descriptorOf(parent);
        return descriptor?.container === true && (descriptor.holds === undefined || descriptor.holds.includes(child.type));
    };
    /** Whether a node can be a root of its own: a container that holds any component. */
    const standsAlone = (node) => descriptorOf(node)?.container === true && descriptorOf(node)?.holds === undefined;
    for (const node of nodes) {
        if (node.parent === null)
            continue;
        let parent = byId.get(node.parent);
        if (parent === undefined) {
            diagnostics.push({ code: 'orphan_node', path: `nodes.${node.id}`, message: `parent "${node.parent}" names no component; <${node.type}> was placed in the card`, repair: 'Nest it under its container: by indentation in DIL, or in "children" in JSON.' });
            node.parent = null;
            continue;
        }
        while (parent !== undefined && !holds(parent, node)) {
            parent = parent.parent === null ? undefined : byId.get(parent.parent);
        }
        if (parent === undefined) {
            node.parent = null;
            continue;
        }
        if (parent.id !== node.parent) {
            const written = byId.get(node.parent);
            const narrow = descriptorOf(written)?.holds;
            const why = narrow === undefined ? 'cannot hold children' : `holds only ${narrow.join(', ')} lines`;
            diagnostics.push({ code: 'orphan_node', path: `nodes.${node.id}`, message: `<${written?.type ?? '?'}> ${why}; <${node.type}> was placed in <${parent.type}>`, repair: 'Put components inside card, col, row, or grid.' });
            node.parent = parent.id;
        }
        // A loop has no root at all; cutting it here leaves the node at the top level.
        const seen = new Set([node.id]);
        let cursor = parent;
        while (cursor !== undefined) {
            if (seen.has(cursor.id)) {
                diagnostics.push({ code: 'orphan_node', path: `nodes.${node.id}`, message: 'the parent chain loops; the loop was cut', repair: 'Give every component exactly one container.' });
                node.parent = null;
                break;
            }
            seen.add(cursor.id);
            cursor = cursor.parent === null ? undefined : byId.get(cursor.parent);
        }
    }
    // Top-level components that cannot stand alone join the closest container root.
    let stranded = false;
    for (const [index, node] of nodes.entries()) {
        if (node.parent !== null || standsAlone(node))
            continue;
        const before = nodes.slice(0, index).reverse().find(candidate => candidate.parent === null && standsAlone(candidate));
        const after = nodes.slice(index + 1).find(candidate => candidate.parent === null && standsAlone(candidate));
        const home = before ?? after;
        if (home === undefined) {
            stranded = true;
            continue;
        }
        node.parent = home.id;
    }
    if (stranded) {
        const id = freshId(ids, 'card');
        ids.add(id);
        nodes.unshift({ id, type: 'card', parent: null, props: {} });
        for (const node of nodes) {
            if (node.id !== id && node.parent === null && !standsAlone(node))
                node.parent = id;
        }
    }
    const lookup = new Map(nodes.map(node => [node.id, node]));
    for (const node of nodes) {
        if (depthOf(node, lookup) > LIMITS.maxDepth) {
            diagnostics.push(limitDiagnostic('nesting depth', LIMITS.maxDepth, `at ${node.id}`));
            break;
        }
    }
}
/**
 * Give every tab a tabs container and every tabs container only tabs.
 *
 * A run of sibling tabs written without their `tabs` line gets one, and a
 * component written straight inside `tabs` joins the tab before it (or the first
 * tab, when it comes before them all). Each repair is reported. A `tabs` with no
 * tab at all draws its children as one stack.
 */
function arrangeTabs(nodes, ids, diagnostics) {
    if (!nodes.some(node => node.type === 'tab'))
        return;
    const byId = new Map(nodes.map(node => [node.id, node]));
    const childrenOf = (parent) => nodes.filter(node => node.parent === parent);
    const parents = new Set(nodes.filter(node => node.type === 'tab').map(node => node.parent));
    for (const parent of parents) {
        if (parent !== null && byId.get(parent)?.type === 'tabs')
            continue;
        let group;
        for (const child of childrenOf(parent)) {
            if (child.type !== 'tab') {
                group = undefined;
                continue;
            }
            if (group === undefined) {
                const id = freshId(ids, 'tabs');
                ids.add(id);
                group = { id, type: 'tabs', parent, props: {} };
                nodes.splice(nodes.indexOf(child), 0, group);
                byId.set(id, group);
                diagnostics.push({
                    code: 'orphan_node',
                    path: `nodes.${child.id}`,
                    message: '<tab> sits outside tabs; a tabs container was added around it and the tabs beside it',
                    repair: 'Write a tabs line and indent every tab under it.',
                });
            }
            child.parent = group.id;
        }
    }
    for (const group of nodes.filter(node => node.type === 'tabs')) {
        const kids = childrenOf(group.id);
        const first = kids.find(kid => kid.type === 'tab');
        if (first === undefined)
            continue;
        let last;
        for (const kid of kids) {
            if (kid.type === 'tab') {
                last = kid;
                continue;
            }
            const home = last ?? first;
            kid.parent = home.id;
            diagnostics.push({
                code: 'orphan_node',
                path: `nodes.${kid.id}`,
                message: `<${kid.type}> sits directly in tabs, which holds only tab pages; it was placed in the tab ${last === undefined ? 'after' : 'before'} it`,
                repair: 'Indent it under one of the tab lines.',
            });
        }
    }
}
/**
 * Give every series a chart and every chart something to draw.
 *
 * A series written beside its chart instead of under it joins the chart just
 * before it; one with no chart there is left out. A chart keeps either its own
 * `values=` or its series, at most {@link MAX_CHART_SERIES} of them, and is left
 * out when it has neither. A pie with too many slices to read is drawn as bars,
 * and `stacked=` on a shape that cannot stack is dropped. Each repair is reported.
 */
function arrangeSeries(nodes, diagnostics) {
    if (!nodes.some(node => node.type === 'series' || node.type === 'chart'))
        return;
    const byId = new Map(nodes.map(node => [node.id, node]));
    const lastChart = new Map();
    const strays = [];
    for (const node of nodes) {
        if (node.type === 'chart') {
            lastChart.set(node.parent, node);
            continue;
        }
        if (node.type !== 'series') {
            lastChart.set(node.parent, undefined);
            continue;
        }
        if (node.parent !== null && byId.get(node.parent)?.type === 'chart')
            continue;
        const chart = lastChart.get(node.parent);
        if (chart === undefined) {
            strays.push(node);
            continue;
        }
        node.parent = chart.id;
        diagnostics.push({
            code: 'orphan_node',
            path: `nodes.${node.id}`,
            message: '<series> sits beside its chart; it was placed in the chart before it',
            repair: 'Indent series lines under their chart line.',
        });
    }
    for (const stray of strays) {
        diagnostics.push({
            code: 'orphan_node',
            path: `nodes.${stray.id}`,
            message: '<series> belongs inside a chart; it was left out',
            repair: 'Indent series lines under the chart line they belong to.',
        });
    }
    const dropped = new Set(strays);
    for (const chart of nodes.filter(node => node.type === 'chart')) {
        const series = nodes.filter(node => node.parent === chart.id && node.type === 'series');
        for (const extra of series.slice(MAX_CHART_SERIES))
            dropped.add(extra);
        if (series.length > MAX_CHART_SERIES) {
            diagnostics.push(limitDiagnostic('series in one chart', MAX_CHART_SERIES, `${series.length - MAX_CHART_SERIES} later series were left out`));
        }
        const kept = series.slice(0, MAX_CHART_SERIES);
        if (kept.length > 0 && chart.props.values !== undefined) {
            delete chart.props.values;
            diagnostics.push({
                code: 'invalid_literal',
                path: `nodes.${chart.id}.values`,
                message: 'chart has both values= and series lines; values= was ignored',
                repair: 'Give a chart either values=[…] or indented series lines, not both.',
            });
        }
        if (kept.length === 0 && chart.props.values === undefined) {
            dropped.add(chart);
            diagnostics.push({
                code: 'invalid_literal',
                path: `nodes.${chart.id}`,
                message: 'chart has neither values= nor series lines; it was left out',
                repair: 'Write values=[…] on the chart, or indent series "Name" values=[…] lines under it.',
            });
            continue;
        }
        const labels = Array.isArray(chart.props.labels) ? chart.props.labels.length : 0;
        const lists = kept.length > 0 ? kept.map(entry => entry.props.values) : [chart.props.values];
        if (lists.some(entry => !Array.isArray(entry) || entry.length !== labels)) {
            diagnostics.push({
                code: 'invalid_literal',
                path: `nodes.${chart.id}.labels`,
                message: `chart has ${labels} labels but a series with a different number of values; extra values are not drawn and missing ones are blank`,
                repair: 'Give every series exactly one value per label.',
            });
        }
        const shape = chart.props.shape;
        const slices = Array.isArray(lists[0]) ? lists[0].length : 0;
        if (shape === 'pie' && slices > MAX_PIE_SLICES) {
            chart.props.shape = 'bar';
            diagnostics.push({
                code: 'invalid_literal',
                path: `nodes.${chart.id}.shape`,
                message: `a pie of ${slices} slices is hard to read; it was drawn as a bar chart`,
                repair: `Keep a pie to ${MAX_PIE_SLICES} slices, or use shape=bar.`,
            });
        }
        else if (shape === 'pie' && kept.length > 1) {
            diagnostics.push({
                code: 'invalid_literal',
                path: `nodes.${chart.id}.shape`,
                message: 'a pie draws one series; only the first series is shown',
                repair: 'Use one series for a pie, or shape=bar to compare several.',
            });
        }
        if (chart.props.stacked !== undefined && (chart.props.shape === 'line' || chart.props.shape === 'pie')) {
            delete chart.props.stacked;
            diagnostics.push({
                code: 'invalid_literal',
                path: `nodes.${chart.id}.stacked`,
                message: `stacked= applies to bar and area charts; it was ignored on a ${String(chart.props.shape)} chart`,
                repair: 'Use stacked=true with shape=bar or shape=area.',
            });
        }
    }
    if (dropped.size > 0)
        nodes.splice(0, nodes.length, ...nodes.filter(node => !dropped.has(node)));
}
/**
 * Put every player at the bottom of the card that holds it, as the card's control
 * bar, wherever the source wrote it. It joins the outermost card above it and
 * follows every other node, so it is that card's last child; players keep their
 * written order among themselves. The browser applies it again to every program
 * it reads, so a card saved before this rule draws the same way.
 * @param nodes - the flat node list, reordered and re-parented in place.
 */
export function dockPlayers(nodes) {
    const players = nodes.filter(node => node.type === 'player');
    if (players.length === 0)
        return;
    const byId = new Map(nodes.map(node => [node.id, node]));
    for (const player of players) {
        let card;
        let cursor = player.parent === null ? undefined : byId.get(player.parent);
        for (let depth = 0; cursor !== undefined && depth <= LIMITS.maxDepth; depth += 1) {
            if (cursor.type === 'card')
                card = cursor;
            cursor = cursor.parent === null ? undefined : byId.get(cursor.parent);
        }
        if (card !== undefined)
            player.parent = card.id;
    }
    const rest = nodes.filter(node => node.type !== 'player');
    nodes.splice(0, nodes.length, ...rest, ...players);
}
/** Depth of one node from its root. */
function depthOf(node, byId) {
    let depth = 1;
    let cursor = node.parent === null ? undefined : byId.get(node.parent);
    while (cursor !== undefined && depth <= LIMITS.maxDepth + 1) {
        depth += 1;
        cursor = cursor.parent === null ? undefined : byId.get(cursor.parent);
    }
    return depth;
}
/**
 * Build the plain-text stand-in for a program.
 *
 * Every consumer that cannot render the node list gets this instead, and the
 * model reads it to see what a text-only reader sees. It resolves derived values
 * through the same evaluator, so the numbers are the ones the card shows.
 * @param program - compiled program.
 * @returns newline-separated readable text, never empty.
 */
export function buildFallback(program) {
    const values = initialValues(program);
    const lines = fallbackLines(program, values);
    const text = lines.filter(line => line.trim() !== '').join('\n').replaceAll(KEPT_BLANK, '');
    return text === '' ? 'Interactive interface (no readable summary was produced).' : text;
}
/** Stands for an empty line inside a code block, so the empty-line filter keeps it. */
const KEPT_BLANK = '\u0000';
/**
 * State and derived values at their declared initial state.
 * @param program - compiled program.
 * @returns each declared key mapped to its initial or computed value.
 */
export function initialValues(program) {
    const values = new Map();
    for (const declaration of program.state)
        values.set(declaration.key, declaration.init);
    for (const declaration of program.calc) {
        const produced = evalExpr(declaration.expr, key => values.get(key));
        if (typeof produced !== 'symbol')
            values.set(declaration.key, produced);
    }
    return values;
}
/**
 * Render one readable line per meaningful node, in tree order.
 * @param program - compiled program.
 * @param values - current state and derived values, normally from {@link initialValues}.
 * @returns the fallback lines, before empty-line filtering.
 */
export function fallbackLines(program, values) {
    const lines = [];
    const children = new Map();
    for (const node of program.nodes) {
        const list = children.get(node.parent) ?? [];
        list.push(node);
        children.set(node.parent, list);
    }
    walk(null, 0, new Set());
    return lines;
    function walk(parent, indent, seen) {
        for (const node of children.get(parent) ?? []) {
            if (seen.has(node.id))
                continue;
            seen.add(node.id);
            const line = describe(node);
            if (line !== undefined)
                lines.push(...line.split('\n').map(part => `${'  '.repeat(indent)}${part}`));
            if (CATALOG_BY_TYPE.get(node.type)?.container === true)
                walk(node.id, indent + (line === undefined ? 0 : 1), seen);
        }
    }
    function text(node, prop) {
        return renderText(node.props[prop], values, program.constants);
    }
    function describe(node) {
        const unit = typeof node.props.unit === 'string' ? ` ${node.props.unit}` : '';
        const bound = node.bind?.key ?? '';
        switch (node.type) {
            case 'card': return node.props.title === undefined ? undefined : `## ${text(node, 'title')}`;
            case 'tabs': return undefined;
            case 'tab': return `### ${text(node, 'title')}`;
            case 'title': return `# ${text(node, 'text')}`;
            case 'text': return text(node, 'text');
            case 'callout': return `Note: ${text(node, 'text')}`;
            case 'badge': return `[${text(node, 'text')}]`;
            case 'divider': return '----';
            case 'metric': return `${text(node, 'label')}: ${digitsText(node.props.value, node.props.digits)}${unit}`;
            case 'formula': return formulaText(node);
            case 'plot': return plotText(node);
            case 'progress': return `${text(node, 'label')}: ${valueText(node.props.value, values)} / ${node.props.max === undefined ? '100' : valueText(node.props.max, values)}`;
            case 'slider':
            case 'numberInput':
            case 'player': {
                const declaration = program.state.find(entry => entry.key === bound);
                const min = typeof node.props.min === 'number' ? node.props.min : declaration?.min;
                const max = typeof node.props.max === 'number' ? node.props.max : declaration?.max;
                const range = min !== undefined && max !== undefined ? ` (${String(min)}–${String(max)})` : '';
                return `${text(node, 'label')}: ${valueText(['ref', bound], values)}${unit}${range}`;
            }
            case 'textInput':
            case 'select': return `${text(node, 'label')}: ${String(values.get(bound) ?? '')}`;
            case 'checkbox': return `${text(node, 'label')}: ${values.get(bound) === true ? 'yes' : 'no'}`;
            case 'button': return `[${text(node, 'text')}]`;
            case 'link': return `${text(node, 'text')} — ${String(node.props.url ?? '')}`;
            case 'image': return `[image: ${String(node.props.alt ?? '')}]`;
            case 'keys': return list(node.props.items).join(' · ');
            case 'list': return list(node.props.items).map(item => `- ${item}`).join('\n');
            case 'steps': return list(node.props.items).map((step, index) => `${index + 1}. ${step}`).join('\n');
            case 'table': return tableText(node);
            case 'checklist': {
                const items = list(node.props.items);
                const head = node.props.label === undefined ? `Checklist (0/${items.length} done)` : `${text(node, 'label')} (0/${items.length} done)`;
                return [head, ...items.map(item => `- [ ] ${item}`)].join('\n');
            }
            case 'diagram': return diagramText(node);
            case 'code': return codeText(node);
            case 'chart': return chartText(node);
            case 'series': return undefined;
            default: return undefined;
        }
    }
    /** A figure at its significant digits when the program set them. */
    function digitsText(expr, digits) {
        if (typeof digits !== 'number')
            return valueText(expr, values);
        const produced = evalExpr(expr, key => values.get(key));
        return typeof produced === 'number' ? formatSignificant(produced, digits) : valueText(expr, values);
    }
    /** `Area: integral(x^2, x, 0, a) = 0.333333`; an equation keeps no value. */
    function formulaText(node) {
        const label = node.props.label === undefined ? '' : `${text(node, 'label')}: `;
        const digits = typeof node.props.digits === 'number' ? node.props.digits : 6;
        const produced = evalExpr(node.props.expr, key => values.get(key));
        const shown = typeof produced === 'number' ? ` = ${formatSignificant(produced, digits)}` : typeof produced === 'symbol' ? ' = —' : '';
        return `${label}${printExpr(node.props.expr)}${shown}`;
    }
    /** The curves, the range, and the figures a reader would read off the plot. */
    function plotText(node) {
        const curves = Array.isArray(node.props.fn) ? node.props.fn : [];
        const variable = typeof node.props.var === 'string' ? node.props.var : 'x';
        const from = node.props.from === undefined ? '-5' : valueText(node.props.from, values);
        const to = node.props.to === undefined ? '5' : valueText(node.props.to, values);
        const caption = node.props.caption === undefined ? 'Plot' : `Plot "${text(node, 'caption')}"`;
        const parts = [`${caption}: ${curves.map(curve => `y = ${printExpr(curve)}`).join('; ')} for ${variable} from ${from} to ${to}`];
        const first = curves[0];
        const read = (key) => values.get(key);
        if (first !== undefined && node.props.mark !== undefined) {
            const at = evalExpr(node.props.mark, read);
            if (typeof at === 'number') {
                const y = evalExpr(first, read, undefined, new Map([[variable, at]]));
                parts.push(`point at ${variable} = ${formatSignificant(at, 6)}: y = ${typeof y === 'number' ? formatSignificant(y, 6) : '—'}`);
                if (node.props.tangent !== undefined && evalExpr(node.props.tangent, read) === true) {
                    const slope = evalExpr(['deriv', variable, first, at], read);
                    parts.push(`tangent slope ${typeof slope === 'number' ? formatSignificant(slope, 6) : '—'}`);
                }
            }
        }
        if (first !== undefined && node.props.shadeFrom !== undefined && node.props.shadeTo !== undefined) {
            const area = evalExpr(['integral', variable, first, node.props.shadeFrom, node.props.shadeTo], read);
            parts.push(`shaded area from ${valueText(node.props.shadeFrom, values)} to ${valueText(node.props.shadeTo, values)} = ${typeof area === 'number' ? formatSignificant(area, 6) : '—'}`);
        }
        return parts.join('; ');
    }
    function tableText(node) {
        const head = list(node.props.columns).join(' | ');
        const rows = Array.isArray(node.props.rows) ? node.props.rows : [];
        const body = rows.map(row => (Array.isArray(row) ? row.map(cell => renderText(cell, values, program.constants)).join(' | ') : '')).join('\n');
        return [head, body].filter(part => part !== '').join('\n');
    }
    /** Every arrow as "From → To (label)", then any box no arrow touches, then the highlighted box. */
    function diagramText(node) {
        const names = list(node.props.nodes);
        const edges = Array.isArray(node.props.edges) ? node.props.edges : [];
        const touched = new Set();
        const parts = [];
        for (const edge of edges) {
            if (!Array.isArray(edge) || typeof edge[0] !== 'number' || typeof edge[1] !== 'number')
                continue;
            const [from, to] = [edge[0], edge[1]];
            touched.add(from).add(to);
            const label = edge[2] === undefined ? '' : ` (${renderText(edge[2], values, program.constants)})`;
            parts.push(`${names[from - 1] ?? '?'} → ${names[to - 1] ?? '?'}${label}`);
        }
        for (const [index, name] of names.entries()) {
            if (!touched.has(index + 1))
                parts.push(name);
        }
        const caption = node.props.caption === undefined ? 'Diagram' : `Diagram "${text(node, 'caption')}"`;
        const current = node.props.current === undefined ? undefined : evalExpr(node.props.current, key => values.get(key));
        const highlighted = typeof current === 'number' ? names[Math.floor(current) - 1] : undefined;
        return `${caption}: ${parts.join('; ')}${highlighted === undefined ? '' : `; current: ${highlighted}`}`;
    }
    /** The block as a Markdown fence longer than any backtick run inside it, then the highlighted line. */
    function codeText(node) {
        const body = typeof node.props.text === 'string'
            ? node.props.text
            : node.props.value === undefined ? '' : valueText(node.props.value, values);
        const lang = typeof node.props.lang === 'string' && node.props.lang !== 'text' ? node.props.lang : '';
        const longest = Math.max(0, ...[...body.matchAll(/`+/gu)].map(run => run[0].length));
        const fence = '`'.repeat(Math.max(3, longest + 1));
        const head = node.props.caption === undefined ? [] : [`${text(node, 'caption')}:`];
        const current = node.props.current === undefined ? undefined : evalExpr(node.props.current, key => values.get(key));
        const lineCount = body.split('\n').length;
        const mark = typeof current === 'number' && current >= 1 && current < lineCount + 1 ? [`(line ${Math.floor(current)} highlighted)`] : [];
        const kept = body.split('\n').map(line => (line.trim() === '' ? KEPT_BLANK : line)).join('\n');
        return [...head, `${fence}${lang}`, kept, fence, ...mark].join('\n');
    }
    /**
     * One series: `Q1: 12 · Q2: 15`, a pie's slices with their shares, or several
     * series as a small table of one row per label.
     */
    function chartText(node) {
        const labels = list(node.props.labels);
        const unit = typeof node.props.unit === 'string' && node.props.unit !== '' ? ` ${node.props.unit}` : '';
        const head = node.props.caption === undefined ? [] : [text(node, 'caption')];
        const series = (children.get(node.id) ?? []).filter(child => child.type === 'series');
        const lists = series.length > 0
            ? series.map(child => (Array.isArray(child.props.values) ? child.props.values : []))
            : [Array.isArray(node.props.values) ? node.props.values : []];
        if (node.props.shape === 'pie') {
            const numbers = (lists[0] ?? []).map(entry => evalExpr(entry, key => values.get(key)));
            const total = numbers.reduce((sum, entry) => sum + (typeof entry === 'number' && entry > 0 ? entry : 0), 0);
            const slices = labels.map((label, index) => {
                const entry = numbers[index];
                const share = typeof entry === 'number' && total > 0 ? ` (${formatSignificant(Math.max(entry, 0) / total * 100, 3)}%)` : '';
                return `${label}: ${valueText(lists[0]?.[index], values)}${unit}${share}`;
            });
            return [...head, slices.join(' · ')].join('\n');
        }
        if (series.length <= 1) {
            const only = lists[0] ?? [];
            return [...head, labels.map((label, index) => `${label}: ${valueText(only[index], values)}${unit}`).join(' · ')].join('\n');
        }
        const names = series.map((child, index) => (child.props.name === undefined ? `Series ${index + 1}` : text(child, 'name')));
        const rows = labels.map((label, index) => `${label} | ${lists.map(entry => (index < entry.length ? `${valueText(entry[index], values)}${unit}` : '—')).join(' | ')}`);
        return [...head, `| ${names.join(' | ')}`, ...rows].join('\n');
    }
    function list(value) {
        if (!Array.isArray(value))
            return [];
        return value.map(entry => renderText(entry, values, program.constants));
    }
}
/**
 * Remove a Markdown code fence around the whole source.
 *
 * Models often wrap the program in ```dil … ``` even inside a JSON argument; the
 * fence carries no meaning here.
 */
function stripFences(source, partial) {
    const trimmed = source.trim();
    if (!trimmed.startsWith('```'))
        return source;
    const lines = trimmed.split(/\r?\n/u).slice(1);
    if (lines.at(-1)?.trim().startsWith('```') === true)
        lines.pop();
    const body = lines.join('\n');
    return partial && !/\n$/u.test(source) ? body : `${body}\n`;
}
/**
 * Parse the JSON envelope.
 *
 * Recovery only trims text around one complete object, such as a trailing
 * sentence, and tries a bounded number of cut points so a large malformed
 * source cannot stall the host.
 */
function parseJsonEnvelope(source, diagnostics, partial) {
    const trimmed = source.trim();
    const direct = tryParse(trimmed);
    if (direct !== undefined)
        return direct;
    if (partial)
        return undefined;
    const start = trimmed.indexOf('{');
    let end = trimmed.length;
    for (let attempt = 0; attempt < LIMITS.maxJsonRecoveryAttempts && start !== -1; attempt += 1) {
        end = trimmed.lastIndexOf('}', end - 1);
        if (end <= start)
            break;
        const candidate = tryParse(trimmed.slice(start, end + 1));
        if (candidate !== undefined) {
            diagnostics.push({
                code: 'unterminated_line',
                message: 'text around the JSON object was ignored',
                repair: 'Pass only the program in "source", with nothing before or after it.',
            });
            return candidate;
        }
    }
    diagnostics.push({
        code: 'unparseable',
        message: 'the source is not valid JSON',
        repair: 'Write the program in DIL instead (one component per line), or send one complete JSON object.',
    });
    return undefined;
}
/** Parse JSON text into an object, returning undefined instead of throwing. */
function tryParse(text) {
    try {
        const value = JSON.parse(text);
        if (typeof value !== 'object' || value === null || Array.isArray(value))
            return undefined;
        const record = value;
        // A bare component tree is accepted as the envelope's only node, with any
        // declarations written beside it. A diagram's own `nodes` are texts, never components.
        const components = Array.isArray(record.nodes) && record.nodes.some(entry => typeof entry === 'object' && entry !== null);
        if (typeof record.type === 'string' && !components) {
            const { states, calcs, state, calc, ...node } = record;
            return { states: states ?? state, calcs: calcs ?? calc, nodes: [node] };
        }
        return record;
    }
    catch {
        return undefined;
    }
}
/** Read an array-or-empty without casting. */
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
/** Read an object-or-empty without casting. */
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}
/** One `invalid_literal` diagnostic. */
function invalid(path, message, repair) {
    return { code: 'invalid_literal', path, message, repair };
}
/** One `limit_exceeded` diagnostic. */
function limitDiagnostic(what, limit, where) {
    return {
        code: 'limit_exceeded',
        message: `${what} exceed the limit of ${limit} (${where})`,
        repair: `Reduce the ${what}.`,
    };
}
