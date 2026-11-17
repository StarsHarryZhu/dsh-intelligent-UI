/**
 * The frame runtime, run the way a frame runs it: the built script inside the
 * document `frameDocument` writes, in a DOM of its own. What only a real
 * browser has — the sandbox, the content policy, blob addresses, import maps —
 * is covered by the browser check in docs/VERIFY.md.
 */

import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { frameDocument } from '../src/client/document.ts'
import { CHANNEL } from '../src/widget/messages.ts'
import { framePolicy, LIMITS } from '../src/widget/policy.ts'
import { bundledText } from './helpers.ts'

const PARTS = { runtime: bundledText('frame/main.runtime'), css: bundledText('frame/base.css'), policy: framePolicy() }

/** One frame under test. */
interface Frame {
  window: JSDOM['window'] & Record<string, any>
  document: Document
  /** Messages the frame posted to the page, in order. */
  out: Array<Record<string, any>>
  /** Deliver a message as the page would. */
  post(message: Record<string, unknown>): void
  /** Let queued frames and promises run. */
  settle(): Promise<void>
  /** Messages of one type. */
  sent(type: string): Array<Record<string, any>>
}

/** Open a frame's document and take the page's side of its channel. */
function openFrame(loadResources = false): Frame {
  const dom = new JSDOM(frameDocument(PARTS, { vars: { '--text-primary': 'rgb(10, 10, 10)' }, dark: false, lang: 'en' }), {
    runScripts: 'dangerously',
    ...(loadResources ? { resources: 'usable' as const } : {}),
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  })
  const window = dom.window as Frame['window']
  const out: Frame['out'] = []
  // A top-level document is its own parent, so what the frame posts arrives here.
  window.postMessage = ((data: Record<string, any>) => { out.push(data) }) as never
  window.CSS ??= { escape: (text: string) => text.replace(/["\\]/gu, '\\$&') }
  return {
    window,
    document: window.document,
    out,
    post: (message) => { window.dispatchEvent(new window.MessageEvent('message', { data: { channel: CHANNEL, ...message }, source: window as never })) },
    settle: () => new Promise((resolve) => { setTimeout(resolve, 60) }),
    sent: type => out.filter(message => message.t === type),
  }
}

/** Open a frame and run a whole widget in it. */
async function run(html: string, extra: Record<string, unknown> = {}, loadResources = false): Promise<Frame> {
  const frame = openFrame(loadResources)
  // The page sends a widget only after the frame's own document has loaded.
  await frame.settle()
  frame.post({ t: 'render', html, final: true, ...extra })
  await frame.settle()
  return frame
}

describe('the document a frame opens with', () => {
  it('holds one script, the runtime, and an empty body', () => {
    const frame = openFrame()
    expect(frame.document.querySelectorAll('script')).toHaveLength(1)
    expect(frame.document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toBe(framePolicy())
    expect(frame.document.body.childNodes).toHaveLength(0)
    expect(frame.document.documentElement.lang).toBe('en')
  })

  it('gives the widget its helpers before any of its code runs', () => {
    const { window } = openFrame()
    expect(typeof window.sendPrompt).toBe('function')
    expect(typeof window.openLink).toBe('function')
    expect(Object.keys(window.dsh).sort()).toEqual(['math', 'state', 'theme'])
    expect(Object.keys(window.dsh.math).sort()).toEqual(['binomial', 'derivative', 'erf', 'factorial', 'gamma', 'integrate', 'limit', 'root'])
    expect(window.dsh.math.integrate((x: number) => x * x, 0, 3)).toBeCloseTo(9, 10)
    expect(window.dsh.math.derivative((x: number) => x ** 3, 2)).toBeCloseTo(12, 6)
    expect(window.dsh.math.limit((x: number) => Math.sin(x) / x, 0)).toBeCloseTo(1, 8)
    expect(window.dsh.math.root((x: number) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 12)
  })
})

describe('while the source streams in', () => {
  it('shows each prefix without running any script', async () => {
    const frame = openFrame()
    frame.post({ t: 'render', html: '<p id="a">One</p><script>window.ranEarly = true</script><button onclick="window.clicked = true" id="b">Go</button>', final: false })
    await frame.settle()
    expect(frame.document.getElementById('a')?.textContent).toBe('One')
    expect(frame.window.ranEarly).toBeUndefined()
    expect(frame.sent('ran')).toEqual([])
    expect(frame.sent('height').length).toBeGreaterThan(0)
  })

  it('leaves inline event handlers off until the source is whole', async () => {
    const frame = openFrame()
    const html = '<button id="b" onclick="window.clicked = true">Go</button><img id="i" onload="window.loaded = true" onerror="window.failed = true" src="data:,">'
    frame.post({ t: 'render', html, final: false })
    await frame.settle()
    expect(frame.document.getElementById('b')?.hasAttribute('onclick')).toBe(false)
    expect(frame.document.getElementById('i')?.hasAttribute('onerror')).toBe(false)
    ;(frame.document.getElementById('b') as HTMLElement).click()
    expect(frame.window.clicked).toBeUndefined()
    frame.post({ t: 'render', html, final: true })
    await frame.settle()
    ;(frame.document.getElementById('b') as HTMLElement).click()
    expect(frame.window.clicked).toBe(true)
  })

  it('reports no error before the widget runs', async () => {
    const frame = openFrame()
    frame.post({ t: 'render', html: '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/x@1/x.css">', final: false })
    frame.window.dispatchEvent(new frame.window.Event('error'))
    frame.document.querySelector('link')?.dispatchEvent(new frame.window.Event('error'))
    await frame.settle()
    expect(frame.sent('error')).toEqual([])
  })

  it('keeps the nodes it already has and adds what is new', async () => {
    const frame = openFrame()
    frame.post({ t: 'render', html: '<div class="card"><h3>Cost</h3><p>Sea', final: false })
    const card = frame.document.querySelector('.card')
    const heading = frame.document.querySelector('h3')
    frame.post({ t: 'render', html: '<div class="card wide"><h3>Cost</h3><p>Seats: 8</p><p>New</p></div><ul><li>a</li></ul>', final: false })
    expect(frame.document.querySelector('.card')).toBe(card)
    expect(frame.document.querySelector('h3')).toBe(heading)
    expect(card?.className).toBe('card wide')
    expect([...frame.document.querySelectorAll('p')].map(p => p.textContent)).toEqual(['Seats: 8', 'New'])
    expect(frame.document.querySelectorAll('li')).toHaveLength(1)
    frame.post({ t: 'render', html: '<p>Only this</p>', final: false })
    expect(frame.document.body.innerHTML).toBe('<p>Only this</p>')
  })
})

describe('once the source is whole', () => {
  it('runs the scripts once, in order, with the page looking as if it had just loaded', async () => {
    const frame = await run(`<p id="out"></p>
<script>window.order = ['first:' + document.readyState]; document.addEventListener('DOMContentLoaded', () => { window.order.push('ready:' + document.readyState) }); window.addEventListener('load', () => { window.order.push('load:' + document.readyState) })</script>
<script type="application/json" id="rows">[1, 2, 3]</script>
<script>window.order.push('second'); document.getElementById('out').textContent = JSON.parse(document.getElementById('rows').textContent).length</script>`)
    expect(frame.window.order).toEqual(['first:loading', 'second', 'ready:interactive', 'load:complete'])
    expect(frame.document.getElementById('out')?.textContent).toBe('3')
    expect(frame.sent('ran')).toHaveLength(1)
  })

  it('waits for a written external script before the next one, as the parser would', async () => {
    const frame = await run(`<script>window.order = ['first']</script>
<script src="data:text/javascript,window.order.push('external')"></script>
<script src="data:text/javascript,window.order.push('async')" async></script>
<script>window.order.push('after')</script>`, {}, true)
    await frame.settle()
    const order = frame.window.order as string[]
    expect(order.filter(entry => entry !== 'async')).toEqual(['first', 'external', 'after'])
    expect(order).toContain('async')
  })

  it('ignores every later render, so a widget cannot be swapped under the reader', async () => {
    const frame = await run('<p id="a">Kept</p><script>window.runs = (window.runs ?? 0) + 1</script>')
    frame.post({ t: 'render', html: '<p id="a">Changed</p><script>window.runs += 1</script>', final: true })
    await frame.settle()
    expect(frame.document.getElementById('a')?.textContent).toBe('Kept')
    expect(frame.window.runs).toBe(1)
    expect(frame.sent('ran')).toHaveLength(1)
  })

  it('reports a script\'s error and goes on to the next script', async () => {
    const frame = await run('<p id="out">before</p>\n<script>\nmissingFunction()\n</script>\n<script>document.getElementById("out").textContent = "after"</script>')
    expect(frame.document.getElementById('out')?.textContent).toBe('after')
    const errors = frame.sent('error')
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toMatch(/missingFunction is not defined/u)
  })

  it('reports at most five errors', async () => {
    const frame = await run(Array.from({ length: 9 }, (_, index) => `<script>fail${index}()</script>`).join('\n'))
    expect(frame.sent('error')).toHaveLength(5)
  })
})

describe('what a widget keeps', () => {
  it('hands back the kept state as a copy, and posts each new value', async () => {
    const frame = await run('<script>window.first = dsh.state.get(); window.first.count = 99; window.second = dsh.state.get()</script>', { state: { count: 2 } })
    expect(frame.window.second).toEqual({ count: 2 })
    expect(frame.window.dsh.state.set({ count: 3, list: ['a'] })).toBe(true)
    expect(frame.sent('state').at(-1)?.value).toEqual({ count: 3, list: ['a'] })
    expect(frame.window.dsh.state.get()).toEqual({ count: 3, list: ['a'] })
  })

  it('has no state before the widget sets one', async () => {
    const frame = await run('<script>window.first = dsh.state.get()</script>')
    expect(frame.window.first).toBeUndefined()
  })

  it('refuses a state that is not JSON or is too large, and says so', async () => {
    const frame = await run('<p>x</p>')
    expect(frame.window.dsh.state.set('x'.repeat(LIMITS.maxStateChars))).toBe(false)
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(frame.window.dsh.state.set(loop)).toBe(false)
    expect(frame.sent('state')).toEqual([])
    expect(frame.sent('error')[0]?.message).toMatch(/dsh\.state\.set/u)
  })

  it('puts kept control values back before the scripts read them, then tells the scripts', async () => {
    const frame = await run(`<input id="seats" type="range" min="1" max="50" value="8"><input id="agree" type="checkbox">
<select id="plan"><option value="a">A</option><option value="b">B</option></select><textarea id="note"></textarea><span id="out"></span>
<script>
window.atStart = [seats.value, agree.checked, plan.value, note.value]
window.heard = 0
seats.addEventListener('input', () => { window.heard += 1; out.textContent = seats.value })
</script>`, { controls: { seats: '20', agree: true, plan: 'b', note: 'hello', gone: 'x', out: 'not a control' } })
    expect(frame.window.atStart).toEqual(['20', true, 'b', 'hello'])
    expect(frame.window.heard).toBe(1)
    expect(frame.document.getElementById('out')?.textContent).toBe('20')
  })

  it('posts the values of controls with an id as the reader changes them', async () => {
    const frame = await run(`<input id="name"><input id="agree" type="checkbox"><input type="text" class="anonymous">
<input id="secret" type="password"><div data-keep="false"><input id="scratch"></div>
<select id="many" multiple><option value="a">A</option><option value="b">B</option><option value="c">C</option></select>`)
    const type = (id: string, value: string): void => {
      const input = frame.document.getElementById(id) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new frame.window.Event('input', { bubbles: true }))
    }
    type('name', 'Ada')
    type('secret', 'hunter2')
    type('scratch', 'draft')
    ;(frame.document.querySelector('.anonymous') as HTMLInputElement).dispatchEvent(new frame.window.Event('input', { bubbles: true }))
    const box = frame.document.getElementById('agree') as HTMLInputElement
    box.click()
    const many = frame.document.getElementById('many') as HTMLSelectElement
    ;(many.options[0] as HTMLOptionElement).selected = true
    ;(many.options[2] as HTMLOptionElement).selected = true
    many.dispatchEvent(new frame.window.Event('change', { bubbles: true }))
    await frame.settle()
    expect(frame.sent('controls').at(-1)?.value).toEqual({ name: 'Ada', agree: true, many: ['a', 'c'] })
  })

  it('keeps a radio group as each button\'s own state', async () => {
    const frame = await run('<input type="radio" name="p" id="p1" value="1" checked><input type="radio" name="p" id="p2" value="2"><input type="radio" name="p" value="3">')
    ;(frame.document.getElementById('p2') as HTMLInputElement).click()
    await frame.settle()
    expect(frame.sent('controls').at(-1)?.value).toEqual({ p1: false, p2: true })
  })
})

describe('what a widget may ask of the page', () => {
  it('asks to send a message from sendPrompt and from a data-prompt element', async () => {
    const frame = await run('<button id="a" data-prompt="  Explain step 2  "><b id="inner">Explain</b></button><button id="b" data-prompt=" ">Empty</button><button id="c">Next</button><script>c.addEventListener("click", () => { sendPrompt("Next question") })</script>')
    ;(frame.document.getElementById('inner') as HTMLElement).click()
    ;(frame.document.getElementById('b') as HTMLElement).click()
    ;(frame.document.getElementById('c') as HTMLElement).click()
    expect(frame.sent('send').map(message => message.text)).toEqual(['Explain step 2', 'Next question'])
  })

  it('asks the page to open a link instead of leaving its document', async () => {
    const frame = await run('<a id="out" href="https://example.org/paper?x=1">Paper</a><a id="hash" href="#part">Part</a><a id="js" href="javascript:void 0">No</a><a id="mail" href="mailto:a@example.org">Mail</a><p id="part"></p>')
    const clicked = ['out', 'hash', 'js', 'mail'].map((id) => {
      const event = new frame.window.MouseEvent('click', { bubbles: true, cancelable: true })
      frame.document.getElementById(id)?.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(clicked).toEqual([true, false, true, true])
    expect(frame.sent('open').map(message => message.url)).toEqual(['https://example.org/paper?x=1'])
    frame.window.openLink('https://example.org/direct')
    expect(frame.sent('open').at(-1)?.url).toBe('https://example.org/direct')
  })

  it('sends a data-send form as one message and never submits it', async () => {
    const frame = await run(`<form id="quiz" data-send="Quiz answer">
<fieldset><legend>Closest planet</legend>
<label><input type="radio" name="planet" value="Mercury"> Mercury</label>
<label><input type="radio" name="planet" value="Venus" checked> Venus</label></fieldset>
<label>Why? <input name="why" value="  It is second  "></label>
<label><input type="checkbox" name="sure" checked> I am sure</label><label><input type="checkbox" name="unsure"> Not sure</label>
<input name="blank" value="">
<input name="pin" type="password" value="1234"><input name="off" value="unused" disabled>
<select name="plan"><option>Free</option><option value="pro" selected>Pro plan</option></select>
<input name="extra_notes" value="none" data-label="Notes">
<fieldset><legend>Seen</legend><label><input type="checkbox" name="seen" checked> Mars</label><label><input type="checkbox" name="seen" checked> Jupiter</label></fieldset>
<button id="go">Send</button></form>`)
    const submit = new frame.window.Event('submit', { bubbles: true, cancelable: true })
    frame.document.getElementById('quiz')?.dispatchEvent(submit)
    expect(submit.defaultPrevented).toBe(true)
    expect(frame.sent('send').map(message => message.text)).toEqual(['Quiz answer — Closest planet: Venus · Why?: It is second · Sure: I am sure · Plan: pro · Notes: none · Seen: Mars, Jupiter'])
  })

  it('leaves a form without data-send to the widget\'s own code', async () => {
    const frame = await run('<form id="f"><input name="a" value="1"></form><script>f.addEventListener("submit", (event) => { event.preventDefault(); window.handled = true })</script>')
    frame.document.getElementById('f')?.dispatchEvent(new frame.window.Event('submit', { bubbles: true, cancelable: true }))
    expect(frame.window.handled).toBe(true)
    expect(frame.sent('send')).toEqual([])
  })
})

describe('messages to the frame', () => {
  it('follows the page\'s theme and tells the widget', async () => {
    const frame = await run('<script>window.themes = []; window.addEventListener("dsh:theme", (event) => { window.themes.push([event.detail.dark, dsh.theme]) })</script>')
    frame.post({ t: 'theme', dark: true, lang: 'zh-CN', vars: { '--text-primary': 'rgb(240, 240, 240)', '--surface-1': 'red;} body{display:none', 'color': 'red', '--x': 5 } })
    expect(frame.document.documentElement.dataset.theme).toBe('dark')
    expect(frame.document.documentElement.lang).toBe('zh-CN')
    expect(frame.document.getElementById('dsh-theme')?.textContent).toBe(':root{--text-primary:rgb(240, 240, 240)}')
    expect(frame.window.themes).toEqual([[true, 'dark']])
    frame.post({ t: 'theme', dark: false, lang: '"><script>', vars: {} })
    expect(frame.document.documentElement.dataset.theme).toBe('light')
    expect(frame.document.documentElement.lang).toBe('zh-CN')
  })

  it('takes messages only from the page, and only of this protocol', async () => {
    const frame = openFrame()
    const html = '<p id="a">Shown</p>'
    frame.window.dispatchEvent(new frame.window.MessageEvent('message', { data: { channel: CHANNEL, t: 'render', html, final: false }, source: null }))
    frame.window.dispatchEvent(new frame.window.MessageEvent('message', { data: { channel: 'other', t: 'render', html, final: false }, source: frame.window as never }))
    frame.window.dispatchEvent(new frame.window.MessageEvent('message', { data: 'render', source: frame.window as never }))
    frame.post({ t: 'render', html: 7, final: false })
    expect(frame.document.body.childNodes).toHaveLength(0)
    frame.post({ t: 'render', html, final: false })
    expect(frame.document.getElementById('a')?.textContent).toBe('Shown')
  })
})
