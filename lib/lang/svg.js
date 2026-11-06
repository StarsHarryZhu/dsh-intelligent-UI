/**
 * A drawing written as SVG, read into a checked tree.
 *
 * The model's SVG never reaches the page as markup. It is parsed here, without a
 * DOM, into a JSON tree of allowlisted elements and attributes; what is not on the
 * lists is dropped and reported. Nothing in a tree can run or load anything: there
 * are no scripts, event handlers, styles, links, images, or embedded documents,
 * and every reference is to an id inside the same drawing. The browser checks a
 * persisted tree again with {@link checkDrawing}, because a stored program is not
 * trusted, and draws it through a fixed table of elements.
 *
 * The parser is a tolerant, linear scan of the XML that SVG uses. A tag still open
 * at the end of the text closes there, so a drawing appears as it streams.
 * @module dsh-intelligent-ui/lang/svg
 */
import { LIMITS } from "./limits.js";
/** The coordinates a drawing has when it names none. */
const DEFAULT_VIEW_BOX = [0, 0, 320, 200];
/** Elements a drawing may contain. */
const ELEMENTS = [
    'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc', 'defs',
    'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'marker', 'symbol', 'use',
];
/** Canonical element names by their lower-case spelling. */
const ELEMENT_BY_LOWER = new Map(ELEMENTS.map(name => [name.toLowerCase(), name]));
/** Elements whose text is drawn or names the drawing. */
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc']);
/** A paint that names black follows the host's text colour, so it stays visible on a dark theme. */
const BLACK = /^(?:black|#000(?:000)?|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))$/iu;
/** An id a drawing may give an element; a shape names one with `ref=`. */
export const SVG_ID = /^[A-Za-z_][\w-]{0,63}$/u;
const ID = SVG_ID;
const LENGTH = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:%|px|em|ex|rem|pt|pc|cm|mm|in)?$/iu;
const NUMBERS = /^[-+0-9.,eE\s%]*$/u;
const WORD = /^[A-Za-z0-9.+-]{1,32}$/u;
const WORDS = /^[A-Za-z0-9 ]{1,64}$/u;
const TRANSFORM = /^[A-Za-z0-9.,()\s+-]*$/u;
const COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([-+0-9.,%\s/a-z]*\)|[a-z]{3,24})$/iu;
const LOCAL_URL = /^url\(\s*["']?#([A-Za-z_][\w-]{0,63})["']?\s*\)$/u;
/** The characters SVG path data is made of. */
export const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/u;
const matching = (pattern) => value => (pattern.test(value) ? value.trim() : undefined);
/** `url(#id)` in its one spelling, which is the only reference a drawing may hold. */
function localUrl(value) {
    const id = LOCAL_URL.exec(value.trim())?.[1];
    return id === undefined ? undefined : `url(#${id})`;
}
/** A colour, `none`, or a local gradient; black follows the host's text colour. */
const paint = (value) => {
    const text = value.trim();
    if (BLACK.test(text))
        return 'currentColor';
    return localUrl(text) ?? (COLOR.test(text) ? text : undefined);
};
/** A local reference such as a clip path, or `none`. */
const reference = (value) => (value.trim() === 'none' ? 'none' : localUrl(value));
const length = matching(LENGTH);
const numbers = matching(NUMBERS);
const word = matching(WORD);
const pathData = matching(PATH_DATA);
const transform = matching(TRANSFORM);
/** Every attribute a drawing may carry, by its canonical name, with the check on its value. */
const ATTRIBUTES = {
    id: matching(ID),
    x: length, y: length, x1: length, y1: length, x2: length, y2: length,
    cx: length, cy: length, r: length, rx: length, ry: length, fx: length, fy: length,
    width: length, height: length,
    d: pathData, points: numbers, pathLength: length,
    transform, gradientTransform: transform, patternTransform: transform,
    viewBox: numbers, preserveAspectRatio: matching(WORDS),
    fill: paint, stroke: paint, 'stop-color': paint, color: paint,
    'stroke-width': length, 'stroke-linecap': word, 'stroke-linejoin': word, 'stroke-miterlimit': length,
    'stroke-dasharray': matching(/^[-+0-9.,eE\s%a-z]*$/iu), 'stroke-dashoffset': length,
    opacity: length, 'fill-opacity': length, 'stroke-opacity': length, 'stop-opacity': length,
    'fill-rule': word, 'clip-rule': word,
    'clip-path': reference, mask: reference, 'marker-start': reference, 'marker-mid': reference, 'marker-end': reference,
    'font-size': length, 'font-weight': word, 'font-style': word, 'text-anchor': word, 'dominant-baseline': word,
    'alignment-baseline': word, 'letter-spacing': length, dx: numbers, dy: numbers, rotate: numbers,
    gradientUnits: word, spreadMethod: word, offset: length,
    markerWidth: length, markerHeight: length, refX: word, refY: word, orient: word, markerUnits: word,
    clipPathUnits: word, maskUnits: word, maskContentUnits: word, patternUnits: word, patternContentUnits: word,
};
/** Canonical attribute names by their lower-case spelling. */
const ATTRIBUTE_BY_LOWER = new Map(Object.keys(ATTRIBUTES).map(name => [name.toLowerCase(), name]));
/** Attributes that change nothing a reader sees here, dropped without a word: the host chooses the font. */
const QUIET_ATTRIBUTE = /^(?:xmlns(?::.*)?|version|font-family|xml:.*|aria-.*|data-.*|role|focusable|baseprofile)$/iu;
/** Root attributes that go on the drawing's own group; the root's size and box are read separately. */
const ROOT_ONLY = new Set(['id', 'x', 'y', 'width', 'height', 'viewBox', 'preserveAspectRatio']);
/** The one href a drawing may hold: `use` naming an id inside the drawing. */
function localHref(tag, value) {
    const text = value.trim();
    return tag === 'use' && text.startsWith('#') && ID.test(text.slice(1)) ? text : undefined;
}
/**
 * Check one attribute.
 * @param tag - the canonical element name.
 * @param name - the attribute name as written.
 * @param value - the decoded value.
 * @returns the canonical name and kept value, or undefined when it is dropped.
 */
function cleanAttribute(tag, name, value) {
    const lower = name.toLowerCase();
    if (lower === 'href' || lower === 'xlink:href') {
        const href = localHref(tag, value);
        return href === undefined ? undefined : ['href', href];
    }
    const canonical = ATTRIBUTE_BY_LOWER.get(lower);
    if (canonical === undefined)
        return undefined;
    const kept = ATTRIBUTES[canonical](value);
    return kept === undefined ? undefined : [canonical, kept];
}
/** Decode the entities XML names and the numeric ones; anything else stays as written. */
function decodeEntities(text) {
    if (!text.includes('&'))
        return text;
    return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|(amp|lt|gt|quot|apos|nbsp));/giu, (whole, decimal, hex, named) => {
        if (named !== undefined)
            return NAMED_ENTITIES[named.toLowerCase()] ?? whole;
        const code = decimal !== undefined ? Number(decimal) : Number.parseInt(hex, 16);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    });
}
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const NAME = /[A-Za-z_:][\w:.-]*/uy;
const SPACE = /\s/u;
/**
 * Scan one opening tag.
 * @param text - the drawing's text.
 * @param start - index of the `<`.
 * @returns the tag, or undefined when the text ends inside it or no name follows.
 */
