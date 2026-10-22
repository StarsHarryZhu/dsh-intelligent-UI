/**
 * Syntax colouring for the `code` component.
 *
 * A small scanner per language family, not a grammar engine: it tells keywords,
 * strings, comments, numbers, constants, and called names apart, which is what a
 * reader needs to read a short listing, and it never fails — text it does not
 * recognise stays plain. The whole text is scanned once and then cut into lines,
 * so a block comment, a triple-quoted string, or a template literal that spans
 * lines keeps its colour on every line.
 *
 * The output is lossless: the tokens of each line joined are exactly that line,
 * so colouring can never change what the reader copies or sees.
 * @module dsh-intelligent-ui/lang/highlight
 */
/** Languages the `code` component colours; `text` is shown as written. */
export const CODE_LANGUAGES = ['text', 'python', 'js', 'ts', 'json', 'bash', 'c', 'cpp', 'java', 'go', 'rust', 'sql', 'html', 'css', 'yaml'];
/** Common names a model writes for a language, mapped to the catalog's name. */
export const CODE_LANGUAGE_ALIASES = {
    plain: 'text', txt: 'text', plaintext: 'text', output: 'text', console: 'text',
    py: 'python', python3: 'python',
    javascript: 'js', jsx: 'js', mjs: 'js', node: 'js',
    typescript: 'ts', tsx: 'ts',
    jsonc: 'json',
    sh: 'bash', shell: 'bash', zsh: 'bash', shellscript: 'bash',
    h: 'c', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    golang: 'go', rs: 'rust',
    xml: 'html', svg: 'html', htm: 'html',
    yml: 'yaml',
    mysql: 'sql', postgres: 'sql', postgresql: 'sql', sqlite: 'sql',
};
/** Split a space-separated word list into a set. */
function words(list) {
    return new Set(list.split(/\s+/u).filter(word => word !== ''));
}
const C_KEYWORDS = 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool _Bool';
const JS_KEYWORDS = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch throw try typeof var void while with yield async await static get set from as';
/** Base fields every generic language shares. */
const BASE = {
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    quotes: '"\'',
    multilineQuotes: '',
    tripleQuotes: false,
    caseInsensitive: false,
    variables: false,
    hashNeedsSpace: false,
    charLiterals: false,
    macros: false,
};
const SPECS = {
    python: {
        ...BASE,
        lineComments: ['#'],
        blockComments: [],
        tripleQuotes: true,
        stringPrefix: /^(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])$/u,
        keywords: words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'),
        constants: words('True False None self cls'),
        directive: '@',
    },
    js: {
        ...BASE,
        quotes: '"\'`',
        multilineQuotes: '`',
        keywords: words(JS_KEYWORDS),
        constants: words('true false null undefined NaN Infinity this'),
    },
    ts: {
        ...BASE,
        quotes: '"\'`',
        multilineQuotes: '`',
        keywords: words(`${JS_KEYWORDS} interface type enum implements declare readonly public private protected abstract namespace module keyof infer is satisfies override string number boolean any unknown never object symbol bigint`),
        constants: words('true false null undefined NaN Infinity this'),
    },
    c: {
        ...BASE,
        keywords: words(C_KEYWORDS),
        constants: words('NULL true false'),
        directive: '#',
    },
    cpp: {
        ...BASE,
        keywords: words(`${C_KEYWORDS} class namespace template typename public private protected virtual override final new delete operator using try catch throw friend explicit constexpr decltype noexcept static_cast dynamic_cast reinterpret_cast const_cast mutable std string vector`),
        constants: words('nullptr true false this NULL'),
        directive: '#',
    },
    java: {
        ...BASE,
        keywords: words('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized throw throws transient try void volatile while var record yield sealed permits String'),
        constants: words('true false null this'),
        directive: '@',
    },
    go: {
        ...BASE,
        quotes: '"\'`',
        multilineQuotes: '`',
        keywords: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var bool byte error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any'),
        constants: words('true false nil iota'),
    },
    rust: {
        ...BASE,
        quotes: '"\'',
        multilineQuotes: '"',
        charLiterals: true,
        macros: true,
        keywords: words('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return static struct super trait type unsafe use where while i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box'),
        constants: words('true false None Some Ok Err self Self'),
        directive: '#',
    },
    sql: {
        ...BASE,
        lineComments: ['--'],
        quotes: '\'"',
        caseInsensitive: true,
        keywords: words('select from where and or not insert into values update set delete create table drop alter add primary key foreign references index view join inner left right full outer cross on as group by order having limit offset distinct union all case when then else end is like in between exists asc desc count sum avg min max default unique check constraint with returning if begin commit rollback transaction'),
        constants: words('true false null'),
    },
    bash: {
        ...BASE,
        lineComments: ['#'],
        blockComments: [],
        multilineQuotes: '"\'',
        variables: true,
        hashNeedsSpace: true,
        keywords: words('if then else elif fi for while until do done case esac function in select return local export readonly declare unset shift break continue exit source alias'),
        constants: words('true false'),
    },
    json: {
        ...BASE,
        quotes: '"',
        keywords: words(''),
        constants: words('true false null'),
    },
};
/** Identifier characters; CSS and HTML names also take `-`. */
const WORD = /[A-Za-z_$À-￿][\w$À-￿]*/uy;
const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[A-Za-z%]*/uy;
/**
 * Colour a text.
 * @param code - the text, lines separated by `\n`.
 * @param lang - a name from {@link CODE_LANGUAGES}; anything else is plain text.
 * @returns one token list per line; each list joined is that line exactly.
 */
