/**
 * Cards in the reply: one Chat node per `ui_render` call, standing where the
 * call stands.
 *
 * A Conversation Definition over what the host already streams and records —
 * the call's argument deltas while the model writes them, its `tool/call`, and
 * its `tool/result` with the persisted meta — that builds one `chat` node per
 * call, a hair after the call's own tool row, at the `turn` group-tree
 * position. That position keeps the node outside the process a finished turn
 * folds, so the card reads as part of the answer: after the text the model
 * wrote before the call and before the text it writes after the result. The
 * Definition writes nothing and adds no event type; unloading the plugin
 * removes it and every node it built.
 * @module dsh-intelligent-ui/client/card-node
 */

import { CARD_NODE_KIND, UI_TOOL_NAME } from '../widget/identity.ts'
import { LIMITS } from '../widget/policy.ts'
import { asRecord, isOwnMeta } from './read.ts'

/**
 * How far after its call a card stands. Streamed rows take fractions of the
 * gap to the next recorded event, each closer than the last, so the offset is
 * far below any gap the stream leaves: the card follows its own tool row and
 * precedes whatever the stream adds next.
 */
export const AFTER_CALL = 1e-9

/**
 * Longest argument text kept while it streams: the largest source the tool
 * accepts, every byte escaped, plus room for the title. A longer stream stops
 * growing the preview; the recorded call carries the rest.
 */
const MAX_STREAMED_ARGS = LIMITS.maxSourceChars * 2 + 4096

/** Where a call is: its arguments streaming, recorded, or answered. */
export type CardPhase = 'preparing' | 'start' | 'result'

/** The payload of one card node. */
export interface CardNodeData {
  readonly callId: string
  readonly phase: CardPhase
  /** The call's arguments as JSON text: a prefix while they stream, complete from `tool/call` on. */
  readonly args: string
  /** The settled result's persisted meta. */
  readonly meta?: unknown
}

/** Per-call Definition state. */
interface CardState {
  readonly callId: string
  /** The called tool, once a delta or the recorded call names it. */
  readonly name: string | undefined
  readonly args: string
  readonly phase: CardPhase
  readonly meta?: unknown
  /** Whether the settled result is an error. */
  readonly failed: boolean
}

/** The engine's view of one matched event, reduced to what this Definition reads. */
interface MatchLike {
  readonly event: { readonly type?: unknown; readonly seq?: unknown; readonly data?: unknown; readonly surfaceOp?: unknown }
  readonly location?: unknown
}

/** The engine's Context, reduced to what this Definition reads. */
interface ContextLike {
  readonly key: string
  readonly id: string
  readonly matches: readonly MatchLike[]
  readonly start: MatchLike | undefined
  readonly state: CardState | undefined
  readonly current: ReadonlyMap<string, unknown>
}

/** A built node, as this Definition builds and compares it. */
interface CardNode {
  readonly key: string
  readonly kind: string
  readonly id: string
  readonly target: 'chat'
  readonly anchorSeq: number
  readonly location: unknown
  readonly visibility: 'visible' | 'hidden'
  readonly groupTree: 'turn'
  readonly data: CardNodeData
}

/** A call id as the host writes it. */
function idOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : typeof value === 'number' ? String(value) : undefined
}

/** The call id a recorded result answers. */
function resultCallId(data: unknown): string | undefined {
  const message = asRecord(asRecord(data).message)
  return idOf(asRecord(message.source).callId) ?? idOf(message.toolCallId)
}

/** Arguments recorded as text or, from some providers, as an object. */
function argumentText(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return '{}'
  }
}

/** Fold one streamed chunk of the call into the state. */
function applyChunk(state: CardState, match: MatchLike): CardState {
  if (state.phase !== 'preparing') return state
  const chunk = asRecord(asRecord(match.event.data).chunk)
  if (chunk.type === 'block-end') {
    const block = asRecord(chunk.block)
    if (block.type !== 'tool-call') return state
    const name = typeof block.name === 'string' ? block.name : state.name
    return { ...state, name, args: name === UI_TOOL_NAME ? argumentText(block.arguments) : '' }
  }
  if (chunk.type !== 'tool-call-delta') return state
  const name = state.name ?? (typeof chunk.name === 'string' && chunk.name !== '' ? chunk.name : undefined)
  // A delta before the name is skipped, as the host's own row skips it.
  if (name === undefined) return state
  if (name !== UI_TOOL_NAME) return state.name === name ? state : { ...state, name }
  const delta = typeof chunk.argumentsDelta === 'string' ? chunk.argumentsDelta : ''
  if (delta === '' || state.args.length + delta.length > MAX_STREAMED_ARGS) return state.name === name ? state : { ...state, name }
  return { ...state, name, args: state.args + delta }
}

