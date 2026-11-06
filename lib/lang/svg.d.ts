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
/** Attributes of one element, by their SVG names. */
export type SvgAttrs = Record<string, string>;
/** One element: tag, attributes, then children; a string child is text. */
export type SvgElement = [string, SvgAttrs, ...SvgChild[]];
/** A child of an element. */
export type SvgChild = string | SvgElement;
/** A checked drawing. */
export interface SvgDrawing {
    /** Left, top, width, and height of the drawing's own coordinates. */
    viewBox: [number, number, number, number];
    /** Presentation attributes the root carried, which its children inherit. */
    attrs: SvgAttrs;
    children: SvgChild[];
}
/** What reading one drawing gave up on, written for the model. */
export interface SvgProblem {
    message: string;
    repair: string;
}
/** An id a drawing may give an element; a shape names one with `ref=`. */
export declare const SVG_ID: RegExp;
/** The characters SVG path data is made of. */
export declare const PATH_DATA: RegExp;
/**
 * Read a drawing written as SVG.
 * @param written - the SVG text.
 * @returns the drawing, undefined when nothing in it can be drawn, and what was dropped.
 */
export declare function parseSvg(written: string): {
    drawing?: SvgDrawing;
    problems: SvgProblem[];
};
/**
 * Check a drawing read back from a stored program. The compiler made it, but a
 * stored program is not trusted: everything is held to the same lists again.
 * @param value - the stored value.
 * @returns the drawing with only what the lists allow, or undefined when it is not one.
 */
export declare function checkDrawing(value: unknown): SvgDrawing | undefined;
/**
 * The ids a drawing gives its elements, which shapes may place with `kind=use`.
 * @param drawing - a checked drawing.
 * @returns the ids, without their `#`.
 */
export declare function drawingIds(drawing: SvgDrawing): Set<string>;
/**
 * The words a drawing shows, for its text version: what its text and title say.
 * @param drawing - a checked drawing.
 * @returns the pieces of text, in drawing order.
 */
export declare function drawingWords(drawing: SvgDrawing): string[];
