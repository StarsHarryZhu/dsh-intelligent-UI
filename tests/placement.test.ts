// @vitest-environment jsdom
/**
 * A widget placed inside the answer: `placement.ts` against a page built the
 * way the host renders a chat — a flow root, rows that carry their turn, and
 * code blocks with a body. The host's real Markdown and the real portal are
 * the check in docs/VERIFY.md, step 4.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { CODE_BODY, namedCard, PLACED_MARK, SLOT_CLASS, watchPlacement } from '../src/client/placement.ts'

/** A row of the chat, in one turn, holding the given markup. */
function row(turn: number, inner = ''): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('data-chat-turn', String(turn))
  element.innerHTML = inner
  return element
}

/** A code block the way the host's Markdown renders one. */
function block(text: string): string {
  return `<div class="md-code-block"><div data-code-block-banner>Code</div><div data-code-block-content><pre><code><span class="line">${text}</span></code></pre></div></div>`
}

/** A chat root with its rows. */
function chat(...rows: HTMLElement[]): HTMLElement {
  const root = document.createElement('div')
  root.setAttribute('data-slot', 'conversation.chat.flow')
  root.append(...rows)
  document.body.append(root)
  return root
}

/** Let the page's observers and frames run. */
async function frames(count = 2): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve() }) })
  }
}

/** Watch one card and record every report. */
function watch(ids: string[], card: Element): { reports: Array<HTMLElement | null>; stop: () => void } {
  const reports: Array<HTMLElement | null> = []
  const stop = watchPlacement({ ids, row: card, place: (slot) => { reports.push(slot) } })
  return { reports, stop }
}

afterEach(() => { document.body.replaceChildren() })

describe('the block that names a card', () => {
  it('holds the card id alone, or after the word widget or card', () => {
    expect(namedCard('call_00_CCdWYgPeMlPa8yIE8wic2444\n')).toBe('call_00_CCdWYgPeMlPa8yIE8wic2444')
    expect(namedCard('  widget call-7 ')).toBe('call-7')
    expect(namedCard('Card: call-7')).toBe('call-7')
    for (const text of ['', '   ', 'call-7 and more', 'let x = 1', 'a/b', 'x'.repeat(201)]) expect(namedCard(text), text).toBeUndefined()
  })
})

describe('a card placed in the answer', () => {
  it('stands after the first block of its turn, after itself, that names it', () => {
    const card = row(2)
    const before = row(2, block('call-7'))
    const other = row(3, block('call-7'))
    const answer = row(2, `<p>Lead-in</p>${block('call-7')}<p>After</p>${block('call-7')}`)
    chat(before, card, answer, other)
    const { reports } = watch(['call-7'], card)
    const [first, second] = Array.from(answer.querySelectorAll('.md-code-block'))
    expect(reports).toHaveLength(1)
    const slot = reports[0] as HTMLElement
    expect(slot.className).toBe(SLOT_CLASS)
    expect(slot.previousElementSibling).toBe(first)
    expect(first?.hasAttribute(PLACED_MARK)).toBe(true)
    expect(second?.hasAttribute(PLACED_MARK)).toBe(false)
    expect(before.querySelector(`[${PLACED_MARK}]`)).toBeNull()
    expect(other.querySelector(`[${PLACED_MARK}]`)).toBeNull()
    expect(slot.hasAttribute('data-text-interaction-exclude')).toBe(true)
  })

  it('reports in place at once when no block names it, and moves once the block is written', async () => {
    const card = row(1)
    const answer = row(1, `<p>Streaming</p>${block('call_')}`)
    chat(card, answer)
    const { reports } = watch(['call_9'], card)
    expect(reports).toEqual([null])
    const body = answer.querySelector(CODE_BODY) as HTMLElement
    ;(body.querySelector('.line') as HTMLElement).textContent = 'call_9'
    await frames()
    expect(reports).toHaveLength(2)
    expect(reports[1]?.previousElementSibling).toBe(answer.querySelector('.md-code-block'))
    // Nothing else changed, so nothing more is reported.
    answer.append(document.createElement('p'))
    await frames()
    expect(reports).toHaveLength(2)
  })

  it('goes back in place when the block goes, and to a fresh container when it comes back', async () => {
    const card = row(1)
    const answer = row(1, block('call-1'))
    chat(card, answer)
    const { reports } = watch(['call-1'], card)
    const first = reports[0] as HTMLElement
    answer.querySelector('.md-code-block')?.remove()
    await frames()
    expect(reports.at(-1)).toBeNull()
    expect(first.isConnected).toBe(false)
    answer.insertAdjacentHTML('beforeend', block('call-1'))
    await frames()
    const again = reports.at(-1) as HTMLElement
    expect(again).not.toBe(first)
    expect(again.isConnected).toBe(true)
  })

  it('takes back its container and its mark when the card leaves', () => {
    const card = row(1)
    const answer = row(1, block('call-1'))
    const root = chat(card, answer)
    const untouched = answer.innerHTML
    const { stop } = watch(['call-1'], card)
    expect(root.querySelector(`.${SLOT_CLASS}`)).not.toBeNull()
    stop()
    expect(root.querySelector(`.${SLOT_CLASS}`)).toBeNull()
    expect(root.querySelector(`[${PLACED_MARK}]`)).toBeNull()
    expect(answer.innerHTML).toBe(untouched)
  })

  it('answers to the id it replaced, but a block naming a card\'s own id goes to that card', () => {
    const old = row(1)
    const redrawn = row(1)
    const answer = row(1, block('call-old'))
    chat(old, redrawn, answer)
    const alone = watch(['call-new', 'call-old'], redrawn)
    expect(alone.reports[0]?.previousElementSibling?.textContent).toContain('call-old')
    alone.stop()
    const original = watch(['call-old'], old)
    const replacing = watch(['call-new', 'call-old'], redrawn)
    expect(original.reports.at(-1)?.previousElementSibling?.textContent).toContain('call-old')
    expect(replacing.reports.at(-1)).toBeNull()
  })

  it('stays in place outside a chat row, and for a card whose row has left the page', () => {
    const loose = document.createElement('div')
    document.body.append(loose)
    expect(watch(['call-1'], loose).reports).toEqual([null])
    const card = row(1)
    chat(row(1, block('call-1')))
    expect(watch(['call-1'], card).reports).toEqual([null])
  })
})
