/**
 * Which cards are drawn in the reply right now.
 *
 * A card in the reply enters while it is mounted and leaves when it unmounts.
 * The call's tool row reads this to stay a one-line status while the card is
 * on the page, and to draw the card itself where no reply copy exists — in a
 * view without Chat nodes, or for a call whose reply copy is hidden.
 * @module dsh-intelligent-ui/client/presence
 */

/** The cards drawn in the reply, by memory key, with change notification. */
export interface Presence {
  /**
   * Record one mounted copy.
   * @returns the cleanup that removes it.
   */
  enter(key: string): () => void
  has(key: string): boolean
  subscribe(key: string, listener: () => void): () => void
}

/**
 * Create an empty record of reply cards.
 * @returns the record, shared by the reply copies and the tool rows of one page.
 */
export function createPresence(): Presence {
  const counts = new Map<string, number>()
  const listeners = new Map<string, Set<() => void>>()
  const notify = (key: string): void => {
    for (const listener of [...(listeners.get(key) ?? [])]) listener()
  }
  return {
    enter(key) {
      const before = counts.get(key) ?? 0
      counts.set(key, before + 1)
      if (before === 0) notify(key)
      let left = false
      return () => {
        if (left) return
        left = true
        const now = (counts.get(key) ?? 1) - 1
        if (now > 0) {
          counts.set(key, now)
          return
        }
        counts.delete(key)
        notify(key)
      }
    },
    has(key) {
      return (counts.get(key) ?? 0) > 0
    },
    subscribe(key, listener) {
      let set = listeners.get(key)
      if (set === undefined) {
        set = new Set()
        listeners.set(key, set)
      }
      set.add(listener)
      return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(key)
      }
    },
  }
}
