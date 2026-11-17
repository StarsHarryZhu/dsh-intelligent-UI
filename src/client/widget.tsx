/**
 * A widget in the chat: its frame, what it keeps, and what it asks for.
 *
 * The widget's code runs only inside a sandboxed frame whose document this
 * page writes once and then feeds by message: the theme, the source while it
 * streams, the shipped libraries it names, and its saved values, then the word
 * that it may run. What the frame sends back is checked by `bridge.ts` before
 * the page acts on it. A message to the model or a link only goes out when the
 * reader has just clicked inside that frame, and a frame that navigates away
 * from its document is removed.
 * @module dsh-intelligent-ui/client/widget
 */

import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CHANNEL, type Json, SCROLL_INTERVAL_MS, type ScrollInput, type ToFrame, type Unmarked } from '../widget/messages.ts'
import { normalizeSource } from '../widget/normalize.ts'
import { FRAME_SANDBOX } from '../widget/policy.ts'
import { addresses, moduleAddresses } from '../widget/scan.ts'
import { readFrameMessage, type FrameAction } from './bridge.ts'
import { copyText } from './clipboard.ts'
import { frameDocument, type FrameParts } from './document.ts'
import type { CardMemory, EditsStore } from './edits.ts'
import type { InputStateLike, SessionKit } from './host.ts'
import type { LibraryLoader } from './libraries.ts'
import { translator, type CopyKey } from './locales.ts'
import type { Presence } from './presence.ts'
import { readTheme, watchTheme, type FrameTheme } from './theme.ts'

/** What every widget on the page shares. */
export interface WidgetEnv {
  /** What each widget keeps. */
  store: EditsStore
  /** Which widgets stand in the reply right now. */
  presence: Presence
  /** The fixed parts of a frame's document. */
  parts: FrameParts
  /** Loads the shipped libraries a widget names. */
  loadLibraries: LibraryLoader
}

/** How far a widget's source has come. */
export type WidgetStage = 'streaming' | 'complete' | 'ready'

/** How a card relates to the earlier card it revises. */
export interface Revision {
  /** Memory key of the earlier card, whose kept values this card starts from. */
  key: string
  /** This card's call id, recorded on the earlier card once this one has settled. */
  by?: string
}

/**
 * Describe a card's revision of an earlier one.
 * @param sessionId - the hosting session.
 * @param revises - the earlier card's id, when the card names one.
 * @param callId - this card's call id, once its result has settled; a preview leaves it out.
 * @returns the revision, or undefined when the card revises nothing.
 */
export function revisionOf(sessionId: string | undefined, revises: string | undefined, callId?: string): Revision | undefined {
  if (revises === undefined || revises === callId) return undefined
  return { key: `${sessionId ?? ''}:${revises}`, ...(callId === undefined ? {} : { by: callId }) }
}

/** Props of one widget. */
export interface WidgetProps {
  env: WidgetEnv
  /** The source as the model wrote it, complete or streaming. */
  source: string
  stage: WidgetStage
  /** Key of this widget's memory: session and call. */
  memoryKey: string
  /** This widget's card id, which a request to fix it names. */
  cardId?: string | undefined
  /** The session kit of the slot that hosts the widget. */
  kit: SessionKit
  /** The earlier card this one revises, from {@link revisionOf}. */
  revision?: Revision | undefined
}

/** Memory of a widget nobody has touched. Stable, so the store snapshot stays referentially equal. */
const UNTOUCHED: CardMemory = {}

/** Least time between two messages a widget sends, in milliseconds. */
const SEND_INTERVAL_MS = 1000

/** Least time between two streamed renders sent to a frame, in milliseconds. */
const STREAM_INTERVAL_MS = 80

/** How far outside the viewport a settled widget's frame starts loading, in pixels. */
const NEAR_MARGIN = '800px 0px'

/** Errors one widget shows. */
const MAX_SHOWN_ERRORS = 5

