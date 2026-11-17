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
  name: string
  value: string | undefined
}

/** One piece of a source, by its offsets. */
export type Piece =
  | { kind: 'text'; start: number; end: number }
  | { kind: 'comment'; start: number; end: number }
  | { kind: 'tag'; name: string; closing: boolean; start: number; end: number; attrs: Attribute[]; complete: boolean; selfClosing: boolean }
  | { kind: 'raw'; name: string; start: number; end: number; closed: boolean }

/** Elements whose content is raw text up to their own closing tag. */
const RAW_ELEMENTS = new Set(['script', 'style', 'textarea', 'title'])

const LETTER = /[A-Za-z]/u
const NAME = /[A-Za-z][\w:.-]*/uy
const SPACE = /\s/u

/**
 * Split a source into pieces.
 * @param source - HTML, complete or a prefix.
 * @returns the pieces in order; their offsets cover the source without gaps.
 */
export function pieces(source: string): Piece[] {
  const found: Piece[] = []
  const length = source.length
  let index = 0
  while (index < length) {
    const open = source.indexOf('<', index)
    if (open < 0) {
      found.push({ kind: 'text', start: index, end: length })
      break
    }
    if (open > index) found.push({ kind: 'text', start: index, end: open })
    if (source.startsWith('<!--', open)) {
      const close = source.indexOf('-->', open + 4)
      const end = close < 0 ? length : close + 3
      found.push({ kind: 'comment', start: open, end })
      index = end
      continue
    }
    const next = source[open + 1] ?? ''
    const closing = next === '/' && LETTER.test(source[open + 2] ?? '')
    if (!closing && !LETTER.test(next) && next !== '!' && next !== '?') {
      found.push({ kind: 'text', start: open, end: open + 1 })
      index = open + 1
      continue
    }
    const tag = readTag(source, open, closing)
    found.push(tag)
    index = tag.end
    if (tag.closing || !tag.complete || tag.selfClosing || !RAW_ELEMENTS.has(tag.name)) continue
    const pattern = new RegExp(`</${tag.name}(?=[\\s/>]|$)`, 'giu')
    pattern.lastIndex = index
    const match = pattern.exec(source)
    const end = match === null ? length : match.index
    found.push({ kind: 'raw', name: tag.name, start: index, end, closed: match !== null })
    index = end
  }
  return found
}

/** Read one tag opening at `start`: `<name …>`, `</name …>`, or a declaration such as `<!doctype html>`. */
function readTag(source: string, start: number, closing: boolean): Extract<Piece, { kind: 'tag' }> {
  const length = source.length
  let index = start + (closing ? 2 : 1)
  let name: string
  if (source[index] === '!' || source[index] === '?') {
    const word = /[!?][\w-]*/uy
    word.lastIndex = index
    name = (word.exec(source)?.[0] ?? '!').toLowerCase()
    const close = source.indexOf('>', index)
    const end = close < 0 ? length : close + 1
    return { kind: 'tag', name, closing: false, start, end, attrs: [], complete: close >= 0, selfClosing: true }
  }
  NAME.lastIndex = index
  name = (NAME.exec(source)?.[0] ?? '').toLowerCase()
  index += name.length
  const attrs: Attribute[] = []
  let selfClosing = false
  while (index < length) {
    const character = source[index] as string
    if (SPACE.test(character)) {
      index += 1
      continue
    }
    if (character === '>') return { kind: 'tag', name, closing, start, end: index + 1, attrs, complete: true, selfClosing }
    if (character === '/') {
      selfClosing = source[index + 1] === '>'
      index += 1
      continue
    }
    selfClosing = false
    let stop = index
    while (stop < length && !SPACE.test(source[stop] as string) && source[stop] !== '=' && source[stop] !== '>' && !(source[stop] === '/' && source[stop + 1] === '>')) stop += 1
    const attrName = source.slice(index, stop).toLowerCase()
    index = stop
    while (index < length && SPACE.test(source[index] as string)) index += 1
    if (source[index] !== '=') {
      if (attrName !== '') attrs.push({ name: attrName, value: undefined })
      if (stop === index && attrName === '') index += 1
      continue
    }
    index += 1
    while (index < length && SPACE.test(source[index] as string)) index += 1
    const quote = source[index]
    if (quote === '"' || quote === "'") {
      const close = source.indexOf(quote, index + 1)
      if (close < 0) return { kind: 'tag', name, closing, start, end: length, attrs, complete: false, selfClosing: false }
      attrs.push({ name: attrName, value: decodeEntities(source.slice(index + 1, close)) })
      index = close + 1
      continue
    }
    let end = index
    while (end < length && !SPACE.test(source[end] as string) && source[end] !== '>') end += 1
    attrs.push({ name: attrName, value: decodeEntities(source.slice(index, end)) })
    index = end
  }
  return { kind: 'tag', name, closing, start, end: length, attrs, complete: false, selfClosing: false }
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Decode the character references a widget's text and attributes commonly hold.
 * @param text - text as written.
 * @returns the text with `&amp;`, `&lt;`, numeric references, and the like decoded.
 */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/giu, (whole, body: string) => {
    if (body[0] !== '#') return NAMED_ENTITIES[body.toLowerCase()] ?? whole
    const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

/**
 * A function from offset to 1-based line number.
 * @param source - the text the offsets index.
 * @returns the lookup.
 */
export function lineOf(source: string): (offset: number) => number {
  const starts = [0]
  for (let index = source.indexOf('\n'); index >= 0; index = source.indexOf('\n', index + 1)) starts.push(index + 1)
  return (offset) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if ((starts[middle] as number) <= offset) low = middle
      else high = middle - 1
    }
    return low + 1
  }
}

