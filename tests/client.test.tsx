// @vitest-environment jsdom
/**
 * The browser half, driven through its real registration path with real React.
 *
 * The built bundle is loaded the way the page loads it — a `__ModuleLoader__.load`
 * registration, a factory that receives the module table's `require`, then
 * `apply(ctx)` called exactly as cordis calls it, with no React argument.
 *
 * A widget's code never runs here: jsdom does not load a frame's `srcdoc`. These
 * tests cover the page's side — the frame element, what the page posts into it,
 * and how it treats what comes back. The frame's side is `runtime.test.ts`, and
 * the two together in a real browser are the check in docs/VERIFY.md.
 */

import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXAMPLE } from '../src/host/model-brief.ts'
import { buildPresentationMeta, createUIRenderTool } from '../src/host/tool.ts'
import { readArguments } from '../src/client/card-node.ts'
import { createEditsStore, readMemory, type StorageLike } from '../src/client/edits.ts'
import { createLibraryLoader } from '../src/client/libraries.ts'
import { readMeta } from '../src/client/read.ts'
import { readTheme } from '../src/client/theme.ts'
import type { Library } from '../src/widget/libs.ts'
import { CHANNEL } from '../src/widget/messages.ts'
import { FRAME_SANDBOX, framePolicy, LIMITS } from '../src/widget/policy.ts'
import { clientBundle } from './helpers.ts'

type Component = (props: Record<string, unknown>) => React.ReactNode

/** What `apply` registered, plus the cleanup cordis would run on unload. */
interface Loaded {
  exports: Record<string, unknown>
  ToolView: Component
  /** The renderer of a widget in the reply, registered under the card node kind. */
  CardNode: Component
  /** The data-only Definition that collects a turn's cards. */
  definition: Record<string, any>
  /** The Definition that places each card in the reply. */
  cardDefinition: Record<string, any>
  registrations: Array<Record<string, unknown>>
  definitions: Array<Record<string, any>>
  dictionaries: string[]
  /** Lazy files the bundle asked the host for. */
  chunks: string[]
  /** The conversation service of `session-1`, the only session the fake host has. */
  conversation: { send: ReturnType<typeof vi.fn<(text: string) => Promise<void>>> }
  dispose(): void
}

/** The bundle's registration with the page's module loader. */
interface Registration {
  id: string
  factory: (require: (request: string) => unknown) => Record<string, unknown>
}

/** Run the built bundle as a page script, with the page's real `window`, and take what it registers. */
function registerBundle(): Registration {
  let registration: Registration | undefined
  const page = window as unknown as { __ModuleLoader__?: unknown }
  page.__ModuleLoader__ = { load: (value: Registration) => { registration = value } }
  try {
    new Function(clientBundle())()
  } finally {
    delete page.__ModuleLoader__
  }
  if (registration === undefined) throw new Error('the bundle did not register itself')
  return registration
}

/** Load the built bundle and activate it against a fake host context. */
function loadClient(lazy?: (request: string) => Promise<unknown>): Loaded {
  const registration = registerBundle()
  expect(registration.id).toBe('dsh-intelligent-ui')
  const chunks: string[] = []
  const hostRequire = (request: string): unknown => {
    if (request === 'react') return React
    if (request === 'react/jsx-runtime') return JsxRuntime
    if (request === 'react-dom') return ReactDom
    throw new Error(`unexpected require: ${request}`)
  }
  if (lazy !== undefined) (hostRequire as { async?: unknown }).async = (request: string) => { chunks.push(request); return lazy(request) }
  const exports = registration.factory(hostRequire)
  const registrations: Array<Record<string, unknown>> = []
  const disposers: Array<() => void> = []
  const definitions: Array<Record<string, any>> = []
  const dictionaries: string[] = []
  const conversation = { send: vi.fn(async (_text: string) => undefined) }
  const services: Record<string, unknown> = {
    slots: {
      inject: (_name: string, callback: () => unknown) => { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose as () => void) },
      register: (options: Record<string, unknown>, component: unknown) => {
        const entry = { ...options, component }
        registrations.push(entry)
        return () => { registrations.splice(registrations.indexOf(entry), 1) }
      },
    },
    locale: { register: (namespace: string) => { dictionaries.push(namespace); return () => { dictionaries.splice(dictionaries.indexOf(namespace), 1) } } },
    uiConversation: { events: { register: (definition: Record<string, any>) => { definitions.push(definition); return () => { definitions.splice(definitions.indexOf(definition), 1) } } } },
    sessions: { scope: (id: string) => (id === 'session-1' ? { get: (name: string) => (name === 'conversation' ? conversation : undefined) } : undefined) },
  }
  const ctx = {
    get: (name: string) => services[name],
    effect: (execute: () => unknown) => { const dispose = execute(); if (typeof dispose === 'function') disposers.push(dispose as () => void) },
    inject: (deps: string[], callback: (scope: unknown) => void) => { if (deps.every(dep => services[dep] !== undefined)) callback(ctx) },
  }
  ;(exports.apply as (...args: unknown[]) => void)(ctx, undefined)
  const row = registrations.find(entry => entry.name === 'tool.call.toolview')
  const node = registrations.find(entry => entry.name === 'conversation.chat.node')
  return {
    exports,
    ToolView: row?.component as Component,
    CardNode: node?.component as Component,
    definition: definitions.find(entry => entry.kind === 'dsh-intelligent-ui') as Record<string, any>,
    cardDefinition: definitions.find(entry => entry.kind === 'dsh-intelligent-ui.card') as Record<string, any>,
    registrations,
    definitions,
    dictionaries,
    chunks,
    conversation,
    dispose: () => { for (const dispose of disposers.reverse()) dispose() },
  }
}

/** Check a source through the real host tool and return the persisted meta. */
async function settle(source: string, extra: { title?: string; revises?: string } = {}, callId = 'call-settle'): Promise<Record<string, unknown>> {
  const tool = createUIRenderTool()
  const args = { source, ...extra }
  const value = await tool.execute(args, { callId } as never)
  return buildPresentationMeta(args, value) as Record<string, unknown>
}

/** A source that does not pass the host's check. */
const BROKEN = '<p>Total</p>\n<script>const total = </script>'

/** The host's disclosure hook: collapsed until something opens it. */
function useHostDisclosure(): { expanded: boolean; setExpanded(open: boolean): void; toggle(): void } {
  const [expanded, setExpanded] = React.useState(false)
  return { expanded, setExpanded, toggle: () => { setExpanded(open => !open) } }
}

/** A session kit: the session id, and the composer props the host passes, with a draft in it. */
function kit(draft = '') {
  const inputActions = { setDraft: vi.fn(), submit: vi.fn() }
  const useInput = <S,>(selector: (state: { draft: string; phase: string }) => S): S => selector({ draft, phase: 'plain' })
  return { sessionId: 'session-1', inputActions, useInput }
}

/** A settled result block. */
function resultBlock(meta: unknown, time = Date.now(), extra: Record<string, unknown> = {}) {
  return { kind: 'tool-result', callId: 'call-1', time, meta, isError: false, content: [{ type: 'text', text: 'ok' }], ...extra }
}

/** The location of a node in a turn whose published cards are `cards`. */
function inTurn(cards: unknown[], turn = 1) {
  return { kind: 'step', turn: { turn, data: { get: () => ({ cards }) } } }
}

/** A card node as the Definition builds it once the call has settled. */
function settledNode(callId: string, meta: unknown, location: unknown = inTurn([])) {
  return { key: `card:${callId}`, kind: 'dsh-intelligent-ui.card', data: { callId, phase: 'result', args: '', meta }, location }
}

/** A card node while its call's arguments stream in. */
function streamingNode(callId: string, args: Record<string, string>, cut = 0) {
  const text = JSON.stringify(args)
  return { key: `card:${callId}`, kind: 'dsh-intelligent-ui.card', data: { callId, phase: 'preparing', args: text.slice(0, text.length - cut) }, location: inTurn([]) }
}

