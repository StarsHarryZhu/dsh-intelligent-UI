// @vitest-environment jsdom
/**
 * The browser half, driven through its real registration path with real React.
 *
 * The built bundle is loaded the way the page loads it — a `__ModuleLoader__.load`
 * registration, a factory that receives the module table's `require`, then
 * `apply(ctx)` called exactly as cordis calls it, with no React argument. That is
 * the path where the original defect hid: the old entry read React from `apply`'s
 * second parameter, which cordis fills with the entry's config.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPARISON_EXAMPLE, ESTIMATE_EXAMPLE, QUIZ_EXAMPLE } from '../src/host/model-brief.ts'
import { buildPresentationMeta, createUIRenderTool } from '../src/host/tool.ts'

type Component = (props: Record<string, unknown>) => React.ReactNode

/** What `apply` registered, plus the cleanup cordis would run on unload. */
interface Loaded {
  exports: Record<string, unknown>
  ToolView: Component
  Tail: Component
  definition: Record<string, any>
  registrations: Array<Record<string, unknown>>
  dictionaries: string[]
  dispose(): void
}

/** Load the built bundle and activate it against a fake host context. */
function loadClient(): Loaded {
  const source = readFileSync(join(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8')
  let registration: { id: string; factory: (require: (request: string) => unknown) => Record<string, unknown> } | undefined
  new Function('window', source)({ __ModuleLoader__: { load: (value: never) => { registration = value } } })
  if (registration === undefined) throw new Error('the bundle did not register itself')
  expect(registration.id).toBe('dsh-intelligent-ui')
  const exports = registration.factory((request) => {
    if (request === 'react') return React
    if (request === 'react/jsx-runtime') return JsxRuntime
    throw new Error(`unexpected require: ${request}`)
  })
  const registrations: Array<Record<string, unknown>> = []
  const disposers: Array<() => void> = []
  const definitions: Array<Record<string, any>> = []
  const dictionaries: string[] = []
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
  }
  const ctx = {
    get: (name: string) => services[name],
    effect: (execute: () => unknown) => { const dispose = execute(); if (typeof dispose === 'function') disposers.push(dispose as () => void) },
    inject: (deps: string[], callback: (scope: unknown) => void) => { if (deps.every(dep => services[dep] !== undefined)) callback(ctx) },
  }
  ;(exports.apply as (...args: unknown[]) => void)(ctx, undefined)
  const row = registrations.find(entry => entry.name === 'tool.call.toolview')
  const tail = registrations.find(entry => entry.name === 'conversation.chat.turnTail')
  return {
    exports,
    ToolView: row?.component as Component,
    Tail: tail?.component as Component,
    definition: definitions[0] as Record<string, any>,
    registrations,
    dictionaries,
    dispose: () => { for (const dispose of disposers.reverse()) dispose() },
  }
}

/** Compile a source through the real host tool and return the persisted meta. */
async function settle(source: string, title?: string): Promise<Record<string, unknown>> {
  const tool = createUIRenderTool()
  const args = { source, ...(title === undefined ? {} : { title }) }
  const value = await tool.execute(args, {} as never)
  return buildPresentationMeta(args, value) as Record<string, unknown>
}

/** The host's disclosure hook: collapsed until something opens it. */
function useHostDisclosure(): { expanded: boolean; setExpanded(open: boolean): void; toggle(): void } {
  const [expanded, setExpanded] = React.useState(false)
  return { expanded, setExpanded, toggle: () => { setExpanded(open => !open) } }
}

/** A session kit: input actions and a static input state. */
function kit(draft = '') {
  const inputActions = { setDraft: vi.fn(), submit: vi.fn() }
  const useInput = <S,>(selector: (state: { draft: string; phase: string }) => S): S => selector({ draft, phase: 'plain' })
  return { sessionId: 'session-1', inputActions, useInput }
}

/** A settled result block. */
function resultBlock(meta: unknown, time = Date.now(), extra: Record<string, unknown> = {}) {
  return { kind: 'tool-result', callId: 'call-1', time, meta, isError: false, content: [{ type: 'text', text: 'ok' }], ...extra }
}

/** A streaming args reader whose text grows as the test appends to it. */
function streamingArgs(text: { source: string }) {
  return { text: (key: string) => (key === 'source' ? text.source : undefined) }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.head.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]').forEach(style => style.remove())
})

