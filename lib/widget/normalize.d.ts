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
/**
 * Normalize one source.
 * @param written - the source as the model wrote it, complete or a streamed prefix.
 * @returns the fragment, with Unix line endings and no surrounding blank lines.
 */
export declare function normalizeSource(written: string): string;