/** A streaming args reader whose text grows as the test appends to it. */
function streamingArgs(text: { source: string }) {
  return { text: (key: string) => (key === 'source' ? text.source : undefined) }
}

/** The page's side of one widget's frame. */
interface FrameSide {
  iframe: HTMLIFrameElement
  /** What the page posted into the frame, in order. */
  posted: Array<Record<string, any>>
  /** Target origins the page posted with. */
  origins: unknown[]
  /** Messages of one type. */
  of(type: string): Array<Record<string, any>>
  /** Deliver a message as the frame's window would. */
  say(message: Record<string, unknown>): void
  /** Wait until the page has posted the whole source. */
  ran(): Promise<void>
}

/** Take the page's side of the frame inside `container`, before its document has loaded. */
function frameIn(container: ParentNode): FrameSide {
  const iframe = container.querySelector('iframe')
  if (iframe === null) throw new Error('no frame was drawn')
  const posted: FrameSide['posted'] = []
  const origins: unknown[] = []
  vi.spyOn(iframe.contentWindow as Window, 'postMessage').mockImplementation(((message: Record<string, any>, origin: unknown) => {
    posted.push(message)
    origins.push(origin)
  }) as never)
  const of = (type: string): FrameSide['posted'] => posted.filter(message => message.t === type)
  return {
    iframe,
    posted,
    origins,
    of,
    say: (message) => {
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: { channel: CHANNEL, ...message }, source: iframe.contentWindow })) })
    },
    ran: async () => {
      await waitFor(() => { expect(of('render').some(message => message.final === true)).toBe(true) })
    },
  }
}

/** Make the frame the focused element, as a click inside it does. */
function clickInside(iframe: HTMLIFrameElement): void {
  act(() => { iframe.focus() })
  expect(document.activeElement).toBe(iframe)
}

/** In-memory storage. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value) }, removeItem: (key) => { map.delete(key) } }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // What widgets keep outlives the page; each test starts from a clean browser.
  localStorage.clear()
  document.head.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]').forEach(style => style.remove())
  document.body.removeAttribute('data-ds-dark-theme')
  document.body.removeAttribute('style')
})

describe('activation through the real contract', () => {
  it('registers every contribution from apply(ctx) alone', () => {
    const client = loadClient()
    expect(client.exports.name).toBe('dsh-intelligent-ui')
    expect(client.exports.inject).toEqual(['slots', 'locale'])
    expect(client.registrations.map(entry => [entry.name, entry.key ?? entry.id])).toEqual([
      ['tool.call.toolview', 'ui_render'],
      ['conversation.chat.node', 'dsh-intelligent-ui.card'],
    ])
    expect(client.definition.kind).toBe('dsh-intelligent-ui')
    expect(client.cardDefinition).toMatchObject({ kind: 'dsh-intelligent-ui.card', target: 'chat' })
    expect(client.dictionaries).toEqual(['dsh-intelligent-ui'])
    expect(document.head.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]')).toHaveLength(1)
  })

  it('leaves nothing behind when the plugin is unloaded', () => {
    const client = loadClient()
    client.dispose()
    expect(client.registrations).toEqual([])
    expect(client.definitions).toEqual([])
    expect(client.dictionaries).toEqual([])
    expect(document.head.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]')).toHaveLength(0)
  })

  it('logs instead of throwing when a service is missing', () => {
    const exports = registerBundle().factory(request => (request === 'react' ? React : JsxRuntime))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => (exports.apply as (ctx: unknown) => void)({ get: () => undefined })).not.toThrow()
    expect(error).toHaveBeenCalled()
  })
})

describe('a widget stands in a sandboxed frame', () => {
  it('draws one frame with no powers beyond scripts and form events', async () => {
    const { CardNode } = loadClient()
    const view = render(<CardNode node={settledNode('call-1', await settle(EXAMPLE))} {...kit()} />)
    const frames = view.container.querySelectorAll('iframe')
    expect(frames).toHaveLength(1)
    const iframe = frames[0] as HTMLIFrameElement
    expect(iframe.getAttribute('sandbox')).toBe(FRAME_SANDBOX)
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    expect(iframe.getAttribute('allow')).toBe('')
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(iframe.hasAttribute('src')).toBe(false)
    expect(iframe.getAttribute('title')).toBe('Interactive widget')
    expect(view.container.querySelector('[data-dsh-intelligent-ui="reply"]')?.getAttribute('data-state')).toBe('ready')
  })

  it('opens the frame on a document that holds the policy and the runtime, and none of the widget', async () => {
    const { CardNode } = loadClient()
    const view = render(<CardNode node={settledNode('call-1', await settle(EXAMPLE))} {...kit()} />)
    const srcdoc = view.container.querySelector('iframe')?.getAttribute('srcdoc') ?? ''
    expect(srcdoc.startsWith('<!doctype html>')).toBe(true)
    expect(srcdoc).toContain(`<meta http-equiv="Content-Security-Policy" content="${framePolicy()}">`)
    expect(srcdoc).toContain('sendPrompt')
    expect(srcdoc).not.toContain('Compare this with the annual plan')
    // Nothing in the runtime's text can end its script early or keep it from ending.
    expect(srcdoc).not.toContain('<!--')
    expect(srcdoc.match(/<script/giu)).toHaveLength(1)
    expect(srcdoc.match(/<\/script/giu)).toHaveLength(1)
    const parsed = new DOMParser().parseFromString(srcdoc, 'text/html')
    expect(parsed.querySelectorAll('script')).toHaveLength(1)
    expect(parsed.body.childNodes).toHaveLength(0)
  })

  it('never puts the model\'s markup into the page itself', async () => {
    const { CardNode, ToolView } = loadClient()
    const meta = await settle('<p id="model-wrote-this">Hello</p><img src="x" onerror="window.pwned = true"><script>window.pwned = true</script>')
    const view = render(<><ToolView phase="result" block={resultBlock(meta)} callId="call-1" {...kit()} /><CardNode node={settledNode('call-1', meta)} {...kit()} /></>)
    await frameIn(view.container).ran()
    expect(document.getElementById('model-wrote-this')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
    expect(document.body.innerHTML).not.toContain('pwned')
    expect((window as { pwned?: unknown }).pwned).toBeUndefined()
  })

  it('hands the frame its theme and the source by message, and nothing else of the page', async () => {
    const { CardNode } = loadClient()
    const meta = await settle(EXAMPLE, { title: 'Seats' })
    const view = render(<CardNode node={settledNode('call-secret-id', meta)} {...kit()} />)
    const frame = frameIn(view.container)
    await frame.ran()
    expect(frame.posted.map(message => message.t)).toEqual(['theme', 'render'])
    expect(frame.origins).toEqual(['*', '*'])
    expect(Object.keys(frame.posted[0] as object).sort()).toEqual(['channel', 'dark', 'lang', 't', 'vars'])
    expect(frame.posted[1]).toEqual({ channel: CHANNEL, t: 'render', html: EXAMPLE, final: true })
    expect(JSON.stringify(frame.posted)).not.toMatch(/session-1|call-secret-id/u)
  })

  it('draws nothing for a failed check, an errored call, or an empty source', async () => {
    const { CardNode } = loadClient()
    for (const meta of [await settle(BROKEN), {}, { version: 2, ok: true, source: '  \n' }, { version: 3, ok: true, source: '<p>from a later build</p>' }, undefined]) {
      const view = render(<CardNode node={settledNode('call-x', meta)} {...kit()} />)
      expect(view.container.innerHTML, JSON.stringify(meta)).toBe('')
      cleanup()
    }
  })

  it('removes a frame that loads a second document, and says why', async () => {
    const { CardNode } = loadClient()
    const view = render(<CardNode node={settledNode('call-1', await settle(EXAMPLE))} {...kit()} />)
    const frame = frameIn(view.container)
    await frame.ran()
    act(() => { fireEvent.load(frame.iframe) })
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(screen.getByText('This widget tried to leave its frame, so it is no longer shown.')).toBeTruthy()
  })

  it('waits to load a settled widget until it is near the screen, holding its place', async () => {
    const observers: Array<{ callback: (entries: Array<{ isIntersecting: boolean }>) => void; options: { rootMargin?: string }; disconnected: boolean }> = []
    vi.stubGlobal('IntersectionObserver', class {
      private readonly entry: (typeof observers)[number]
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void, options: { rootMargin?: string } = {}) {
        this.entry = { callback, options, disconnected: false }
        observers.push(this.entry)
      }

      observe(): void { /* The test decides when the holder comes near. */ }
      disconnect(): void { this.entry.disconnected = true }
    })
    const { CardNode } = loadClient()
    const view = render(<CardNode node={settledNode('call-1', await settle(EXAMPLE))} {...kit()} />)
    expect(view.container.querySelector('iframe')).toBeNull()
    const holder = view.container.querySelector('.dsh-iui-frame-holder') as HTMLElement
    expect(holder.style.minHeight).toBe('120px')
    expect(observers[0]?.options.rootMargin).toBe('800px 0px')
    act(() => { observers[0]?.callback([{ isIntersecting: false }]) })
    expect(view.container.querySelector('iframe')).toBeNull()
    act(() => { observers[0]?.callback([{ isIntersecting: true }]) })
    expect(view.container.querySelector('iframe')).not.toBeNull()
    expect(observers[0]?.disconnected).toBe(true)
    // A widget still streaming is on screen by definition: it loads at once.
    cleanup()
    const live = render(<CardNode node={streamingNode('call-2', { source: '<p>Hi</p>' })} {...kit()} />)
    expect(live.container.querySelector('iframe')).not.toBeNull()
  })
})

