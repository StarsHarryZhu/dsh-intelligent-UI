/**
 * Which ```widget block of the answer each card stands in.
 *
 * The model calls `ui_render`, then writes its answer with a block whose only
 * line is the card id where the widget belongs. It mostly copies the id right,
 * but not always: it miscopies a character, names a card of an earlier answer
 * to show it again, writes the block before the call it belongs to, or writes
 * one for a widget it never drew. This module decides, from the blocks and the
 * cards alone, where every card stands and which blocks the reader should not
 * see. It touches no page and no log, so the browser half runs it on what the
 * page shows and the tests run it on plain lists.
 *
 * The rules, in order:
 * 1. A block that names a card's id, or the id that card replaced, goes to
 *    that card when the card was drawn in the block's turn or before it. Of
 *    several cards it could name, the newest wins, and a card's own id before
 *    an id it replaced.
 * 2. A card named by several blocks stands at the first of them in the latest
 *    turn: an answer that shows an earlier widget again takes it there.
 * 3. A block that looks like a card id but names none takes the first card of
 *    its own turn that no block named, in the order the cards were drawn, even
 *    a card drawn after it. That covers a miscopied id and a block written
 *    before its call.
 * 4. Every block that names a card, or looks like a card id, is hidden; a
 *    card id means nothing to the reader. One that no card fills is reported
 *    as empty.
 * @module dsh-intelligent-ui/widget/blocks
 */
/**
 * The card id a code block names: its whole text, optionally after the word
 * `widget` or `card`.
 * @param text - the block's text.
 * @returns the id, or undefined when the block is anything else.
 */
export declare function namedCard(text: string): string | undefined;
/**
 * The prefix a host gives every call id, such as `call_`: the letters and
 * digits before the first underscore, with it.
 * @param id - a card id.
 * @returns the prefix, or undefined when the id has none.
 */
export declare function idPrefix(id: string): string | undefined;
/** One block that names something, in the order the answer shows them. */
export interface BlockEntry {
    /** What the block names, as {@link namedCard} read it. */
    readonly name: string;
    /** The turn the block was written in. */
    readonly turn: number;
}
/** One card on the page, in the order the cards were drawn. */
export interface CardEntry {
    /** The card's own id first, then the id of the card it replaced, if any. */
    readonly ids: readonly string[];
    /** The turn the card was drawn in. */
    readonly turn: number;
}
/** Where every card stands, and what becomes of every block. */
export interface PlacementPlan {
    /** For each card, the index of the block it stands in, or undefined to stand where it was called. */
    readonly cards: ReadonlyArray<number | undefined>;
    /** For each block, whether the reader should not see it. */
    readonly hidden: readonly boolean[];
    /** Indexes of hidden blocks no card fills and none is still being written toward. */
    readonly empty: readonly number[];
}
/**
 * Decide where every card stands.
 * @param blocks - the blocks that name something, in the answer's order.
 * @param cards - the cards, in the order they were drawn.
 * @returns the plan; see the module's rules.
 */
export declare function planPlacement(blocks: readonly BlockEntry[], cards: readonly CardEntry[]): PlacementPlan;
