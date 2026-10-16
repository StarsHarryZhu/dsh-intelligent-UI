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
import { CATALOG_BY_TYPE, CATALOG_VERSION, catalogHash, SIZES, TONES } from "./catalog.js";
import { parseDil } from "./dil.js";
import { checkExpr, evalExpr } from "./expr.js";
import { PROGRAM_VERSION } from "./identity.js";
import { asNode, parseInfix } from "./infix.js";
import { LIMITS, MAX_SPACE } from "./limits.js";
import { parseTemplate, renderText, valueText } from "./text.js";
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
    const program = {
        v: PROGRAM_VERSION,
        catalogVersion: CATALOG_VERSION,
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
/** Accepted spellings of a state kind. */
const STATE_KINDS = {
    number: 'number', string: 'string', text: 'string', boolean: 'boolean', select: 'select',
};
/** Read one state declaration, inferring its kind from the initial value when none is given. */
function readState(raw, diagnostics) {
    const key = typeof raw.key === 'string' ? raw.key : '';
    if (!/^[A-Za-z_$][\w$]*$/u.test(key)) {
        diagnostics.push(invalid('state', 'a state declaration needs a name of letters, digits, or underscores', 'Write "@state seats = 8".'));
        return undefined;
    }
    const options = readOptionList(raw.options);
    const declared = typeof raw.kind === 'string' ? STATE_KINDS[raw.kind] : undefined;
    let init = raw.init;
    const kind = declared ?? (options !== undefined ? 'select'
        : typeof init === 'number' ? 'number'
            : typeof init === 'boolean' ? 'boolean'
                : 'string');
    if (kind === 'number' && typeof init === 'string' && init.trim() !== '' && Number.isFinite(Number(init)))
        init = Number(init);
    if (kind === 'boolean' && (init === 'true' || init === 'false'))
        init = init === 'true';
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
            repair: 'Use + - * / % ( ), comparisons, && || ! ?:, and min max abs floor ceil round(x, digits) over declared names.',
        });
        return undefined;
    }
    const check = checkExpr(expr, scope, `calc.${key}`);
    if (check.type === undefined) {
        diagnostics.push(...check.problems.map(problem => ({
            code: 'invalid_expression',
            path: problem.path,
            message: problem.message,
            repair: 'A calc may read only @state keys and calcs declared above it.',
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
            const text = typeof value === 'number' ? String(value) : value;
            if (typeof text !== 'string')
                return bad('must be text', `Write ${name}="…".`);
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
/** Whether a string is an inline raster image the browser can show without a request. */
export function isDataImage(value) {
    return /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/u.test(value);
}
/**
 * Read a text prop into its hoisted form.
 *
 * Accepted forms: a string with `{…}` interpolation, a number, and the older
 * template objects (`{"$text":[{"text":"…"},{"$expr":[…]}]}`).
 */
function readText(value, context) {
    if (typeof value === 'number' || typeof value === 'boolean')
        value = String(value);
    if (typeof value === 'string') {
        const parsed = parseTemplate(value, context.scope);
        const notes = parsed.rejected.map(segment => `${segment} is not an expression over declared names, so it is shown as written`);
        return { value: hoist(parsed.template, context.constants), notes };
    }
    const legacy = readLegacyTemplate(value);
    if (legacy === undefined)
        return undefined;
    for (const segment of legacy) {
        if ('expr' in segment && checkExpr(segment.expr, context.scope).type === undefined)
            return undefined;
    }
    return { value: hoist(legacy, context.constants), notes: [] };
}
/** Read the older template object forms. */
function readLegacyTemplate(value) {
    const record = asRecord(value);
    const parts = Array.isArray(value) ? value : Array.isArray(record.$text) ? record.$text : undefined;
    if (parts === undefined) {
        if (typeof record.text === 'string')
            return [{ text: record.text }];
        if (Array.isArray(record.$expr))
            return [{ expr: record.$expr }];
        return undefined;
    }
    const segments = [];
    for (const part of parts) {
        if (typeof part === 'string')
            segments.push({ text: part });
        else if (typeof asRecord(part).text === 'string')
            segments.push({ text: asRecord(part).text });
        else if (Array.isArray(asRecord(part).$expr))
            segments.push({ expr: asRecord(part).$expr });
        else
            return undefined;
    }
    return segments.length === 0 ? undefined : segments;
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
    const isContainer = (node) => node !== undefined && CATALOG_BY_TYPE.get(node.type)?.container === true;
    for (const node of nodes) {
        if (node.parent === null)
            continue;
        let parent = byId.get(node.parent);
        if (parent === undefined) {
            diagnostics.push({ code: 'orphan_node', path: `nodes.${node.id}`, message: `in=${node.parent} names no component; <${node.type}> was placed in the card`, repair: 'Nest it by indentation under its container.' });
            node.parent = null;
            continue;
        }
        while (parent !== undefined && !isContainer(parent)) {
            parent = parent.parent === null ? undefined : byId.get(parent.parent);
        }
        if (parent === undefined) {
            node.parent = null;
            continue;
        }
        if (parent.id !== node.parent) {
            diagnostics.push({ code: 'orphan_node', path: `nodes.${node.id}`, message: `<${byId.get(node.parent)?.type ?? '?'}> cannot hold children; <${node.type}> was placed in <${parent.type}>`, repair: 'Put components inside card, col, row, or grid.' });
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
        if (node.parent !== null || isContainer(node))
            continue;
        const before = nodes.slice(0, index).reverse().find(candidate => candidate.parent === null && isContainer(candidate));
        const after = nodes.slice(index + 1).find(candidate => candidate.parent === null && isContainer(candidate));
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
            if (node.id !== id && node.parent === null && !isContainer(node))
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
    const text = lines.filter(line => line.trim() !== '').join('\n');
    return text === '' ? 'Interactive interface (no readable summary was produced).' : text;
}
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
            case 'title': return `# ${text(node, 'text')}`;
            case 'text': return text(node, 'text');
            case 'callout': return `Note: ${text(node, 'text')}`;
            case 'badge': return `[${text(node, 'text')}]`;
            case 'divider': return '----';
            case 'metric': return `${text(node, 'label')}: ${valueText(node.props.value, values)}${unit}`;
            case 'progress': return `${text(node, 'label')}: ${valueText(node.props.value, values)} / ${node.props.max === undefined ? '100' : valueText(node.props.max, values)}`;
            case 'slider':
            case 'numberInput': {
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
            case 'chart': return chartText(node);
            default: return undefined;
        }
    }
    function tableText(node) {
        const head = list(node.props.columns).join(' | ');
        const rows = Array.isArray(node.props.rows) ? node.props.rows : [];
        const body = rows.map(row => (Array.isArray(row) ? row.map(cell => renderText(cell, values, program.constants)).join(' | ') : '')).join('\n');
        return [head, body].filter(part => part !== '').join('\n');
    }
    function chartText(node) {
        const labels = list(node.props.labels);
        const series = Array.isArray(node.props.values) ? node.props.values : [];
        return labels.map((label, index) => `${label}: ${valueText(series[index], values)}`).join(' · ');
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
        // declarations written beside it.
        if (typeof record.type === 'string' && record.nodes === undefined) {
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