describe('while the source streams in', () => {
  it('sends each longer prefix to the same frame, then the whole source once', async () => {
    const { CardNode } = loadClient()
    const source = '<div class="card"><p>Seats</p><p id="total"></p></div>\n<script>total.textContent = 8 * 29</script>'
    const view = render(<CardNode node={streamingNode('call-s', { source }, 60)} {...kit()} />)
    expect(view.container.querySelector('[data-dsh-intelligent-ui="reply"]')?.getAttribute('data-state')).toBe('running')
    const frame = frameIn(view.container)
    await waitFor(() => { expect(frame.of('render')).toHaveLength(1) })
    expect(frame.of('render')[0]).toEqual({ channel: CHANNEL, t: 'render', html: readArguments(JSON.stringify({ source }).slice(0, -60)).source, final: false })
    view.rerender(<CardNode node={streamingNode('call-s', { source }, 20)} {...kit()} />)
    await waitFor(() => { expect(frame.of('render')).toHaveLength(2) })
    expect(source.startsWith(frame.of('render')[1]?.html as string)).toBe(true)
    expect((frame.of('render')[1]?.html as string).length).toBeGreaterThan((frame.of('render')[0]?.html as string).length)
    view.rerender(<CardNode node={settledNode('call-s', await settle(source))} {...kit()} />)
    await frame.ran()
    expect(view.container.querySelector('iframe')).toBe(frame.iframe)
    expect(frame.of('render').at(-1)).toEqual({ channel: CHANNEL, t: 'render', html: source, final: true })
    view.rerender(<CardNode node={settledNode('call-s', await settle(source))} {...kit()} />)
    await new Promise((resolve) => { setTimeout(resolve, 80) })
    expect(frame.of('render').filter(message => message.final === true)).toHaveLength(1)
  })

  it('cleans a streamed prefix the way the host cleans the whole source', async () => {
    const { CardNode } = loadClient()
    const view = render(<CardNode node={streamingNode('call-s', { source: '```html\n<!doctype html>\n<html><body>\n<p>Hello</p>\n<p>Wor' })} {...kit()} />)
    const frame = frameIn(view.container)
    await waitFor(() => { expect(frame.of('render')).toHaveLength(1) })
    expect(frame.of('render')[0]?.html).toBe('<p>Hello</p>\n<p>Wor')
  })

  it('draws nothing until the source has something to show', () => {
    const { CardNode } = loadClient()
    const view = render(<CardNode node={streamingNode('call-s', { title: 'Plan', source: '' })} {...kit()} />)
    expect(view.container.innerHTML).toBe('')
  })
})