/** The value of one attribute of a tag, or undefined when it has none. */
export function attribute(tag: { attrs: readonly Attribute[] }, name: string): string | undefined {
  return tag.attrs.find(entry => entry.name === name)?.value
}

/** One `<script>` element. */
export interface ScriptBlock {
  /** Line of the first character of its text. */
  line: number
  text: string
  /** `src`, when it loads a file. */
  src?: string
  /** `classic` runs as a script, `module` as a module, `importmap` maps names, `data` is not run at all. */
  type: 'classic' | 'module' | 'importmap' | 'data'
  /** Whether its closing tag was written. */
  closed: boolean
}

/** Script types a browser runs as a classic script. */
const CLASSIC_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript', 'javascript'])

/**
 * Every script element of a source.
 * @param source - the widget.
 * @returns the scripts in document order.
 */
export function scriptBlocks(source: string): ScriptBlock[] {
  const line = lineOf(source)
  const all = pieces(source)
  const found: ScriptBlock[] = []
  for (let index = 0; index < all.length; index += 1) {
    const piece = all[index] as Piece
    if (piece.kind !== 'tag' || piece.closing || piece.name !== 'script' || !piece.complete) continue
    const typeValue = (attribute(piece, 'type') ?? '').trim().toLowerCase()
    const type = typeValue === 'module' ? 'module' : typeValue === 'importmap' ? 'importmap' : CLASSIC_TYPES.has(typeValue) ? 'classic' : 'data'
    const raw = all[index + 1]
    const text = raw?.kind === 'raw' && raw.name === 'script' ? source.slice(raw.start, raw.end) : ''
    const src = attribute(piece, 'src')
    found.push({
      line: line(piece.end),
      text,
      ...(src === undefined ? {} : { src: src.trim() }),
      type,
      closed: raw?.kind === 'raw' ? raw.closed : piece.selfClosing,
    })
  }
  return found
}

/** One inline event handler, such as `onclick="…"`. */
export interface Handler {
  /** The attribute, such as `onclick`. */
  name: string
  code: string
  line: number
}

/**
 * Every inline event handler of a source.
 * @param source - the widget.
 * @returns the handlers in document order.
 */
export function eventHandlers(source: string): Handler[] {
  const line = lineOf(source)
  const found: Handler[] = []
  for (const piece of pieces(source)) {
    if (piece.kind !== 'tag' || piece.closing) continue
    for (const attr of piece.attrs) {
      if (/^on[a-z]+$/u.test(attr.name) && attr.value !== undefined && attr.value.trim() !== '') found.push({ name: attr.name, code: attr.value, line: line(piece.start) })
    }
  }
  return found
}

/**
 * Every absolute http or https address written anywhere in a source: in
 * attributes, in styles, and in scripts.
 * @param source - the widget.
 * @returns each address once, with the line it first appears on.
 */