/** Fold the recorded call into the state. */
function applyCall(state: CardState, match: MatchLike): CardState {
  const data = asRecord(match.event.data)
  const name = typeof data.name === 'string' ? data.name : state.name
  return { ...state, name, args: argumentText(data.arguments), phase: state.phase === 'result' ? 'result' : 'start' }
}

/** Fold the recorded result into the state. */
function applyResult(state: CardState, match: MatchLike): CardState {
  const data = asRecord(match.event.data)
  const failed = asRecord(data.message).isError === true
  return { ...state, phase: 'result', meta: data.meta, failed }
}

/** State when the call's start is outside the loaded window: the result alone. */
function resultOnly(context: ContextLike): CardState | undefined {
  const match = context.matches.find(candidate => candidate.event.type === 'tool/result')
  if (match === undefined) return undefined
  const meta = asRecord(match.event.data).meta
  const blank: CardState = { callId: context.id, name: isOwnMeta(meta) ? UI_TOOL_NAME : undefined, args: '', phase: 'preparing', failed: false }
  return applyResult(blank, match)
}

/** Whether the call's step closed before its result arrived: the turn was stopped. */
function interrupted(context: ContextLike): boolean {
  const location = asRecord(context.start?.location ?? context.matches[0]?.location)
  if (location.kind === 'step' && asRecord(location.step).status === 'closed') return true
  return (location.kind === 'step' || location.kind === 'turn') && asRecord(location.turn).status === 'closed'
}

/** Hide a node that was built before, so its identity survives; build nothing otherwise. */
function hide(current: CardNode | null | undefined): CardNode | null {
  if (current === null || current === undefined) return null
  return current.visibility === 'hidden' ? current : { ...current, visibility: 'hidden' }
}

/** The Conversation Definition registered with `uiConversation.events`. */
export const cardNodeDefinition = {
  kind: CARD_NODE_KIND,
  target: 'chat',
  match: {
    'assistant/live-chunk': (event: { data?: unknown }) => {
      // Every delta of a call opens or extends its Context; only the name says
      // whether it is a card, and later deltas carry no name.
      const chunk = asRecord(asRecord(event.data).chunk)
      if (chunk.type === 'tool-call-delta') {
        const id = idOf(chunk.id)
        return id === undefined ? null : { id, role: 'start' as const }
      }
      if (chunk.type === 'block-end') {
        const block = asRecord(chunk.block)
        const id = block.type === 'tool-call' ? idOf(block.id) : undefined
        return id === undefined ? null : { id, role: 'start' as const }
      }
      return null
    },
    'tool/call': (event: { data?: unknown }) => {
      const data = asRecord(event.data)
      const id = data.name === UI_TOOL_NAME ? idOf(data.callId) : undefined
      return id === undefined ? null : { id, role: 'start' as const }
    },
    'tool/result': (event: { data?: unknown; surfaceOp?: unknown }) => {
      // A replaced surface range re-presents an older result; only the original append counts.
      if (event.surfaceOp !== 'append') return null
      const data = asRecord(event.data)
      if (!isOwnMeta(data.meta) && asRecord(data.message).isError !== true) return null
      const id = resultCallId(data)
      return id === undefined ? null : { id, role: 'update' as const }
    },
  },
  start(context: { readonly id: string }, match: MatchLike): CardState {
    const blank: CardState = { callId: context.id, name: undefined, args: '', phase: 'preparing', failed: false }
    if (match.event.type === 'tool/call') return applyCall(blank, match)
    return applyChunk(blank, match)
  },
  update(context: { readonly state: CardState }, match: MatchLike): CardState {
    const type = match.event.type
    if (type === 'assistant/live-chunk') return applyChunk(context.state, match)
    if (type === 'tool/call') return applyCall(context.state, match)
    if (type === 'tool/result') return applyResult(context.state, match)
    return context.state
  },
  publication(match: MatchLike): 'animation-frame' | 'immediate' {
    return match.event.type === 'assistant/live-chunk' ? 'animation-frame' : 'immediate'
  },
  buildViewNode(context: ContextLike): CardNode | null {
    const current = context.current.get('chat') as CardNode | null | undefined
    const state = context.state ?? resultOnly(context)
    if (state === undefined || state.name !== UI_TOOL_NAME) return hide(current)
    const shown = state.phase === 'result'
      ? !state.failed && asRecord(state.meta).ok === true
      : state.args !== '' && !interrupted(context)
    const start = context.start?.event.seq ?? context.matches[0]?.event.seq
    const anchorSeq = (typeof start === 'number' ? start : 0) + AFTER_CALL
    const location = context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
    const visibility = shown ? 'visible' : 'hidden'
    const previous = current?.data
    const data: CardNodeData = previous !== undefined && previous.callId === state.callId && previous.phase === state.phase
      && previous.args === state.args && previous.meta === state.meta
      ? previous
      : { callId: state.callId, phase: state.phase, args: state.args, ...(state.phase === 'result' ? { meta: state.meta } : {}) }
    if (current !== null && current !== undefined && current.data === data && current.anchorSeq === anchorSeq
      && current.visibility === visibility && current.location === location) return current
    if (current === null || current === undefined) {
      if (!shown) return null
    }
    return { key: context.key, kind: CARD_NODE_KIND, id: context.id, target: 'chat', anchorSeq, location, visibility, groupTree: 'turn', data }
  },
}