describe('activation through the real contract', () => {
  it('registers every contribution from apply(ctx) alone', () => {
    const client = loadClient()
    expect(client.exports.name).toBe('dsh-intelligent-ui')
    expect(client.exports.inject).toEqual(['slots', 'locale'])
    expect(client.registrations.map(entry => [entry.name, entry.key ?? entry.id])).toEqual([
      ['tool.call.toolview', 'ui_render'],
      ['conversation.chat.turnTail', 'dsh-intelligent-ui'],
    ])
    expect(client.definition.kind).toBe('dsh-intelligent-ui')
    expect(client.dictionaries).toEqual(['dsh-intelligent-ui'])
    expect(document.head.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]')).toHaveLength(1)
  })

  it('leaves nothing behind when the plugin is unloaded', () => {
    const client = loadClient()
    client.dispose()
    expect(client.registrations).toEqual([])
    expect(client.dictionaries).toEqual([])
    expect(document.head.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]')).toHaveLength(0)
  })

  it('logs instead of throwing when a service is missing', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8')
    let registration: { factory: (require: (request: string) => unknown) => Record<string, unknown> } | undefined
    new Function('window', source)({ __ModuleLoader__: { load: (value: never) => { registration = value } } })
    const exports = registration?.factory(request => (request === 'react' ? React : JsxRuntime))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => (exports?.apply as (ctx: unknown) => void)({ get: () => undefined })).not.toThrow()
    expect(error).toHaveBeenCalled()
  })
})

