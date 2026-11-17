/**
 * Read a widget's source without a DOM.
 *
 * The host checks a widget before it is shown and tells the model what it
 * drew; the browser cleans the source while it streams. Neither runs the
 * model's code or builds a document from it, so this file reads HTML the way a
 * careful lexer would: tags with their attributes, the raw text of `script`,
 * `style`, `textarea`, and `title`, comments, and the text between. It never
 * throws and never builds a tree; an unfinished tag at the end, as a streaming
 * source has, is reported as unfinished.
 * @module dsh-intelligent-ui/widget/scan
 */
/** One attribute of a tag. `value` is undefined for a bare attribute such as `disabled`. */
export interface Attribute {
    name: string;
    value: string | undefined;
}
/** One piece of a source, by its offsets. */
export type Piece = {
    kind: 'text';
    start: number;
    end: number;
} | {
    kind: 'comment';
    start: number;
    end: number;
} | {
    kind: 'tag';
    name: string;
    closing: boolean;
    start: number;
    end: number;
    attrs: Attribute[];
    complete: boolean;
    selfClosing: boolean;
} | {
    kind: 'raw';
    name: string;
    start: number;
    end: number;
    closed: boolean;
};
/**
 * Split a source into pieces.
 * @param source - HTML, complete or a prefix.
 * @returns the pieces in order; their offsets cover the source without gaps.
 */
export declare function pieces(source: string): Piece[];
/**
 * Decode the character references a widget's text and attributes commonly hold.
 * @param text - text as written.
 * @returns the text with `&amp;`, `&lt;`, numeric references, and the like decoded.
 */
export declare function decodeEntities(text: string): string;
/**
 * A function from offset to 1-based line number.
 * @param source - the text the offsets index.
 * @returns the lookup.
 */
export declare function lineOf(source: string): (offset: number) => number;
/** The value of one attribute of a tag, or undefined when it has none. */
export declare function attribute(tag: {
    attrs: readonly Attribute[];
}, name: string): string | undefined;
/** One `<script>` element. */
export interface ScriptBlock {
    /** Line of the first character of its text. */
    line: number;
    text: string;
    /** `src`, when it loads a file. */
    src?: string;
    /** `classic` runs as a script, `module` as a module, `importmap` maps names, `data` is not run at all. */
    type: 'classic' | 'module' | 'importmap' | 'data';
    /** Whether its closing tag was written. */
    closed: boolean;
}
/**
 * Every script element of a source.
 * @param source - the widget.
 * @returns the scripts in document order.
 */
export declare function scriptBlocks(source: string): ScriptBlock[];
/** One inline event handler, such as `onclick="…"`. */
export interface Handler {
    /** The attribute, such as `onclick`. */
    name: string;
    code: string;
    line: number;
}
/**
 * Every inline event handler of a source.
 * @param source - the widget.
 * @returns the handlers in document order.
 */
export declare function eventHandlers(source: string): Handler[];
/**
 * Every absolute http or https address written anywhere in a source: in
 * attributes, in styles, and in scripts.
 * @param source - the widget.
 * @returns each address once, with the line it first appears on.
 */
export declare function addresses(source: string): Array<{
    url: string;
    line: number;
}>;
/**
 * The addresses a widget's modules import by bare name through its own import
 * maps, such as `three/addons/controls/OrbitControls.js` mapped under a
 * `three/addons/` prefix: the address each one resolves to, which a shipped
 * copy may stand in for. Exact keys win over prefixes, and a longer prefix over
 * a shorter one, as in the browser.
 * @param source - the widget.
 * @returns each resolved http or https address once.
 */
export declare function moduleAddresses(source: string): string[];
/**
 * The ids of the controls a reader can change, with their kind.
 * @param source - the widget.
 * @returns `id (type)` for each control that has an id.
 */
export declare function controlIds(source: string): string[];
/**
 * What the widget's buttons send as the reader's message, where the source says
 * so in place: `data-prompt` values and `sendPrompt` calls with a literal string.
 * @param source - the widget.
 * @returns each message once.
 */
export declare function promptTexts(source: string): string[];
/**
 * The text a reader sees before any script runs: the text between tags, without
 * scripts, styles, and titles, with spacing collapsed.
 * @param source - the widget.
 * @param max - most characters returned; a longer text is cut and marked with an ellipsis.
 * @returns the text.
 */
export declare function visibleText(source: string, max: number): string;