export function highlight(code, lang) {
    let tokens;
    try {
        tokens = scanLanguage(code, lang);
    }
    catch {
        tokens = [{ kind: 'plain', text: code }];
    }
    // A scanner defect must never change the text: fall back to plain when it would.
    if (tokens.map(token => token.text).join('') !== code)
        tokens = [{ kind: 'plain', text: code }];
    return splitLines(tokens);
}
/** Pick the scanner for a language. */
function scanLanguage(code, lang) {
    if (lang === 'html')
        return scanHtml(code);
    if (lang === 'css')
        return scanCss(code);
    if (lang === 'yaml')
        return scanYaml(code);
    const spec = SPECS[lang];
    if (spec === undefined)
        return [{ kind: 'plain', text: code }];
    return scanGeneric(code, spec, lang === 'json');
}
/** Cut a token stream at newlines, which belong to no line. */
function splitLines(tokens) {
    const lines = [[]];
    for (const token of tokens) {
        const parts = token.text.split('\n');
        for (const [index, part] of parts.entries()) {
            if (index > 0)
                lines.push([]);
            if (part !== '')
                lines.at(-1).push({ kind: token.kind, text: part });
        }
    }
    return lines;
}
/** A token list that merges neighbouring plain text. */
class Out {
    tokens = [];
    push(kind, text) {
        if (text === '')
            return;
        const last = this.tokens.at(-1);
        if (last !== undefined && last.kind === kind && kind === 'plain')
            last.text += text;
        else
            this.tokens.push({ kind, text });
    }
}
/** Index just past a quoted run starting at `start`, honouring backslash escapes. */
function quoteEnd(code, start, quote, multiline, escapes = true) {
    let index = start + quote.length;
    while (index < code.length) {
        const character = code[index];
        if (escapes && character === '\\') {
            index += 2;
            continue;
        }
        if (code.startsWith(quote, index))
            return index + quote.length;
        if (character === '\n' && !multiline)
            return index;
        index += 1;
    }
    return code.length;
}
/** Whether only spaces and tabs precede `index` on its line. */
function atLineStart(code, index) {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
        const character = code[cursor];
        if (character === '\n')
            return true;
        if (character !== ' ' && character !== '\t')
            return false;
    }
    return true;
}
/** Read a word at `index` with the sticky identifier pattern. */
function wordAt(code, index) {
    WORD.lastIndex = index;
    return WORD.exec(code)?.[0];
}
/** Read a number at `index`, unless it is the tail of a word. */
function numberAt(code, index) {
    const before = code[index - 1];
    if (before !== undefined && /[\w$]/u.test(before))
        return undefined;
    NUMBER.lastIndex = index;
    return NUMBER.exec(code)?.[0];
}
/** The C-family, Python, shell, SQL, and JSON scanner. */
function scanGeneric(code, spec, json) {
    const out = new Out();
    let index = 0;
    scan: while (index < code.length) {
        const character = code[index];
        for (const marker of spec.lineComments) {
            if (!code.startsWith(marker, index))
                continue;
            if (marker === '#' && spec.hashNeedsSpace && index > 0 && !/[\s;|&(]/u.test(code[index - 1]))
                continue;
            if (marker === '#' && spec.directive === '#' && atLineStart(code, index))
                continue;
            const end = code.indexOf('\n', index);
            const stop = end === -1 ? code.length : end;
            out.push('comment', code.slice(index, stop));
            index = stop;
            continue scan;
        }
        for (const [open, close] of spec.blockComments) {
            if (!code.startsWith(open, index))
                continue;
            const end = code.indexOf(close, index + open.length);
            const stop = end === -1 ? code.length : end + close.length;
            out.push('comment', code.slice(index, stop));
            index = stop;
            continue scan;
        }
        if (spec.tripleQuotes && (code.startsWith('"""', index) || code.startsWith("'''", index))) {
            const stop = quoteEnd(code, index, code.slice(index, index + 3), true);
            out.push('string', code.slice(index, stop));
            index = stop;
            continue;
        }
        if (spec.quotes.includes(character)) {
            if (spec.charLiterals && character === '\'') {
                const literal = /'(?:\\.[^']{0,8}|[^\\'\n])'/uy;
                literal.lastIndex = index;
                const match = literal.exec(code);
                if (match === null) {
                    out.push('plain', character);
                    index += 1;
                    continue;
                }
                out.push('string', match[0]);
                index += match[0].length;
                continue;
            }
            const stop = quoteEnd(code, index, character, spec.multilineQuotes.includes(character));
            const text = code.slice(index, stop);
            // A JSON key is a string followed by a colon.
            const isKey = json && /^\s*:/u.test(code.slice(stop, stop + 32));
            out.push(isKey ? 'keyword' : 'string', text);
            index = stop;
            continue;
        }
        if (spec.directive !== undefined && character === spec.directive && (spec.directive === '@' || atLineStart(code, index))) {
            const name = wordAt(code, index + 1);
            if (name !== undefined) {
                out.push(spec.directive === '@' ? 'function' : 'keyword', `${character}${name}`);
                index += 1 + name.length;
                continue;
            }
        }
        if (spec.variables && character === '$') {
            const braced = code[index + 1] === '{' ? code.indexOf('}', index + 2) : -1;
            if (braced !== -1 && !code.slice(index, braced).includes('\n')) {
                out.push('constant', code.slice(index, braced + 1));
                index = braced + 1;
                continue;
            }
            const name = wordAt(code, index + 1) ?? (/[\d#?@*!$-]/u.test(code[index + 1] ?? '') ? code[index + 1] : undefined);
            if (name !== undefined) {
                out.push('constant', `$${name}`);
                index += 1 + name.length;
                continue;
            }
            // `$(` and a lone `$` are punctuation in a shell, never the start of a name.
            out.push('plain', character);
            index += 1;
            continue;
        }
        const number = /[\d.]/u.test(character) ? numberAt(code, index) : undefined;
        if (number !== undefined && number !== '.' && /\d/u.test(number)) {
            out.push('number', number);
            index += number.length;
            continue;
        }
        const word = wordAt(code, index);
        if (word !== undefined) {
            const after = index + word.length;
            if (spec.stringPrefix?.test(word) === true && spec.quotes.includes(code[after] ?? '')) {
                const quote = spec.tripleQuotes && (code.startsWith('"""', after) || code.startsWith("'''", after)) ? code.slice(after, after + 3) : code[after];
                const stop = quoteEnd(code, after, quote, quote.length === 3 || spec.multilineQuotes.includes(quote), !/[rR]/u.test(word));
                out.push('string', code.slice(index, stop));
                index = stop;
                continue;
            }
            const key = spec.caseInsensitive ? word.toLowerCase() : word;
            if (spec.keywords.has(key))
                out.push('keyword', word);
            else if (spec.constants.has(key))
                out.push('constant', word);
            else if (code[after] === '(' || (spec.macros && code[after] === '!' && /[([{]/u.test(code[after + 1] ?? '')))
                out.push('function', word);
            else
                out.push('plain', word);
            index = after;
            continue;
        }
        out.push('plain', character);
        index += 1;
    }
    return out.tokens;
}
/** Markup: comments, tags, attribute names and values, and entities. */
function scanHtml(code) {
    const out = new Out();
    let index = 0;
    while (index < code.length) {
        if (code.startsWith('<!--', index)) {
            const end = code.indexOf('-->', index + 4);
            const stop = end === -1 ? code.length : end + 3;
            out.push('comment', code.slice(index, stop));
            index = stop;
            continue;
        }
        const character = code[index];
        const tag = character === '<' ? /<\/?[!?]?([A-Za-z][\w:.-]*)/uy : undefined;
        if (tag !== undefined) {
            tag.lastIndex = index;
            const match = tag.exec(code);
            if (match !== null) {
                const name = match[1];
                out.push('plain', match[0].slice(0, match[0].length - name.length));
                out.push('keyword', name);
                index += match[0].length;
                index = scanAttributes(code, index, out);
                continue;
            }
        }
        if (character === '&') {
            const entity = /&(?:#\d+|#x[\da-fA-F]+|[A-Za-z]\w*);/uy;
            entity.lastIndex = index;
            const match = entity.exec(code);
            if (match !== null) {
                out.push('constant', match[0]);
                index += match[0].length;
                continue;
            }
        }
        out.push('plain', character);
        index += 1;
    }
    return out.tokens;
}
/** The inside of one tag, up to and including its `>`. */
function scanAttributes(code, start, out) {
    let index = start;
    while (index < code.length) {
        const character = code[index];
        if (character === '>') {
            out.push('plain', character);
            return index + 1;
        }
        if (character === '"' || character === '\'') {
            const stop = quoteEnd(code, index, character, true, false);
            out.push('string', code.slice(index, stop));
            index = stop;
            continue;
        }
        const name = /[^\s=>/"']+/uy;
        name.lastIndex = index;
        const match = name.exec(code);
        if (match !== null) {
            out.push(code[index - 1] === '=' ? 'string' : 'function', match[0]);
            index += match[0].length;
            continue;
        }
        out.push('plain', character);
        index += 1;
    }
    return index;
}
/** Stylesheets: comments, strings, at-rules, properties, numbers with units, colours, and functions. */
function scanCss(code) {
    const out = new Out();
    let index = 0;
    let depth = 0;
    while (index < code.length) {
        const character = code[index];
        if (code.startsWith('/*', index)) {
            const end = code.indexOf('*/', index + 2);
            const stop = end === -1 ? code.length : end + 2;
            out.push('comment', code.slice(index, stop));
            index = stop;
            continue;
        }
        if (character === '"' || character === '\'') {
            const stop = quoteEnd(code, index, character, false);
            out.push('string', code.slice(index, stop));
            index = stop;
            continue;
        }
        if (character === '{' || character === '}')
            depth = Math.max(0, depth + (character === '{' ? 1 : -1));
        if (character === '@' || (character === '!' && code.startsWith('!important', index))) {
            const name = /[@!][\w-]+/uy;
            name.lastIndex = index;
            const match = name.exec(code);
            if (match !== null) {
                out.push('keyword', match[0]);
                index += match[0].length;
                continue;
            }
        }
        if (character === '#' && depth > 0) {
            const colour = /#[\da-fA-F]{3,8}\b/uy;
            colour.lastIndex = index;
            const match = colour.exec(code);
            if (match !== null) {
                out.push('constant', match[0]);
                index += match[0].length;
                continue;
            }
        }
        const number = /[\d.]/u.test(character) ? numberAt(code, index) : undefined;
        if (number !== undefined && /\d/u.test(number)) {
            out.push('number', number);
            index += number.length;
            continue;
        }
        const ident = /-{0,2}[A-Za-z_][\w-]*/uy;
        ident.lastIndex = index;
        const match = /[A-Za-z_-]/u.test(character) ? ident.exec(code) : null;
        if (match !== null) {
            const after = index + match[0].length;
            const rest = code.slice(after, after + 32);
            if (code[after] === '(')
                out.push('function', match[0]);
            else if (depth > 0 && /^\s*:/u.test(rest))
                out.push('keyword', match[0]);
            else
                out.push('plain', match[0]);
            index = after;
            continue;
        }
        out.push('plain', character);
        index += 1;
    }
    return out.tokens;
}
/** YAML, line by line: keys, comments, quoted strings, and scalar constants and numbers. */
function scanYaml(code) {
    const out = new Out();
    const lines = code.split('\n');
    for (const [number, line] of lines.entries()) {
        if (number > 0)
            out.push('plain', '\n');
        const lead = /^(\s*(?:-\s+)*)/u.exec(line)?.[1] ?? '';
        out.push('plain', lead);
        let rest = line.slice(lead.length);
        const key = /^("[^"\n]*"|'[^'\n]*'|[^\s#'"][^:#\n]*?)(\s*:)(?=\s|$)/u.exec(rest);
        if (key !== null) {
            out.push('keyword', key[1]);
            out.push('plain', key[2]);
            rest = rest.slice(key[0].length);
        }
        scanYamlValue(rest, out);
    }
    return out.tokens;
}
/** The value part of one YAML line. */
function scanYamlValue(text, out) {
    let index = 0;
    while (index < text.length) {
        const character = text[index];
        if (character === '#' && (index === 0 || /\s/u.test(text[index - 1]))) {
            out.push('comment', text.slice(index));
            return;
        }
        if (character === '"' || character === '\'') {
            const stop = quoteEnd(text, index, character, false, character === '"');
            out.push('string', text.slice(index, stop));
            index = stop;
            continue;
        }
        if (/\s/u.test(character) || character === '[' || character === ']' || character === '{' || character === '}' || character === ',') {
            out.push('plain', character);
            index += 1;
            continue;
        }
        const scalar = /[^\s,[\]{}#]+/uy;
        scalar.lastIndex = index;
        const word = scalar.exec(text)?.[0] ?? character;
        if (/^(?:true|false|null|yes|no|on|off|~)$/iu.test(word))
            out.push('constant', word);
        else if (/^[-+]?(?:\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?|\.inf|\.nan)$/iu.test(word))
            out.push('number', word);
        else
            out.push('plain', word);
        index += word.length;
    }
}
