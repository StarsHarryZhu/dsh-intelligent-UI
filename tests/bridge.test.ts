import { describe, expect, it } from 'vitest'
import { readFrameMessage } from '../src/client/bridge.ts'
import { frameDocument } from '../src/client/document.ts'
import { CHANNEL } from '../src/widget/messages.ts'
import { framePolicy, LIMITS } from '../src/widget/policy.ts'
import { pieces } from '../src/widget/scan.ts'

/** A message as a frame posts it. */
function from(message: Record<string, unknown>): unknown {
  return { channel: CHANNEL, ...message }
}

describe('messages from a frame are untrusted', () => {
  it('ignores anything that is not a message of this protocol', () => {
    for (const data of [undefined, null, 'text', 42, [], {}, { t: 'send', text: 'hi' }, { channel: 'other', t: 'send', text: 'hi' }, from({}), from({ t: 'unknown' }), from({ t: 'toString' })]) {
      expect(readFrameMessage(data), JSON.stringify(data)).toBeUndefined()
    }
  })

  it('holds a height inside its limits', () => {
    expect(readFrameMessage(from({ t: 'height', h: 312.4 }))).toEqual({ kind: 'height', height: 312 })
    expect(readFrameMessage(from({ t: 'height', h: 0 }))).toEqual({ kind: 'height', height: LIMITS.minHeight })
    expect(readFrameMessage(from({ t: 'height', h: 1e9 }))).toEqual({ kind: 'height', height: LIMITS.maxHeight })
    for (const h of ['300', Number.NaN, Number.POSITIVE_INFINITY, null]) expect(readFrameMessage(from({ t: 'height', h })), String(h)).toBeUndefined()
  })

  it('takes a message to send only as bounded text', () => {
    expect(readFrameMessage(from({ t: 'send', text: '  Explain step 2  ' }))).toEqual({ kind: 'send', text: 'Explain step 2' })
    expect(readFrameMessage(from({ t: 'send', text: 'x'.repeat(LIMITS.maxPromptChars) }))).toMatchObject({ kind: 'send' })
    for (const text of ['', '   ', 'x'.repeat(LIMITS.maxPromptChars + 1), 7, { toString: () => 'x' }, ['a']]) {
      expect(readFrameMessage(from({ t: 'send', text })), String(text).slice(0, 20)).toBeUndefined()
    }
  })

  it('opens only http and https addresses', () => {
    expect(readFrameMessage(from({ t: 'open', url: 'https://example.org/a b?q=1#x' }))).toEqual({ kind: 'open', url: 'https://example.org/a%20b?q=1#x' })
    expect(readFrameMessage(from({ t: 'open', url: 'HTTP://Example.org' }))).toEqual({ kind: 'open', url: 'http://example.org/' })
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'blob:https://example.org/1', 'about:blank', '/relative', '', 'https://', `https://example.org/${'a'.repeat(LIMITS.maxLinkChars)}`, 5]) {
      expect(readFrameMessage(from({ t: 'open', url })), String(url).slice(0, 30)).toBeUndefined()
    }
  })

  it('keeps state only as JSON within its size, as a copy', () => {
    const value = { count: 2, items: ['a', 'b'], nested: { ok: true, none: null } }
    const read = readFrameMessage(from({ t: 'state', value }))
    expect(read).toEqual({ kind: 'state', value })
    expect((read as { value: unknown }).value).not.toBe(value)
    expect(readFrameMessage(from({ t: 'state', value: 'x'.repeat(LIMITS.maxStateChars) }))).toBeUndefined()
    expect(readFrameMessage(from({ t: 'state', value: undefined }))).toBeUndefined()
    expect(readFrameMessage(from({ t: 'state', value: () => 1 }))).toBeUndefined()
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(readFrameMessage(from({ t: 'state', value: loop }))).toBeUndefined()
    expect(readFrameMessage(from({ t: 'state', value: 10n }))).toBeUndefined()
  })

  it('keeps control values of the three kept shapes only', () => {
    expect(readFrameMessage(from({ t: 'controls', value: { seats: '20', agree: true, tags: ['a', 'b'], bad: 3, worse: { a: 1 }, mixed: ['a', 1], none: null } })))
      .toEqual({ kind: 'controls', value: { seats: '20', agree: true, tags: ['a', 'b'] } })
    for (const value of [null, 'text', ['a'], 4]) expect(readFrameMessage(from({ t: 'controls', value })), String(value)).toBeUndefined()
    expect(readFrameMessage(from({ t: 'controls', value: { a: 'x'.repeat(LIMITS.maxControlsChars) } }))).toBeUndefined()
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`c${index}`, true]))
    expect(Object.keys((readFrameMessage(from({ t: 'controls', value: many })) as { value: object }).value)).toHaveLength(200)
    expect(readFrameMessage(from({ t: 'controls', value: { ['i'.repeat(129)]: 'x', ok: 'y' } }))).toEqual({ kind: 'controls', value: { ok: 'y' } })
  })

  it('cuts an error short and drops an empty one', () => {
    expect(readFrameMessage(from({ t: 'error', message: ' ReferenceError: a is not defined (line 4) ' }))).toEqual({ kind: 'error', message: 'ReferenceError: a is not defined (line 4)' })
    expect((readFrameMessage(from({ t: 'error', message: 'e'.repeat(5000) })) as { message: string }).message).toHaveLength(LIMITS.maxErrorChars)
    expect(readFrameMessage(from({ t: 'error', message: '  ' }))).toBeUndefined()
    expect(readFrameMessage(from({ t: 'error', message: { text: 'x' } }))).toBeUndefined()
  })

  it('reads the mark that scripts have run, ignoring anything sent with it', () => {
    expect(readFrameMessage(from({ t: 'ran', extra: 'ignored' }))).toEqual({ kind: 'ran' })
  })
})

