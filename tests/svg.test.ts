/**
 * A drawing written as SVG reaches the page only as a checked tree: whatever is
 * not on the lists is gone, however it was spelled.
 */

import { describe, expect, it } from 'vitest'
import { LIMITS } from '../src/lang/limits.ts'
import { checkDrawing, drawingIds, drawingWords, parseSvg, type SvgChild, type SvgDrawing } from '../src/lang/svg.ts'

/** A drawing that must parse. */
function drawing(text: string): SvgDrawing {
  const read = parseSvg(text)
  if (read.drawing === undefined) throw new Error(`no drawing: ${JSON.stringify(read.problems)}`)
  return read.drawing
}

/** Everything in a drawing, as text, for checking what did not survive. */
function dump(value: SvgDrawing | undefined): string {
  return JSON.stringify(value ?? null)
}

/** The tags of a tree, in order. */
function tags(children: readonly SvgChild[]): string[] {
  return children.flatMap(child => (typeof child === 'string' ? [] : [child[0], ...tags(child.slice(2) as SvgChild[])]))
}

describe('reading a drawing', () => {
  it('reads elements, attributes, nesting, and text into a tree', () => {
    const read = parseSvg('<svg viewBox="0 0 100 50" fill="#f80"><g transform="translate(1 2)"><circle cx="5" cy="5" r="4"/><text x="1" y="2">Hi <tspan>there</tspan></text></g></svg>')
    expect(read.problems).toEqual([])
    expect(read.drawing?.viewBox).toEqual([0, 0, 100, 50])
    expect(read.drawing?.attrs).toEqual({ fill: '#f80' })
    expect(read.drawing?.children).toEqual([
      ['g', { transform: 'translate(1 2)' }, ['circle', { cx: '5', cy: '5', r: '4' }], ['text', { x: '1', y: '2' }, 'Hi ', ['tspan', {}, 'there']]],
    ])
  })

  it('takes its box from width and height, and says when there is none', () => {
    expect(drawing('<svg width="40" height="20"><rect width="4" height="4"/></svg>').viewBox).toEqual([0, 0, 40, 20])
    const read = parseSvg('<svg><rect width="4" height="4"/></svg>')
    expect(read.drawing?.viewBox).toEqual([0, 0, 320, 200])
    expect(read.problems[0]?.message).toContain('no viewBox')
    expect(parseSvg('<svg viewBox="0 0 0 10"><rect width="4" height="4"/></svg>').drawing?.viewBox).toEqual([0, 0, 320, 200])
  })

  it('accepts elements without a root, and canonical names however they are cased', () => {
    expect(drawing('<circle r="2"/>').children).toEqual([['circle', { r: '2' }]])
    expect(tags(drawing('<svg viewBox="0 0 9 9"><LINEARGRADIENT id="a"><STOP OFFSET="0"/></LINEARGRADIENT></svg>').children)).toEqual(['linearGradient', 'stop'])
    expect(drawing('<svg viewBox="0 0 9 9"><svg:rect VIEWBOX="0 0 1 1" width="1"/></svg>').children).toEqual([['rect', { viewBox: '0 0 1 1', width: '1' }]])
  })

  it('closes what is still open at the end, so a drawing shows as it streams', () => {
    const open = parseSvg('<svg viewBox="0 0 9 9"><g><rect width="1"/><circle r="1"')
    expect(tags(open.drawing?.children ?? [])).toEqual(['g', 'rect'])
    expect(parseSvg('<svg viewBox="0 0 9 9"><circ').drawing).toBeUndefined()
  })

  it('skips comments, declarations, and doctypes, and reads CDATA as text', () => {
    const value = drawing('<?xml version="1.0"?><!DOCTYPE svg><!-- <script>x</script> --><svg viewBox="0 0 9 9"><text><![CDATA[a < b]]></text></svg>')
    expect(value.children).toEqual([['text', {}, 'a < b']])
  })

  it('decodes entities in text and attributes, and tolerates line endings and stray marks', () => {
    expect(drawing('<svg viewBox="0 0 9 9">\r\n<text>a &amp; b &#x4e2d; &bogus; < c</text></svg>').children).toEqual([['text', {}, 'a & b 中 &bogus; ', ' c']])
  })

  it('makes black follow the host text colour and leaves other colours alone', () => {
    const value = drawing('<svg viewBox="0 0 9 9"><path fill="black" stroke="#000"/><path fill="#000000" stroke="rgb(0, 0, 0)"/><path fill="red" stroke="#123456"/></svg>')
    expect(value.children).toEqual([
      ['path', { fill: 'currentColor', stroke: 'currentColor' }],
      ['path', { fill: 'currentColor', stroke: 'currentColor' }],
      ['path', { fill: 'red', stroke: '#123456' }],
    ])
  })

  it('collects the words a drawing shows, without its description', () => {
    expect(drawingWords(drawing('<svg viewBox="0 0 9 9"><title>Lamp</title><desc>long</desc><g><text>On <tspan>off</tspan></text></g></svg>'))).toEqual(['Lamp', 'On', 'off'])
  })

  it('lists the ids of its elements, at any depth, for shapes that place them', () => {
    const ids = drawingIds(drawing('<svg viewBox="0 0 9 9"><defs><g id="arm"><circle id="joint" r="1"/></g></defs><rect id="bad id" width="1"/></svg>'))
    expect([...ids]).toEqual(['arm', 'joint'])
  })

  it('holds its limits and says so', () => {
    const long = parseSvg(`<svg viewBox="0 0 9 9"><rect width="1"/>${' '.repeat(LIMITS.maxSvgChars)}<circle r="1"/></svg>`)
    expect(tags(long.drawing?.children ?? [])).toEqual(['rect'])
    expect(long.problems[0]?.message).toContain('longer than')
    const many = parseSvg(`<svg viewBox="0 0 9 9">${'<g/>'.repeat(LIMITS.maxSvgElements + 5)}</svg>`)
    expect(many.drawing?.children).toHaveLength(LIMITS.maxSvgElements)
    expect(many.problems[0]?.message).toContain('more than')
    const deep = parseSvg(`<svg viewBox="0 0 9 9">${'<g>'.repeat(LIMITS.maxSvgDepth + 4)}</svg>`)
    expect(tags(deep.drawing?.children ?? [])).toHaveLength(LIMITS.maxSvgDepth)
    expect(deep.problems[0]?.message).toContain('nests deeper')
  })
})

