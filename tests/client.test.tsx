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
import { CALCULUS_EXAMPLE, COMPARISON_EXAMPLE, ESTIMATE_EXAMPLE, QUIZ_EXAMPLE } from '../src/host/model-brief.ts'
import { buildPresentationMeta, createUIRenderTool } from '../src/host/tool.ts'
import { compareCells } from '../src/client/components.tsx'
import { layoutDiagram } from '../src/client/diagram.tsx'

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

  it('shows the text to copy by hand when the clipboard refuses', async () => {
    const { ToolView } = loadClient()
    const session = kit('half a sentence')
    const writeText = vi.fn(async () => { throw new Error('denied') })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ToolView phase="result" block={resultBlock(await settle(QUIZ_EXAMPLE))} callId="call-7b" useDisclosure={useHostDisclosure} {...session} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /C\. Poisson/u })) })
    const status = screen.getByRole('status')
    expect(status.textContent).toContain('copy this by hand')
    expect(status.querySelector('code')?.textContent).toBe('C')
  })

  it('states the message a button will send', async () => {
    const { ToolView } = loadClient()
    render(<ToolView phase="result" block={resultBlock(await settle(QUIZ_EXAMPLE))} callId="call-8" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(screen.getByRole('button', { name: /C\. Poisson/u }).getAttribute('title')).toBe('Sends: C')
  })
})