/**
 * One widget: its frame, the line it folds to once a later card replaces it,
 * and its notes.
 * @param props - the source, its stage, and the widget's memory.
 * @returns the widget.
 */
export function Widget(props: WidgetProps): ReactNode {
  const { env, memoryKey, kit } = props
  const { store } = env
  const tr = translator(kit.t)
  const subscribe = useCallback((listener: () => void) => store.subscribe(memoryKey, listener), [store, memoryKey])
  const revisedKey = props.revision?.key
  const revisedBy = props.revision?.by
  // A revision starts from what the earlier card kept. Nothing is written until
  // this card's frame sends something, so the earlier card's later changes do
  // not leak in.
  const base = useMemo(() => carriedMemory(revisedKey === undefined ? undefined : store.get(revisedKey)), [store, revisedKey])
  const memory = useSyncExternalStore(subscribe, () => store.get(memoryKey) ?? base)
  useEffect(() => {
    if (revisedKey === undefined || revisedBy === undefined || revisedKey === memoryKey) return
    const earlier = store.get(revisedKey) ?? UNTOUCHED
    if (earlier.revisedBy !== revisedBy) store.set(revisedKey, { ...earlier, revisedBy })
  }, [store, revisedKey, revisedBy, memoryKey])
  const html = useMemo(() => normalizeSource(props.source), [props.source])
  const [unfolded, setUnfolded] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<{ key: CopyKey; text?: string } | undefined>(undefined)
  const send = useSender(kit, setNotice)
  const update = useCallback((change: (current: CardMemory) => CardMemory, keep = true) => {
    store.set(memoryKey, change(store.get(memoryKey) ?? base), keep)
  }, [store, memoryKey, base])
  const reportError = useCallback((message: string) => {
    setErrors(previous => (previous.length >= MAX_SHOWN_ERRORS || previous.includes(message) ? previous : [...previous, message]))
  }, [])

  const replaced = memory.revisedBy !== undefined
  const fold = replaced ? <Replaced open={unfolded} onToggle={() => { setUnfolded(open => !open) }} tr={tr} /> : null
  if (replaced && !unfolded) return fold
  const askFix = (): void => {
    const lines = errors.map(error => `- ${error}`).join('\n')
    send(tr('error.request', { errors: lines, card: props.cardId ?? '' }))
  }
  return (
    <div className="dsh-iui-widget" data-dsh-intelligent-ui="widget" data-stage={props.stage}>
      {fold}
      <WidgetFrame
        env={env}
        html={html}
        stage={props.stage}
        memory={memory}
        update={update}
        send={send}
        onError={reportError}
        onNotice={(key) => { setNotice({ key }) }}
        tr={tr}
      />
      {errors.length === 0 ? null : (
        <div className="dsh-iui-note dsh-iui-error" role="status" data-dsh-intelligent-ui="errors">
          <span>{tr('error.title')}</span>
          <ul>{errors.map(error => <li key={error}>{error}</li>)}</ul>
          {props.stage === 'ready' && props.cardId !== undefined ? (
            <button type="button" className="dsh-iui-note-action" onClick={askFix}>{tr('error.fix')}</button>
          ) : null}
        </div>
      )}
      {notice === undefined ? null : (
        <div className="dsh-iui-note" role="status">
          {tr(notice.key)}
          {notice.text === undefined ? null : <code className="dsh-iui-copy-text">{notice.text}</code>}
        </div>
      )}
    </div>
  )
}

/** The memory a revision starts from: everything the earlier card kept, except its replacement mark. */
function carriedMemory(earlier: CardMemory | undefined): CardMemory {
  if (earlier === undefined) return UNTOUCHED
  const { revisedBy: _revisedBy, height: _height, ...kept } = earlier
  return kept.state === undefined && kept.controls === undefined ? UNTOUCHED : kept
}

/** Props of the frame itself. */
interface FrameProps {
  env: WidgetEnv
  html: string
  stage: WidgetStage
  memory: CardMemory
  update: (change: (current: CardMemory) => CardMemory, keep?: boolean) => void
  send: (text: string) => void
  onError: (message: string) => void
  onNotice: (key: CopyKey) => void
  tr: (key: CopyKey, params?: Record<string, unknown>) => string
}

