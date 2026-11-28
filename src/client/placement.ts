/**
 * A widget placed inside the answer's text.
 *
 * A model that calls `ui_render` before it writes its answer can still put the
 * widget anywhere in that answer: it writes a fenced block whose only line is
 * the card id. The host renders the block as a code block; this module finds
 * it, hides it, and puts one container right after it, into which the card
 * node draws its widget through a portal. Unplaced, the widget stays where the
 * call was. Which block each card takes, and which blocks are hidden although
 * no card fills them, is `planPlacement`'s decision (`../widget/blocks.ts`);
 * this module reads the page for it and carries it out.
 *
 * This is the only file that reads the host's DOM. It relies on four hooks
 * the host renders: a code block's `.md-code-block` root and
 * `[data-code-block-content]` body, each chat row's `data-chat-turn`, and the
 * `data-chat-flow-kind` that marks the reader's own messages and injected
 * context, whose blocks are never read. It never removes or rewrites a host node: it marks a block with
 * one attribute, adds one element after a block a card stands in, and takes
 * both back when the card leaves or the block goes. Where a hook is missing
 * nothing matches, and the block stays an ordinary code block.
 * @module dsh-intelligent-ui/client/placement
 */

import { namedCard, planPlacement, type BlockEntry, type CardEntry } from '../widget/blocks.ts'

export { namedCard }

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

/**
 * Rows holding a message the model did not write: the reader's own, sent at
 * the start of a turn or while it runs, and context other parts inject. Their
 * blocks are never read.
 */
const INPUT_ROW = ['user', 'steering', 'context', 'turn-trigger'].map(kind => `[data-chat-flow-kind="${kind}"]`).join(', ')

/** The turn number a row or a node inside one carries. */
function turnOf(element: Element): number | undefined {
  const value = element.closest(`[${ROW_TURN}]`)?.getAttribute(ROW_TURN)
  if (value === undefined || value === null) return undefined
  const turn = Number.parseInt(value, 10)
  return Number.isFinite(turn) ? turn : undefined
}

/** Whether one node comes before another on the page. */
function earlier(a: Element, b: Element): number {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? -1 : 1
}

/** The watcher of one chat root: it finds the blocks every card there names. */
class Watcher {
  readonly claims: Claim[] = []
  private readonly observer: MutationObserver
  private frame: number | undefined
  /** Blocks this watcher has marked, so it takes back exactly those marks. */
  private readonly marked = new Set<Element>()

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
    this.mark(new Set())
    this.done()
  }

  private schedule(): void {
    if (this.frame !== undefined) return
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined
      this.scan()
    })
  }

  /** Read the blocks and the cards on the page, decide where each card stands, and carry it out. */
  scan(): void {
    const cards: Array<{ claim: Claim; entry: CardEntry }> = []
    for (const claim of this.claims) {
      const { row, ids } = claim.request
      const turn = row.isConnected ? turnOf(row) : undefined
      if (turn !== undefined) cards.push({ claim, entry: { ids, turn } })
    }
    cards.sort((a, b) => earlier(a.claim.request.row, b.claim.request.row))
    const blocks: Array<{ block: Element; entry: BlockEntry }> = []
    if (cards.length > 0) {
      for (const block of Array.from(this.root.querySelectorAll(CODE_BLOCK))) {
        if (block.closest(INPUT_ROW) !== null) continue
        const turn = turnOf(block)
        if (turn === undefined) continue
        const name = namedCard(block.querySelector(CODE_BODY)?.textContent ?? '')
        if (name !== undefined) blocks.push({ block, entry: { name, turn } })
      }
    }
    const plan = planPlacement(blocks.map(item => item.entry), cards.map(item => item.entry))
    this.mark(new Set(blocks.filter((_item, index) => plan.hidden[index] === true).map(item => item.block)))
    const found = new Map<Claim, Element>()
    cards.forEach((item, index) => {
      const block = plan.cards[index]
      if (block !== undefined) found.set(item.claim, (blocks[block] as { block: Element }).block)
    })
    for (const claim of this.claims) settle(claim, found.get(claim) ?? null)
  }

  /** Mark exactly the given blocks as hidden, taking back the marks on any others. */
  private mark(hidden: ReadonlySet<Element>): void {
    for (const block of this.marked) {
      if (hidden.has(block)) continue
      if (block.isConnected) block.removeAttribute(PLACED_MARK)
      this.marked.delete(block)
    }
    for (const block of hidden) {
      if (!block.hasAttribute(PLACED_MARK)) block.setAttribute(PLACED_MARK, '')
      this.marked.add(block)
    }
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
      block.after(slot)
      claim.block = block
      claim.slot = slot
    }
  }
  claim.reported = true
  claim.request.place(claim.slot)
}

/** Take back the container a claim added to the page; the watcher keeps the marks. */
function release(claim: Claim): void {
  claim.slot?.remove()
  claim.slot = null
  claim.block = null
}

/** One watcher per chat root. */
const watchers = new Map<Element, Watcher>()

/**
 * Let a card stand in the answer wherever a block takes it, by the rules of
 * `planPlacement`. Reports where to draw at once, then again whenever that
 * changes.
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
