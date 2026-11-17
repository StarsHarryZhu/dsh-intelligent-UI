/**
 * Check a widget before it is shown.
 *
 * The model's code never runs on the host. Each script is compiled, not
 * executed, with Node's `vm.Script`, which parses with the same engine the
 * browser uses, so a syntax error comes back to the model with its line while
 * it can still fix it in the same turn. Everything else here reads the source
 * as text: which addresses the frame will block, which libraries the plugin
 * ships, and which habits do not work inside a sandboxed frame.
 * @module dsh-intelligent-ui/host/check
 */

import { Script } from 'node:vm'
import { shippedFileFor } from '../widget/libs.ts'
import { normalizeSource } from '../widget/normalize.ts'
import { CODE_HOSTS, isAllowedUrl, LIMITS } from '../widget/policy.ts'
import { addresses, attribute, eventHandlers, lineOf, pieces, scriptBlocks } from '../widget/scan.ts'

/** One problem, written as an instruction the model can act on. */
export interface Problem {
  /** Line of the source the problem is on, when it has one. */
  line?: number
  message: string
  repair: string
  /** An error keeps the widget from being shown; a warning is reported with it. */
  severity: 'error' | 'warning'
}

/** What the check found. */
export interface Checked {
  /** The normalized source the frame shows. */
  source: string
  problems: Problem[]
  /** Titles of the shipped libraries the widget loads. */
  shipped: string[]
  /** Addresses the widget loads from code hosts. */
  fetched: string[]
}

/**
 * Check one source.
 * @param written - the source as the model wrote it.
 * @returns the normalized source and every problem found.
 */
export function checkWidget(written: string): Checked {
  const source = normalizeSource(written)
  const problems: Problem[] = []
  const shipped = new Set<string>()
  const fetched = new Set<string>()
  if (source.trim() === '') {
    problems.push({ severity: 'error', message: 'The source is empty', repair: 'Put the widget\'s HTML, SVG, CSS, and scripts in `source`.' })
    return { source, problems, shipped: [], fetched: [] }
  }
  if (source.length > LIMITS.maxSourceChars) {
    problems.push({
      severity: 'error',
      message: `The source has ${source.length} characters, over the limit of ${LIMITS.maxSourceChars}`,
      repair: 'Draw less, compute repeated parts with a script, or split it into two widgets.',
    })
    return { source, problems, shipped: [], fetched: [] }
  }
  for (const block of scriptBlocks(source)) {
    if (!block.closed) {
      problems.push({ severity: 'error', line: block.line, message: 'A <script> is not closed', repair: 'End it with </script>.' })
      continue
    }
    if (block.src !== undefined) {
      if (block.text.trim() !== '') problems.push({ severity: 'warning', line: block.line, message: 'A <script src> also holds code, which the browser ignores', repair: 'Put that code in a <script> of its own.' })
      continue
    }
    if (block.type === 'classic') compile(block.text, block.line, problems)
    else if (block.type === 'module') compile(asFunctionBody(block.text), block.line, problems)
    else if (block.type === 'importmap') {
      try {
        JSON.parse(block.text)
      } catch (error) {
        problems.push({ severity: 'error', line: block.line, message: `The import map is not JSON: ${messageOf(error)}`, repair: 'Write it as one JSON object: {"imports": {"name": "https://…"}}.' })
      }
    }
  }
  for (const handler of eventHandlers(source)) {
    try {
      // eslint-disable-next-line no-new -- compiled for its syntax only, never run.
      new Script(`(function (event) {\n${handler.code}\n})`, { filename: 'widget' })
    } catch (error) {
      problems.push({ severity: 'error', line: handler.line, message: `The ${handler.name} handler does not parse: ${messageOf(error)}`, repair: 'Fix the handler, or move it into a script.' })
    }
  }
  readAddresses(source, problems, shipped, fetched)
  warnHabits(source, problems)
  return { source, problems: problems.slice(0, LIMITS.maxDiagnostics * 2), shipped: [...shipped], fetched: [...fetched] }
}

/** Compile code for its syntax alone, recording an error with its line in the source. */
function compile(code: string, line: number, problems: Problem[]): void {
  try {
    // eslint-disable-next-line no-new -- compiled for its syntax only, never run.
    new Script(code, { filename: 'widget', lineOffset: line - 1 })
  } catch (error) {
    const at = /^widget:(\d+)/u.exec(String((error as { stack?: unknown }).stack ?? ''))
    problems.push({
      severity: 'error',
      ...(at === null ? { line } : { line: Number(at[1]) }),
      message: `${(error as { name?: unknown }).name === 'SyntaxError' ? 'SyntaxError' : 'Error'}: ${messageOf(error)}`,
      repair: 'Fix this script.',
    })
  }
}

/**
 * Turn a module's text into a function body with the same lines, so a classic
 * compile can check it: import and export declarations become blank lines or
 * plain declarations, `import.meta` an object, and top-level `await` stays
 * legal inside an async function.
 */
