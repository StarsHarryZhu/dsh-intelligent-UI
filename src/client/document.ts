/**
 * The document a widget frame starts from.
 *
 * It holds no part of the widget: only the frame's content policy, the theme
 * the widget opens with, the base stylesheet, and the runtime, which then
 * receives the widget by message. So the document is fixed for the life of a
 * frame, and the frame never reloads while the widget streams.
 * @module dsh-intelligent-ui/client/document
 */

import type { FrameTheme } from './theme.ts'

/** The fixed parts of a frame's document. */
export interface FrameParts {
  /** The runtime script. */
  runtime: string
  /** The base stylesheet. */
  css: string
  /** The content policy. */
  policy: string
}

/** Escape text for a double-quoted attribute. */
function attribute(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;')
}

/**
 * Make script text safe inside a `<script>` element. The HTML tokenizer ends a
 * script at `</script`, and after `<!--` it treats `<script` … `</script` as a
 * nested pair that does not end it; writing the `<` of each as `\x3C` keeps the
 * text one script. The runtime only has these inside string and regular
 * expression literals, where `\x3C` reads as `<`.
 */
function inScript(text: string): string {
  return text.replace(/<(?=!--|\/script|script)/giu, '\\x3C')
}

/**
 * Write a frame's document.
 * @param parts - the runtime, the stylesheet, and the policy.
 * @param theme - the theme the frame opens with, so it does not flash before the first theme message.
 * @returns the `srcdoc` text.
 */
export function frameDocument(parts: FrameParts, theme: FrameTheme): string {
  const declarations = Object.entries(theme.vars)
    .filter(([name, value]) => /^--[\w-]+$/u.test(name) && !/[;{}<>]/u.test(value))
    .map(([name, value]) => `${name}:${value}`)
    .join(';')
  const lang = /^[A-Za-z]{2,3}(?:-\w{2,8})*$/u.test(theme.lang) ? ` lang="${theme.lang}"` : ''
  const mode = theme.dark ? 'dark' : 'light'
  return [
    `<!doctype html><html${lang} data-theme="${mode}" style="color-scheme:${mode}"><head><meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${attribute(parts.policy)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${parts.css.replace(/<\/style/giu, '<\\/style')}</style>`,
    `<style id="dsh-theme">:root{${declarations}}</style>`,
    `<script>${inScript(parts.runtime)}</script>`,
    '</head><body></body></html>',
  ].join('')
}
