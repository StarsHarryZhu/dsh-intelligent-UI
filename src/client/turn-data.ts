/**
 * The cards a turn produced, published as Turn data.
 *
 * A data-only Conversation Definition: it reads events the host already records
 * — `turn/start`, the `ui_render` `tool/call`, and that call's `tool/result` with
 * its persisted meta — and publishes the turn's settled cards under its own key.
 * It builds no view node and writes nothing, so it adds no event type and no
 * session data; removing the plugin removes the Definition and nothing else.
 * @module dsh-intelligent-ui/client/turn-data
 */

import { TURN_DATA_KEY, UI_TOOL_NAME } from '../lang/identity.ts'
import { asRecord } from './program.ts'

/** One settled card in a turn. */
export interface TurnCard {
  /** Sequence of the `tool/result` event. */
  readonly seq: number
  readonly callId: string
  /** The persisted presentation metadata. */
  readonly meta: unknown
}

/** The Turn data value this Definition publishes. */
export interface TurnCards {
  readonly cards: readonly TurnCard[]
}

/** Per-turn Definition state. */
interface TurnState {
  readonly turn: number
  /** `ui_render` calls seen in the turn. */
  readonly calls: ReadonlySet<string>
  readonly cards: readonly TurnCard[]
}

/** The engine's view of one matched event, reduced to what this Definition reads. */
interface MatchLike {
  readonly event: { readonly type?: unknown; readonly seq?: unknown; readonly data?: unknown }
}

/** A published Location value, as the engine hands back the previous one. */
interface LocationValue {
  readonly kind?: unknown
  readonly turn?: unknown
  readonly key?: unknown
  readonly value?: unknown
}

/** The turn number an event belongs to. */
function turnOf(event: { readonly data?: unknown }): number | undefined {
  const turn = asRecord(event.data).turn
  return typeof turn === 'number' && Number.isInteger(turn) ? turn : undefined
}

/** Whether persisted meta is a renderable card of this plugin. */
function isCardMeta(meta: unknown): boolean {
  const record = asRecord(meta)
  return record.ok === true && typeof record.program === 'object' && record.program !== null
}

/** Identity of a matched event: its turn. */
function identify(event: { readonly data?: unknown }, role: 'start' | 'update'): { id: string; role: 'start' | 'update' } | null {
  const turn = turnOf(event)
  return turn === undefined ? null : { id: String(turn), role }
}

/** The Conversation Definition registered with `uiConversation.events`. */
export const turnDataDefinition = {
  kind: TURN_DATA_KEY,
  match: {
    'turn/start': (event: { data?: unknown }) => identify(event, 'start'),
    'tool/call': (event: { data?: unknown }) => (asRecord(event.data).name === UI_TOOL_NAME ? identify(event, 'update') : null),
    'tool/result': (event: { data?: unknown; surfaceOp?: unknown }) =>
      // A replaced surface range re-presents an older result; only the original append counts.
      event.surfaceOp === 'append' && isCardMeta(asRecord(event.data).meta) ? identify(event, 'update') : null,
  },
  start(_context: unknown, match: MatchLike): TurnState {
    return { turn: turnOf(match.event) ?? 0, calls: new Set(), cards: [] }
  },
  update(context: { readonly state: TurnState }, match: MatchLike): TurnState {
    const state = context.state
    const data = asRecord(match.event.data)
    if (match.event.type === 'tool/call') {
      const callId = data.callId
      if (typeof callId !== 'string' || state.calls.has(callId)) return state
      return { ...state, calls: new Set([...state.calls, callId]) }
    }
    if (match.event.type !== 'tool/result') return state
    const message = asRecord(data.message)
    const source = asRecord(message.source)
    const callId = typeof source.callId === 'string' ? source.callId : message.toolCallId
    if (typeof callId !== 'string' || !state.calls.has(callId) || message.isError === true) return state
    if (state.cards.some(card => card.callId === callId)) return state
    const seq = typeof match.event.seq === 'number' ? match.event.seq : Number.MAX_SAFE_INTEGER
    return { ...state, cards: [...state.cards, { seq, callId, meta: data.meta }] }
  },
  buildLocationData(context: { readonly state?: TurnState }, scope: string, previous: LocationValue | null): LocationValue | null {
    const state = context.state
    if (scope !== 'turn' || state === undefined || state.cards.length === 0) return null
    if (previous !== null && previous.kind === 'turn' && previous.turn === state.turn && previous.key === TURN_DATA_KEY
      && (previous.value as TurnCards | undefined)?.cards === state.cards) return previous
    return { kind: 'turn', turn: state.turn, key: TURN_DATA_KEY, value: { cards: state.cards } satisfies TurnCards }
  },
}