/**
 * Read the string arguments of a call from JSON text that may still be
 * streaming: every complete top-level string, and the one still growing at the
 * end. Anything else is skipped; a malformed prefix yields what came before it.
 * @param text - the arguments as JSON text, complete or a prefix.
 * @returns the string arguments by name.
 */
export function readArguments(text: string): Record<string, string> {
  const found: Record<string, string> = {}
  let index = skipSpace(text, 0)
  if (text[index] !== '{') return found
  index += 1
  while (index < text.length) {
    index = skipSpace(text, index)
    if (text[index] === ',') {
      index += 1
      continue
    }
    if (text[index] !== '"') break
    const key = readString(text, index)
    if (!key.closed) break
    index = skipSpace(text, key.end)
    if (text[index] !== ':') break
    index = skipSpace(text, index + 1)
    if (index >= text.length) break
    if (text[index] === '"') {
      const value = readString(text, index)
      if (key.value !== '__proto__') found[key.value] = value.value
      if (!value.closed) break
      index = value.end
      continue
    }
    const next = skipValue(text, index)
    if (next === undefined) break
    index = next
  }
  return found
}

/** The index of the first non-space character at or after `index`. */
function skipSpace(text: string, index: number): number {
  let at = index
  while (at < text.length && (text[at] === ' ' || text[at] === '\n' || text[at] === '\r' || text[at] === '\t')) at += 1
  return at
}

/** Escapes that stand for one character. */
const ESCAPES: Readonly<Record<string, string>> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }

/**
 * Decode the JSON string opening at `start`, up to its closing quote or, while
 * it streams, up to the last whole character.
 */
function readString(text: string, start: number): { value: string; end: number; closed: boolean } {
  let value = ''
  let index = start + 1
  while (index < text.length) {
    const character = text[index] as string
    if (character === '"') return { value, end: index + 1, closed: true }
    if (character !== '\\') {
      // Copy the run up to the next quote or escape in one slice.
      let stop = index + 1
      while (stop < text.length && text[stop] !== '"' && text[stop] !== '\\') stop += 1
      value += text.slice(index, stop)
      index = stop
      continue
    }
    const escape = text[index + 1]
    if (escape === undefined) break
    if (escape === 'u') {
      const hex = text.slice(index + 2, index + 6)
      if (hex.length < 4) break
      if (!/^[0-9a-fA-F]{4}$/u.test(hex)) return { value, end: index, closed: false }
      value += String.fromCharCode(Number.parseInt(hex, 16))
      index += 6
      continue
    }
    const decoded = ESCAPES[escape]
    if (decoded === undefined) return { value, end: index, closed: false }
    value += decoded
    index += 2
  }
  return { value, end: index, closed: false }
}

/**
 * Skip one non-string value — a number, a literal, an object, or an array — to
 * the comma or brace that ends it at the top level.
 * @returns where the next member starts, or undefined while the value streams.
 */
function skipValue(text: string, start: number): number | undefined {
  let depth = 0
  let index = start
  while (index < text.length) {
    const character = text[index]
    if (character === '"') {
      const skipped = readString(text, index)
      if (!skipped.closed) return undefined
      index = skipped.end
      continue
    }
    if (character === '{' || character === '[') depth += 1
    else if (character === '}' || character === ']') {
      if (depth === 0) return index
      depth -= 1
    } else if (character === ',' && depth === 0) return index
    index += 1
  }
  return undefined
}
