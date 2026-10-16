/**
 * The `ui_render` tool row: the card while its turn is still running.
 *
 * Tool rows are process rows, and a finished turn folds them away, so this view
 * is the live surface: it previews the interface while the arguments stream,
 * shows the compiled card the moment the result lands, and leaves the settled
 * card to the turn tail under the reply. A result that arrives while the reader
 * watches opens the row; the host's own reset closes it when the turn folds.
 * @module dsh-intelligent-ui/client/toolview
 */

import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Card, Contained } from './card.tsx'
import type { EditsStore } from './edits.ts'
import type { DisclosureLike, ToolBlockLike, ToolViewProps } from './host.ts'
import { translator } from './locales.ts'
import { previewProgram, readMeta, type Program } from './program.ts'

/** A result newer than this opens its row on arrival. */
const FRESH_MS = 30_000

/**
 * Build the row component over the plugin's edit store.
 * @param store - the reader's edits, shared with the turn tail.
 * @returns the component registered under the `ui_render` key.
 */
export function createToolView(store: EditsStore): (props: ToolViewProps) => ReactNode {
  return function DshIntelligentUiToolView(props: ToolViewProps): ReactNode {
    return (
      <Contained label="tool row">
        <ToolViewBody {...props} edits={store} />
      </Contained>
    )
  }
}

/** The row's header and, while open, its card. */
function ToolViewBody(props: ToolViewProps & { edits: EditsStore }): ReactNode {
  const store = props.edits
  const tr = translator(props.t)
  const phase = props.phase ?? 'result'
  const block: ToolBlockLike = props.block ?? {}
  const live = phase !== 'result'
  // The preparing view grows in place, so the source is read during render and
  // the preview is memoized by the text itself, never by the block's identity.
  const source = live ? readArgument(block, 'source') : undefined
  const preview = useMemo(
    () => (source === undefined || source.trim() === '' ? undefined : previewProgram(source, phase === 'preparing')),
    [source, phase],
  )
  const metaValue = live ? undefined : block.meta
  const meta = useMemo(() => (metaValue === undefined ? undefined : readMeta(metaValue)), [metaValue])
  const disclosure = (props.useDisclosure ?? useLocalDisclosure)()
  const resultTime = !live && typeof block.time === 'number' ? block.time : undefined
  useEffect(() => {
    if (resultTime !== undefined && Date.now() - resultTime < FRESH_MS) disclosure.setExpanded(true)
    // Only a result's arrival opens the row; the reset that closes it belongs to the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultTime])

  const title = (meta?.title ?? readArgument(block, 'title') ?? '').trim()
  const program: Program | undefined = live ? preview : meta?.ok === true ? meta.program : undefined
  const errorText = !live && block.isError === true ? contentText(block) : undefined
  const diagnostics = meta?.ok === false
    ? meta.diagnostics.map(entry => `${entry.line === undefined ? '' : `line ${entry.line}: `}${entry.message}. ${entry.repair}`).join('\n')
    : !live && meta === undefined && errorText === undefined ? contentText(block) : undefined
  const state = live ? 'running' : program !== undefined ? 'ready' : 'failed'
  const status = live
    ? tr('row.preparing')
    : block.isError === true
      ? block.error?.code === 'interrupted' ? tr('row.stopped') : tr('row.error')
      : program !== undefined
        ? tr('row.ready', { components: program.nodes.length, controls: program.nodes.filter(node => node.bind !== undefined || node.type === 'button').length })
        : tr('row.failed')
  const detail = errorText ?? diagnostics
  const expandable = !live && (program !== undefined || (detail !== undefined && detail !== ''))
  const open = live || disclosure.expanded
  const toggle = (): void => { if (expandable) disclosure.toggle() }
  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    disclosure.toggle()
  }
  const memoryKey = `${props.sessionId ?? ''}:${props.callId ?? block.callId ?? ''}`
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
      {open && program !== undefined ? (
        <div className="dsh-iui-row-body">
          <Card program={program} memoryKey={memoryKey} store={store} kit={props} />
        </div>
      ) : null}
      {open && !live && program === undefined && detail !== undefined && detail !== '' ? (
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