describe('math cards', () => {
  it('draws a calculus card whose figures follow the slider with no request', async () => {
    const { ToolView } = loadClient()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const meta = await settle(CALCULUS_EXAMPLE)
    expect((meta.program as { version: number }).version).toBe(1)
    const view = render(<ToolView phase="result" block={resultBlock(meta)} callId="math-1" useDisclosure={useHostDisclosure} {...kit()} />)
    const formula = screen.getByRole('math')
    expect(formula.getAttribute('aria-label')).toBe('integral(x^2, x, 0, a) = 0.333333')
    expect(formula.textContent).toContain('∫')
    expect(view.container.querySelector('.dsh-iui-plot-curve')?.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+L/u)
    expect(view.container.querySelector('.dsh-iui-plot-shade')).not.toBeNull()
    expect(view.container.querySelector('.dsh-iui-plot-tangent')).not.toBeNull()
    expect(screen.getByText('x = 1 · y = 1 · slope = 2 · area = 0.333333')).toBeTruthy()
    act(() => { fireEvent.change(screen.getByRole('slider', { name: 'Upper limit a' }), { target: { value: '2' } }) })
    expect(screen.getByRole('math').getAttribute('aria-label')).toBe('integral(x^2, x, 0, a) = 2.66667')
    expect(screen.getByText('x = 2 · y = 4 · slope = 4 · area = 2.66667')).toBeTruthy()
    expect(view.container.querySelector('.dsh-iui-metric-value')?.textContent).toBe('2.66667')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('typesets fractions, radicals, scripts, and big operators', async () => {
    const { ToolView } = loadClient()
    const source = [
      '@state n = 10',
      'card "Forms"',
      '  formula "sqrt(a^2 + 1) / (2a)" label="q"',
      '  formula "sum(1/k^2, k, 1, n)" digits=4',
      '  formula "limit(sin(x)/x, x, 0)"',
      '  formula "a^2 + b^2 = 25"',
      '@state a = 3',
      '@state b = 4',
    ].join('\n')
    const view = render(<ToolView phase="result" block={resultBlock(await settle(source))} callId="math-2" useDisclosure={useHostDisclosure} {...kit()} />)
    const [quotient, series, lim, equation] = screen.getAllByRole('math')
    expect(quotient?.querySelector('.dsh-iui-math-frac .dsh-iui-math-radical .dsh-iui-math-radicand')).not.toBeNull()
    expect(quotient?.getAttribute('aria-label')).toBe('sqrt(a^2 + 1) / (2 * a) = 0.527046')
    expect(series?.textContent).toContain('∑')
    expect(series?.getAttribute('aria-label')).toBe('sum(1 / k^2, k, 1, n) = 1.55')
    expect(lim?.textContent).toContain('lim')
    expect(lim?.getAttribute('aria-label')).toBe('limit(sin(x) / x, x, 0) = 1')
    expect(equation?.getAttribute('aria-label')).toBe('a^2 + b^2 == 25')
    expect(equation?.querySelector('.dsh-iui-math-result')).toBeNull()
    expect(view.container.querySelectorAll('.dsh-iui-math-sup').length).toBeGreaterThanOrEqual(3)
  })

  it('breaks a curve at an asymptote and labels several curves', async () => {
    const { ToolView } = loadClient()
    const source = 'card\n  plot fn=["tan(x)", "x"] from=-3 to=3 labels=["tan","identity"]'
    const view = render(<ToolView phase="result" block={resultBlock(await settle(source))} callId="math-3" useDisclosure={useHostDisclosure} {...kit()} />)
    const [tangent, line] = [...view.container.querySelectorAll('.dsh-iui-plot-curve')]
    expect((tangent?.getAttribute('d')?.match(/M/gu) ?? []).length).toBeGreaterThanOrEqual(3)
    expect((line?.getAttribute('d')?.match(/M/gu) ?? []).length).toBe(1)
    expect(screen.getByText('tan')).toBeTruthy()
    expect(screen.getByText('identity')).toBeTruthy()
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
  /** A card persisted before programs carried a `version` field, copied from a real session. */
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

  /** The same card as this build persists it, with both version fields. */
  const CURRENT_META = { ...LEGACY_META, version: 1, program: { ...LEGACY_META.program, version: 1 } }

  it('shows a card from before the version fields as its text, not as a drawing', () => {
    const { Tail } = loadClient()
    const turn = { turn: 11, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 2524, callId: 'legacy', meta: LEGACY_META }] }) } }
    render(<Tail turn={turn} seq={2533} {...kit()} />)
    expect(screen.getByText('# Team plan')).toBeTruthy()
    expect(screen.getByText(/another version of the plugin/u)).toBeTruthy()
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('shows a program without a version field as its text inside a current envelope', () => {
    const { Tail } = loadClient()
    const meta = { ...CURRENT_META, program: LEGACY_META.program }
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'unversioned', meta }] }) } }
    render(<Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.getByText('# Team plan')).toBeTruthy()
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('draws a card persisted by this build', () => {
    const { Tail } = loadClient()
    const turn = { turn: 11, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 2524, callId: 'current', meta: CURRENT_META }] }) } }
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
    const turn = { turn: 11, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'titled', meta: CURRENT_META }] }) } }
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
    const meta = { ...CURRENT_META, program: { ...CURRENT_META.program, version: 99, fallback: 'text version of the future' } }
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'future', meta }] }) } }
    render(<Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.getByText('text version of the future')).toBeTruthy()
    expect(screen.getByText(/another version of the plugin/u)).toBeTruthy()
  })

  it('draws what it knows and says what it skipped', () => {
    const { Tail } = loadClient()
    const program = { ...CURRENT_META.program, nodes: [...CURRENT_META.program.nodes, { id: 'x', type: 'hologram', parent: 'root', props: {} }] }
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'mixed', meta: { ...CURRENT_META, program } }] }) } }
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
      const program = { ...CURRENT_META.program, constants: hostile, fallback: 'safe text version' }
      const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 1, callId: 'broken', meta: { ...CURRENT_META, program } }] }) } }
      const view = render(<div data-testid="transcript"><Tail turn={turn} seq={9} {...kit()} /><p>the rest of the transcript</p></div>)
      expect(within(view.getByTestId('transcript')).getByText('safe text version')).toBeTruthy()
      expect(screen.getByText('the rest of the transcript')).toBeTruthy()
    } finally {
      window.removeEventListener('error', quiet)
    }
  })
})

