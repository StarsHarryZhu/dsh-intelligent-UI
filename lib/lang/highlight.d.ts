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
/** What one run of text is. `plain` is everything else. */
export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'constant' | 'function';
/** One run of text with one colour. */
export interface Token {
    kind: TokenKind;
    text: string;
}
/** Languages the `code` component colours; `text` is shown as written. */
export declare const CODE_LANGUAGES: readonly ["text", "python", "js", "ts", "json", "bash", "c", "cpp", "java", "go", "rust", "sql", "html", "css", "yaml"];
/** One name from {@link CODE_LANGUAGES}. */
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];
/** Common names a model writes for a language, mapped to the catalog's name. */
export declare const CODE_LANGUAGE_ALIASES: Readonly<Record<string, CodeLanguage>>;
/**
 * Colour a text.
 * @param code - the text, lines separated by `\n`.
 * @param lang - a name from {@link CODE_LANGUAGES}; anything else is plain text.
 * @returns one token list per line; each list joined is that line exactly.
 */
export declare function highlight(code: string, lang: string): Token[][];