describe('the tool row', () => {
  it('previews the interface while the source streams in', () => {
    const { ToolView } = loadClient()
    const text = { source: 'card "Team plan"\n  text "first line"\n  text "second' }
    const props = { phase: 'preparing', block: { callId: 'call-1', args: streamingArgs(text) }, callId: 'call-1', useDisclosure: useHostDisclosure, ...kit() }
    const view = render(<ToolView {...props} />)
    expect(screen.getByText('Building the interface…')).toBeTruthy()
    expect(screen.getByText('Team plan')).toBeTruthy()
    expect(screen.getByText('first line')).toBeTruthy()
    expect(screen.queryByText('second')).toBeNull()
    text.source += ' line"\n  metric "Total" value=3\n'
    view.rerender(<ToolView {...props} block={{ callId: 'call-1', args: streamingArgs(text) }} />)
    expect(screen.getByText('second line')).toBeTruthy()
    expect(screen.getByText('Total')).toBeTruthy()
  })

  it('opens a fresh result and recomputes on a control change without any request', async () => {
    const { ToolView } = loadClient()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const meta = await settle(ESTIMATE_EXAMPLE, 'Team plan')
    render(<ToolView phase="result" block={resultBlock(meta)} callId="call-1" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByText('Interactive · Team plan')).toBeTruthy()
    expect(screen.getByText('5 components · 2 controls')).toBeTruthy()
    expect(screen.getByText('8 seats on Pro cost 232 USD a month.')).toBeTruthy()
    const slider = screen.getByRole('slider', { name: 'Seats' })
    act(() => { fireEvent.change(slider, { target: { value: '20' } }) })
    expect(screen.getByText('20 seats on Pro cost 580 USD a month.')).toBeTruthy()
    act(() => { fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Team' } }) })
    expect(screen.getByText('20 seats on Team cost 440 USD a month.')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('keeps an old result collapsed until the reader opens it', async () => {
    const { ToolView } = loadClient()
    const meta = await settle(COMPARISON_EXAMPLE)
    render(<ToolView phase="result" block={resultBlock(meta, Date.now() - 3_600_000)} callId="call-2" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.queryByText('Amtrak')).toBeNull()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show interface' })) })
    expect(screen.getByText('Amtrak')).toBeTruthy()
  })

  it('shows why a program did not compile', async () => {
    const { ToolView } = loadClient()
    const meta = await settle('hologram')
    render(<ToolView phase="result" block={resultBlock(meta)} callId="call-3" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByText('The interface did not compile')).toBeTruthy()
    expect(screen.getByText(/"hologram" is not a component/u)).toBeTruthy()
  })

  it('shows a refused call as a failure with its reason', () => {
    const { ToolView } = loadClient()
    const block = resultBlock({}, Date.now(), { isError: true, error: { name: 'ToolError', code: 'denied' }, content: [{ type: 'text', text: 'Error: 工具 ui_render 在课程复习模式下不可用' }] })
    render(<ToolView phase="result" block={block} callId="call-4" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByText('The call failed')).toBeTruthy()
    expect(screen.getByText('Error: 工具 ui_render 在课程复习模式下不可用')).toBeTruthy()
  })

  it('uses the host translator when the namespace is registered', async () => {
    const { ToolView } = loadClient()
    const meta = await settle(COMPARISON_EXAMPLE)
    const t = (key: string, params?: Record<string, unknown>) => (key === 'card.label' ? '交互界面' : key === 'row.ready' ? `${String(params?.components)} 个组件` : key)
    render(<ToolView phase="result" block={resultBlock(meta)} callId="call-5" useDisclosure={useHostDisclosure} t={t} {...kit()} />)
    expect(screen.getByText('交互界面')).toBeTruthy()
    expect(screen.getByText('3 个组件')).toBeTruthy()
  })
})

describe('buttons continue the conversation', () => {
  it('sends the prompt through the composer once, then locks the card', async () => {
    const { ToolView } = loadClient()
    const session = kit()
    render(<ToolView phase="result" block={resultBlock(await settle(QUIZ_EXAMPLE))} callId="call-6" useDisclosure={useHostDisclosure} {...session} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: /B\. Hypergeometric/u })) })
    expect(session.inputActions.setDraft).toHaveBeenCalledWith('B')
    expect(session.inputActions.submit).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sent')).toBeTruthy()
    for (const button of screen.getAllByRole('button', { name: /^[ABC]\./u })) expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('never overwrites what the reader is typing', async () => {
    const { ToolView } = loadClient()
    const session = kit('half a sentence')
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ToolView phase="result" block={resultBlock(await settle(QUIZ_EXAMPLE))} callId="call-7" useDisclosure={useHostDisclosure} {...session} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: /A\. Binomial/u })) })
    expect(session.inputActions.setDraft).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith('A')
    expect(screen.getByRole('status').textContent).toContain('copied to the clipboard')
  })

  it('states the message a button will send', async () => {
    const { ToolView } = loadClient()
    render(<ToolView phase="result" block={resultBlock(await settle(QUIZ_EXAMPLE))} callId="call-8" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByRole('button', { name: /C\. Poisson/u }).getAttribute('title')).toBe('Sends: C')
  })
})