describe('animation', () => {
  const STEPPER = [
    '@state t = 0 min=0 max=4 step=1',
    'card "Walkthrough"',
    '  player "Step" bind=t duration=4',
    '  steps items=["a = 1", "  b = 2", "c = 3", "d = 4", "e"] current=t + 1 mono=true',
    '  table columns=["name", "value"] rows=[["i", "{t}"], ["j", "{t * 2}"]] current=t',
    '  text "{pick(t + 1, \\"start\\", \\"one\\", \\"two\\", \\"three\\", \\"done\\")}"',
  ].join('\n')

  /** Animation frames the test advances by hand. */
  function frames() {
    let queue: Array<(now: number) => void> = []
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => { queue.push(callback); return queue.length })
    vi.stubGlobal('cancelAnimationFrame', cancel)
    let now = 0
    return {
      cancel,
      /** Run queued frames `count` times, `ms` apart; returns how many ran. */
      run(count: number, ms = 100): number {
        let ran = 0
        for (let index = 0; index < count && queue.length > 0; index += 1) {
          const pending = queue
          queue = []
          act(() => { for (const callback of pending) callback(now) })
          now += ms
          ran += 1
        }
        return ran
      },
      get pending(): number { return queue.length },
    }
  }

  async function draw(callId: string) {
    const { ToolView } = loadClient()
    const meta = await settle(STEPPER)
    return render(<ToolView phase="result" block={resultBlock(meta)} callId={callId} useDisclosure={useHostDisclosure} {...kit()} />)
  }

  const highlighted = (view: ReturnType<typeof render>, selector: string): string | undefined =>
    view.container.querySelector(`${selector} [aria-current="step"]`)?.textContent ?? undefined

  afterEach(() => { vi.unstubAllGlobals() })

  it('draws the controls and the first frame', async () => {
    const view = await draw('anim-1')
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false')
    expect((screen.getByRole('button', { name: 'Step back' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Speed 1×; click to change' }).textContent).toBe('1×')
    expect(view.container.querySelector('.dsh-iui-steps')?.hasAttribute('data-mono')).toBe(true)
    expect(view.container.querySelector('.dsh-iui-card')?.lastElementChild?.classList.contains('dsh-iui-player')).toBe(true)
    expect(highlighted(view, '.dsh-iui-steps')).toBe('a = 1')
    expect(highlighted(view, '.dsh-iui-table')).toBeUndefined()
    expect(view.container.querySelectorAll('.dsh-iui-steps li')[1]?.textContent).toBe('  b = 2')
    expect(screen.getByText('start')).toBeTruthy()
  })

  it('docks the player at the bottom of a card saved with it first', async () => {
    const { ToolView } = loadClient()
    const meta = await settle(STEPPER)
    const program = meta.program as { nodes: Array<{ type: string }> }
    const player = program.nodes.find(node => node.type === 'player') as { type: string }
    const nodes = [program.nodes[0], player, ...program.nodes.slice(1).filter(node => node !== player)]
    const saved = { ...meta, program: { ...program, nodes } }
    const view = render(<ToolView phase="result" block={resultBlock(saved)} callId="anim-8" useDisclosure={useHostDisclosure} {...kit()} />)
    expect(view.container.querySelector('.dsh-iui-card')?.lastElementChild?.classList.contains('dsh-iui-player')).toBe(true)
  })

  it('steps forward and back by one step, inside the range', async () => {
    const view = await draw('anim-2')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Step forward' })) })
    expect(highlighted(view, '.dsh-iui-steps')).toBe('  b = 2')
    expect(highlighted(view, '.dsh-iui-table')).toBe('i1')
    expect(screen.getByText('one')).toBeTruthy()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Step back' })) })
    expect(screen.getByText('start')).toBeTruthy()
    for (let index = 0; index < 6; index += 1) {
      const next = screen.getByRole('button', { name: 'Step forward' }) as HTMLButtonElement
      if (!next.disabled) act(() => { fireEvent.click(next) })
    }
    expect(screen.getByText('done')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Step forward' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('plays to the end in its duration and stops there, without a request', async () => {
    const clock = frames()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await draw('anim-3')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe('true')
    clock.run(16)
    expect(screen.getByText('one')).toBeTruthy()
    const ran = clock.run(100)
    expect(ran).toBeGreaterThan(20)
    expect(ran).toBeLessThan(30)
    expect(screen.getByText('done')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false')
    expect(clock.pending).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps its pace on a page that paints once a second', async () => {
    const clock = frames()
    await draw('anim-7')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    clock.run(3, 1000)
    expect(screen.getByText('two')).toBeTruthy()
    clock.run(10, 5000)
    expect(screen.getByText('done')).toBeTruthy()
  })

  it('starts again from the beginning once a run has ended', async () => {
    const clock = frames()
    await draw('anim-4')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    clock.run(100)
    expect(screen.getByText('done')).toBeTruthy()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    expect(screen.getByText('start')).toBeTruthy()
  })

  it('pauses when the reader scrubs, steps, or the card unmounts', async () => {
    const clock = frames()
    const view = await draw('anim-5')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    clock.run(3)
    act(() => { fireEvent.change(screen.getByRole('slider', { name: 'Step' }), { target: { value: '3' } }) })
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('three')).toBeTruthy()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Step back' })) })
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('two')).toBeTruthy()
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    const cancelled = clock.cancel.mock.calls.length
    view.unmount()
    expect(clock.cancel.mock.calls.length).toBe(cancelled + 1)
  })

  it('cycles the speed, and a faster run takes fewer frames', async () => {
    const clock = frames()
    await draw('anim-6')
    const speed = (): HTMLElement => screen.getByRole('button', { name: /^Speed/u })
    act(() => { fireEvent.click(speed()) })
    expect(speed().textContent).toBe('2×')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    const fast = clock.run(100)
    expect(screen.getByText('done')).toBeTruthy()
    expect(fast).toBeLessThan(25)
    act(() => { fireEvent.click(speed()) })
    expect(speed().textContent).toBe('0.5×')
    act(() => { fireEvent.click(speed()) })
    expect(speed().textContent).toBe('1×')
  })
})

describe('pages, checklists, sorting, and diagrams', () => {
  async function draw(source: string, callId: string, client = loadClient()) {
    const meta = await settle(source)
    const { ToolView } = client
    return { meta, view: render(<ToolView phase="result" block={resultBlock(meta)} callId={callId} useDisclosure={useHostDisclosure} {...kit()} />) }
  }

  it('shows one page at a time, by click or arrow key, the same in both copies', async () => {
    const client = loadClient()
    const source = 'card "Course"\n  tabs\n    tab "Idea"\n      text "A rate."\n    tab "Example"\n      text "2x"\n    tab "Practice"\n      text "Try 3x^2."'
    const { meta } = await draw(source, 'tabs-1', client)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
    expect(screen.getByText('A rate.')).toBeTruthy()
    expect(screen.queryByText('2x')).toBeNull()
    act(() => { fireEvent.click(tabs[1] as HTMLElement) })
    expect(screen.getByRole('tabpanel').textContent).toBe('2x')
    act(() => { fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' }) })
    expect(screen.getByRole('tabpanel').textContent).toBe('Try 3x^2.')
    expect(document.activeElement?.textContent).toBe('Practice')
    act(() => { fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' }) })
    expect(screen.getByRole('tabpanel').textContent).toBe('A rate.')
    act(() => { fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' }) })
    cleanup()
    const turn = { turn: 1, end: { data: { reason: { kind: 'completed' } } }, data: { get: () => ({ cards: [{ seq: 3, callId: 'tabs-1', meta }] }) } }
    render(<client.Tail turn={turn} seq={9} {...kit()} />)
    expect(screen.getByRole('tabpanel').textContent).toBe('Try 3x^2.')
  })

  it('counts ticked items into its bound state', async () => {
    await draw('@state done = 0\ncard\n  checklist "Packing" items=["Passport", "Tickets", "Charger"] bind=done\n  progress "Ready" value=done max=3', 'check-1')
    expect(screen.getByText('0 of 3 done')).toBeTruthy()
    act(() => { fireEvent.click(screen.getByRole('checkbox', { name: 'Tickets' })) })
    act(() => { fireEvent.click(screen.getByRole('checkbox', { name: 'Charger' })) })
    expect(screen.getByText('2 of 3 done')).toBeTruthy()
    expect(screen.getByText('2 / 3')).toBeTruthy()
    act(() => { fireEvent.click(screen.getByRole('checkbox', { name: 'Tickets' })) })
    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Charger' }).closest('label')?.hasAttribute('data-done')).toBe(true)
  })

  it('sorts by a column ascending, then descending, then back, keeping the highlight on its row', async () => {
    const { view } = await draw('card\n  table columns=["City", "Price"] rows=[["Oslo", "$1,200"], ["Rome", "$89"], ["Lima", ""], ["Bonn", "$300"]] sortable=true current=2', 'sort-1')
    const cities = (): string[] => [...view.container.querySelectorAll('tbody tr')].map(row => row.firstElementChild?.textContent ?? '')
    const header = (name: string): HTMLElement => screen.getByRole('button', { name })
    expect(cities()).toEqual(['Oslo', 'Rome', 'Lima', 'Bonn'])
    act(() => { fireEvent.click(header('Price')) })
    expect(cities()).toEqual(['Rome', 'Bonn', 'Oslo', 'Lima'])
    expect(header('Price').closest('th')?.getAttribute('aria-sort')).toBe('ascending')
    expect(view.container.querySelector('[aria-current="step"]')?.firstElementChild?.textContent).toBe('Rome')
    act(() => { fireEvent.click(header('Price')) })
    expect(cities()).toEqual(['Oslo', 'Bonn', 'Rome', 'Lima'])
    act(() => { fireEvent.click(header('Price')) })
    expect(cities()).toEqual(['Oslo', 'Rome', 'Lima', 'Bonn'])
    act(() => { fireEvent.click(header('City')) })
    expect(cities()).toEqual(['Bonn', 'Lima', 'Oslo', 'Rome'])
  })

  it('leaves a table without sortable= as written', async () => {
    await draw(COMPARISON_EXAMPLE, 'sort-2')
    expect(screen.queryByRole('button', { name: 'Operator' })).toBeNull()
  })

  it('compares cells as numbers when both are numbers, words otherwise', () => {
    expect(compareCells('$89', '$1,200', false)).toBeLessThan(0)
    expect(compareCells('-3', '2', false)).toBeLessThan(0)
    expect(compareCells('item 2', 'item 10', false)).toBeLessThan(0)
    expect(compareCells('7', 'seven', false)).toBeLessThan(0)
    expect(compareCells('', 'a', true)).toBeGreaterThan(0)
    expect(compareCells('1', '2', true)).toBeGreaterThan(0)
  })

  it('draws a diagram with its arrows and highlights the current box as it moves', async () => {
    const source = [
      '@state step = 1 min=1 max=3',
      'card',
      '  diagram "Retry" nodes=["Send", "Answered?", "Done"] edges=["Send -> Answered?", "Answered? -> Done: yes", "Answered? -> Send: no"] current=step',
      '  slider "Step" bind=step',
    ].join('\n')
    const { view } = await draw(source, 'diagram-1')
    const svg = view.container.querySelector('svg.dsh-iui-diagram-svg') as SVGElement
    expect(svg.getAttribute('aria-label')).toBe('Retry; Send → Answered?; Answered? → Done (yes); Answered? → Send (no); ▶ Send')
    expect(svg.querySelectorAll('.dsh-iui-diagram-node')).toHaveLength(3)
    expect(svg.querySelectorAll('.dsh-iui-diagram-line')).toHaveLength(3)
    expect(svg.querySelectorAll('.dsh-iui-diagram-label')).toHaveLength(2)
    const current = (): string => svg.querySelector('[data-current] text')?.textContent ?? ''
    expect(current()).toBe('Send')
    act(() => { fireEvent.change(screen.getByRole('slider', { name: 'Step' }), { target: { value: '2' } }) })
    expect(current()).toBe('Answered?')
  })
})

describe('diagram layout', () => {
  it('puts each box one layer past the boxes that lead to it, and returns loops along a lane', () => {
    const layout = layoutDiagram(['A', 'B', 'C', 'D'], [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 0, to: 2 }, { from: 2, to: 0 }, { from: 3, to: 3 }], 'down')
    const [a, b, c, d] = layout.boxes
    expect(a!.y).toBeLessThan(b!.y)
    expect(b!.y).toBeLessThan(c!.y)
    expect(d!.y).toBe(a!.y)
    expect(layout.arrows).toHaveLength(5)
    // Three forward arrows first, then the loop back to A along a lane, then D's loop to itself.
    expect(layout.arrows[3]!.path).toMatch(/H[\d.]+Q/u)
    expect(layout.arrows[4]!.path).toMatch(/C/u)
    const right = Math.max(...layout.boxes.map(box => box.x + box.w))
    expect(layout.width).toBeGreaterThan(right)
    for (const box of layout.boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y + box.h).toBeLessThanOrEqual(layout.height)
    }
  })

  it('flows left to right on request, and orders a layer to follow its parents', () => {
    const layout = layoutDiagram(['root', 'left', 'right', 'under right', 'under left'], [
      { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 2, to: 3 }, { from: 1, to: 4 },
    ], 'right')
    const [root, left, right, underRight, underLeft] = layout.boxes
    expect(root!.x).toBeLessThan(left!.x)
    expect(left!.x + left!.w / 2).toBe(right!.x + right!.w / 2)
    expect(underLeft!.y < underRight!.y).toBe(left!.y < right!.y)
  })

  it('wraps long text to three lines at most, ending in an ellipsis', () => {
    const layout = layoutDiagram(['检查输入是否合法并且记录每一次失败的原因然后决定是否重试以及等待多久再发送下一次请求直到成功为止'], [], 'down')
    const lines = layout.boxes[0]!.lines
    expect(lines).toHaveLength(3)
    expect(lines[2]!.endsWith('…')).toBe(true)
    expect(layout.boxes[0]!.w).toBeLessThanOrEqual(180)
  })

  it('draws an empty diagram as an empty drawing', () => {
    const layout = layoutDiagram([], [], 'down')
    expect(layout.boxes).toEqual([])
    expect(layout.width).toBeGreaterThan(0)
  })
})

describe('code blocks', () => {
  const Q = '"""'
  async function draw(source: string, callId: string) {
    const meta = await settle(source)
    const { ToolView } = loadClient()
    return render(<ToolView phase="result" block={resultBlock(meta)} callId={callId} useDisclosure={useHostDisclosure} {...kit()} />)
  }
  const TRACE = [
    '@state frame = 1 min=1 max=3 step=1',
    '@calc line = pick(frame, 1, 2, 3)',
    'card "Trace"',
    `  code lang=python current=line numbers=true ${Q}`,
    '    total = 0  # start',
    '    for i in range(3):',
    '        total += i',
    `  ${Q}`,
    '  player "Step" bind=frame',
  ].join('\n')

  it('draws each line with its number and syntax colours, and the current line marked', async () => {
    const view = await draw(TRACE, 'code-1')
    const lines = [...view.container.querySelectorAll('.dsh-iui-code-line')]
    expect(lines.map(line => line.querySelector('.dsh-iui-code-text')?.textContent)).toEqual(['total = 0  # start', 'for i in range(3):', '    total += i'])
    expect(lines.map(line => line.querySelector('.dsh-iui-code-number')?.textContent)).toEqual(['1', '2', '3'])
    expect(view.container.querySelector('.dsh-iui-tok-keyword')?.textContent).toBe('for')
    expect(view.container.querySelector('.dsh-iui-tok-comment')?.textContent).toBe('# start')
    expect(view.container.querySelector('.dsh-iui-tok-function')?.textContent).toBe('range')
    expect(lines[0]?.getAttribute('aria-current')).toBe('step')
    expect(lines[0]?.classList.contains('dsh-iui-current')).toBe(true)
    expect(screen.getByRole('region', { name: 'python' })).toBeTruthy()
  })

  it('moves the highlight with the player and scrolls only the block to it', async () => {
    const rows = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return Number(this.getAttribute('data-line') ?? 0) * 20
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(20)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(30)
    const scrolled = vi.spyOn(window, 'scrollTo')
    const view = await draw(TRACE, 'code-2')
    const box = view.container.querySelector('.dsh-iui-code-scroll') as HTMLElement
    expect(box.scrollTop).toBe(0)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Step forward' })) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Step forward' })) })
    const current = view.container.querySelector('[aria-current="step"]')
    expect(current?.getAttribute('data-line')).toBe('2')
    // Line 2 (20–40px) left a 30px viewport, which scrolled to 30 with one line of margin;
    // line 3 (40–60px) is then already in view, so the block does not move again.
    expect(box.scrollTop).toBe(40 - 30 + 20)
    expect(scrolled).not.toHaveBeenCalled()
    rows.mockRestore()
  })

  it('copies the exact text, and says when the page refuses', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await draw(`card\n  code caption="a.py" ${Q}\n    x = {1}\n\n    y = "}}"\n  ${Q}`, 'code-3')
    expect(screen.getByText('a.py')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })) })
    expect(writeText).toHaveBeenCalledWith('x = {1}\n\ny = "}}"')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    act(() => { fireEvent.blur(screen.getByRole('button', { name: 'Copied' })) })
    writeText.mockImplementation(() => Promise.reject(new Error('denied')))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })) })
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('follows a text state through value=, and wraps plain text', async () => {
    const view = await draw('@state src = "SELECT 1"\ncard\n  textInput "Query" bind=src\n  code lang=sql value=src\n  code "plain words"', 'code-4')
    const blocks = [...view.container.querySelectorAll('.dsh-iui-code-pre')]
    expect(blocks[0]?.textContent).toBe('SELECT 1')
    expect(blocks[0]?.hasAttribute('data-wrap')).toBe(false)
    expect(blocks[1]?.hasAttribute('data-wrap')).toBe(true)
    act(() => { fireEvent.change(screen.getByRole('textbox', { name: 'Query' }), { target: { value: 'select name from t' } }) })
    expect(blocks[0]?.textContent).toBe('select name from t')
    expect([...(blocks[0] as Element).querySelectorAll('.dsh-iui-tok-keyword')].map(token => token.textContent)).toEqual(['select', 'from'])
  })
})
