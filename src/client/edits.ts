/**
 * What each widget keeps, in this browser.
 *
 * A widget's frame has no storage of its own: it is sandboxed. What it keeps —
 * the value it stores with `dsh.state`, the values of its controls, and its last
 * height — is sent to the page and kept here, keyed by session and call, so a
 * remount, a reload, or a restart shows the widget as the reader left it. Each
 * card's memory is also written to the browser's own storage. The storage is per
 * viewer: another browser, or the session log, still starts from the widget as
 * the model wrote it. This is the only file of the browser half that touches
 * storage, and the page only stores what a frame sends; it never interprets it.
 * @module dsh-intelligent-ui/client/edits
 */

import type { Json } from '../widget/messages.ts'

/** What the store remembers for one card. */
export interface CardMemory {
  /** What the widget kept with `dsh.state`. */
  state?: Json
  /** Control values by element id. */
  controls?: Readonly<Record<string, Json>>
  /** The frame's last height, so a reload draws it at its size at once. */
  height?: number
  /** Call id of a later card that revises this one. */
  revisedBy?: string
}

/** A small keyed store with change notification, so both copies of a card stay in step. */
export interface EditsStore {
  get(key: string): CardMemory | undefined
  /**
   * Remember a card's memory and tell its copies.
   * @param keep - false for a passing value, such as one frame of an animation: the
   *   page shows it, and storage gets the memory with the next kept change.
   */
  set(key: string, memory: CardMemory, keep?: boolean): void
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
const CARD_PREFIX = 'dsh-intelligent-ui.card.v2:'
/** Storage key of the stored cards' memory keys, oldest first. */
const INDEX_KEY = 'dsh-intelligent-ui.cards.v2'
/** Largest memory written to storage; a larger one lives for the page only. */
const MAX_STORED_CHARS = 40 * 1024

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
    set(key, memory, keep = true) {
      looked.add(key)
      remember(key, memory)
      if (keep) persist(key, memory)
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
 * Check a stored memory's shape. What the widget kept is handed back to its
 * frame as it was stored; the page itself never interprets it.
 * @param value - the parsed JSON.
 * @returns the memory, or undefined when the shape is wrong.
 */
export function readMemory(value: unknown): CardMemory | undefined {
  if (!isRecord(value)) return undefined
  return {
    ...(value.state === undefined ? {} : { state: value.state as Json }),
    ...(isRecord(value.controls) ? { controls: value.controls as Record<string, Json> } : {}),
    ...(typeof value.height === 'number' && Number.isFinite(value.height) ? { height: value.height } : {}),
    ...(typeof value.revisedBy === 'string' ? { revisedBy: value.revisedBy } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