describe('what a drawing cannot hold', () => {
  const box = (inner: string): string => `<svg viewBox="0 0 9 9"><rect width="1"/>${inner}</svg>`

  it.each([
    ['a script', '<script>alert(1)</script>'],
    ['a script in capitals', '<SCRIPT>alert(1)</SCRIPT>'],
    ['a prefixed script', '<svg:script>alert(1)</svg:script>'],
    ['a stylesheet', '<style>rect { fill: url(http://x/y) }</style>'],
    ['a link', '<a href="https://x.test"><circle r="1"/></a>'],
    ['an image', '<image href="https://x.test/a.png" width="1"/>'],
    ['an embedded document', '<foreignObject><iframe src="https://x.test"></iframe></foreignObject>'],
    ['an animation that rewrites a link', '<animate attributeName="href" to="javascript:alert(1)"/>'],
    ['a nested svg', '<svg onload="alert(1)"><circle r="1"/></svg>'],
    ['a filter', '<filter id="f"><feImage href="https://x.test/a.png"/></filter>'],
  ])('leaves out %s, with everything inside it', (_name, inner) => {
    const read = parseSvg(box(inner))
    expect(tags(read.drawing?.children ?? [])).toEqual(['rect'])
    expect(dump(read.drawing)).not.toMatch(/alert|x\.test|script|iframe/iu)
    expect(read.problems[0]?.message).toContain('left out')
  })

  it.each([
    ['an event handler', '<rect onclick="alert(1)" width="1"/>', 'onclick'],
    ['a handler in capitals', '<rect ONLOAD="alert(1)" width="1"/>', 'ONLOAD'],
    ['a style', '<rect style="fill:url(https://x.test/a)" width="1"/>', 'style'],
    ['a class', '<rect class="a" width="1"/>', 'class'],
    ['an href on a shape', '<rect href="https://x.test" width="1"/>', 'href'],
  ])('ignores %s and names it', (_name, inner, attribute) => {
    const read = parseSvg(`<svg viewBox="0 0 9 9">${inner}</svg>`)
    expect(read.drawing?.children).toEqual([['rect', { width: '1' }]])
    expect(read.problems[0]?.message).toContain(attribute)
  })

  it.each([
    ['an outside gradient', 'fill="url(https://x.test/a.svg#g)"'],
    ['a scheme hidden in entities', 'fill="url(&#106;avascript:alert(1))"'],
    ['a colour that is not one', 'fill="expression(alert(1))"'],
    ['an outside clip', 'clip-path="url(https://x.test/a.svg#c)"'],
    ['a transform with a url', 'transform="url(https://x.test)"'],
    ['path data with a url', 'd="M0 0 url(https://x.test)"'],
    ['a length with script', 'width="javascript:alert(1)"'],
  ])('drops %s', (_name, attribute) => {
    const value = drawing(`<svg viewBox="0 0 9 9"><path ${attribute} r="1"/></svg>`)
    expect(value.children).toEqual([['path', { r: '1' }]])
    expect(dump(value)).not.toMatch(/x\.test|alert/u)
  })

  it('keeps references inside the drawing, in one spelling', () => {
    const value = drawing(`<svg viewBox="0 0 9 9"><use xlink:href="#a"/><use href="https://x.test#a"/><rect fill='url( "#g" )' clip-path="url(#c)"/></svg>`)
    expect(value.children).toEqual([
      ['use', { href: '#a' }],
      ['use', {}],
      ['rect', { fill: 'url(#g)', 'clip-path': 'url(#c)' }],
    ])
  })

  it('has nothing to draw when nothing survives', () => {
    const read = parseSvg('<svg viewBox="0 0 9 9"><script>alert(1)</script></svg>')
    expect(read.drawing).toBeUndefined()
    expect(read.problems[0]?.message).toContain('script')
    expect(parseSvg('').drawing).toBeUndefined()
  })
})

