import { describe, expect, it } from 'vitest'
import { normalizeSource } from '../src/widget/normalize.ts'
import { addresses, attribute, controlIds, decodeEntities, eventHandlers, lineOf, moduleAddresses, pieces, promptTexts, scriptBlocks, visibleText, type Piece } from '../src/widget/scan.ts'

/** The tags of a source, by name. */
function tags(source: string): Array<Extract<Piece, { kind: 'tag' }>> {
  return pieces(source).filter((piece): piece is Extract<Piece, { kind: 'tag' }> => piece.kind === 'tag')
}

describe('reading a source into pieces', () => {
  it('covers the source from start to end with no gap and no overlap', () => {
    const source = '<!-- note --><style>p > b { color: red }</style>\n<p class="a" data-x=\'1\' hidden>Hi <b>there</b></p><br/><script>if (a < b) { go() }</script> tail'
    const all = pieces(source)
    expect(all[0]?.start).toBe(0)
    expect(all.at(-1)?.end).toBe(source.length)
    for (let index = 1; index < all.length; index += 1) expect(all[index]?.start, String(index)).toBe(all[index - 1]?.end)
    expect(all.map(piece => piece.kind)).toEqual(['comment', 'tag', 'raw', 'tag', 'text', 'tag', 'text', 'tag', 'text', 'tag', 'tag', 'tag', 'tag', 'raw', 'tag', 'text'])
  })

  it('reads attributes in every quoting, lowercased, with entities decoded', () => {
    const [tag] = tags('<INPUT ID="seats" type=range data-label=\'Seats &amp; desks\' Disabled value="a>b">')
    expect(tag?.name).toBe('input')
    expect(tag?.attrs.map(attr => attr.name)).toEqual(['id', 'type', 'data-label', 'disabled', 'value'])
    expect(attribute(tag!, 'id')).toBe('seats')
    expect(attribute(tag!, 'type')).toBe('range')
    expect(attribute(tag!, 'data-label')).toBe('Seats & desks')
    expect(attribute(tag!, 'value')).toBe('a>b')
    expect(attribute(tag!, 'missing')).toBeUndefined()
  })

  it('keeps a script\'s or a style\'s text whole, whatever it holds', () => {
    const source = '<script>const html = "<p>not a tag</p>"; if (1 < 2 && 3 > 2) {}</script><style>a::after { content: "</b>" }</style>'
    expect(tags(source).map(tag => `${tag.closing ? '/' : ''}${tag.name}`)).toEqual(['script', '/script', 'style', '/style'])
  })

  it('reads a prefix cut anywhere without throwing, marking what is unfinished', () => {
    const source = '<div class="card"><p>Total</p><script>const a = "</p>"; show()</script><button data-prompt="Next one">Next</button></div>'
    for (let cut = 0; cut <= source.length; cut += 1) {
      const all = pieces(source.slice(0, cut))
      expect(all.at(-1)?.end ?? 0, String(cut)).toBe(cut)
    }
    const [open] = tags('<div class="car')
    expect(open?.complete).toBe(false)
    const raw = pieces('<script>const a = 1').find(piece => piece.kind === 'raw')
    expect(raw).toMatchObject({ name: 'script', closed: false })
  })

  it('treats a lone < as text', () => {
    expect(pieces('a < b and 3 <4').every(piece => piece.kind === 'text')).toBe(true)
    expect(visibleText('<p>a < b</p>', 100)).toBe('a < b')
  })

  it('maps offsets to lines', () => {
    const line = lineOf('one\ntwo\n\nfour')
    expect([0, 3, 4, 8, 9].map(line)).toEqual([1, 1, 2, 3, 4])
  })

  it('decodes the entities models write', () => {
    expect(decodeEntities('&lt;b&gt; &amp;&quot;&#39;&apos; &#x41;&#66; &nbsp;| &unknown;')).toBe('<b> &"\'\' AB  | &unknown;')
  })
})

