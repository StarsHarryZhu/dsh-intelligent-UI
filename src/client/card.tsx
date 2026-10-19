/**
 * The card: one model-authored interface with its local state.
 *
 * It evaluates the program against the reader's edits on every change and
 * re-renders without any network call. A button is the only control that
 * reaches the model, and it does so the ordinary way — by sending a message
 * through the session's own composer, exactly as if the reader had typed it.
 * @module dsh-intelligent-ui/client/card
 */

import { Component, Fragment, useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { evalExpr } from '../lang/expr.ts'
import { renderText } from '../lang/text.ts'
import type { JsonValue } from '../lang/types.ts'
import { renderNode, unrenderable, type RenderScope } from './components.tsx'
import type { CardMemory, EditsStore } from './edits.ts'
import type { InputStateLike, SessionKit } from './host.ts'
import { translator, type CopyKey } from './locales.ts'
import { acceptEdit, computeValues, type NodeRow, type Program } from './program.ts'

/** Props of one card. */
export interface CardProps {
  program: Program
  /** Key of this card's memory: session and call. */
  memoryKey: string
  store: EditsStore
  /** The session kit of the slot that hosts the card. */
  kit: SessionKit
  /** Title for the first root card when the program gave it none. */
  fallbackTitle?: string | undefined
}

/** Memory of a card nobody has touched. Stable, so the store snapshot stays referentially equal. */
const UNTOUCHED: CardMemory = { values: {} }

/**
 * Draw one program inside its failure boundary.
 *
 * The boundary has to sit above the component that renders the nodes: an error
 * thrown while a component computes its own output is caught by a boundary
 * among its ancestors, never by one it returns.
 * @param props - the program and the hosting slot's kit.
 * @returns the card element.
 */
export function Card(props: CardProps): ReactNode {
  const tr = translator(props.kit.t)
  return (
    <CardBoundary fallback={props.program.fallback} note={tr('card.crashed')}>
      <CardBody {...props} />
    </CardBoundary>
  )
}

/** The card's state and nodes. */
function CardBody(props: CardProps): ReactNode {
  const { program, store, memoryKey, kit } = props
  const tr = translator(kit.t)
  const subscribe = useCallback((listener: () => void) => store.subscribe(memoryKey, listener), [store, memoryKey])
  const memory = useSyncExternalStore(subscribe, () => store.get(memoryKey) ?? UNTOUCHED)
  const composerReady = useComposerReady(kit)
  const [notice, setNotice] = useState<{ key: CopyKey; text?: string } | undefined>(undefined)
  const values = useMemo(() => computeValues(program, memory.values), [program, memory.values])

  if (!program.supported) return <TextVersion text={program.fallback} note={tr('card.newer')} />

  const setValue = (key: string, value: JsonValue): void => {
    const row = program.state.find(entry => entry.key === key)
    const accepted = row === undefined ? undefined : acceptEdit(row, value)
    if (accepted === undefined) return
    const current = store.get(memoryKey) ?? UNTOUCHED
    store.set(memoryKey, { ...current, values: { ...current.values, [key]: accepted } })
  }
  const setUi = (id: string, value: JsonValue): void => {
    const current = store.get(memoryKey) ?? UNTOUCHED
    store.set(memoryKey, { ...current, ui: { ...current.ui, [id]: value } })
  }
  const press = (node: NodeRow, prompt: string): void => {
    const current = store.get(memoryKey) ?? UNTOUCHED
    if (current.sent !== undefined || prompt.trim() === '') return
    const actions = kit.inputActions
    if (typeof actions?.setDraft === 'function' && typeof actions.submit === 'function' && composerReady) {
      try {
        actions.setDraft(prompt)
        actions.submit()
        store.set(memoryKey, { ...current, sent: node.id })
        setNotice(undefined)
        return
      } catch (error) {
        console.error('dsh-intelligent-ui: sending a card message failed', error)
      }
    }
    const reason: CopyKey = typeof actions?.setDraft === 'function' ? 'button.copied' : 'button.unavailable'
    setNotice({ key: reason })
    // The clipboard answers asynchronously and may refuse (an insecure page, a
    // denied permission); then the card shows the text to copy by hand.
    void copyText(prompt).then((copied) => {
      if (!copied) setNotice({ key: 'button.copyFailed', text: prompt })
    })
  }
  const roots = (program.children.get(null) ?? [])
    .map(id => program.byId.get(id))
    .filter((node): node is NodeRow => node !== undefined)
  const scope: RenderScope = {
    program,
    values,
    setValue,
    ui: id => memory.ui?.[id],
    setUi,
    text: value => renderText(value, values, program.constants),
    number: value => numberOf(value, values),
    press,
    sent: memory.sent,
    tr,
    fallbackTitle: props.fallbackTitle,
    firstRoot: roots[0]?.id,
  }
  const missing = unrenderable(program)
  const hasControls = program.nodes.some(node => node.bind !== undefined)
  return (
    <div className="dsh-iui-surface" data-dsh-intelligent-ui="card">
      {roots.map((node) => {
        const element = renderNode(node, scope)
        // Every root sits in a framed surface; a card root is that frame itself.
        return node.type === 'card'
          ? <Fragment key={node.id}>{element}</Fragment>
          : <div key={node.id} className="dsh-iui-card" style={{ padding: '12px', gap: '8px' }}>{element}</div>
      })}
      {missing > 0 ? <div className="dsh-iui-note">{tr('card.partial', { count: missing })}</div> : null}
      {notice === undefined ? null : (
        <div className="dsh-iui-note" role="status">
          {tr(notice.key)}
          {notice.text === undefined ? null : <code className="dsh-iui-copy-text">{notice.text}</code>}
        </div>
      )}
      {hasControls ? <div className="dsh-iui-foot">{tr('card.local')}</div> : null}
    </div>
  )
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

/** Resolve a number prop: a literal, or an expression whose value reads as a number. */
function numberOf(value: unknown, values: ReadonlyMap<string, JsonValue>): number | undefined {
  if (value === undefined || value === null) return undefined
  const produced = evalExpr(value, key => values.get(key))
  if (typeof produced === 'number') return Number.isFinite(produced) ? produced : undefined
  if (typeof produced === 'string' && produced.trim() !== '' && Number.isFinite(Number(produced))) return Number(produced)
  return undefined
}

/**
 * Put text on the clipboard where the page allows it.
 * @param text - the text to copy.
 * @returns whether the clipboard accepted it; false on a page without one.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = (globalThis as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }).navigator?.clipboard
    if (typeof clipboard?.writeText !== 'function') return false
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The program's plain-text stand-in, with the reason it is shown. */
export function TextVersion(props: { text: string; note: string }): ReactNode {
  return (
    <div className="dsh-iui-surface" data-dsh-intelligent-ui="text-version">
      <div className="dsh-iui-card" style={{ padding: '12px', gap: '8px' }}>
        <pre className="dsh-iui-fallback">{props.text}</pre>
      </div>
      <div className="dsh-iui-note">{props.note}</div>
    </div>
  )
}

/**
 * Contain a defect in one slot entry: render nothing rather than let an
 * unexpected host prop shape crash the row or the tail it sits in.
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

/**
 * The card is the failure boundary: a render defect degrades this card to its
 * text version and leaves the surrounding transcript alone.
 */
class CardBoundary extends Component<{ fallback: string; note: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error('dsh-intelligent-ui: a card failed to render', error)
  }

  override render(): ReactNode {
    return this.state.failed ? <TextVersion text={this.props.fallback} note={this.props.note} /> : this.props.children
  }
}