describe('the turn data and the turn tail', () => {
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
    const meta = await settle(COMPARISON_EXAMPLE)
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
    const meta = await settle(COMPARISON_EXAMPLE)
    const { state, data } = fold(definition, [
      { type: 'turn/start', seq: 1, data: { turn: 2 } },
      { type: 'tool/call', seq: 2, data: { turn: 2, callId: 'a', name: 'ui_render' } },
      { type: 'tool/result', seq: 3, surfaceOp: 'append', data: { turn: 2, message: { source: { callId: 'a' } }, meta } },
    ])
    expect(definition.buildLocationData({ state }, 'turn', data)).toBe(data)
    expect(definition.buildLocationData({ state }, 'step', null)).toBeNull()
  })

  it('ignores a failed program and an errored call', async () => {
    const { definition } = loadClient()
    expect(definition.match['tool/result']({ surfaceOp: 'append', data: { turn: 1, meta: await settle('hologram') } })).toBeNull()
    const { data } = fold(definition, [
      { type: 'turn/start', seq: 1, data: { turn: 3 } },
      { type: 'tool/call', seq: 2, data: { turn: 3, callId: 'a', name: 'ui_render' } },
      { type: 'tool/result', seq: 3, surfaceOp: 'append', data: { turn: 3, message: { source: { callId: 'a' }, isError: true }, meta: await settle(COMPARISON_EXAMPLE) } },
    ])
    expect(data).toBeNull()
  })

  it('draws the cards under a completed reply and nowhere else', async () => {
    const { Tail } = loadClient()
    const meta = await settle(COMPARISON_EXAMPLE, 'Fares')
    const value = { cards: [{ seq: 5, callId: 'call-9', meta }] }
    const turn = (reason: string) => ({ turn: 4, end: { data: { reason: { kind: reason } } }, data: { get: () => value } })
    const view = render(<Tail turn={turn('completed')} seq={9} {...kit()} />)
    expect(screen.getByText('Amtrak')).toBeTruthy()
    view.rerender(<Tail turn={turn('completed')} seq={4} {...kit()} />)
    expect(screen.queryByText('Amtrak')).toBeNull()
    view.rerender(<Tail turn={turn('aborted')} seq={9} {...kit()} />)
    expect(screen.queryByText('Amtrak')).toBeNull()
  })

  it('follows the observable turn data source', async () => {
    const { Tail } = loadClient()
    const meta = await settle(COMPARISON_EXAMPLE)
    let current: unknown
    const listeners = new Set<() => void>()
    const source = { getSnapshot: () => current, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) } }
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { source: () => source } }
    render(<Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.queryByText('Amtrak')).toBeNull()
    act(() => {
      current = { cards: [{ seq: 2, callId: 'call-10', meta }] }
      for (const listener of listeners) listener()
    })
    expect(screen.getByText('Amtrak')).toBeTruthy()
  })

  it('shares the reader\'s edits between the row and the tail', async () => {
    const { ToolView, Tail } = loadClient()
    const meta = await settle(ESTIMATE_EXAMPLE)
    const row = render(<ToolView phase="result" block={resultBlock(meta)} callId="call-11" useDisclosure={useHostDisclosure} {...kit()} />)
    act(() => { fireEvent.change(screen.getByRole('slider', { name: 'Seats' }), { target: { value: '10' } }) })
    row.unmount()
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 3, callId: 'call-11', meta }] }) } }
    render(<Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.getByText('10 seats on Pro cost 290 USD a month.')).toBeTruthy()
  })
})