describe('what a source holds', () => {
  it('lists scripts with their kind, their line, and whether they closed', () => {
    const blocks = scriptBlocks(`<p>x</p>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
start()
</script>
<script type="module">import 'a'</script>
<script type="importmap">{}</script>
<script type="application/json">{"a": 1}</script>
<script type="text/JavaScript">late()`)
    expect(blocks.map(block => [block.type, block.line, block.closed, block.src])).toEqual([
      ['classic', 2, true, 'https://cdn.jsdelivr.net/npm/chart.js'],
      ['classic', 3, true, undefined],
      ['module', 6, true, undefined],
      ['importmap', 7, true, undefined],
      ['data', 8, true, undefined],
      ['classic', 9, false, undefined],
    ])
    expect(blocks[1]?.text).toBe('\nstart()\n')
  })

  it('lists inline handlers with their tag\'s line', () => {
    expect(eventHandlers('<p>x</p>\n<button onclick="go(1)" onmouseover="">a</button>\n<input oninput="show(this.value)" online="no">')).toEqual([
      { name: 'onclick', code: 'go(1)', line: 2 },
      { name: 'oninput', code: 'show(this.value)', line: 3 },
      { name: 'online', code: 'no', line: 3 },
    ])
  })

  it('finds every absolute address once, wherever it is written', () => {
    const found = addresses(`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>.a { background: url(https://cdn.jsdelivr.net/npm/x/a.png) }</style>
<script>
fetch('https://unpkg.com/world-atlas@2/countries-110m.json').then(r => r.json())
const again = "https://unpkg.com/world-atlas@2/countries-110m.json"
// see http://example.com/docs.
</script>`)
    expect(found).toEqual([
      { url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap', line: 1 },
      { url: 'https://cdn.jsdelivr.net/npm/x/a.png', line: 2 },
      { url: 'https://unpkg.com/world-atlas@2/countries-110m.json', line: 4 },
      { url: 'http://example.com/docs', line: 6 },
    ])
  })

  it('resolves what modules import by bare name through the widget\'s own import maps', () => {
    expect(moduleAddresses(`<script type="importmap">{"imports": {"three": "https://unpkg.com/three@0.160.0/build/three.module.js", "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/", "three/addons/special.js": "https://esm.sh/special@1"}}</script>
<script type="module">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import special from "three/addons/special.js"
import './local.js'
import { x } from 'https://esm.sh/x@1'
const lazy = await import('three/addons/loaders/GLTFLoader.js')
import { y } from 'unmapped'
</script>
<script>import('three/addons/never-a-module.js')</script>`)).toEqual([
      'https://unpkg.com/three@0.160.0/build/three.module.js',
      'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js',
      'https://esm.sh/special@1',
      'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
    ])
    expect(moduleAddresses('<script type="importmap">{ broken</script><script type="module">import a from "a"</script>')).toEqual([])
  })

  it('lists controls that have an id, with their kind', () => {
    expect(controlIds('<input id="a"><input id="b" type="RANGE"><input type="text"><select id="c"></select><textarea id=" d "></textarea><button id="e">x</button>'))
      .toEqual(['a (text)', 'b (range)', 'c (select)', 'd (textarea)'])
  })

  it('lists what buttons send, from data-prompt and literal sendPrompt calls', () => {
    expect(promptTexts(`<button data-prompt=" Explain step 2 ">?</button><button data-prompt="">x</button>
<button onclick="sendPrompt('Show me the next question')">Next</button>
<script>
more.onclick = () => sendPrompt("Why is it \\"blue\\"?")
other.onclick = () => sendPrompt(\`Tell me about \${name}\`)
again.onclick = () => sendPrompt('Explain step 2')
</script>`)).toEqual(['Explain step 2', 'Show me the next question', 'Why is it "blue"?'])
  })

  it('reads the text shown before scripts run', () => {
    expect(visibleText(`<style>p { color: red }</style><title>Hidden</title>
<div class="card"><h3>Monthly cost</h3><p>Seats &amp; storage</p><ul><li>One</li><li>Two</li></ul></div>
<script>document.title = 'no'</script><!-- nor this -->`, 200)).toBe('Monthly cost Seats & storage One Two')
    expect(visibleText('<p>abcdefghij</p>', 6)).toBe('abcde…')
    expect(visibleText('<script>only()</script>', 50)).toBe('')
  })
})

describe('cleaning a source', () => {
  it('takes off a Markdown fence, a byte order mark, and Windows line endings', () => {
    expect(normalizeSource('﻿```html\r\n<p>One</p>\r\n<p>Two</p>\r\n```\r\n')).toBe('<p>One</p>\n<p>Two</p>')
    expect(normalizeSource('```\n<svg viewBox="0 0 1 1"></svg>\n```')).toBe('<svg viewBox="0 0 1 1"></svg>')
  })

  it('unwraps a whole document, keeping what its head and body hold', () => {
    expect(normalizeSource(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Loan calculator</title>
<base href="https://example.com/">
<link rel="icon" href="https://example.com/favicon.ico">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
<style>p { margin: 0 }</style>
</head>
<body class="x">
<p>Hello</p>
<script>start()</script>
</body>
</html>`).replace(/\n+/gu, '\n')).toBe('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">\n<style>p { margin: 0 }</style>\n<p>Hello</p>\n<script>start()</script>')
  })

  it('leaves a fragment as written, including a fence inside a script', () => {
    const fragment = '<p>Use ```js fences``` in Markdown</p>\n<script>const fence = "```"\nconst html = "<body>"</script>'
    expect(normalizeSource(fragment)).toBe(fragment)
    expect(normalizeSource('  \n\n<p>x</p>\n\n  ')).toBe('<p>x</p>')
  })

  it('is stable: cleaning twice changes nothing, and a prefix never throws', () => {
    const source = '```html\n<!doctype html><html><head><title>T</title></head><body><p>Hi</p><script>a()</script></body></html>\n```'
    expect(normalizeSource(normalizeSource(source))).toBe(normalizeSource(source))
    for (let cut = 0; cut <= source.length; cut += 1) expect(() => normalizeSource(source.slice(0, cut)), String(cut)).not.toThrow()
    expect(normalizeSource(source.slice(0, 42))).not.toContain('<title')
  })
})
