/**
 * The reader's edits, kept for the page's lifetime.
 *
 * One card can be drawn twice — in the tool row while its turn runs and under the
 * reply once it ends — and a chat list may unmount a row that scrolls away. Keeping
 * edits here, keyed by session and call, makes both copies and every remount show
 * the same state. A reload starts from the model's initial values again; nothing
 * claims otherwise, and nothing is persisted.
 * @module dsh-intelligent-ui/client/edits
 */

import type { JsonValue } from '../lang/types.ts'

/** What the store remembers for one card. */
export interface CardMemory {
  /** State values the reader changed, by key. */
  values: Readonly<Record<string, JsonValue>>
  /** The button whose prompt was sent, by node id. */
  sent?: string
  /** What the reader set on a component itself, by node id: the open tab, ticked items, a sort. */
  ui?: Readonly<Record<string, JsonValue>>
}

/** A small keyed store with change notification, so both copies of a card stay in step. */
export interface EditsStore {
  get(key: string): CardMemory | undefined
  set(key: string, memory: CardMemory): void
  subscribe(key: string, listener: () => void): () => void
}

/** Most cards remembered at once; the oldest are forgotten first. */
const MAX_CARDS = 200

/**
 * Create one store. The plugin entry owns it, so unloading the plugin drops it.
 * @returns an empty store.
 */
export function createEditsStore(): EditsStore {
  const memories = new Map<string, CardMemory>()
  const listeners = new Map<string, Set<() => void>>()
  return {
    get: key => memories.get(key),
    set(key, memory) {
      memories.delete(key)
      memories.set(key, memory)
      while (memories.size > MAX_CARDS) memories.delete(memories.keys().next().value as string)
      for (const listener of [...listeners.get(key) ?? []]) listener()
    },
    subscribe(key, listener) {
      const set = listeners.get(key) ?? new Set()
      set.add(listener)
      listeners.set(key, set)
      return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(key)
      }
    },
  }
}
