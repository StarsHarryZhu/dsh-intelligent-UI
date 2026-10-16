import { describe, expect, it } from 'vitest'
import { parseInfix, readString } from '../src/lang/infix.ts'

describe('the readable expression syntax', () => {
  it('lowers arithmetic with the usual precedence', () => {
    expect(parseInfix('1 + 2 * 3')).toEqual(['add', 1, ['mul', 2, 3]])
    expect(parseInfix('(1 + 2) * 3')).toEqual(['mul', ['add', 1, 2], 3])
    expect(parseInfix('seats * 29')).toEqual(['mul', ['ref', 'seats'], 29])
    expect(parseInfix('a % 4 - -2')).toEqual(['sub', ['mod', ['ref', 'a'], 4], -2])
  })

  it('wraps a bare literal so every stored expression is an operator array', () => {
    expect(parseInfix('29')).toEqual(['lit', 29])
    expect(parseInfix('true')).toEqual(['lit', true])
  })

  it('reads comparisons, equality, and the logical operators', () => {
    expect(parseInfix('a <= b')).toEqual(['le', ['ref', 'a'], ['ref', 'b']])
    expect(parseInfix('a > 1 && b < 2 || !c')).toEqual(['or', ['and', ['gt', ['ref', 'a'], 1], ['lt', ['ref', 'b'], 2]], ['not', ['ref', 'c']]])
    expect(parseInfix('a and not b')).toEqual(['and', ['ref', 'a'], ['not', ['ref', 'b']]])
    expect(parseInfix('a = 1')).toEqual(['eq', ['ref', 'a'], 1])
  })

  it('compares against quoted text, in either quote style', () => {
    expect(parseInfix('plan == "Pro"')).toEqual(['eq', ['ref', 'plan'], ['lit', 'Pro']])
    expect(parseInfix('plan != \'Team\'')).toEqual(['ne', ['ref', 'plan'], ['lit', 'Team']])
  })

  it('reads a nested ternary from the right', () => {
    expect(parseInfix('plan == "Team" ? 22 : plan == "Pro" ? 29 : 12')).toEqual([
      'if', ['eq', ['ref', 'plan'], ['lit', 'Team']], 22, ['if', ['eq', ['ref', 'plan'], ['lit', 'Pro']], 29, 12],
    ])
  })

  it('lowers the named functions', () => {
    expect(parseInfix('min(a, 3)')).toEqual(['min', ['ref', 'a'], 3])
    expect(parseInfix('round(a / 3, 2)')).toEqual(['round', ['div', ['ref', 'a'], 3], 2])
    expect(parseInfix('round(a)')).toEqual(['round', ['ref', 'a'], 0])
    expect(parseInfix('fmt(a, 1)')).toEqual(['fmtNum', ['ref', 'a'], 1])
    expect(parseInfix('if(a > 1, 2, 3)')).toEqual(['if', ['gt', ['ref', 'a'], 1], 2, 3])
  })

  it('rejects anything outside the vocabulary instead of guessing', () => {
    expect(parseInfix('alert(1)')).toBeUndefined()
    expect(parseInfix('a.b')).toBeUndefined()
    expect(parseInfix('a[0]')).toBeUndefined()
    expect(parseInfix('1 +')).toBeUndefined()
    expect(parseInfix('round(a, b)')).toBeUndefined()
    expect(parseInfix('"unterminated')).toBeUndefined()
    expect(parseInfix('')).toBeUndefined()
    expect(parseInfix('a'.repeat(2001))).toBeUndefined()
  })

  it('decodes escapes inside quoted text', () => {
    expect(readString('"a \\"b\\" \\n c"', 0)).toEqual({ value: 'a "b" \n c', end: 14 })
    expect(readString('"open', 0)).toBeUndefined()
  })
})