/** The frame's running state, read by handlers that outlive one render. */
interface FrameLive {
  props: FrameProps
  loads: number
  ready: boolean
  posted: string
  final: boolean
  ran: boolean
  /** Addresses already asked of the library loader. */
  asked: Set<string>
  /** The library files on their way to the frame. */
  libraries: Promise<void>
  lastSend: number
  lastStream: number
  heightSavedAt: number
  /** When each kind of the reader's scrolling was last repeated to the chat. */
  lastScroll: Record<ScrollInput, number>
  frame: number | undefined
}

/** The sandboxed frame of one widget. */
function WidgetFrame(props: FrameProps): ReactNode {
  const { env, stage, tr } = props
  const holder = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const settled = stage === 'ready'
  const [near, setNear] = useState(() => !settled || typeof IntersectionObserver !== 'function')
  const [height, setHeight] = useState(() => props.memory.height ?? (settled ? 120 : 0))
  const [broken, setBroken] = useState(false)
  const [opening] = useState(pageTheme)
  const [srcdoc] = useState(() => frameDocument(env.parts, opening))
  // The frame element carries the colour scheme its document uses: where the two
  // differ, the browser paints the frame opaque instead of keeping it transparent.
  const [dark, setDark] = useState(opening.dark)
  const live = useRef<FrameLive>({ props, loads: 0, ready: false, posted: '', final: false, ran: false, asked: new Set(), libraries: Promise.resolve(), lastSend: Number.NEGATIVE_INFINITY, lastStream: Number.NEGATIVE_INFINITY, heightSavedAt: Number.NEGATIVE_INFINITY, lastScroll: { wheel: Number.NEGATIVE_INFINITY, touch: Number.NEGATIVE_INFINITY, key: Number.NEGATIVE_INFINITY }, frame: undefined })
  live.current.props = props

  const post = useCallback((message: Unmarked<ToFrame>) => {
    frame.current?.contentWindow?.postMessage({ channel: CHANNEL, ...message }, '*')
  }, [])

  // Shipped copies of the libraries a widget names go to its frame as soon as
  // their addresses appear, so a widget still streaming in draws with them too.
  const sendLibraries = useCallback((html: string): Promise<void> => {
    const state = live.current
    const urls = [...addresses(html).map(entry => entry.url), ...moduleAddresses(html)].filter(url => !state.asked.has(url))
    if (urls.length === 0) return state.libraries
    for (const url of urls) state.asked.add(url)
    const arriving = state.props.env.loadLibraries(urls)
    state.libraries = Promise.all([state.libraries, arriving]).then(([, files]) => {
      if (files.length > 0) post({ t: 'libs', files })
    })
    return state.libraries
  }, [post])

  const push = useCallback(async (): Promise<void> => {
    const state = live.current
    if (!state.ready || state.final) return
    const { html, stage: now, memory } = state.props
    if (now === 'ready') {
      state.final = true
      await sendLibraries(html)
      post({
        t: 'render',
        html,
        final: true,
        ...(memory.state === undefined ? {} : { state: memory.state }),
        ...(memory.controls === undefined ? {} : { controls: { ...memory.controls } as Record<string, Json> }),
      })
      return
    }
    if (html === state.posted) return
    state.posted = html
    state.lastStream = performance.now()
    void sendLibraries(html)
    post({ t: 'render', html, final: false })
  }, [post, sendLibraries])

  // A streamed source is sent at most every STREAM_INTERVAL_MS; the settled one at once.
  useEffect(() => {
    const state = live.current
    if (state.frame !== undefined) return
    const tick = (): void => {
      state.frame = undefined
      if (state.props.stage !== 'ready' && performance.now() - state.lastStream < STREAM_INTERVAL_MS) {
        state.frame = requestAnimationFrame(tick)
        return
      }
      void push()
    }
    state.frame = requestAnimationFrame(tick)
  }, [props.html, stage, push])
  useEffect(() => () => {
    const state = live.current
    if (state.frame !== undefined) cancelAnimationFrame(state.frame)
  }, [])

  // A settled widget's frame loads only when it comes near the viewport.
  useEffect(() => {
    if (near || holder.current === null || typeof IntersectionObserver !== 'function') return undefined
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return
      setNear(true)
      observer.disconnect()
    }, { rootMargin: NEAR_MARGIN })
    observer.observe(holder.current)
    return () => { observer.disconnect() }
  }, [near])

  useEffect(() => {
    if (holder.current === null) return undefined
    return watchTheme(holder.current, (theme) => {
      setDark(theme.dark)
      post({ t: 'theme', ...theme })
    })
  }, [post])

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (frame.current === null || event.source !== frame.current.contentWindow) return
      const action = readFrameMessage(event.data)
      if (action !== undefined) handle(action)
    }
    const handle = (action: FrameAction): void => {
      const state = live.current
      const current = state.props
      switch (action.kind) {
        case 'height': {
          setHeight(action.height)
          const now = performance.now()
          if (state.ran && now - state.heightSavedAt > 1000) {
            state.heightSavedAt = now
            current.update(memory => ({ ...memory, height: action.height }))
          }
          return
        }
        case 'ran':
          state.ran = true
          return
        case 'scroll': {
          // The chat tells the reader's scrolling from its own by input events, and none
          // from inside the frame reach it: repeat the reader's on the frame element, so a
          // scroll the frame passes on to the chat is not taken back. A key counts only
          // while the frame has the focus, as the key could reach it only then.
          const element = frame.current
          if (element === null || (action.input === 'key' && document.activeElement !== element)) return
          const now = performance.now()
          if (now - state.lastScroll[action.input] < SCROLL_INTERVAL_MS) return
          state.lastScroll[action.input] = now
          element.dispatchEvent(scrollEvent(action.input, action.key))
          return
        }
        case 'state':
          current.update(memory => ({ ...memory, state: action.value }))
          return
        case 'controls':
          current.update(memory => ({ ...memory, controls: action.value }))
          return
        case 'error':
          current.onError(action.message)
          return
        case 'send':
        case 'open': {
          // Only a click inside this frame, just now, lets a widget speak or open a page.
          if (!clickedInside(frame.current)) {
            current.onNotice(action.kind === 'send' ? 'send.blocked' : 'open.blocked')
            return
          }
          const now = performance.now()
          if (now - state.lastSend < SEND_INTERVAL_MS) return
          state.lastSend = now
          if (action.kind === 'send') current.send(action.text)
          else window.open(action.url, '_blank', 'noopener,noreferrer')
          return
        }
        default:
      }
    }
    window.addEventListener('message', onMessage)
    return () => { window.removeEventListener('message', onMessage) }
  }, [])

  const onLoad = (): void => {
    const state = live.current
    state.loads += 1
    if (state.loads > 1) {
      // The frame left its document: whatever it shows now is not the widget.
      setBroken(true)
      return
    }
    state.ready = true
    if (holder.current !== null) {
      const theme = readTheme(holder.current)
      setDark(theme.dark)
      post({ t: 'theme', ...theme })
    }
    void push()
  }

  return (
    <div ref={holder} className="dsh-iui-frame-holder" style={{ minHeight: broken ? undefined : `${height}px` }}>
      {broken ? (
        <div className="dsh-iui-note" role="status">{tr('frame.left')}</div>
      ) : near ? (
        <iframe
          ref={frame}
          className="dsh-iui-frame"
          title={tr('frame.title')}
          sandbox={FRAME_SANDBOX}
          allow=""
          referrerPolicy="no-referrer"
          srcDoc={srcdoc}
          style={{ height: `${height}px`, colorScheme: dark ? 'dark' : 'light' }}
          onLoad={onLoad}
        />
      ) : null}
    </div>
  )
}