describe('a drawing read back from a stored program', () => {
  it('passes a compiled drawing through unchanged', () => {
    const value = drawing('<svg viewBox="1 2 30 40" stroke="red"><g id="a"><path d="M0 0" fill="url(#b)"/><text>x</text></g></svg>')
    expect(checkDrawing(JSON.parse(JSON.stringify(value)))).toEqual(value)
  })

  it('holds a forged tree to the same lists', () => {
    const forged = {
      viewBox: [0, 0, 9, 9],
      attrs: { onload: 'alert(1)', fill: 'red', width: '9' },
      children: [
        ['script', {}, 'alert(1)'],
        ['constructor', {}],
        ['rect', { onclick: 'alert(1)', href: 'https://x.test', fill: 'url(https://x.test)', width: '1' }, ['foreignObject', {}]],
        ['use', { href: 'https://x.test#a' }],
        42,
      ],
    }
    expect(checkDrawing(forged)).toEqual({ viewBox: [0, 0, 9, 9], attrs: { fill: 'red' }, children: [['rect', { width: '1' }], ['use', {}]] })
  })

  it('refuses what is not a drawing', () => {
    for (const value of [undefined, null, 'x', [], {}, { viewBox: [0, 0, 1], children: [] }, { viewBox: [0, 0, -1, 1], children: [] }, { viewBox: [0, 0, 1, 1] }]) {
      expect(checkDrawing(value)).toBeUndefined()
    }
  })

  it('holds its limits on a forged tree', () => {
    let deep: unknown[] = ['g', {}]
    for (let index = 0; index < LIMITS.maxSvgDepth + 5; index += 1) deep = ['g', {}, deep]
    const checked = checkDrawing({ viewBox: [0, 0, 9, 9], attrs: {}, children: [deep] })
    expect(tags(checked?.children ?? [])).toHaveLength(LIMITS.maxSvgDepth)
    const wide = checkDrawing({ viewBox: [0, 0, 9, 9], attrs: {}, children: Array.from({ length: LIMITS.maxSvgElements + 5 }, () => ['g', {}]) })
    expect(wide?.children).toHaveLength(LIMITS.maxSvgElements)
  })
})
