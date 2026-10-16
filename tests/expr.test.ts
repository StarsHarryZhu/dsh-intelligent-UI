import { describe, expect, it } from 'vitest'
import { EXPR_FAILURE, checkExpr, evalExpr, formatNumber, truthy } from '../src/lang/expr.ts'
import type { ExprNode } from '../src/lang/types.ts'

/** Evaluate with a fixed value table. */
function run(node: ExprNode, values: Record<string, unknown> = {}): unknown {
  return evalExpr(node, key => values[key] as never)
}

describe('expression validation', () => {
  const scope = new Map<string, 'number' | 'string' | 'boolean'>([
    ['seats', 'number'],
    ['label', 'string'],
    ['on', 'boolean'],
  ])

  it('types the numeric operators', () => {
    expect(checkExpr(['add', ['ref', 'seats'], 1], scope).type).toBe('number')
    expect(checkExpr(['lt', ['ref', 'seats'], 1], scope).type).toBe('boolean')
    expect(checkExpr(['if', ['ref', 'on'], 1, 0], scope).type).toBe('number')
  })

  it('rejects a reference the program never declared', () => {
    const check = checkExpr(['ref', 'ghost'], scope)
    expect(check.type).toBeUndefined()
    expect(check.problems[0]?.code).toBe('unknown_ref')
  })

  it('rejects an unknown operator', () => {
    const check = checkExpr(['evaluate', ['lit', 'x']], scope)
    expect(check.type).toBeUndefined()
    expect(check.problems[0]?.message).toContain('unknown expression operator')
  })

  it('rejects the wrong argument count', () => {
    const check = checkExpr(['add', 1], scope)
    expect(check.type).toBeUndefined()
    expect(check.problems[0]?.message).toContain('add takes 2 argument(s), got 1')
  })

  it('rejects a non-number where a number is required', () => {
    const check = checkExpr(['mul', ['ref', 'label'], 2], scope)
    expect(check.type).toBeUndefined()
    expect(check.problems[0]?.message).toContain('expected a number')
  })

  it('rejects branches of an if that disagree', () => {
    const check = checkExpr(['if', ['ref', 'on'], 1, ['ref', 'label']], scope)
    expect(check.problems[0]?.message).toContain('same type')
  })

  it('refuses to let concat reassemble derived text', () => {
    const check = checkExpr(['concat', ['lit', 'a'], ['ref', 'label']], scope)
    expect(check.type).toBeUndefined()
    expect(check.problems[0]?.message).toContain('concat cannot use "ref"')
  })

  it('refuses a nested concat', () => {
    const check = checkExpr(['concat', ['lit', 'a'], ['concat', ['lit', 'b']]], scope)
    expect(check.problems[0]?.message).toContain('does not nest')
  })

  it('allows concat over literals and formatted numbers', () => {
    const check = checkExpr(['concat', ['lit', '$'], ['fmtNum', ['ref', 'seats'], 0]], scope)
    expect(check.type).toBe('string')
    expect(check.problems).toEqual([])
  })

  it('bounds the fmtNum digit count', () => {
    expect(checkExpr(['fmtNum', ['ref', 'seats'], 7], scope).type).toBeUndefined()
    expect(checkExpr(['fmtNum', ['ref', 'seats'], -1], scope).type).toBeUndefined()
  })

  it('bounds nesting depth', () => {
    let deep: ExprNode = 1
    for (let index = 0; index < 20; index += 1) deep = ['neg', deep]
    const check = checkExpr(deep, scope)
    expect(check.type).toBeUndefined()
    expect(check.problems[0]?.message).toContain('nests deeper than')
  })

  it('rejects a value that is not an expression array', () => {
    expect(checkExpr({ op: 'add' }, scope).type).toBeUndefined()
    expect(checkExpr([], scope).type).toBeUndefined()
  })

  it('compares text with text, which a choice-driven price needs', () => {
    expect(checkExpr(['eq', ['ref', 'label'], ['lit', 'Pro']], scope).type).toBe('boolean')
    expect(checkExpr(['ne', ['ref', 'on'], true], scope).type).toBe('boolean')
  })

  it('refuses to compare values of different types', () => {
    const check = checkExpr(['eq', ['ref', 'label'], 3], scope)
    expect(check.type).toBeUndefined()
    expect(check.problems[0]?.message).toContain('same type')
  })

  it('keeps ordering comparisons numeric', () => {
    expect(checkExpr(['lt', ['ref', 'label'], ['lit', 'b']], scope).type).toBeUndefined()
  })

  it('bounds the round digit count', () => {
    expect(checkExpr(['round', ['ref', 'seats'], 2], scope).type).toBe('number')
    expect(checkExpr(['round', ['ref', 'seats'], 7], scope).type).toBeUndefined()
    expect(checkExpr(['round', ['ref', 'seats'], 1.5], scope).type).toBeUndefined()
  })

  it('rejects a non-finite literal', () => {
    expect(checkExpr(['lit', Number.POSITIVE_INFINITY], scope).type).toBeUndefined()
  })
})

