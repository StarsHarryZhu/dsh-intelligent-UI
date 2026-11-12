/**
 * A card in the reply: the renderer of one card node.
 *
 * The node stands where the model called `ui_render`, outside the process a
 * finished turn folds, so the card sits between the text written before the
 * call and the text written after it. It draws from the node's own payload:
 * while the arguments stream it previews the growing source, and once the
 * result settles it draws the compiled program from the persisted meta. A card
 * that a later card of the same turn revises is left out, read from the turn's
 * own data, so a card the model redrew in the same answer never shows; one
 * revised in a later turn folds to a line inside the card.
 * @module dsh-intelligent-ui/client/node-view
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { TURN_DATA_KEY } from '../lang/identity.ts'
import { Card, Contained, revisionOf } from './card.tsx'
import { readArguments } from './card-node.ts'
import type { EditsStore } from './edits.ts'
import type { ChatNodeProps, TurnLike } from './host.ts'
import type { Presence } from './presence.ts'
import { asArray, asRecord, previewProgram, readCardId, readMeta } from './program.ts'

/** Snapshot stand-in when the host offers no observable source; stable, so React never loops. */
const NO_SOURCE = Symbol('dsh-intelligent-ui.no-source')

/** No subscription to offer. */
const NO_SUBSCRIPTION = (): (() => void) => () => undefined

/**
 * Build the card-node renderer over the plugin's edit store.
 * @param store - the reader's edits, shared with the tool row.
 * @param presence - the record of reply cards the tool rows read.
 * @returns the component registered in `conversation.chat.node` under the card kind.
 */
export function createCardNodeView(store: EditsStore, presence: Presence): (props: ChatNodeProps) => ReactNode {
  return function DshIntelligentUiCardNode(props: ChatNodeProps): ReactNode {
    return (
      <Contained label="card in the reply">
        <CardNodeBody {...props} edits={store} presence={presence} />
      </Contained>
    )
  }
}

/** The card of one node, or nothing while there is none to draw. */
function CardNodeBody(props: ChatNodeProps & { edits: EditsStore; presence: Presence }): ReactNode {
  const { edits, presence } = props
  const data = asRecord(props.node?.data)
  const callId = typeof data.callId === 'string' && data.callId !== '' ? data.callId : undefined
  const phase = data.phase === 'preparing' || data.phase === 'start' ? data.phase : 'result'
  const live = phase !== 'result'
  const args = live && typeof data.args === 'string' ? data.args : ''
  // The arguments grow in place while they stream, so they are read and the
  // preview compiled by the text itself, never by the payload's identity.
  const read = useMemo(() => readArguments(args), [args])
  const source = read.source
  const preview = useMemo(
    () => (source === undefined || source.trim() === '' ? undefined : previewProgram(source, phase === 'preparing')),
    [source, phase],
  )
  const metaValue = live ? undefined : data.meta
  const meta = useMemo(() => (metaValue === undefined ? undefined : readMeta(metaValue)), [metaValue])
  const program = live ? preview : meta?.ok === true ? meta.program : undefined
  const location = props.node?.location
  const turn = location?.kind === 'turn' || location?.kind === 'step' ? location.turn : undefined
  const redrawn = useRedrawnInTurn(turn, callId)
  const memoryKey = `${props.sessionId ?? ''}:${callId ?? ''}`
  const shown = callId !== undefined && program !== undefined && !redrawn
  // While this copy is on the page, the call's tool row stays a status line.
  useEffect(() => (shown ? presence.enter(memoryKey) : undefined), [presence, shown, memoryKey])
  if (!shown) return null
  const revises = live ? readCardId(read.revises) : meta?.ok === true ? meta.revises : undefined
  const title = (meta?.title ?? read.title ?? '').trim()
  return (
    <div className="dsh-iui-reply" data-dsh-intelligent-ui="reply" data-state={live ? 'running' : 'ready'}>
      <Card
        program={program}
        memoryKey={memoryKey}
        store={edits}
        kit={props}
        fallbackTitle={title === '' ? undefined : title}
        // A preview starts from the revised card's values; only a settled
        // result marks the earlier card as revised.
        revision={revisionOf(props.sessionId, revises, live ? undefined : callId)}
      />
    </div>
  )
}

/**
 * Whether a later card of the same turn has replaced this one, read from the
 * cards the turn has published.
 * @param turn - the node's turn.
 * @param callId - this card's call id.
 * @returns true once a settled card of the turn names this one in `revises`.
 */
function useRedrawnInTurn(turn: TurnLike | undefined, callId: string | undefined): boolean {
  const turnData = turn?.data
  const source = typeof turnData?.source === 'function' ? turnData.source(TURN_DATA_KEY) : undefined
  const subscribe = useCallback(
    (listener: () => void) => (source === undefined ? NO_SUBSCRIPTION() : source.subscribe(listener)),
    [source],
  )
  const observed = useSyncExternalStore(subscribe, () => (source === undefined ? NO_SOURCE : source.getSnapshot()))
  const value = observed === NO_SOURCE ? turnData?.get?.(TURN_DATA_KEY) : observed
  if (callId === undefined) return false
  return asArray(asRecord(value).cards).some((card) => {
    const meta = asRecord(asRecord(card).meta)
    return meta.ok === true && readCardId(meta.revises) === callId
  })
}