/**
 * The event the chat would have met had the reader's input landed outside the
 * frame. It does not bubble, so it reaches only listeners that watch the way
 * down to the frame, as the chat's scroll container does; it scrolls nothing.
 */
function scrollEvent(input: ScrollInput, key: string | undefined): Event {
  if (input === 'wheel') return new WheelEvent('wheel')
  if (input === 'key') return new KeyboardEvent('keydown', { key: key ?? '' })
  return new Event('touchstart')
}

/** The page's theme before the frame has a place to read it from: the body carries the chat's tokens. */
function pageTheme(): FrameTheme {
  if (typeof document === 'undefined' || document.body === null) return { vars: {}, dark: false, lang: '' }
  return readTheme(document.body)
}

/**
 * Whether the reader has just clicked inside this frame: the page holds a
 * transient activation, and the frame is the focused element, which it becomes
 * when the reader clicks in it.
 */
function clickedInside(frame: HTMLIFrameElement | null): boolean {
  if (frame === null) return false
  const activation = (navigator as { userActivation?: { isActive?: boolean } }).userActivation
  const active = activation === undefined || activation.isActive === true
  return active && document.activeElement === frame
}

/**
 * Send a widget's message through the session's composer, as if the reader had
 * typed it; where the composer cannot take it, copy it for the reader.
 */
