/**
 * Clean a widget's source into the fragment the frame shows.
 *
 * A model sometimes writes a whole document, or wraps the widget in a Markdown
 * fence. The frame already is the document: it brings its own head, policy, and
 * styles. So the fence, the doctype, and the `html`, `head`, and `body` tags are
 * taken off, keeping what they hold, and `meta`, `base`, and `title` elements,
 * which only make sense in a document's head, are dropped. Both halves use this:
 * the host on the finished source, the browser on every streamed prefix.
 * @module dsh-intelligent-ui/widget/normalize
 */
import { pieces } from "./scan.js";
/** Tags taken off while what they hold is kept. */
const UNWRAPPED = new Set(['!doctype', 'html', 'head', 'body']);
/** Elements dropped whole. */
const DROPPED = new Set(['meta', 'base']);
/**
 * Normalize one source.
 * @param written - the source as the model wrote it, complete or a streamed prefix.
 * @returns the fragment, with Unix line endings and no surrounding blank lines.
 */
export function normalizeSource(written) {
    let text = written.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n');
    const fence = /^\s*```[\w-]*[ \t]*\n/u.exec(text);
    if (fence !== null) {
        text = text.slice(fence[0].length);
        text = text.replace(/\n```\s*$/u, '\n');
    }
    const kept = [];
    let insideTitle = false;
    for (const piece of pieces(text)) {
        if (piece.kind === 'tag') {
            if (UNWRAPPED.has(piece.name))
                continue;
            if (piece.name === 'title') {
                insideTitle = !piece.closing && !piece.selfClosing;
                continue;
            }
            if (!piece.closing && DROPPED.has(piece.name))
                continue;
            if (!piece.closing && piece.name === 'link' && /\bicon\b/iu.test(piece.attrs.find(attr => attr.name === 'rel')?.value ?? ''))
                continue;
        }
        if (piece.kind === 'raw' && piece.name === 'title')
            continue;
        if (insideTitle && piece.kind !== 'tag')
            continue;
        kept.push(text.slice(piece.start, piece.end));
    }
    return kept.join('').replace(/^\s*\n/u, '').trimEnd();
}