describe('what a frame asks is checked by the page', () => {
  /** A drawn widget whose frame has the whole source. */
  async function drawn(draft = '') {
    const client = loadClient()
    const session = kit(draft)
    const view = render(<client.CardNode node={settledNode('call-1', await settle(EXAMPLE))} {...session} />)
    const frame = frameIn(view.container)
    await frame.ran()
    return { client, session, view, frame }
  }

  it('sizes the frame to the height it reports, inside the limits', async () => {
    const { frame } = await drawn()
    frame.say({ t: 'height', h: 312.6 })
    expect(frame.iframe.style.height).toBe('313px')
    frame.say({ t: 'height', h: 1e7 })
    expect(frame.iframe.style.height).toBe(`${LIMITS.maxHeight}px`)
    frame.say({ t: 'height', h: 'tall' })
    expect(frame.iframe.style.height).toBe(`${LIMITS.maxHeight}px`)
  })

  it('listens only to its own frame, and only to this protocol', async () => {
    const { frame, client } = await drawn()
    clickInside(frame.iframe)
    const other = document.createElement('iframe')
    document.body.append(other)
    for (const source of [window, other.contentWindow, null]) {
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: { channel: CHANNEL, t: 'send', text: 'from elsewhere' }, source })) })
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: { channel: CHANNEL, t: 'height', h: 999 }, source })) })
    }
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { channel: 'another', t: 'send', text: 'wrong channel' }, source: frame.iframe.contentWindow })) })
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { t: 'send', text: 'no channel' }, source: frame.iframe.contentWindow })) })
    other.remove()
    expect(client.conversation.send).not.toHaveBeenCalled()
    expect(frame.iframe.style.height).not.toBe('999px')
  })

  it('repeats the reader\'s scrolling inside the frame to the chat, without letting it bubble', async () => {
    const { frame, view } = await drawn()
    const seen: string[] = []
    const bubbled: string[] = []
    for (const type of ['wheel', 'touchstart', 'keydown']) {
      view.container.addEventListener(type, (event) => { seen.push(event instanceof KeyboardEvent ? `${type} ${event.key}` : type) }, true)
      view.container.addEventListener(type, () => { bubbled.push(type) })
    }
    frame.say({ t: 'scroll', input: 'wheel' })
    frame.say({ t: 'scroll', input: 'wheel' })
    frame.say({ t: 'scroll', input: 'touch' })
    // A key reaches the frame only while it has the focus.
    frame.say({ t: 'scroll', input: 'key', key: 'PageDown' })
    clickInside(frame.iframe)
    frame.say({ t: 'scroll', input: 'key', key: 'PageDown' })
    frame.say({ t: 'scroll', input: 'key', key: 'Enter' })
    frame.say({ t: 'scroll', input: 'pointer' })
    expect(seen).toEqual(['wheel', 'touchstart', 'keydown PageDown'])
    expect(bubbled).toEqual([])
  })

  it('sends a message only after a click inside the frame', async () => {
    const { frame, client } = await drawn()
    frame.say({ t: 'send', text: 'Sent by a timer' })
    expect(client.conversation.send).not.toHaveBeenCalled()
    expect(screen.getByText('The widget tried to send a message without your click, so it was stopped.')).toBeTruthy()
    clickInside(frame.iframe)
    frame.say({ t: 'send', text: '  Compare this with the annual plan ' })
    expect(client.conversation.send).toHaveBeenCalledExactlyOnceWith('Compare this with the annual plan')
    expect(screen.queryByText(/without your click/u)).toBeNull()
  })

  it('requires the browser\'s own record of the click where the browser keeps one', async () => {
    const { frame, client } = await drawn()
    const activation = { isActive: false }
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { userActivation: activation }))
    clickInside(frame.iframe)
    frame.say({ t: 'send', text: 'Focused, but nobody clicked' })
    expect(client.conversation.send).not.toHaveBeenCalled()
    activation.isActive = true
    frame.say({ t: 'send', text: 'Clicked' })
    expect(client.conversation.send).toHaveBeenCalledExactlyOnceWith('Clicked')
  })

  it('sends one message per click, however many the frame posts', async () => {
    const { frame, client } = await drawn()
    clickInside(frame.iframe)
    for (let index = 0; index < 5; index += 1) frame.say({ t: 'send', text: `Message ${index}` })
    expect(client.conversation.send).toHaveBeenCalledExactlyOnceWith('Message 0')
  })

  it('opens a link in a new tab without an opener, only after a click', async () => {
    const { frame } = await drawn()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    frame.say({ t: 'open', url: 'https://example.org/paper' })
    expect(open).not.toHaveBeenCalled()
    expect(screen.getByText('The widget tried to open a link without your click, so it was stopped.')).toBeTruthy()
    clickInside(frame.iframe)
    frame.say({ t: 'open', url: 'javascript:alert(1)' })
    expect(open).not.toHaveBeenCalled()
    frame.say({ t: 'open', url: 'https://example.org/paper' })
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.org/paper', '_blank', 'noopener,noreferrer')
  })

  it('sends past what the reader is typing, and leaves the composer alone', async () => {
    const { frame, client, session } = await drawn('half a thought')
    clickInside(frame.iframe)
    frame.say({ t: 'send', text: 'Compare this with the annual plan' })
    expect(client.conversation.send).toHaveBeenCalledExactlyOnceWith('Compare this with the annual plan')
    expect(session.inputActions.setDraft).not.toHaveBeenCalled()
    expect(session.inputActions.submit).not.toHaveBeenCalled()
    expect(screen.queryByText(/clipboard/u)).toBeNull()
  })

  it('copies the message when the host refuses it', async () => {
    const { frame, client } = await drawn()
    client.conversation.send.mockRejectedValueOnce(new Error('session/busy'))
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText } }))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    clickInside(frame.iframe)
    frame.say({ t: 'send', text: 'Compare this with the annual plan' })
    await waitFor(() => { expect(screen.getByText('The message could not be sent, so it was copied to the clipboard')).toBeTruthy() })
    expect(writeText).toHaveBeenCalledExactlyOnceWith('Compare this with the annual plan')
  })

  it('copies the message where no session can take it, and shows it when the clipboard refuses', async () => {
    const client = loadClient()
    const view = render(<client.CardNode node={settledNode('call-1', await settle(EXAMPLE))} {...kit()} sessionId="session-gone" />)
    const frame = frameIn(view.container)
    await frame.ran()
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { clipboard: { writeText: async () => { throw new Error('denied') } } }))
    clickInside(frame.iframe)
    frame.say({ t: 'send', text: 'Compare this with the annual plan' })
    expect(client.conversation.send).not.toHaveBeenCalled()
    expect(screen.getByText('Sending is unavailable here, so this was copied to the clipboard')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('The clipboard is unavailable; copy this by hand:')).toBeTruthy() })
    expect(screen.getByText('Compare this with the annual plan')).toBeTruthy()
  })

  it('shows a widget\'s errors and offers to send them to the model', async () => {
    const { frame, client, view } = await drawn()
    frame.say({ t: 'error', message: 'Uncaught ReferenceError: total is not defined (line 9)' })
    frame.say({ t: 'error', message: 'Uncaught ReferenceError: total is not defined (line 9)' })
    frame.say({ t: 'error', message: 'Could not load https://cdn.jsdelivr.net/npm/nothing@1/x.js' })
    const box = view.container.querySelector('[data-dsh-intelligent-ui="errors"]') as HTMLElement
    expect(box.querySelectorAll('li')).toHaveLength(2)
    for (let index = 0; index < 9; index += 1) frame.say({ t: 'error', message: `Another error ${index}` })
    expect(box.querySelectorAll('li')).toHaveLength(5)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Ask to fix' })) })
    expect(client.conversation.send).toHaveBeenCalledTimes(1)
    const sent = client.conversation.send.mock.calls[0]?.[0] as string
    expect(sent).toContain('card call-1')
    expect(sent).toContain('- Uncaught ReferenceError: total is not defined (line 9)')
    expect(sent).toContain('revises=call-1')
  })

  it('uses the host translator when the namespace is registered', async () => {
    const { CardNode } = loadClient()
    const t = (key: string) => (key === 'frame.title' ? '交互界面' : key === 'send.blocked' ? '已拦下' : key)
    const view = render(<CardNode node={settledNode('call-1', await settle(EXAMPLE))} t={t} {...kit()} />)
    const frame = frameIn(view.container)
    await frame.ran()
    expect(frame.iframe.getAttribute('title')).toBe('交互界面')
    frame.say({ t: 'send', text: 'x' })
    expect(screen.getByText('已拦下')).toBeTruthy()
  })
})

