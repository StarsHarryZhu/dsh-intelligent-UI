/**
 * The messages between a widget frame and the page that holds it.
 *
 * The page sends the theme, the widget's source as it streams, its saved
 * values, and the shipped libraries it names. The frame sends its height, what
 * the widget asks the page to do, and what went wrong. Every message carries
 * the {@link CHANNEL} mark, so neither side mistakes another script's message
 * for one of these. The page trusts nothing the frame sends: the widget's code
 * runs in the same frame and can post anything, so the page checks every
 * message against these shapes and its own limits.
 * @module dsh-intelligent-ui/widget/messages
 */

import type { LibraryKind } from './libs.ts'

/** A JSON value. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** The mark every message of this protocol carries. */
export const CHANNEL = 'dsh-intelligent-ui'

/** One shipped file, sent as text so the frame can load it from a `blob:` address. */
export interface ShippedText {
  /** The code-host address the widget wrote, which the shipped copy stands in for. */
  url: string
  kind: LibraryKind
  text: string
  /** Bare names a module of this file is imported by, such as `three`, which the frame's import map points here. */
  aliases?: string[]
}

/** What the page sends the frame. */
export type ToFrame =
  | { channel: typeof CHANNEL; t: 'theme'; vars: Record<string, string>; dark: boolean; lang: string }
  | {
    channel: typeof CHANNEL
    t: 'render'
    html: string
    /** True once the whole source has arrived and been checked: the scripts may run. */
    final: boolean
    /** What the widget kept with `dsh.state`. */
    state?: Json
    /** Saved control values by element id. */
    controls?: Record<string, Json>
  }
  | { channel: typeof CHANNEL; t: 'libs'; files: ShippedText[] }

/** What the frame sends the page. */
export type FromFrame =
  | { channel: typeof CHANNEL; t: 'height'; h: number }
  | { channel: typeof CHANNEL; t: 'send'; text: string }
  | { channel: typeof CHANNEL; t: 'open'; url: string }
  | { channel: typeof CHANNEL; t: 'state'; value: Json }
  | { channel: typeof CHANNEL; t: 'controls'; value: Record<string, Json> }
  | { channel: typeof CHANNEL; t: 'error'; message: string }
  | { channel: typeof CHANNEL; t: 'ran' }

/** A message of either direction without its channel mark, as a sender writes it. */
export type Unmarked<M> = M extends unknown ? Omit<M, 'channel'> : never