function useSender(kit: SessionKit, setNotice: (notice: { key: CopyKey; text?: string } | undefined) => void): (text: string) => void {
  const composerReady = useComposerReady(kit)
  return (text) => {
    const actions = kit.inputActions
    if (typeof actions?.setDraft === 'function' && typeof actions.submit === 'function' && composerReady) {
      try {
        actions.setDraft(text)
        actions.submit()
        setNotice(undefined)
        return
      } catch (error) {
        console.error('dsh-intelligent-ui: sending a widget message failed', error)
      }
    }
    setNotice({ key: typeof actions?.setDraft === 'function' ? 'send.copied' : 'send.unavailable' })
    // The clipboard answers asynchronously and may refuse; then the note shows the text to copy by hand.
    void copyText(text).then((copied) => {
      if (!copied) setNotice({ key: 'send.copyFailed', text })
    })
  }
}

/** Whether the composer can take a message right now: empty, and not mid-submission. */
function useComposerReady(kit: SessionKit): boolean {
  const useInput = kit.useInput ?? useNoInput
  return useInput((state: InputStateLike | undefined) => state === undefined
    || ((state.draft ?? '').trim() === '' && (state.phase === undefined || state.phase === 'plain')))
}

/** Stand-in for a host without the input seat. */
function useNoInput<S>(selector: (state: InputStateLike | undefined) => S): S {
  return selector(undefined)
}

/** The line a replaced widget folds to: what happened, and a toggle for the old one. */
function Replaced(props: { open: boolean; onToggle: () => void; tr: (key: CopyKey) => string }): ReactNode {
  return (
    <div className="dsh-iui-replaced" data-dsh-intelligent-ui="replaced">
      <span className="dsh-iui-note">{props.tr('card.revised')}</span>
      <button type="button" className="dsh-iui-replaced-toggle" aria-expanded={props.open} onClick={props.onToggle}>
        {props.tr(props.open ? 'card.hideOld' : 'card.showOld')}
      </button>
    </div>
  )
}

/** A card from the DIL era: the text version it carried, with the reason it is shown. */
export function LegacyCard(props: { text: string; tr: (key: CopyKey) => string }): ReactNode {
  return (
    <div className="dsh-iui-legacy" data-dsh-intelligent-ui="legacy">
      <pre className="dsh-iui-fallback">{props.text}</pre>
      <div className="dsh-iui-note">{props.tr('card.legacy')}</div>
    </div>
  )
}

/**
 * Contain a defect in one slot entry: render nothing rather than let an
 * unexpected host prop shape crash the row or the reply it sits in.
 */
export class Contained extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error(`dsh-intelligent-ui: the ${this.props.label} failed to render`, error)
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