describe('persisted programs from other builds', () => {
  /** A card persisted by the first build of this plugin (format 1), copied from a real session. */
  const LEGACY_META = {
    ok: true,
    title: '可拖动的报价器',
    height: 420,
    program: {
      v: 1, catalogVersion: '1', catalogHash: '6969bfec',
      state: [
        { key: 'seats', kind: 'number', init: 8, min: 1, max: 50, step: 1 },
        { key: 'price', kind: 'number', init: 29, min: 5, max: 200, step: 1 },
        { key: 'annual', kind: 'boolean', init: true },
      ],
      calc: [
        { key: 'monthly', expr: ['mul', ['ref', 'seats'], ['ref', 'price']] },
        { key: 'yearly', expr: ['mul', ['ref', 'monthly'], 12] },
        { key: 'saved', expr: ['mul', ['ref', 'yearly'], 0.2] },
      ],
      nodes: [
        { id: 'root', type: 'card', parent: null, props: { padding: 4, gap: 3 } },
        { id: 't', type: 'title', parent: 'root', props: { text: [{ $c: 'c0' }], size: 'lg' } },
        { id: 's1', type: 'slider', parent: 'root', props: { label: [{ $c: 'c2' }], min: 1, max: 50, step: 1 }, bind: { key: 'seats', kind: 'number' } },
        { id: 'c', type: 'checkbox', parent: 'root', props: { label: [{ $c: 'c4' }] }, bind: { key: 'annual', kind: 'boolean' } },
        { id: 'm1', type: 'metric', parent: 'root', props: { label: [{ $c: 'c5' }], value: ['ref', 'monthly'], unit: '$' } },
        { id: 'm3', type: 'metric', parent: 'root', props: { label: [{ $c: 'c7' }], value: ['ref', 'saved'], unit: '$', tone: 'success' } },
      ],
      constants: { c0: 'Team plan', c2: 'Seats', c4: 'Annual billing (-20%)', c5: 'Monthly', c7: 'You save' },
      fallback: '# Team plan',
      diagnostics: [],
    },
  }

  it('still draws a card persisted by the first build', () => {
    const { Tail } = loadClient()
    const turn = { turn: 11, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 2524, callId: 'legacy', meta: LEGACY_META }] }) } }
    render(<Tail turn={turn} seq={2533} {...kit()} />)
    expect(screen.getByText('Team plan')).toBeTruthy()
    expect(screen.getByText('232')).toBeTruthy()
    expect(screen.getByText('556.8')).toBeTruthy()
    act(() => { fireEvent.change(screen.getByRole('slider', { name: 'Seats' }), { target: { value: '10' } }) })
    expect(screen.getByText('290')).toBeTruthy()
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('does not stack the call title over a heading the program already has', () => {
    const { Tail } = loadClient()
    const turn = { turn: 11, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'titled', meta: LEGACY_META }] }) } }
    render(<Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.queryByText('可拖动的报价器')).toBeNull()
    expect(screen.getByText('Team plan')).toBeTruthy()
  })

  it('uses the call title when the program has no heading', async () => {
    const { Tail } = loadClient()
    const meta = await settle(COMPARISON_EXAMPLE.replace('card "Fares to Boston"', 'card'), 'Fares')
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'untitled', meta }] }) } }
    render(<Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.getByText('Fares')).toBeTruthy()
  })

  it('shows a newer format as text instead of half-drawing it', () => {
    const { Tail } = loadClient()
    const meta = { ...LEGACY_META, program: { ...LEGACY_META.program, v: 99, fallback: 'text version of the future' } }
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'future', meta }] }) } }
    render(<Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.getByText('text version of the future')).toBeTruthy()
    expect(screen.getByText(/newer version of the plugin/u)).toBeTruthy()
  })

  it('draws what it knows and says what it skipped', () => {
    const { Tail } = loadClient()
    const program = { ...LEGACY_META.program, nodes: [...LEGACY_META.program.nodes, { id: 'x', type: 'hologram', parent: 'root', props: {} }] }
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'mixed', meta: { ...LEGACY_META, program } }] }) } }
    const view = render(<Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.getByText('1 component(s) could not be shown.')).toBeTruthy()
    expect(view.container.querySelector('hologram')).toBeNull()
  })

  it('degrades a card that fails to render to its text version', () => {
    const { Tail } = loadClient()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // React's development build re-dispatches a caught render error as a window error; that report is expected here.
    const quiet = (event: ErrorEvent): void => { event.preventDefault() }
    window.addEventListener('error', quiet)
    try {
      const hostile = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('boom') } })
      const program = { ...LEGACY_META.program, constants: hostile, fallback: 'safe text version' }
      const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'broken', meta: { ...LEGACY_META, program } }] }) } }
      const view = render(<div data-testid="transcript"><Tail turn={turn} seq={9} {...kit()} /><p>the rest of the transcript</p></div>)
      expect(within(view.getByTestId('transcript')).getByText('safe text version')).toBeTruthy()
      expect(screen.getByText('the rest of the transcript')).toBeTruthy()
    } finally {
      window.removeEventListener('error', quiet)
    }
  })
})