describe('expression evaluation', () => {
  it('computes the canonical price expression', () => {
    expect(run(['mul', ['ref', 'seats'], 29], { seats: 8 })).toBe(232)
  })

  it('honours arithmetic precedence through the tree', () => {
    // 1 + 2 * 3 as the parser would emit it for "1 + 2 * 3".
    expect(run(['add', 1, ['mul', 2, 3]])).toBe(7)
  })

  it('degrades instead of throwing on division by zero', () => {
    expect(run(['div', 1, 0])).toBe(EXPR_FAILURE)
    expect(run(['mod', 1, 0])).toBe(EXPR_FAILURE)
  })

  it('degrades on a non-finite result', () => {
    expect(run(['mul', ['num', Number.MAX_VALUE], 2])).toBe(EXPR_FAILURE)
  })

  it('returns a failure symbol for an undeclared reference at runtime', () => {
    expect(run(['ref', 'ghost'])).toBe(EXPR_FAILURE)
  })

  it('drops a reference that is not a primitive', () => {
    expect(run(['ref', 'seats'], { seats: [1, 2] })).toBe(EXPR_FAILURE)
  })

  it('rounds to the requested digits', () => {
    expect(run(['round', 2.345, 2])).toBe(2.35)
  })

  it('formats numbers with fmtNum', () => {
    expect(run(['fmtNum', 1234.5678, 2])).toBe('1234.57')
    expect(run(['fmtNum', 8, 0])).toBe('8')
  })

  it('concatenates literals and formatted numbers', () => {
    const dollar = ['lit', '\u0024'] as ExprNode
    expect(run(['concat', dollar, ['fmtNum', 232, 0], ['lit', '/mo']])).toBe('\u0024232/mo')
  })

  it('caps the length of concatenated text', () => {
    const long: ExprNode = ['lit', 'x'.repeat(1500)]
    expect(run(['concat', long, long])).toBe(EXPR_FAILURE)
  })

  it('short-circuits and/or and if', () => {
    expect(run(['and', 1, 0])).toBe(false)
    expect(run(['or', 0, 1])).toBe(true)
    expect(run(['if', 0, 1, 2])).toBe(2)
  })

  it('treats an empty string and zero as false', () => {
    expect(truthy('')).toBe(false)
    expect(truthy(0)).toBe(false)
    expect(truthy('0')).toBe(true)
  })

  it('compares text and booleans by value', () => {
    expect(run(['eq', ['ref', 'plan'], ['lit', 'Pro']], { plan: 'Pro' })).toBe(true)
    expect(run(['ne', ['ref', 'plan'], ['lit', 'Pro']], { plan: 'Team' })).toBe(true)
    expect(run(['eq', ['ref', 'on'], true], { on: true })).toBe(true)
  })

  it('degrades when equality meets two different types at runtime', () => {
    expect(run(['eq', ['ref', 'plan'], 3], { plan: 'Pro' })).toBe(EXPR_FAILURE)
  })

  it('selects a rate from a choice the way the estimate example does', () => {
    const rate: ExprNode = ['if', ['eq', ['ref', 'plan'], ['lit', 'Team']], 22, ['if', ['eq', ['ref', 'plan'], ['lit', 'Pro']], 29, 12]]
    expect(run(rate, { plan: 'Team' })).toBe(22)
    expect(run(rate, { plan: 'Pro' })).toBe(29)
    expect(run(rate, { plan: 'Basic' })).toBe(12)
  })

  it('does not treat numeric text as a number in arithmetic', () => {
    expect(run(['add', ['ref', 'n'], 1], { n: '2' })).toBe(EXPR_FAILURE)
  })

  it('prints integers plainly and fractions to two places', () => {
    expect(formatNumber(232)).toBe('232')
    expect(formatNumber(2.5)).toBe('2.5')
    expect(formatNumber(2.345)).toBe('2.35')
    expect(formatNumber(Number.NaN)).toBe('—')
  })
})