function scanTag(text, start) {
    NAME.lastIndex = start + 1;
    const name = NAME.exec(text)?.[0];
    if (name === undefined)
        return undefined;
    const attrs = [];
    let index = NAME.lastIndex;
    while (index < text.length) {
        const character = text[index];
        if (SPACE.test(character)) {
            index += 1;
        }
        else if (character === '>') {
            return { name, attrs, selfClosing: false, end: index + 1 };
        }
        else if (character === '/' && text[index + 1] === '>') {
            return { name, attrs, selfClosing: true, end: index + 2 };
        }
        else {
            NAME.lastIndex = index;
            const attribute = NAME.exec(text)?.[0];
            if (attribute === undefined) {
                index += 1;
                continue;
            }
            index = NAME.lastIndex;
            while (index < text.length && SPACE.test(text[index]))
                index += 1;
            if (text[index] !== '=') {
                attrs.push([attribute, '']);
                continue;
            }
            index += 1;
            while (index < text.length && SPACE.test(text[index]))
                index += 1;
            const quote = text[index];
            if (quote === '"' || quote === "'") {
                const close = text.indexOf(quote, index + 1);
                if (close === -1)
                    return undefined;
                attrs.push([attribute, decodeEntities(text.slice(index + 1, close))]);
                index = close + 1;
            }
            else {
                let end = index;
                while (end < text.length && !SPACE.test(text[end]) && text[end] !== '>')
                    end += 1;
                attrs.push([attribute, decodeEntities(text.slice(index, end))]);
                index = end;
            }
        }
    }
    return undefined;
}
/** The local name of an element written with an `svg:` prefix; any other prefix stays and is dropped. */
function elementName(written) {
    return written.toLowerCase().startsWith('svg:') ? written.slice(4) : written;
}
/** A box from a root's `viewBox`, or from its `width` and `height`. */
function rootBox(attrs) {
    const read = (name) => attrs.find(([key]) => key.toLowerCase() === name)?.[1];
    const box = checkViewBox(read('viewbox')?.trim().split(/[\s,]+/u).map(Number));
    if (box !== undefined)
        return box;
    return checkViewBox([0, 0, Number.parseFloat(read('width') ?? ''), Number.parseFloat(read('height') ?? '')]);
}
/** A usable box: four finite numbers with a positive size. */
function checkViewBox(value) {
    if (!Array.isArray(value) || value.length !== 4)
        return undefined;
    const [x, y, width, height] = value;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number')
        return undefined;
    return Number.isFinite(x) && Number.isFinite(y) && width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
        ? [x, y, width, height]
        : undefined;
}
/**
 * Read a drawing written as SVG.
 * @param written - the SVG text.
 * @returns the drawing, undefined when nothing in it can be drawn, and what was dropped.
 */
