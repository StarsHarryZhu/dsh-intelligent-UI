/**
 * The settled cards of a finished turn, under its reply.
 *
 * A completed turn folds its process rows, the `ui_render` row among them, so
 * this turn-tail entry is where an interface stays visible and usable after the
 * answer: in reading order, between the reply and its action row. Only completed
 * turns get a tail, because only they fold; an interrupted turn keeps its rows
 * open and its card stays where it was drawn.
 * @module dsh-intelligent-ui/client/tail
 */

import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import { TURN_DATA_KEY } from '../lang/identity.ts'
import { Card, Contained, revisionOf } from './card.tsx'
import type { EditsStore } from './edits.ts'
import type { TurnTailProps } from './host.ts'
import { asArray, asRecord, readMeta } from './program.ts'

/** Snapshot stand-in when the host offers no observable source; stable, so React never loops. */
const NO_SOURCE = Symbol('dsh-intelligent-ui.no-source')

/** No subscription to offer. */
const NO_SUBSCRIPTION = (): (() => void) => () => undefined

/**
 * Build the turn-tail component over the plugin's edit store.
 * @param store - the reader's edits, shared with the tool row.
 * @returns the component registered in `conversation.chat.turnTail`.
 */
export function createTail(store: EditsStore): (props: TurnTailProps) => ReactNode {
  return function DshIntelligentUiTail(props: TurnTailProps): ReactNode {
    return (
      <Contained label="turn tail">
        <TailBody {...props} edits={store} />
      </Contained>
    )
  }
}

/** The tail's cards, read from the turn's published data. */
function TailBody(props: TurnTailProps & { edits: EditsStore }): ReactNode {
  const turnData = props.turn?.data
  const source = typeof turnData?.source === 'function' ? turnData.source(TURN_DATA_KEY) : undefined
  const subscribe = useCallback(
    (listener: () => void) => (source === undefined ? NO_SUBSCRIPTION() : source.subscribe(listener)),
    [source],
  )
  const observed = useSyncExternalStore(subscribe, () => (source === undefined ? NO_SOURCE : source.getSnapshot()))
  // Without a source the value is read once per render; the tail renders after
  // its turn ends, when the value no longer changes.
  const value = observed === NO_SOURCE ? turnData?.get?.(TURN_DATA_KEY) : observed
  if (props.turn?.end?.data?.reason?.kind !== 'completed') return null
  const closing = typeof props.seq === 'number' ? props.seq : Number.POSITIVE_INFINITY
  const cards = asArray(asRecord(value).cards)
    .map(asRecord)
    .filter(card => typeof card.callId === 'string' && typeof card.seq === 'number' && card.seq < closing)
  if (cards.length === 0) return null
  return (
    <div className="dsh-iui-tail" data-dsh-intelligent-ui="tail">
      {cards.map((card) => {
        const meta = readMeta(card.meta)
        if (meta?.ok !== true) return null
        const callId = card.callId as string
        return (
          <Card
            key={callId}
            program={meta.program}
            memoryKey={`${props.sessionId ?? ''}:${callId}`}
            store={props.edits}
            kit={props}
            fallbackTitle={meta.title}
            revision={revisionOf(props.sessionId, meta.revises, callId)}
          />
        )
      })}
    </div>
  )
}
