/**
 * A widget placed inside the answer's text.
 *
 * A model that calls `ui_render` before it writes its answer can still put the
 * widget anywhere in that answer: it writes a fenced block whose only line is
 * the card id. The host renders the block as a code block; this module finds
 * it, hides it, and puts one container right after it, into which the card
 * node draws its widget through a portal. Unplaced, the widget stays where the
 * call was.
 *
 * This is the only file that reads the host's DOM. It relies on three hooks
 * the host renders: a code block's `.md-code-block` root and
 * `[data-code-block-content]` body, and each chat row's `data-chat-turn`. It
 * never removes or rewrites a host node: it marks the block with one attribute
 * and adds one element after it, and takes both back when the card leaves or
 * the block goes. Where a hook is missing nothing matches, and the block stays
 * an ordinary code block.
 * @module dsh-intelligent-ui/client/placement
 */

/** A code block the host's Markdown renders. */
export const CODE_BLOCK = '.md-code-block'

/** The body of a code block, holding its text. */
export const CODE_BODY = '[data-code-block-content]'

/** The attribute that numbers a chat row's turn. */
export const ROW_TURN = 'data-chat-turn'

/** The root of one session's chat rows. */
export const FLOW_ROOT = '[data-slot="conversation.chat.flow"]'

/** The mark on a code block whose widget stands in its place; the stylesheet hides a marked block. */
export const PLACED_MARK = 'data-dsh-iui-placed'

/** The class of the container a placed widget is drawn into. */
export const SLOT_CLASS = 'dsh-iui-placed'

/** Longest code block text read for a card id; anything longer is ordinary code. */
const MAX_NAME_CHARS = 200

/**
 * The card id a code block names: its whole text, optionally after the word
 * `widget` or `card`.
 * @param text - the block's text.
 * @returns the id, or undefined when the block is anything else.
 */
export function namedCard(text: string): string | undefined {
  if (text.length > MAX_NAME_CHARS) return undefined
  const match = /^\s*(?:(?:widget|card)\s*:?\s+)?([\w:.-]{1,128})\s*$/iu.exec(text)
  return match?.[1]
}

/** One card asking to stand in the answer. */
export interface PlacementRequest {
  /** The ids a block may name: the card's own first, then any it replaces. */
  readonly ids: readonly string[]
  /** The card's own chat row. */
  readonly row: Element
  /** Receives the container to draw into, or null to draw where the call was. */
  readonly place: (slot: HTMLElement | null) => void
}

/** What one request holds now. */
interface Claim {
  readonly request: PlacementRequest
  block: Element | null
  slot: HTMLElement | null
  reported: boolean
}

/** The turn number a row or a node inside one carries. */
function turnOf(element: Element): string | undefined {
  return element.closest(`[${ROW_TURN}]`)?.getAttribute(ROW_TURN) ?? undefined
}

/** The watcher of one chat root: it finds the blocks every card there names. */
class Watcher {
  readonly claims: Claim[] = []
  private readonly observer: MutationObserver
  private frame: number | undefined

  constructor(readonly root: Element, private readonly done: () => void) {
    const view = root.ownerDocument.defaultView
    this.observer = new (view?.MutationObserver ?? MutationObserver)(() => { this.schedule() })
    this.observer.observe(root, { childList: true, subtree: true, characterData: true })
  }

  add(claim: Claim): void {
    this.claims.push(claim)
    this.scan()
  }

  leave(claim: Claim): void {
    const index = this.claims.indexOf(claim)
    if (index < 0) return
    this.claims.splice(index, 1)
    release(claim)
    if (this.claims.length > 0) {
      this.schedule()
      return
    }
    this.observer.disconnect()
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    this.done()
  }

  private schedule(): void {
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined
      this.scan()
    })
  }

  /** Match every claim to the first free block after its card, in its turn, that names it. */
  scan(): void {
    const turns = new Set<string>()
    for (const claim of this.claims) {
      const turn = turnOf(claim.request.row)
      if (turn !== undefined) turns.add(turn)
    }
    const named: Array<{ block: Element; id: string; turn: string }> = []
    if (turns.size > 0) {
      for (const block of Array.from(this.root.querySelectorAll(CODE_BLOCK))) {
        const turn = turnOf(block)
        if (turn === undefined || !turns.has(turn)) continue
        const id = namedCard(block.querySelector(CODE_BODY)?.textContent ?? '')
        if (id !== undefined) named.push({ block, id, turn })
      }
    }
    const taken = new Set<Element>()
    const found = new Map<Claim, Element>()
    // A block naming a card's own id goes to that card before any card that only replaced it.
    for (const own of [true, false]) {
      for (const claim of this.claims) {
        if (found.has(claim)) continue
        const { row, ids } = claim.request
        const turn = row.isConnected ? turnOf(row) : undefined
        if (turn === undefined) continue
        const wanted = own ? ids.slice(0, 1) : ids.slice(1)
        const entry = named.find(candidate => !taken.has(candidate.block) && candidate.turn === turn && wanted.includes(candidate.id)
          && (row.compareDocumentPosition(candidate.block) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
        if (entry === undefined) continue
        taken.add(entry.block)
        found.set(claim, entry.block)
      }
    }
    for (const claim of this.claims) settle(claim, found.get(claim) ?? null)
  }
}

/** Put a claim's widget after its block, or back where its call was. */
function settle(claim: Claim, block: Element | null): void {
  const kept = block === claim.block && (block === null || (claim.slot?.isConnected ?? false))
  if (kept && claim.reported) return
  if (!kept) {
    release(claim)
    if (block !== null) {
      // A fresh container each time: moving a frame's element would reload it under the widget.
      const slot = block.ownerDocument.createElement('div')
      slot.className = SLOT_CLASS
      slot.setAttribute('data-text-interaction-exclude', '')
      block.setAttribute(PLACED_MARK, '')
      block.after(slot)
      claim.block = block
      claim.slot = slot
    }
  }
  claim.reported = true
  claim.request.place(claim.slot)
}

/** Take back what a claim added to the page. */
function release(claim: Claim): void {
  claim.slot?.remove()
  if (claim.block !== null && claim.block.isConnected) claim.block.removeAttribute(PLACED_MARK)
  claim.slot = null
  claim.block = null
}

/** One watcher per chat root. */
const watchers = new Map<Element, Watcher>()

/**
 * Let a card stand in the answer wherever a block of its turn names it.
 * Reports where to draw at once, then again whenever that changes.
 * @param request - the card's ids, its row, and where to report.
 * @returns the cleanup that takes the card's container and mark back.
 */
export function watchPlacement(request: PlacementRequest): () => void {
  const root = request.row.closest(FLOW_ROOT) ?? request.row.parentElement
  if (root === null || request.ids.length === 0) {
    request.place(null)
    return () => undefined
  }
  let watcher = watchers.get(root)
  if (watcher === undefined) {
    watcher = new Watcher(root, () => { watchers.delete(root) })
    watchers.set(root, watcher)
  }
  const claim: Claim = { request, block: null, slot: null, reported: false }
  watcher.add(claim)
  const owner = watcher
  return () => { owner.leave(claim) }
}

/**
 * The chat row a node inside it stands in.
 * @param element - a node the card rendered in place.
 * @returns the row, or null outside a chat.
 */
export function rowOf(element: Element): Element | null {
  return element.closest(`[${ROW_TURN}]`)
}