describe('the frame\'s document', () => {
  const parts = { runtime: 'window.__runtime = "<!-- </script><script>alert(1)</script> <SCRIPT src=x>"', css: 'body { margin: 0 } /* </style><script>alert(2)</script> */', policy: framePolicy() }
  const theme = { vars: { '--text-primary': 'rgb(1, 2, 3)', '--bad;name': 'red', '--surface-0': 'red;} body{display:none' }, dark: true, lang: 'zh-CN' }
  const html = frameDocument(parts, theme)

  it('puts the policy first in the head, before any style or script', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    const policyAt = html.indexOf('http-equiv="Content-Security-Policy"')
    expect(policyAt).toBeGreaterThan(0)
    expect(policyAt).toBeLessThan(html.indexOf('<style'))
    expect(policyAt).toBeLessThan(html.indexOf('<script'))
    expect(html).toContain(`content="${framePolicy()}"`)
  })

  it('cannot be broken out of by the text it embeds', () => {
    // Read the way a browser tokenizes it: the embedded text stays inside its own element.
    const opened = pieces(html).filter(piece => piece.kind === 'tag' && !piece.closing).map(piece => (piece as { name: string }).name)
    expect(opened).toEqual(['!doctype', 'html', 'head', 'meta', 'meta', 'meta', 'style', 'style', 'script', 'body'])
    expect(html.endsWith('</script></head><body></body></html>')).toBe(true)
    // From the runtime's script on, nothing reads as a tag or a comment but the script's own two tags.
    const tail = html.slice(html.lastIndexOf('</style>'))
    expect(tail.match(/<script/giu)).toHaveLength(1)
    expect(tail.match(/<\/script/giu)).toHaveLength(1)
    expect(tail).not.toContain('<!--')
    // The escapes read back as the text that was embedded.
    const script = /<script>([\s\S]*)<\/script>/u.exec(tail)?.[1] ?? ''
    const page: { __runtime?: string } = {}
    new Function('window', script)(page)
    expect(page.__runtime).toBe('<!-- </script><script>alert(1)</script> <SCRIPT src=x>')
    expect(html).not.toContain('display:none')
    expect(html).not.toContain('--bad;name')
  })

  it('starts in the page\'s theme and language, with an empty body', () => {
    expect(html).toMatch(/<html[^>]* data-theme="dark"/u)
    expect(html).toMatch(/<html[^>]* lang="zh-CN"/u)
    expect(html).toContain('--text-primary:rgb(1, 2, 3)')
    expect(html).toMatch(/<body>\s*<\/body>/u)
    expect(frameDocument(parts, { vars: {}, dark: false, lang: '"><script>' })).not.toContain('"><script>')
  })
})
