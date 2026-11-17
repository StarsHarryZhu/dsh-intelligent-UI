/**
 * A widget in the reply: the renderer of one card node.
 *
 * The node stands where the model called `ui_render`, outside the process a
 * finished turn folds, so the widget sits between the text written before the
 * call and the text written after it. It draws from the node's own payload:
 * while the arguments stream it shows the growing source without running its
 * scripts, and once the result settles it runs the checked source from the
 * persisted meta. The frame stays the same element throughout, so the widget
 * never reloads between those stages. A widget that a later card of the same
 * turn revises is left out, read from the turn's own data, so a widget the
 * model redrew in the same answer never shows; one revised in a later turn
 * folds to a line.
 * @module dsh-intelligent-ui/client/node-view
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { TURN_DATA_KEY } from '../widget/identity.ts'
import { readArguments } from './card-node.ts'
import type { ChatNodeProps, TurnLike } from './host.ts'
import { translator } from './locales.ts'
import { asArray, asRecord, readCardId, readMeta } from './read.ts'
import { Contained, LegacyCard, revisionOf, Widget, type WidgetEnv, type WidgetStage } from './widget.tsx'

/** Snapshot stand-in when the host offers no observable source; stable, so React never loops. */
const NO_SOURCE = Symbol('dsh-intelligent-ui.no-source')

/** No subscription to offer. */
const NO_SUBSCRIPTION = (): (() => void) => () => undefined

/**
 * Build the card-node renderer.
 * @param env - what every widget on the page shares.
 * @returns the component registered in `conversation.chat.node` under the card kind.
 */
export function createCardNodeView(env: WidgetEnv): (props: ChatNodeProps) => ReactNode {
  return function DshIntelligentUiCardNode(props: ChatNodeProps): ReactNode {
    return (
      <Contained label="widget in the reply">
        <CardNodeBody {...props} env={env} />
      </Contained>
    )
  }
}

/** The widget of one node, or nothing while there is none to draw. */
function CardNodeBody(props: ChatNodeProps & { env: WidgetEnv }): ReactNode {
  const { env } = props
  const data = asRecord(props.node?.data)
  const callId = typeof data.callId === 'string' && data.callId !== '' ? data.callId : undefined
  const phase = data.phase === 'preparing' || data.phase === 'start' ? data.phase : 'result'
  const live = phase !== 'result'
  const args = live && typeof data.args === 'string' ? data.args : ''
  // The arguments grow in place while they stream, so they are read by the text itself, never by the payload's identity.
  const read = useMemo(() => readArguments(args), [args])
  const metaValue = live ? undefined : data.meta
  const meta = useMemo(() => (metaValue === undefined ? undefined : readMeta(metaValue)), [metaValue])
  const source = live ? read.source : meta?.kind === 'widget' ? meta.source : undefined
  const legacy = !live && meta?.kind === 'legacy' ? meta.text : undefined
  const location = props.node?.location
  const turn = location?.kind === 'turn' || location?.kind === 'step' ? location.turn : undefined
  const redrawn = useRedrawnInTurn(turn, callId)
  const memoryKey = `${props.sessionId ?? ''}:${callId ?? ''}`
  const drawable = legacy !== undefined || (source !== undefined && source.trim() !== '')
  const shown = callId !== undefined && drawable && !redrawn
  // While this copy is on the page, the call's tool row stays a status line.
  useEffect(() => (shown ? env.presence.enter(memoryKey) : undefined), [env.presence, shown, memoryKey])
  if (!shown) return null
  if (legacy !== undefined) {
    return (
      <div className="dsh-iui-reply" data-dsh-intelligent-ui="reply" data-state="ready">
        <LegacyCard text={legacy} tr={translator(props.t)} />
      </div>
    )
  }
  const revises = live ? readCardId(read.revises) : meta?.kind === 'widget' ? meta.revises : undefined
  const stage: WidgetStage = phase === 'preparing' ? 'streaming' : phase === 'start' ? 'complete' : 'ready'
  return (
    <div className="dsh-iui-reply" data-dsh-intelligent-ui="reply" data-state={live ? 'running' : 'ready'}>
      <Widget
        env={env}
        source={source ?? ''}
        stage={stage}
        memoryKey={memoryKey}
        cardId={callId}
        kit={props}
        // A preview starts from the revised card's values; only a settled result marks the earlier card as revised.
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
