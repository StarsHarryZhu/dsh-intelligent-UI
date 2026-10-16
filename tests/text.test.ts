import { describe, expect, it } from 'vitest'
import type { ExprType } from '../src/lang/expr.ts'
import { LIMITS } from '../src/lang/limits.ts'
import { parseTemplate, renderText, valueText } from '../src/lang/text.ts'

const scope = new Map<string, ExprType>([['seats', 'number'], ['price', 'number'], ['plan', 'string']])

describe('text interpolation', () => {
  it('splits literal text and {expressions}', () => {
    expect(parseTemplate('{seats} seats cost {price} USD', scope)).toEqual({
      template: [{ expr: ['ref', 'seats'] }, { text: ' seats cost ' }, { expr: ['ref', 'price'] }, { text: ' USD' }],
      rejected: [],
    })
  })

  it('accepts a whole expression, quotes and all, inside one pair of braces', () => {
    const parsed = parseTemplate('Plan: {plan == "Pro" ? "yes" : "no"}', scope)
    expect(parsed.rejected).toEqual([])
    expect(parsed.template[1]).toEqual({ expr: ['if', ['eq', ['ref', 'plan'], ['lit', 'Pro']], ['lit', 'yes'], ['lit', 'no']] })
  })

  it('writes literal braces with {{ and }}', () => {
    expect(parseTemplate('{{seats}} = {seats}', scope).template).toEqual([{ text: '{seats} = ' }, { expr: ['ref', 'seats'] }])
  })

  it('keeps an interpolation that is not a valid expression visible as text', () => {
    const parsed = parseTemplate('Use {a: 1} or {ghost}', scope)
    expect(parsed.template).toEqual([{ text: 'Use {a: 1} or {ghost}' }])
    expect(parsed.rejected).toEqual(['{a: 1}', '{ghost}'])
  })

  it('treats an unclosed brace as text', () => {
    expect(parseTemplate('total {price', scope).template).toEqual([{ text: 'total {price' }])
  })

  it('stops interpolating past the limit and keeps the rest as text', () => {
    const many = Array.from({ length: LIMITS.maxInterpolations + 2 }, () => '{seats}').join(',')
    const parsed = parseTemplate(many, scope)
    expect(parsed.template.filter(segment => 'expr' in segment)).toHaveLength(LIMITS.maxInterpolations)
    expect(parsed.rejected).toHaveLength(2)
  })

  it('always returns at least one segment', () => {
    expect(parseTemplate('', scope).template).toEqual([{ text: '' }])
  })
})

describe('rendering hoisted text', () => {
  const values = new Map<string, number | string>([['seats', 8], ['price', 232.456]])
  const constants = { c0: ' seats, ', c1: ' USD' }

  it('resolves constants and expressions in order', () => {
    const text = [{ $expr: ['ref', 'seats'] }, { $c: 'c0' }, { $expr: ['ref', 'price'] }, { $c: 'c1' }]
    expect(renderText(text, values, constants)).toBe('8 seats, 232.46 USD')
  })

  it('renders plain scalars and degrades unknown shapes to nothing', () => {
    expect(renderText('plain', values)).toBe('plain')
    expect(renderText(3.5, values)).toBe('3.5')
    expect(renderText({ weird: true }, values)).toBe('')
    expect(renderText([{ $c: 'missing' }, 7, null], values, constants)).toBe('')
  })

  it('does not read inherited properties as constants', () => {
    expect(renderText([{ $c: 'toString' }], values, constants)).toBe('')
  })

  it('shows an em dash for a value that cannot be computed', () => {
    expect(valueText(['div', 1, 0], values)).toBe('—')
    expect(valueText(['ref', 'seats'], values)).toBe('8')
  })
})