describe('what a widget keeps outlives the page', () => {
  const CARD = 'dsh-intelligent-ui.card.v2:'

  it('stores the state, the control values, and the height a frame reports, and hands them back after a reload', async () => {
    const first = loadClient()
    const meta = await settle(EXAMPLE)
    const view = render(<first.CardNode node={settledNode('call-1', meta)} {...kit()} />)
    const frame = frameIn(view.container)
    await frame.ran()
    frame.say({ t: 'ran' })
    frame.say({ t: 'state', value: { count: 2 } })
    frame.say({ t: 'controls', value: { seats: '20', bogus: 7 } })
    frame.say({ t: 'height', h: 222 })
    expect(JSON.parse(localStorage.getItem(`${CARD}session-1:call-1`) ?? '')).toEqual({ state: { count: 2 }, controls: { seats: '20' }, height: 222 })
    cleanup()
    // A reload: a fresh bundle, a fresh store, the same browser storage.
    const second = loadClient()
    const again = render(<second.CardNode node={settledNode('call-1', meta)} {...kit()} />)
    const reloaded = frameIn(again.container)
    expect(reloaded.iframe.style.height).toBe('222px')
    await reloaded.ran()
    expect(reloaded.of('render')[0]).toEqual({ channel: CHANNEL, t: 'render', html: EXAMPLE, final: true, state: { count: 2 }, controls: { seats: '20' } })
  })

  it('keeps one session\'s widgets apart from another\'s', async () => {
    const { CardNode } = loadClient()
    const meta = await settle(EXAMPLE)
    const view = render(<CardNode node={settledNode('call-1', meta)} {...kit()} />)
    const frame = frameIn(view.container)
    await frame.ran()
    frame.say({ t: 'state', value: { count: 2 } })
    cleanup()
    const other = render(<CardNode node={settledNode('call-1', meta)} {...{ ...kit(), sessionId: 'session-2' }} />)
    const elsewhere = frameIn(other.container)
    await elsewhere.ran()
    expect(elsewhere.of('render')[0]).not.toHaveProperty('state')
  })

  it('does not keep the height of a widget whose scripts have not run', async () => {
    const { CardNode } = loadClient()
    const view = render(<CardNode node={settledNode('call-1', await settle(EXAMPLE))} {...kit()} />)
    const frame = frameIn(view.container)
    await frame.ran()
    frame.say({ t: 'height', h: 222 })
    expect(localStorage.getItem(`${CARD}session-1:call-1`)).toBeNull()
  })

  it('writes each change through and reads it back in a fresh store', () => {
    const storage = memoryStorage()
    createEditsStore(storage).set('s:c1', { state: { seats: 10 }, controls: { a: 'x' } })
    expect(JSON.parse(storage.map.get(`${CARD}s:c1`) ?? '')).toEqual({ state: { seats: 10 }, controls: { a: 'x' } })
    expect(JSON.parse(storage.map.get('dsh-intelligent-ui.cards.v2') ?? '')).toEqual(['s:c1'])
    const reloaded = createEditsStore(storage)
    const memory = reloaded.get('s:c1')
    expect(memory).toEqual({ state: { seats: 10 }, controls: { a: 'x' } })
    expect(reloaded.get('s:c1')).toBe(memory)
  })

  it('forgets the oldest card past two hundred', () => {
    const storage = memoryStorage()
    const store = createEditsStore(storage)
    for (let index = 0; index <= 200; index += 1) store.set(`s:c${index}`, { state: index })
    const index = JSON.parse(storage.map.get('dsh-intelligent-ui.cards.v2') ?? '') as string[]
    expect(index).toHaveLength(200)
    expect(index[0]).toBe('s:c1')
    expect(storage.map.has(`${CARD}s:c0`)).toBe(false)
    expect(storage.map.has(`${CARD}s:c200`)).toBe(true)
  })

  it('ignores damaged entries, leaves the DIL era\'s entries alone, and keeps working when storage refuses', () => {
    const old = 'dsh-intelligent-ui.card.v1:s:a'
    const damaged = memoryStorage({ [`${CARD}s:a`]: '{bad', [`${CARD}s:b`]: '[1]', [`${CARD}s:c`]: '{"state":{"x":1},"controls":7,"height":"tall","revisedBy":3,"extra":true}', [old]: '{"values":{"seats":3}}' })
    const store = createEditsStore(damaged)
    expect(store.get('s:a')).toBeUndefined()
    expect(store.get('s:b')).toBeUndefined()
    expect(store.get('s:c')).toEqual({ state: { x: 1 } })
    expect(damaged.map.get(old)).toBe('{"values":{"seats":3}}')
    expect(readMemory('text')).toBeUndefined()
    const refusing: StorageLike = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') }, removeItem: () => undefined }
    const page = createEditsStore(refusing)
    expect(() => { page.set('s:d', { state: { y: 2 } }) }).not.toThrow()
    expect(page.get('s:d')).toEqual({ state: { y: 2 } })
  })

  it('keeps a memory too large for storage on the page only', () => {
    const storage = memoryStorage()
    const store = createEditsStore(storage)
    store.set('s:big', { state: 'short' })
    store.set('s:big', { state: 'x'.repeat(50_000) })
    expect(storage.map.has(`${CARD}s:big`)).toBe(false)
    expect((store.get('s:big')?.state as string).length).toBe(50_000)
  })
})

describe('revising a widget', () => {
  it('starts from what the earlier widget kept and folds the earlier one to a line', async () => {
    const { CardNode } = loadClient()
    const first = await settle(EXAMPLE, {}, 'call-1')
    const second = await settle(EXAMPLE.replace('* 29', '* 35'), { revises: 'call-1' }, 'call-2')
    expect(second.revises).toBe('call-1')
    const session = kit()
    const earlier = render(<CardNode node={settledNode('call-1', first)} {...session} />)
    const before = frameIn(earlier.container)
    await before.ran()
    before.say({ t: 'ran' })
    before.say({ t: 'state', value: { plan: 'pro' } })
    before.say({ t: 'controls', value: { seats: '20' } })
    before.say({ t: 'height', h: 300 })
    const later = render(<CardNode node={settledNode('call-2', second, inTurn([], 2))} {...session} />)
    const after = frameIn(later.container)
    await after.ran()
    // The values carry over; the height does not, because the new widget is another size.
    expect(after.of('render')[0]).toMatchObject({ final: true, state: { plan: 'pro' }, controls: { seats: '20' } })
    expect(after.iframe.style.height).toBe('120px')
    expect(localStorage.getItem('dsh-intelligent-ui.card.v2:session-1:call-2')).toBeNull()
    await waitFor(() => { expect(earlier.container.querySelector('iframe')).toBeNull() })
    expect(earlier.container.textContent).toContain('A newer version below replaced this widget.')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show the old version' })) })
    expect(earlier.container.querySelector('iframe')).not.toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Hide the old version' })) })
    expect(earlier.container.querySelector('iframe')).toBeNull()
  })

  it('leaves out of a reply the widget a later one of the same turn redrew', async () => {
    const { CardNode } = loadClient()
    const first = await settle(EXAMPLE, {}, 'call-1')
    const second = await settle(EXAMPLE, { revises: 'call-1' }, 'call-2')
    const cards = [{ seq: 3, callId: 'call-1', meta: first }, { seq: 5, callId: 'call-2', meta: second }]
    const earlier = render(<CardNode node={settledNode('call-1', first, inTurn(cards))} {...kit()} />)
    expect(earlier.container.innerHTML).toBe('')
    const later = render(<CardNode node={settledNode('call-2', second, inTurn(cards))} {...kit()} />)
    expect(later.container.querySelector('iframe')).not.toBeNull()
  })

  it('carries values into the streaming preview, but marks nothing until the result lands', async () => {
    const { CardNode } = loadClient()
    const session = kit()
    const earlier = render(<CardNode node={settledNode('call-1', await settle(EXAMPLE, {}, 'call-1'))} {...session} />)
    const before = frameIn(earlier.container)
    await before.ran()
    before.say({ t: 'state', value: { plan: 'pro' } })
    const preview = render(<CardNode node={streamingNode('call-2', { revises: 'call-1', source: EXAMPLE })} {...session} />)
    const live = frameIn(preview.container)
    await waitFor(() => { expect(live.of('render')).toHaveLength(1) })
    expect(earlier.container.querySelector('iframe')).not.toBeNull()
    preview.rerender(<CardNode node={settledNode('call-2', await settle(EXAMPLE, { revises: 'call-1' }, 'call-2'), inTurn([], 2))} {...session} />)
    await live.ran()
    expect(live.of('render').at(-1)).toMatchObject({ final: true, state: { plan: 'pro' } })
    await waitFor(() => { expect(earlier.container.querySelector('iframe')).toBeNull() })
  })
})