export function parseSvg(written) {
    const problems = [];
    let text = written.replace(/\r\n?/gu, '\n');
    if (text.length > LIMITS.maxSvgChars) {
        text = text.slice(0, LIMITS.maxSvgChars);
        problems.push({ message: `is longer than ${LIMITS.maxSvgChars} characters; the rest was cut`, repair: 'Draw less detail, or use fewer points in long paths.' });
    }
    const droppedElements = new Set();
    const droppedAttributes = new Set();
    const children = [];
    const rootAttrs = {};
    let viewBox;
    let sawRoot = false;
    let elements = 0;
    let overElements = false;
    let overDepth = false;
    // A frame's element is null inside a dropped element: its whole subtree goes with it.
    const stack = [];
    const parentList = () => {
        const top = stack.at(-1);
        return top === undefined ? children : top.element;
    };
    let index = 0;
    while (index < text.length) {
        const open = text.indexOf('<', index);
        const run = text.slice(index, open === -1 ? text.length : open);
        const holder = stack.at(-1)?.element;
        if (holder !== null && holder !== undefined && TEXT_ELEMENTS.has(holder[0]) && run.trim() !== '') {
            holder.push(decodeEntities(run.replace(/\s+/gu, ' ')));
        }
        if (open === -1)
            break;
        if (text.startsWith('<!--', open)) {
            const close = text.indexOf('-->', open + 4);
            index = close === -1 ? text.length : close + 3;
            continue;
        }
        if (text.startsWith('<![CDATA[', open)) {
            const close = text.indexOf(']]>', open + 9);
            const content = text.slice(open + 9, close === -1 ? text.length : close);
            if (holder !== null && holder !== undefined && TEXT_ELEMENTS.has(holder[0]) && content.trim() !== '')
                holder.push(content);
            index = close === -1 ? text.length : close + 3;
            continue;
        }
        if (text.startsWith('<?', open) || text.startsWith('<!', open)) {
            const close = text.indexOf('>', open + 2);
            index = close === -1 ? text.length : close + 1;
            continue;
        }
        if (text.startsWith('</', open)) {
            const close = text.indexOf('>', open + 2);
            if (close === -1)
                break;
            const name = text.slice(open + 2, close).trim();
            let depth = stack.length - 1;
            while (depth >= 0 && stack[depth]?.written !== name)
                depth -= 1;
            if (depth >= 0)
                stack.length = depth;
            index = close + 1;
            continue;
        }
        const tag = scanTag(text, open);
        if (tag === undefined) {
            // A lone "<" in text goes on; a tag the text ends inside waits for more.
            if (/^<[A-Za-z_:]/u.test(text.slice(open, open + 2)))
                break;
            index = open + 1;
            continue;
        }
        index = tag.end;
        const local = elementName(tag.name);
        if (local.toLowerCase() === 'svg' && !sawRoot && stack.length === 0) {
            sawRoot = true;
            viewBox = rootBox(tag.attrs);
            for (const [name, value] of tag.attrs) {
                const kept = cleanAttribute('svg', name, value);
                if (kept !== undefined && !ROOT_ONLY.has(kept[0]))
                    rootAttrs[kept[0]] = kept[1];
                else if (kept === undefined && !QUIET_ATTRIBUTE.test(name))
                    droppedAttributes.add(name);
            }
            continue;
        }
        const canonical = ELEMENT_BY_LOWER.get(local.toLowerCase());
        const parent = parentList();
        const dropped = parent === null || canonical === undefined || stack.length >= LIMITS.maxSvgDepth || elements >= LIMITS.maxSvgElements;
        if (dropped) {
            if (parent !== null) {
                if (canonical === undefined)
                    droppedElements.add(tag.name);
                else if (stack.length >= LIMITS.maxSvgDepth)
                    overDepth = true;
                else
                    overElements = true;
            }
            if (!tag.selfClosing)
                stack.push({ written: tag.name, element: null });
            continue;
        }
        const attrs = {};
        for (const [name, value] of tag.attrs) {
            const kept = cleanAttribute(canonical, name, value);
            if (kept !== undefined)
                attrs[kept[0]] = kept[1];
            else if (!QUIET_ATTRIBUTE.test(name))
                droppedAttributes.add(name);
        }
        const element = [canonical, attrs];
        parent?.push(element);
        elements += 1;
        if (!tag.selfClosing)
            stack.push({ written: tag.name, element });
    }
    if (droppedElements.size > 0) {
        problems.push({
            message: `had elements a card does not draw, which were left out: ${[...droppedElements].slice(0, 8).join(', ')}`,
            repair: `Draw with ${ELEMENTS.slice(0, 10).join(', ')}, and gradients or clip paths in defs; a drawing has no scripts, styles, links, images, or animation.`,
        });
    }
    if (droppedAttributes.size > 0) {
        problems.push({
            message: `had attributes a card does not keep, which were ignored: ${[...droppedAttributes].slice(0, 8).join(', ')}`,
            repair: 'Write colours and sizes as attributes such as fill= and stroke-width=, not style= or class=; references may only name ids inside the drawing.',
        });
    }
    if (overElements)
        problems.push({ message: `has more than ${LIMITS.maxSvgElements} elements; the rest were left out`, repair: 'Draw less detail.' });
    if (overDepth)
        problems.push({ message: `nests deeper than ${LIMITS.maxSvgDepth} levels; deeper elements were left out`, repair: 'Flatten the groups.' });
    if (elements === 0)
        return { problems };
    if (viewBox === undefined) {
        problems.push({ message: `has no viewBox, so it uses ${DEFAULT_VIEW_BOX.join(' ')}`, repair: 'Write <svg viewBox="0 0 320 200">.' });
    }
    return { drawing: { viewBox: viewBox ?? [...DEFAULT_VIEW_BOX], attrs: rootAttrs, children }, problems };
}
/**
 * Check a drawing read back from a stored program. The compiler made it, but a
 * stored program is not trusted: everything is held to the same lists again.
 * @param value - the stored value.
 * @returns the drawing with only what the lists allow, or undefined when it is not one.
 */
