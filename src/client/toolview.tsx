/**
 * The `ui_render` tool row: one status line in the process.
 *
 * The widget itself stands in the reply, as its own Chat node, while this row
 * sits among the process rows a finished turn folds. While that reply copy is
 * on the page the row says how the call went — building, shown, replaced,
 * failed — and opens only to show why a widget did not pass the check. Where no
 * reply copy exists, in a view without Chat nodes or for a widget whose reply
 * copy is not drawn, the row draws the widget itself: it shows the source while
 * the arguments stream, and a result that arrives while the reader watches
 * opens the row.
 * @module dsh-intelligent-ui/client/toolview
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import type { DisclosureLike, ToolBlockLike, ToolViewProps } from './host.ts'
import { translator } from './locales.ts'
import { readCardId, readMeta } from './read.ts'
import { Contained, LegacyCard, revisionOf, Widget, type WidgetEnv } from './widget.tsx'

/** A result newer than this opens its row on arrival. */
const FRESH_MS = 30_000

/**
 * Build the row component.
 * @param env - what every widget on the page shares.
 * @returns the component registered under the `ui_render` key.
 */
export function createToolView(env: WidgetEnv): (props: ToolViewProps) => ReactNode {
  return function DshIntelligentUiToolView(props: ToolViewProps): ReactNode {
    return (
      <Contained label="tool row">
        <ToolViewBody {...props} env={env} />
      </Contained>
    )
  }
}

