/**
 * Which block each card stands in: `planPlacement` on plain lists. The cases
 * come from real sessions, where the model miscopied an id, showed an earlier
 * widget again, or wrote a block for a widget it never drew.
 */

import { describe, expect, it } from 'vitest'
import { idPrefix, namedCard, planPlacement } from '../src/widget/blocks.ts'

describe('the block that names a card', () => {
  it('holds the card id alone, or after the word widget or card', () => {
    expect(namedCard('call_00_CCdWYgPeMlPa8yIE8wic2444\n')).toBe('call_00_CCdWYgPeMlPa8yIE8wic2444')
    expect(namedCard('  widget call-7 ')).toBe('call-7')
    expect(namedCard('Card: call-7')).toBe('call-7')
    for (const text of ['', '   ', 'call-7 and more', 'let x = 1', 'a/b', 'x'.repeat(201)]) expect(namedCard(text), text).toBeUndefined()
  })

  it('reads the prefix a host gives its call ids', () => {
    expect(idPrefix('call_00_CCdW')).toBe('call_')
    expect(idPrefix('toolu_01ABC')).toBe('toolu_')
    expect(idPrefix('call-7')).toBeUndefined()
    expect(idPrefix('_x')).toBeUndefined()
  })
})

describe('where each card stands', () => {
  const A = 'call_00_t8A3gOhOaQTMyq8bt6vJ2153'
  const B = 'call_00_jQJ0mN91wgyDAf382jOT3886'

  it('puts a card at the block that names it, and hides that block', () => {
    expect(planPlacement([{ name: A, turn: 39 }], [{ ids: [A], turn: 39 }])).toEqual({ cards: [0], hidden: [true], empty: [] })
  })

  it('gives a miscopied id the card of its turn that no block named', () => {
    const plan = planPlacement([{ name: 'call_00_jQJ0mN91wgyDAf382j0390', turn: 183 }], [{ ids: [B], turn: 183 }])
    expect(plan).toEqual({ cards: [0], hidden: [true], empty: [] })
  })

  it('fills a block written before its call, with the card drawn after it', () => {
    const plan = planPlacement(
      [{ name: A, turn: 3 }, { name: 'call_00_q8mK2cVn5YsLxT4pRbGv7au4', turn: 3 }],
      [{ ids: [A], turn: 3 }, { ids: ['call_00_later'], turn: 3 }],
    )
    expect(plan.cards).toEqual([0, 1])
    expect(plan.empty).toEqual([])
  })

  it('hides a block for a widget that was never drawn, and reports it empty', () => {
    // The model drew one widget, then wrote a second block for one it never drew.
    const extra = planPlacement([{ name: A, turn: 39 }, { name: 'call_00_pW3kR7mN2sV9xT4bQ6dZ8f1', turn: 39 }], [{ ids: [A], turn: 39 }])
    expect(extra).toEqual({ cards: [0], hidden: [true, true], empty: [1] })
    // An answer with a block and no widget at all: an earlier turn's card stays where it is.
    const none = planPlacement([{ name: A, turn: 21 }, { name: 'call_00_x1KEvGZRp7jT2Xv8XpQm9r7w', turn: 22 }], [{ ids: [A], turn: 21 }])
    expect(none).toEqual({ cards: [0], hidden: [true, true], empty: [1] })
  })

  it('moves a card to a later answer that shows it again, and hides the earlier block', () => {
    const plan = planPlacement([{ name: A, turn: 126 }, { name: A, turn: 127 }, { name: A, turn: 127 }], [{ ids: [A], turn: 126 }])
    expect(plan).toEqual({ cards: [1], hidden: [true, true, true], empty: [] })
  })

  it('gives a replaced id to the newest card that replaced it, never to a card drawn after the block', () => {
    const cards = [{ ids: ['call_old'], turn: 5 }, { ids: ['call_new', 'call_old'], turn: 8 }]
    expect(planPlacement([{ name: 'call_old', turn: 5 }, { name: 'call_old', turn: 8 }], cards).cards).toEqual([0, 1])
    expect(planPlacement([{ name: 'call_old', turn: 5 }], cards).cards).toEqual([0, undefined])
  })

  it('prefers a card\'s own id to an id another card of the turn replaced', () => {
    const plan = planPlacement([{ name: 'call_old', turn: 1 }], [{ ids: ['call_old'], turn: 1 }, { ids: ['call_new', 'call_old'], turn: 1 }])
    expect(plan.cards).toEqual([0, undefined])
  })

  it('waits while a block is still being written toward an id', () => {
    const plan = planPlacement([{ name: 'call_00_t8A3g', turn: 39 }], [{ ids: [A], turn: 39 }])
    expect(plan).toEqual({ cards: [undefined], hidden: [true], empty: [] })
  })

  it('leaves ordinary code alone', () => {
    const plan = planPlacement([{ name: 'ls', turn: 1 }, { name: 'npm_install', turn: 1 }, { name: 'call_', turn: 1 }], [{ ids: [A], turn: 1 }])
    expect(plan).toEqual({ cards: [undefined], hidden: [false, false, false], empty: [] })
  })
})