export function addresses(source: string): Array<{ url: string; line: number }> {
  const line = lineOf(source)
  const seen = new Set<string>()
  const found: Array<{ url: string; line: number }> = []
  for (const match of source.matchAll(/\bhttps?:\/\/[^\s'"`<>()\\]+/giu)) {
    const url = match[0].replace(/[.,;:!?]+$/u, '')
    if (seen.has(url)) continue
    seen.add(url)
    found.push({ url, line: line(match.index) })
  }
  return found
}

/**
 * The addresses a widget's modules import by bare name through its own import
 * maps, such as `three/addons/controls/OrbitControls.js` mapped under a
 * `three/addons/` prefix: the address each one resolves to, which a shipped
 * copy may stand in for. Exact keys win over prefixes, and a longer prefix over
 * a shorter one, as in the browser.
 * @param source - the widget.
 * @returns each resolved http or https address once.
 */
export function moduleAddresses(source: string): string[] {
  const blocks = scriptBlocks(source)
  const map: Record<string, string> = {}
  for (const block of blocks) {
    if (block.type !== 'importmap') continue
    try {
      const imports = (JSON.parse(block.text) as { imports?: unknown }).imports
      if (typeof imports !== 'object' || imports === null) continue
      for (const [key, value] of Object.entries(imports)) if (typeof value === 'string') map[key] ??= value
    } catch {
      // The host's check reports a map that is not JSON.
    }
  }
  const prefixes = Object.keys(map).filter(key => key.endsWith('/')).sort((a, b) => b.length - a.length)
  const found = new Set<string>()
  for (const block of blocks) {
    if (block.type !== 'module') continue
    for (const match of block.text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\1/gu)) {
      const specifier = match[2] as string
      if (/^(?:[a-z]+:|\.{0,2}\/)/iu.test(specifier)) continue
      const exact = map[specifier]
      const prefix = exact === undefined ? prefixes.find(key => specifier.startsWith(key)) : undefined
      const resolved = exact ?? (prefix === undefined ? undefined : `${map[prefix] as string}${specifier.slice(prefix.length)}`)
      if (resolved !== undefined && /^https?:\/\//iu.test(resolved)) found.add(resolved)
    }
  }
  return [...found]
}

/** Elements whose value the reader sets. */
const CONTROL_TAGS = new Set(['input', 'select', 'textarea'])

/**
 * The ids of the controls a reader can change, with their kind.
 * @param source - the widget.
 * @returns `id (type)` for each control that has an id.
 */
export function controlIds(source: string): string[] {
  const found: string[] = []
  for (const piece of pieces(source)) {
    if (piece.kind !== 'tag' || piece.closing || !CONTROL_TAGS.has(piece.name)) continue
    const id = attribute(piece, 'id')
    if (id === undefined || id.trim() === '') continue
    const type = piece.name === 'input' ? (attribute(piece, 'type') ?? 'text').toLowerCase() : piece.name
    found.push(`${id.trim()} (${type})`)
  }
  return found
}

/**
 * What the widget's buttons send as the reader's message, where the source says
 * so in place: `data-prompt` values and `sendPrompt` calls with a literal string.
 * @param source - the widget.
 * @returns each message once.
 */
export function promptTexts(source: string): string[] {
  const found = new Set<string>()
  for (const piece of pieces(source)) {
    if (piece.kind !== 'tag' || piece.closing) continue
    const prompt = attribute(piece, 'data-prompt')
    if (prompt !== undefined && prompt.trim() !== '') found.add(prompt.trim())
  }
  const decoded = decodeEntities(source)
  for (const match of decoded.matchAll(/sendPrompt\(\s*(["'`])((?:\\.|(?!\1)[^\\\n])*)\1\s*\)/gu)) {
    const text = (match[2] as string).replace(/\\(.)/gu, '$1').trim()
    if (text !== '' && !text.includes('${')) found.add(text)
  }
  return [...found]
}

/**
 * The text a reader sees before any script runs: the text between tags, without
 * scripts, styles, and titles, with spacing collapsed.
 * @param source - the widget.
 * @param max - most characters returned; a longer text is cut and marked with an ellipsis.
 * @returns the text.
 */
export function visibleText(source: string, max: number): string {
  const parts: string[] = []
  for (const piece of pieces(source)) {
    if (piece.kind === 'text') parts.push(source.slice(piece.start, piece.end))
    else if (piece.kind === 'tag' && /^(?:br|p|div|li|tr|h[1-6]|section|button|label|option)$/u.test(piece.name)) parts.push(' ')
  }
  const text = decodeEntities(parts.join('')).replace(/\s+/gu, ' ').trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