/** The row's header and, while open, its widget or its problems. */
function ToolViewBody(props: ToolViewProps & { env: WidgetEnv }): ReactNode {
  const { env } = props
  const { presence, store } = env
  const tr = translator(props.t)
  const phase = props.phase ?? 'result'
  const block: ToolBlockLike = props.block ?? {}
  const live = phase !== 'result'
  const streamed = live ? readArgument(block, 'source') : undefined
  const metaValue = live ? undefined : block.meta
  const meta = useMemo(() => (metaValue === undefined ? undefined : readMeta(metaValue)), [metaValue])
  const disclosure = (props.useDisclosure ?? useLocalDisclosure)()
  const [, forceRender] = useState(0)
  const callId = props.callId ?? block.callId
  const memoryKey = `${props.sessionId ?? ''}:${callId ?? ''}`
  const subscribe = useCallback((listener: () => void) => store.subscribe(memoryKey, listener), [store, memoryKey])
  // A later card that revises this one renames the row's status.
  const replaced = useSyncExternalStore(subscribe, () => store.get(memoryKey)?.revisedBy !== undefined)
  const subscribeReply = useCallback((listener: () => void) => presence.subscribe(memoryKey, listener), [presence, memoryKey])
  // While the widget stands in the reply, the row does not draw it a second time.
  const inReply = useSyncExternalStore(subscribeReply, () => presence.has(memoryKey))
  const resultTime = !live && typeof block.time === 'number' ? block.time : undefined
  useEffect(() => {
    if (!inReply && resultTime !== undefined && Date.now() - resultTime < FRESH_MS) disclosure.setExpanded(true)
    // Only a result's arrival opens the row; the reset that closes it belongs to the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultTime, inReply])

  const title = (meta?.title ?? readArgument(block, 'title') ?? '').trim()
  const source = live ? streamed : meta?.kind === 'widget' ? meta.source : undefined
  const legacy = !live && meta?.kind === 'legacy' ? meta.text : undefined
  const drawable = legacy !== undefined || (source !== undefined && source.trim() !== '')
  const errorText = !live && block.isError === true ? contentText(block) : undefined
  const problems = meta?.kind === 'failed'
    ? meta.problems.map(entry => `${entry.line === undefined ? '' : `line ${entry.line}: `}${entry.message}. ${entry.repair}`).join('\n')
    : !live && meta === undefined && errorText === undefined ? contentText(block) : undefined
  const state = live ? 'running' : drawable ? 'ready' : 'failed'
  const status = live
    ? tr('row.preparing')
    : block.isError === true
      ? block.error?.code === 'interrupted' ? tr('row.stopped') : tr('row.error')
      : legacy !== undefined
        ? tr('row.legacy')
        : drawable
          ? replaced ? tr('row.replaced') : tr('row.ready', { lines: (source ?? '').split('\n').length })
          : tr('row.failed')
  const detail = errorText ?? problems
  const drawsCard = drawable && !inReply
  const expandable = !live && (drawsCard || (!drawable && detail !== undefined && detail !== ''))
  // A row that drew its widget while it streamed keeps it open when the result
  // lands, until the host's disclosure catches up: closing it for one render
  // would throw the frame away and load it again.
  const heldOpen = useRef(false)
  if (live && drawsCard) heldOpen.current = true
  const open = (live && drawsCard) || (expandable && (disclosure.expanded || heldOpen.current))
  const toggle = (): void => {
    if (!expandable) return
    if (heldOpen.current && !disclosure.expanded) {
      // The reader closes a row the hold alone kept open.
      heldOpen.current = false
      forceRender(count => count + 1)
      return
    }
    heldOpen.current = false
    disclosure.toggle()
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    toggle()
  }
  const revises = live ? readCardId(readArgument(block, 'revises')) : meta?.kind === 'widget' ? meta.revises : undefined
  return (
    <div className="dsh-iui-tool" data-dsh-intelligent-ui="tool" data-state={state}>
      <div
        className="dsh-iui-row-head"
        data-state={state}
        data-expandable={expandable ? '' : undefined}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        aria-label={expandable ? (open ? tr('row.hide') : tr('row.show')) : undefined}
        onClick={toggle}
        onKeyDown={onKey}
      >
        <span className="dsh-iui-row-icon"><Glyph /></span>
        <span className="dsh-iui-row-title">{title === '' ? tr('card.label') : `${tr('card.label')} · ${title}`}</span>
        <span className="dsh-iui-row-status">{status}</span>
        {props.inspect === undefined ? null : (
          <button
            type="button"
            className="dsh-iui-row-inspect"
            onClick={(event) => { event.stopPropagation(); props.inspect?.() }}
          >
            {tr('row.inspect')}
          </button>
        )}
      </div>
      {open && drawsCard ? (
        <div className="dsh-iui-row-body">
          {legacy !== undefined ? <LegacyCard text={legacy} tr={tr} /> : (
            <Widget
              env={env}
              source={source ?? ''}
              stage={live ? (phase === 'preparing' ? 'streaming' : 'complete') : 'ready'}
              memoryKey={memoryKey}
              cardId={callId}
              kit={props}
              revision={revisionOf(props.sessionId, revises, live ? undefined : callId)}
            />
          )}
        </div>
      ) : null}
      {open && !live && !drawable && detail !== undefined && detail !== '' ? (
        <pre className="dsh-iui-diag">{detail}</pre>
      ) : null}
    </div>
  )
}

/** Disclosure for hosts that supply none: open by default, toggled locally. */
function useLocalDisclosure(): DisclosureLike {
  const [expanded, setExpanded] = useState(true)
  return { expanded, setExpanded, toggle: () => { setExpanded(previous => !previous) } }
}

/**
 * Read one string argument at any stage: the lazy reader first, then the
 * started call's or the settled call's raw JSON.
 */
function readArgument(block: ToolBlockLike, key: string): string | undefined {
  try {
    const text = block.args?.text?.(key)
    if (typeof text === 'string') return text
  } catch {
    // The reader is total by contract; a host that breaks it falls back to the raw text.
  }
  const raw = block.argsRaw ?? block.call?.argsRaw
  if (typeof raw !== 'string') return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed[key]
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

/** The text content of a settled result. */
function contentText(block: ToolBlockLike): string {
  return (block.content ?? [])
    .map(item => (typeof item === 'object' && item !== null && typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : ''))
    .filter(text => text !== '')
    .join('\n')
}

/** The row glyph: a small panel with controls, drawn in the current text colour. */
function Glyph(): ReactNode {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="2" y="2.5" width="12" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.75 6.5h6.5M4.75 9.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="10" cy="9.5" r="1.25" fill="currentColor" />
    </svg>
  )
}