describe('the tool row', () => {
  it('draws the widget itself where no copy stands in the reply', async () => {
    const { ToolView } = loadClient()
    const text = { source: '<div class="card"><p>Seats</p>' }
    const props = { phase: 'preparing', block: { callId: 'call-1', args: streamingArgs(text) }, callId: 'call-1', useDisclosure: useHostDisclosure, ...kit() }
    const view = render(<ToolView {...props} />)
    expect(screen.getByText('Building the widget…')).toBeTruthy()
    const frame = frameIn(view.container)
    await waitFor(() => { expect(frame.of('render')).toHaveLength(1) })
    expect(frame.of('render')[0]).toMatchObject({ html: text.source, final: false })
    const meta = await settle(EXAMPLE, { title: 'Team plan' })
    view.rerender(<ToolView {...props} phase="result" block={resultBlock(meta)} />)
    await frame.ran()
    expect(screen.getByText('Interactive · Team plan')).toBeTruthy()
    expect(screen.getByText(`Shown · ${EXAMPLE.split('\n').length} lines`)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide widget' })).toBeTruthy()
  })

  it('keeps an old result collapsed until the reader opens it', async () => {
    const { ToolView } = loadClient()
    const meta = await settle(EXAMPLE)
    const view = render(<ToolView phase="result" block={resultBlock(meta, Date.now() - 3_600_000)} callId="call-2" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(view.container.querySelector('iframe')).toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show widget' })) })
    expect(view.container.querySelector('iframe')).not.toBeNull()
  })

  it('stays a status line while the widget stands in the reply', async () => {
    const { ToolView, CardNode } = loadClient()
    const meta = await settle(EXAMPLE, { title: 'Seats' })
    const row = <ToolView phase="result" block={resultBlock(meta)} callId="call-12" useDisclosure={useHostDisclosure} {...kit()} />
    const view = render(<>{row}<CardNode node={settledNode('call-12', meta)} {...kit()} /></>)
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1)
    expect(view.container.querySelector('.dsh-iui-tool iframe')).toBeNull()
    expect(screen.getByText(/^Shown · /u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show widget' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide widget' })).toBeNull()
    // Without the reply copy, as in a view that draws no Chat nodes, the row draws the widget itself.
    view.rerender(<>{row}</>)
    expect(view.container.querySelectorAll('.dsh-iui-tool iframe')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Hide widget' })).toBeTruthy()
  })

  it('keeps the streaming preview out of the row while the reply copy draws it', () => {
    const { ToolView, CardNode } = loadClient()
    const args = { source: '<div class="card"><p>first line</p>' }
    const view = render(
      <>
        <ToolView phase="preparing" block={{ callId: 'call-13', args: streamingArgs({ source: args.source }) }} callId="call-13" useDisclosure={useHostDisclosure} {...kit()} />
        <CardNode node={streamingNode('call-13', args)} {...kit()} />
      </>,
    )
    expect(screen.getByText('Building the widget…')).toBeTruthy()
    expect(view.container.querySelectorAll('iframe')).toHaveLength(1)
    expect(view.container.querySelector('.dsh-iui-tool iframe')).toBeNull()
  })

  it('shows why a widget did not pass the check', async () => {
    const { ToolView } = loadClient()
    const view = render(<ToolView phase="result" block={resultBlock(await settle(BROKEN))} callId="call-3" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByText('The widget did not pass the check')).toBeTruthy()
    expect(view.container.querySelector('.dsh-iui-diag')?.textContent).toMatch(/^line 2: SyntaxError: .+\. Fix this script\.$/u)
    expect(view.container.querySelector('iframe')).toBeNull()
  })

  it('shows a refused call as a failure with its reason, and a stopped one as stopped', () => {
    const { ToolView } = loadClient()
    const block = resultBlock({}, Date.now(), { isError: true, error: { name: 'ToolError', code: 'denied' }, content: [{ type: 'text', text: 'Error: 工具 ui_render 在课程复习模式下不可用' }] })
    render(<ToolView phase="result" block={block} callId="call-4" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByText('The call failed')).toBeTruthy()
    expect(screen.getByText('Error: 工具 ui_render 在课程复习模式下不可用')).toBeTruthy()
    cleanup()
    render(<ToolView phase="result" block={resultBlock({}, Date.now(), { isError: true, error: { code: 'interrupted' }, content: [] })} callId="call-5" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByText('Stopped')).toBeTruthy()
  })

  it('says when a later widget replaced this one', async () => {
    const { ToolView, CardNode } = loadClient()
    const first = await settle(EXAMPLE, {}, 'call-1')
    const second = await settle(EXAMPLE, { revises: 'call-1' }, 'call-2')
    const session = kit()
    render(<>
      <ToolView phase="result" block={resultBlock(first, Date.now() - 3_600_000)} callId="call-1" useDisclosure={useHostDisclosure} {...session} />
      <CardNode node={settledNode('call-2', second, inTurn([], 2))} {...session} />
    </>)
    await waitFor(() => { expect(screen.getByText('Replaced by a newer version')).toBeTruthy() })
  })

  it('uses the host translator when the namespace is registered', async () => {
    const { ToolView } = loadClient()
    const meta = await settle(EXAMPLE)
    const t = (key: string, params?: Record<string, unknown>) => (key === 'card.label' ? '交互界面' : key === 'row.ready' ? `已显示 · ${String(params?.lines)} 行` : key)
    render(<ToolView phase="result" block={resultBlock(meta, Date.now() - 3_600_000)} callId="call-5" useDisclosure={useHostDisclosure} t={t} {...kit()} />)
    expect(screen.getByText('交互界面')).toBeTruthy()
    expect(screen.getByText(`已显示 · ${EXAMPLE.split('\n').length} 行`)).toBeTruthy()
  })
})

describe('cards from before the rewrite', () => {
  /** A card persisted before programs carried a `version` field, cut down from a real session. */
  const UNVERSIONED = {
    ok: true,
    title: '可拖动的报价器',
    height: 420,
    program: {
      v: 1,
      state: [{ key: 'seats', kind: 'number', init: 8, min: 1, max: 50, step: 1 }],
      calc: [],
      nodes: [{ id: 'root', type: 'card', parent: null, props: {} }, { id: 's1', type: 'slider', parent: 'root', props: {}, bind: { key: 'seats', kind: 'number' } }],
      fallback: '# Team plan\n- Seats: 8\n- Monthly: 232 USD',
      diagnostics: [],
    },
  }

  /** The same card as the last DIL build persisted it. */
  const VERSION_ONE = { ...UNVERSIONED, version: 1, program: { ...UNVERSIONED.program, version: 1 } }

  it('reads both as the text version they carried', () => {
    expect(readMeta(UNVERSIONED)).toEqual({ kind: 'legacy', text: UNVERSIONED.program.fallback, title: '可拖动的报价器' })
    expect(readMeta(VERSION_ONE)).toEqual({ kind: 'legacy', text: UNVERSIONED.program.fallback, title: '可拖动的报价器' })
    expect(readMeta({ version: 1, ok: false, diagnostics: [{ message: 'x', repair: 'y' }] })).toEqual({ kind: 'failed', problems: [] })
    expect(readMeta({ version: 1, ok: true, program: { fallback: '' } })).toBeUndefined()
    expect(readMeta({ ok: true })).toBeUndefined()
  })

  it('shows the text in the reply, with no frame and no controls', () => {
    const { CardNode } = loadClient()
    for (const meta of [UNVERSIONED, VERSION_ONE]) {
      const view = render(<CardNode node={settledNode('legacy', meta)} {...kit()} />)
      expect(view.container.querySelector('pre')?.textContent).toBe(UNVERSIONED.program.fallback)
      expect(screen.getByText('This card comes from an earlier version of the plugin; only its text version is shown.')).toBeTruthy()
      expect(view.container.querySelector('iframe')).toBeNull()
      expect(screen.queryByRole('slider')).toBeNull()
      cleanup()
    }
  })

  it('says so in the tool row, which shows the text where no copy stands in the reply', () => {
    const { ToolView } = loadClient()
    const view = render(<ToolView phase="result" block={resultBlock(VERSION_ONE)} callId="call-old" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByText('Interactive · 可拖动的报价器')).toBeTruthy()
    expect(screen.getByText('Earlier card · text version')).toBeTruthy()
    expect(view.container.querySelector('pre')?.textContent).toBe(UNVERSIONED.program.fallback)
  })
})

describe('the turn data', () => {
  /** Feed events through the Definition the way the engine would. */
  function fold(definition: Record<string, any>, events: Array<Record<string, unknown>>) {
    let state: unknown
    for (const event of events) {
      const handler = definition.match[event.type as string] as ((event: unknown) => { role: string } | null) | undefined
      const matched = handler?.(event)
      if (matched === null || matched === undefined) continue
      state = matched.role === 'start' || state === undefined
        ? definition.start({}, { event, role: matched.role })
        : definition.update({ state }, { event, role: matched.role })
    }
    return { state, data: definition.buildLocationData({ state }, 'turn', null) }
  }

  it('collects the settled cards of ui_render calls only', async () => {
    const { definition } = loadClient()
    const meta = await settle(EXAMPLE)
    const { data } = fold(definition, [
      { type: 'turn/start', seq: 1, data: { turn: 4 } },
      { type: 'tool/call', seq: 2, data: { turn: 4, callId: 'a', name: 'ui_render' } },
      { type: 'tool/call', seq: 3, data: { turn: 4, callId: 'b', name: 'bash' } },
      { type: 'tool/result', seq: 4, surfaceOp: 'append', data: { turn: 4, message: { source: { callId: 'b' } }, meta } },
      { type: 'tool/result', seq: 5, surfaceOp: 'append', data: { turn: 4, message: { source: { callId: 'a' } }, meta } },
      { type: 'tool/result', seq: 6, surfaceOp: 'replace', data: { turn: 4, message: { source: { callId: 'a' } }, meta } },
    ])
    expect(data).toEqual({ kind: 'turn', turn: 4, key: 'dsh-intelligent-ui', value: { cards: [{ seq: 5, callId: 'a', meta }] } })
  })

  it('publishes nothing for a turn without cards, and keeps identity while unchanged', async () => {
    const { definition } = loadClient()
    expect(fold(definition, [{ type: 'turn/start', seq: 1, data: { turn: 1 } }]).data).toBeNull()
    const meta = await settle(EXAMPLE)
    const { state, data } = fold(definition, [
      { type: 'turn/start', seq: 1, data: { turn: 2 } },
      { type: 'tool/call', seq: 2, data: { turn: 2, callId: 'a', name: 'ui_render' } },
      { type: 'tool/result', seq: 3, surfaceOp: 'append', data: { turn: 2, message: { source: { callId: 'a' } }, meta } },
    ])
    expect(definition.buildLocationData({ state }, 'turn', data)).toBe(data)
    expect(definition.buildLocationData({ state }, 'step', null)).toBeNull()
  })

  it('ignores a failed check and an errored call', async () => {
    const { definition } = loadClient()
    expect(definition.match['tool/result']({ surfaceOp: 'append', data: { turn: 1, meta: await settle(BROKEN) } })).toBeNull()
    const { data } = fold(definition, [
      { type: 'turn/start', seq: 1, data: { turn: 3 } },
      { type: 'tool/call', seq: 2, data: { turn: 3, callId: 'a', name: 'ui_render' } },
      { type: 'tool/result', seq: 3, surfaceOp: 'append', data: { turn: 3, message: { source: { callId: 'a' }, isError: true }, meta: await settle(EXAMPLE) } },
    ])
    expect(data).toBeNull()
  })
})

describe('cards in the reply', () => {
  /**
   * Feed events through the card Definition the way the engine does: one
   * Context per id, opened by its first start match, each build handed the node
   * it built before.
   */
  function assemble(definition: Record<string, any>, events: Array<Record<string, unknown>>) {
    const contexts = new Map<string, { key: string; id: string; matches: unknown[]; start: any; state: any; current: Map<string, unknown> }>()
    for (const event of events) {
      const handler = definition.match[event.type as string] as ((event: unknown) => { id: string; role: string } | null) | undefined
      const matched = handler?.(event)
      if (matched === null || matched === undefined) continue
      let context = contexts.get(matched.id)
      if (context === undefined) {
        context = { key: `k:${matched.id}`, id: matched.id, matches: [], start: undefined, state: undefined, current: new Map() }
        contexts.set(matched.id, context)
      }
      const match = { event, role: matched.role, location: event.location ?? { kind: 'step', turn: { turn: 1, status: 'open' }, step: { status: 'open' } } }
      context.matches.push(match)
      if (context.state === undefined && matched.role === 'start') {
        context.start = match
        context.state = definition.start(context, match, {})
      } else if (context.state !== undefined) {
        context.state = definition.update(context, match)
      }
      const node = definition.buildViewNode(context)
      context.current.set('chat', node)
    }
    return new Map([...contexts].map(([id, context]) => [id, context.current.get('chat') as Record<string, any> | null]))
  }
  const delta = (seq: number, id: string, argumentsDelta: string, name?: string) =>
    ({ type: 'assistant/live-chunk', seq, data: { turn: 1, step: 1, chunk: { type: 'tool-call-delta', index: 0, id, argumentsDelta, ...(name === undefined ? {} : { name }) } } })

  it('stands each card where its call stands, after its row and outside the folded process', async () => {
    const { cardDefinition } = loadClient()
    const meta = await settle(EXAMPLE, { title: 'Seats' })
    const args = JSON.stringify({ source: EXAMPLE, title: 'Seats' })
    const live = assemble(cardDefinition, [
      delta(7.5, 'a', '', 'ui_render'),
      delta(7.75, 'a', args.slice(0, 40)),
      delta(7.8, 'b', '{"command":"ls"}', 'bash'),
    ])
    const preparing = live.get('a')
    expect(preparing).toMatchObject({ kind: 'dsh-intelligent-ui.card', target: 'chat', groupTree: 'turn', visibility: 'visible', anchorSeq: 7.5 + 1e-9 })
    expect(preparing?.data).toEqual({ callId: 'a', phase: 'preparing', args: args.slice(0, 40) })
    expect(live.get('b')).toBeNull()
    const settled = assemble(cardDefinition, [
      { type: 'tool/call', seq: 8, data: { turn: 1, step: 1, callId: 'a', name: 'ui_render', arguments: args } },
      { type: 'tool/result', seq: 9, surfaceOp: 'append', data: { turn: 1, message: { source: { callId: 'a' } }, meta } },
      { type: 'tool/call', seq: 10, data: { turn: 1, step: 1, callId: 'b', name: 'bash', arguments: '{}' } },
    ])
    expect(settled.get('a')).toMatchObject({ anchorSeq: 8 + 1e-9, visibility: 'visible', data: { callId: 'a', phase: 'result', args, meta } })
    expect(settled.has('b')).toBe(false)
  })

  it('builds nothing for a failed check or an errored call, and hides a preview that failed', async () => {
    const { cardDefinition } = loadClient()
    const failed = await settle(BROKEN)
    const args = JSON.stringify({ source: BROKEN })
    const nodes = assemble(cardDefinition, [
      { type: 'tool/call', seq: 2, data: { callId: 'a', name: 'ui_render', arguments: args } },
      { type: 'tool/result', seq: 3, surfaceOp: 'append', data: { message: { source: { callId: 'a' } }, meta: failed } },
      { type: 'tool/call', seq: 4, data: { callId: 'b', name: 'ui_render', arguments: args } },
      { type: 'tool/result', seq: 5, surfaceOp: 'append', data: { message: { source: { callId: 'b' }, isError: true } } },
    ])
    expect(nodes.get('a')).toMatchObject({ visibility: 'hidden' })
    expect(nodes.get('b')).toMatchObject({ visibility: 'hidden' })
    // A result whose call is outside the loaded window still draws, when it is a card.
    const alone = assemble(cardDefinition, [
      { type: 'tool/result', seq: 5, surfaceOp: 'append', data: { message: { source: { callId: 'c' } }, meta: await settle(EXAMPLE) } },
      { type: 'tool/result', seq: 6, surfaceOp: 'append', data: { message: { source: { callId: 'd' } }, meta: failed } },
      { type: 'tool/result', seq: 7, surfaceOp: 'replace', data: { message: { source: { callId: 'e' } }, meta: failed } },
      { type: 'tool/result', seq: 8, surfaceOp: 'append', data: { message: { source: { callId: 'f' } }, meta: { version: 1, ok: true, program: { fallback: '# Old card' } } } },
    ])
    expect(alone.get('c')).toMatchObject({ visibility: 'visible', anchorSeq: 5 + 1e-9, data: { phase: 'result' } })
    expect(alone.get('d')).toBeNull()
    expect(alone.has('e')).toBe(false)
    expect(alone.get('f')).toMatchObject({ visibility: 'visible' })
  })

  it('hides a preview whose turn was stopped before the call was recorded', () => {
    const { cardDefinition } = loadClient()
    const stopped = { kind: 'step', turn: { turn: 1, status: 'closed' }, step: { status: 'closed' } }
    const nodes = assemble(cardDefinition, [{ ...delta(3.5, 'a', '{"source":"<p>Hi</p>\\n', 'ui_render'), location: stopped }])
    expect(nodes.get('a')).toBeNull()
  })

  it('reads string arguments from a stream cut anywhere', () => {
    const source = '<p class="a">é ☃ 💡 \\ "quoted"</p>\n<script>const t = `x`\n</script>'
    const full = JSON.stringify({ title: 'Fares "to" Boston', count: 3, nested: { a: [1, '}'] }, source })
    expect(readArguments(full)).toEqual({ title: 'Fares "to" Boston', source })
    for (let cut = 0; cut <= full.length; cut += 1) {
      const read = readArguments(full.slice(0, cut))
      // A prefix never invents text: each value it reports starts the real one.
      if (read.title !== undefined) expect('Fares "to" Boston'.startsWith(read.title)).toBe(true)
      if (read.source !== undefined) expect(source.startsWith(read.source), String(cut)).toBe(true)
    }
    expect(readArguments('{"source":"a\\u00')).toEqual({ source: 'a' })
    expect(readArguments('{"source":"a\\')).toEqual({ source: 'a' })
    expect(readArguments('not json')).toEqual({})
    expect(readArguments('{"__proto__":"x"}')).toEqual({})
  })
})

describe('the theme a frame is sent', () => {
  it('maps the chat\'s tokens onto the frame\'s names and follows the page when it changes', async () => {
    document.body.style.setProperty('--dsw-alias-label-primary', 'rgb(20, 20, 20)')
    document.body.style.setProperty('--dsw-alias-link', 'rgb(0, 90, 200)')
    document.documentElement.lang = 'zh-CN'
    const theme = readTheme(document.body)
    expect(theme.vars).toMatchObject({ '--text-primary': 'rgb(20, 20, 20)', '--accent': 'rgb(0, 90, 200)' })
    expect(theme.dark).toBe(false)
    expect(theme.lang).toBe('zh-CN')
    expect(Object.keys(theme.vars).every(name => /^--[a-z0-9-]+$/u.test(name))).toBe(true)

    const { CardNode } = loadClient()
    const view = render(<CardNode node={settledNode('call-1', await settle(EXAMPLE))} {...kit()} />)
    expect(view.container.querySelector('iframe')?.getAttribute('srcdoc')).toContain('--text-primary:rgb(20, 20, 20)')
    const frame = frameIn(view.container)
    await frame.ran()
    expect(frame.of('theme')).toHaveLength(1)
    expect(frame.iframe.style.colorScheme).toBe('light')
    act(() => { document.body.setAttribute('data-ds-dark-theme', '') })
    await waitFor(() => { expect(frame.of('theme')).toHaveLength(2) })
    expect(frame.of('theme')[1]).toMatchObject({ dark: true, lang: 'zh-CN' })
    // The frame element follows, so the browser keeps the frame transparent.
    expect(frame.iframe.style.colorScheme).toBe('dark')
    document.documentElement.lang = ''
  })

  it('reads a light text colour as a dark theme where the host marks nothing', () => {
    document.body.style.setProperty('--dsw-alias-label-primary', 'rgba(245, 245, 245, 0.9)')
    expect(readTheme(document.body).dark).toBe(true)
  })
})

describe('shipped libraries', () => {
  const TABLE: readonly Library[] = [{
    id: 'demo',
    title: 'Demo 4',
    example: 'https://cdn.jsdelivr.net/npm/demo@4/dist/demo.umd.min.js',
    npm: ['demo'],
    cdnjs: ['demo.js'],
    majors: [4],
    pick: path => (path.endsWith('.css') ? { file: 'demo.css', kind: 'style' } : { file: 'demo.js', kind: 'script' }),
  }]

  it('loads a library\'s file once and hands back the text of each file a widget names', async () => {
    const load = vi.fn(async () => ({ files: { 'demo.js': 'window.Demo = {}', 'demo.css': '.demo{}', other: 7 } }))
    const loader = createLibraryLoader(load, TABLE)
    const urls = ['https://cdn.jsdelivr.net/npm/demo@4.1.0/dist/demo.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/demo.js/4.0.0/demo.min.css', 'https://cdn.jsdelivr.net/npm/other@1/x.js', 'https://cdn.jsdelivr.net/npm/demo@4.1.0/dist/demo.umd.min.js']
    expect(await loader(urls)).toEqual([
      { url: urls[0], kind: 'script', text: 'window.Demo = {}' },
      { url: urls[1], kind: 'style', text: '.demo{}' },
    ])
    await loader(urls)
    expect(load).toHaveBeenCalledExactlyOnceWith('client.lib-demo.js')
  })

  it('leaves the widget to its code host when the file does not arrive, and tries again next time', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const load = vi.fn<(file: string) => Promise<unknown>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ files: { 'demo.js': 'ok' } })
    const loader = createLibraryLoader(load, TABLE)
    expect(await loader([TABLE[0]?.example as string])).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(await loader([TABLE[0]?.example as string])).toEqual([{ url: TABLE[0]?.example, kind: 'script', text: 'ok' }])
    expect(await createLibraryLoader(undefined, TABLE)([TABLE[0]?.example as string])).toEqual([])
  })
})