export function checkDrawing(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return undefined;
    const record = value;
    const viewBox = checkViewBox(record.viewBox);
    if (viewBox === undefined || !Array.isArray(record.children))
        return undefined;
    const budget = { left: LIMITS.maxSvgElements };
    const attrs = cleanAttrs('svg', record.attrs);
    for (const name of ROOT_ONLY)
        delete attrs[name];
    return { viewBox, attrs, children: checkChildren(record.children, 0, budget) };
}
/** The attributes of one stored element that pass the lists. */
function cleanAttrs(tag, value) {
    const attrs = {};
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return attrs;
    for (const [name, entry] of Object.entries(value)) {
        if (typeof entry !== 'string')
            continue;
        const kept = cleanAttribute(tag, name, entry);
        if (kept !== undefined)
            attrs[kept[0]] = kept[1];
    }
    return attrs;
}
/** The children of one stored element that pass the lists, within the limits. */
function checkChildren(value, depth, budget) {
    const children = [];
    if (depth >= LIMITS.maxSvgDepth)
        return children;
    for (const entry of value) {
        if (typeof entry === 'string') {
            children.push(entry);
            continue;
        }
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !ELEMENTS.includes(entry[0]) || budget.left <= 0)
            continue;
        budget.left -= 1;
        const tag = entry[0];
        children.push([tag, cleanAttrs(tag, entry[1]), ...checkChildren(entry.slice(2), depth + 1, budget)]);
    }
    return children;
}
/**
 * The ids a drawing gives its elements, which shapes may place with `kind=use`.
 * @param drawing - a checked drawing.
 * @returns the ids, without their `#`.
 */
export function drawingIds(drawing) {
    const ids = new Set();
    const walk = (children) => {
        for (const child of children) {
            if (typeof child === 'string')
                continue;
            const id = child[1].id;
            if (id !== undefined)
                ids.add(id);
            walk(child.slice(2));
        }
    };
    walk(drawing.children);
    return ids;
}
/**
 * The words a drawing shows, for its text version: what its text and title say.
 * @param drawing - a checked drawing.
 * @returns the pieces of text, in drawing order.
 */
export function drawingWords(drawing) {
    const words = [];
    const walk = (children, inText) => {
        for (const child of children) {
            if (typeof child === 'string') {
                const word = child.trim();
                if (inText && word !== '')
                    words.push(word);
            }
            else if (child[0] !== 'desc') {
                walk(child.slice(2), TEXT_ELEMENTS.has(child[0]));
            }
        }
    };
    walk(drawing.children, false);
    return words;
}