function asFunctionBody(text: string): string {
  const blank = (whole: string): string => whole.replace(/[^\n]/gu, ' ')
  const body = text
    .replace(/^\s*import\s+(?:[\w*{}\s,$]+?\s+from\s+)?(['"])[^'"\n]+\1\s*;?/gmu, blank)
    .replace(/^\s*export\s+(?:\*|\{[^}]*\})(?:\s+from\s+(['"])[^'"\n]+\1)?\s*;?/gmu, blank)
    .replace(/^(\s*)export\s+default\s+(?=(?:async\s+)?(?:function|class)\b)/gmu, '$1')
    .replace(/^(\s*)export\s+default\s+/gmu, '$1void ')
    .replace(/^(\s*)export\s+(?=(?:const|let|var|function|class|async)\b)/gmu, '$1')
    .replace(/\bimport\.meta\b/gu, '({})')
  return `(async () => {${body}\n})`
}

/** The message of a thrown value, on one line. */
function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split('\n')[0]?.trim() ?? text
}

/**
 * Sort every address the widget names: a link opens through the host; an
 * address on a code host loads a shipped copy or loads from that host; any
 * other address the frame blocks, which the model hears about.
 */
function readAddresses(source: string, problems: Problem[], shipped: Set<string>, fetched: Set<string>): void {
  const links = new Set<string>()
  for (const piece of pieces(source)) {
    if (piece.kind === 'tag' && !piece.closing && piece.name === 'a') {
      const href = attribute(piece, 'href')
      if (href !== undefined) links.add(href.trim())
    }
  }
  const blocked: Array<{ url: string; line: number }> = []
  for (const { url, line: at } of addresses(source)) {
    if (links.has(url)) continue
    if (!isAllowedUrl(url)) {
      blocked.push({ url, line: at })
      continue
    }
    const file = shippedFileFor(url)
    if (file === undefined) fetched.add(url)
    else shipped.add(file.library.title)
  }
  for (const entry of blocked.slice(0, 4)) {
    problems.push({
      severity: 'warning',
      line: entry.line,
      message: `${entry.url} will be blocked: the widget may load only from ${CODE_HOSTS.join(', ')} and Google Fonts`,
      repair: 'Put the data in the widget itself, or load the file from one of those hosts; a link the reader opens belongs in <a href>.',
    })
  }
}

/** Habits that do not work inside a sandboxed frame, each with what to do instead. */
const HABITS: ReadonlyArray<{ pattern: RegExp; message: string; repair: string }> = [
  { pattern: /position\s*:\s*fixed/iu, message: 'position: fixed takes an element out of the frame\'s flow, and the frame then shrinks to nothing', repair: 'Lay it out in the normal flow, or use position: absolute inside a positioned box.' },
  { pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/u, message: 'Browser storage is blocked in the frame', repair: 'Keep values with dsh.state.set(…) and read them back with dsh.state.get(); inputs with an id are kept by themselves.' },
  { pattern: /(?<![.\w])(?:window\.)?(?:alert|confirm|prompt)\s*\(/u, message: 'alert, confirm, and prompt dialogs are blocked in the frame', repair: 'Show the message or the question inside the widget.' },
  { pattern: /\bdocument\.cookie\b/u, message: 'Cookies are blocked in the frame', repair: 'Keep values with dsh.state.' },
  { pattern: /\bwindow\.open\s*\(/u, message: 'window.open is blocked in the frame', repair: 'Call openLink(url), or use <a href>, which opens through the host.' },
  { pattern: /<iframe\b/iu, message: 'A frame inside the widget is blocked', repair: 'Draw the content in the widget itself.' },
  { pattern: /\bdocument\.write(?:ln)?\s*\(/u, message: 'document.write runs after the page has loaded and wipes the whole widget', repair: 'Build the content with elements, textContent, or insertAdjacentHTML on a container.' },
]

/** Warn about each habit once, at its first line. */
function warnHabits(source: string, problems: Problem[]): void {
  const line = lineOf(source)
  for (const habit of HABITS) {
    const match = habit.pattern.exec(source)
    if (match !== null) problems.push({ severity: 'warning', line: line(match.index), message: habit.message, repair: habit.repair })
  }
  for (const piece of pieces(source)) {
    if (piece.kind !== 'tag' || piece.closing || piece.name !== 'form') continue
    if (attribute(piece, 'data-send') !== undefined || attribute(piece, 'onsubmit') !== undefined || /preventDefault/u.test(source)) continue
    problems.push({
      severity: 'warning',
      line: line(piece.start),
      message: 'A form\'s own submission goes nowhere in the frame',
      repair: 'Add data-send to the form to send its fields as the reader\'s message, or handle submit in a script that calls event.preventDefault().',
    })
    break
  }
}