describe('a widget placed in the answer', () => {
  /** A chat laid out the way the host lays it out: the card's row, then the answer's row with a code block. */
  function inChat(CardNode: Component, meta: unknown, named: string) {
    return render(
      <div data-slot="conversation.chat.flow">
        <div data-chat-turn="1" data-testid="card-row">
          <CardNode node={settledNode('call-1', meta)} {...kit()} />
        </div>
        <div data-chat-turn="1" data-testid="answer">
          <p>Lead-in</p>
          <div className="md-code-block"><div data-code-block-content=""><pre><code>{named}</code></pre></div></div>
          <p>After</p>
        </div>
      </div>,
    )
  }

  it('draws the widget right after the block that names it, and leaves its own place empty', async () => {
    const { CardNode } = loadClient()
    inChat(CardNode, await settle(EXAMPLE), 'call-1')
    const row = screen.getByTestId('card-row')
    expect(row.childElementCount).toBe(0)
    const answer = screen.getByTestId('answer')
    const block = answer.querySelector('.md-code-block') as HTMLElement
    expect(block.hasAttribute('data-dsh-iui-placed')).toBe(true)
    const slot = block.nextElementSibling as HTMLElement
    expect(slot.className).toBe('dsh-iui-placed')
    expect(slot.nextElementSibling?.textContent).toBe('After')
    expect(slot.querySelectorAll('iframe')).toHaveLength(1)
    expect(slot.querySelector('[data-dsh-intelligent-ui="reply"]')?.hasAttribute('data-placed')).toBe(true)
  })

  it('stays where the call was when the answer names another card, with no marker left behind', async () => {
    const { CardNode } = loadClient()
    inChat(CardNode, await settle(EXAMPLE), 'call-2')
    const row = screen.getByTestId('card-row')
    expect(row.querySelectorAll('iframe')).toHaveLength(1)
    expect(row.querySelector('[data-dsh-intelligent-ui="probe"]')).toBeNull()
    expect(screen.getByTestId('answer').querySelector('.dsh-iui-placed')).toBeNull()
  })

  it('takes its container back when it unmounts', async () => {
    const { CardNode } = loadClient()
    const view = inChat(CardNode, await settle(EXAMPLE), 'call-1')
    view.rerender(
      <div data-slot="conversation.chat.flow">
        <div data-chat-turn="1" data-testid="card-row" />
        <div data-chat-turn="1" data-testid="answer">
          <p>Lead-in</p>
          <div className="md-code-block"><div data-code-block-content=""><pre><code>call-1</code></pre></div></div>
          <p>After</p>
        </div>
      </div>,
    )
    const answer = screen.getByTestId('answer')
    expect(answer.querySelector('.dsh-iui-placed')).toBeNull()
    expect(answer.querySelector('[data-dsh-iui-placed]')).toBeNull()
  })
})
