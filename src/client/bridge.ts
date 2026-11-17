/**
 * Check what a widget frame sends.
 *
 * The widget's own code runs in the frame and can post anything, so every
 * message is read here against the protocol's shapes and the policy's limits
 * before the page acts on it. Whether a click stands behind a message that
 * sends or opens something is the caller's check, because only the page can see
 * it.
 * @module dsh-intelligent-ui/client/bridge
 */

import { CHANNEL, type Json, SCROLL_KEYS, type ScrollInput } from '../widget/messages.ts'
import { LIMITS } from '../widget/policy.ts'

/** One checked request from a frame. */
export type FrameAction =
  | { kind: 'height'; height: number }
  | { kind: 'send'; text: string }
  | { kind: 'open'; url: string }
  | { kind: 'state'; value: Json }
  | { kind: 'controls'; value: Record<string, Json> }
  | { kind: 'error'; message: string }
  | { kind: 'ran' }
  | { kind: 'scroll'; input: ScrollInput; key?: string }

/** Most control ids the page keeps for one widget. */
const MAX_CONTROLS = 200

/**
 * Read one message from a frame.
 * @param data - the posted value.
 * @returns the checked request, or undefined when it is not a well-formed message of this protocol.
 */
export function readFrameMessage(data: unknown): FrameAction | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const message = data as Record<string, unknown>
  if (message.channel !== CHANNEL) return undefined
  switch (message.t) {
    case 'height': {
      const value = message.h
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
      return { kind: 'height', height: Math.round(Math.min(LIMITS.maxHeight, Math.max(LIMITS.minHeight, value))) }
    }
    case 'send': {
      const text = typeof message.text === 'string' ? message.text.trim() : ''
      if (text === '' || text.length > LIMITS.maxPromptChars) return undefined
      return { kind: 'send', text }
    }
    case 'open': {
      if (typeof message.url !== 'string' || message.url.length > LIMITS.maxLinkChars) return undefined
      let url: URL
      try {
        url = new URL(message.url)
      } catch {
        return undefined
      }
      return url.protocol === 'https:' || url.protocol === 'http:' ? { kind: 'open', url: url.href } : undefined
    }
    case 'state': {
      const value = jsonWithin(message.value, LIMITS.maxStateChars)
      return value === undefined ? undefined : { kind: 'state', value }
    }
    case 'controls': {
      const value = jsonWithin(message.value, LIMITS.maxControlsChars)
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
      const entries = Object.entries(value).filter(([id, entry]) => id.length <= 128 && isControlValue(entry)).slice(0, MAX_CONTROLS)
      return { kind: 'controls', value: Object.fromEntries(entries) }
    }
    case 'error': {
      if (typeof message.message !== 'string' || message.message.trim() === '') return undefined
      return { kind: 'error', message: message.message.trim().slice(0, LIMITS.maxErrorChars) }
    }
    case 'ran':
      return { kind: 'ran' }
    case 'scroll': {
      if (message.input === 'wheel' || message.input === 'touch') return { kind: 'scroll', input: message.input }
      if (message.input !== 'key' || typeof message.key !== 'string' || !SCROLL_KEYS.has(message.key)) return undefined
      return { kind: 'scroll', input: 'key', key: message.key }
    }
    default:
      return undefined
  }
}

/** A kept control value: text, a truth value, or a list of texts. */
function isControlValue(value: Json): boolean {
  return typeof value === 'string' || typeof value === 'boolean' || (Array.isArray(value) && value.every(entry => typeof entry === 'string'))
}

/** A value as JSON when it is JSON and fits the size; a copy, so the frame keeps no reference. */
function jsonWithin(value: unknown, max: number): Json | undefined {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch {
    return undefined
  }
  if (text === undefined || text.length > max) return undefined
  return JSON.parse(text) as Json
}
