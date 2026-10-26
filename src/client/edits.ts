/**
 * The reader's edits, kept in this browser.
 *
 * One card can be drawn twice — in the tool row while its turn runs and under the
 * reply once it ends — and a chat list may unmount a row that scrolls away. Keeping
 * edits here, keyed by session and call, makes both copies and every remount show
 * the same state. Each card's memory is also written to the browser's own storage,
 * so a reload or a restart shows the card as the reader left it. The storage is
 * per viewer: another browser, or the session log, still starts from the model's
 * initial values. This is the only file of the browser half that touches storage.
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
  /** Call id of a later card that revises this one. */
  revisedBy?: string
}

/** A small keyed store with change notification, so both copies of a card stay in step. */
export interface EditsStore {
  get(key: string): CardMemory | undefined
  set(key: string, memory: CardMemory): void
  subscribe(key: string, listener: () => void): () => void
}

/** The slice of the Web Storage interface the store uses. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Most cards remembered at once, in the page and in storage; the oldest are forgotten first. */
const MAX_CARDS = 200
/** Storage key of one card's memory, before its memory key. */
const CARD_PREFIX = 'dsh-intelligent-ui.card.v1:'
/** Storage key of the stored cards' memory keys, oldest first. */
const INDEX_KEY = 'dsh-intelligent-ui.cards.v1'
/** Largest memory written to storage; a larger one lives for the page only. */
const MAX_STORED_CHARS = 16 * 1024

/**
 * The browser's local storage, when the page may use it.
 * @returns the storage, or undefined in a context without one or where reading it throws.
 */
export function browserStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    // A blocked or sandboxed page throws on the getter itself.
    return undefined
  }
}

/**
 * Create one store. The plugin entry owns it, so unloading the plugin drops it.
 * @param storage - where memories outlive the page; without one they live for the page only.
 * @returns an empty store.
 */
export function createEditsStore(storage: StorageLike | undefined = browserStorage()): EditsStore {
  const memories = new Map<string, CardMemory>()
  /** Keys already looked up in storage, so a miss is read once, not on every render. */
  const looked = new Set<string>()
  /** Keys this page knows are in the storage index. */
  const indexed = new Set<string>()
  const listeners = new Map<string, Set<() => void>>()

  const remember = (key: string, memory: CardMemory): void => {
    memories.delete(key)
    memories.set(key, memory)
    while (memories.size > MAX_CARDS) {
      const oldest = memories.keys().next().value as string
      memories.delete(oldest)
      looked.delete(oldest)
    }
  }

  const persist = (key: string, memory: CardMemory): void => {
    if (storage === undefined) return
    try {
      const text = JSON.stringify(memory)
      if (text.length > MAX_STORED_CHARS) {
        // An older, smaller copy would come back on reload as a stale state.
        storage.removeItem(CARD_PREFIX + key)
        return
      }
      storage.setItem(CARD_PREFIX + key, text)
      if (indexed.has(key)) return
      // Read the index afresh: another tab may have added cards since.
      const keys = readIndex(storage).filter(entry => entry !== key)
      keys.push(key)
      while (keys.length > MAX_CARDS) storage.removeItem(CARD_PREFIX + (keys.shift() as string))
      storage.setItem(INDEX_KEY, JSON.stringify(keys))
      indexed.add(key)
    } catch {
      // A full or blocked storage keeps the edit for this page only.
    }
  }

  return {
    get(key) {
      const known = memories.get(key)
      if (known !== undefined || storage === undefined || looked.has(key)) return known
      looked.add(key)
      const stored = readStored(storage, key)
      if (stored !== undefined) {
        remember(key, stored)
        indexed.add(key)
      }
      return stored
    },
    set(key, memory) {
      looked.add(key)
      remember(key, memory)
      persist(key, memory)
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

/** One card's stored memory, or undefined when there is none or it does not read as one. */
function readStored(storage: StorageLike, key: string): CardMemory | undefined {
  try {
    return readMemory(JSON.parse(storage.getItem(CARD_PREFIX + key) ?? 'null'))
  } catch {
    return undefined
  }
}

/** The stored index, or an empty one when it is missing or damaged. */
function readIndex(storage: StorageLike): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(INDEX_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

/**
 * Check a stored memory's shape. Values are checked again against the card's own
 * declarations when it renders, so this only has to keep the shape honest.
 * @param value - the parsed JSON.
 * @returns the memory, or undefined when the shape is wrong.
 */
export function readMemory(value: unknown): CardMemory | undefined {
  if (!isRecord(value) || !isRecord(value.values)) return undefined
  return {
    values: value.values as Record<string, JsonValue>,
    ...(typeof value.sent === 'string' ? { sent: value.sent } : {}),
    ...(isRecord(value.ui) ? { ui: value.ui as Record<string, JsonValue> } : {}),
    ...(typeof value.revisedBy === 'string' ? { revisedBy: value.revisedBy } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
