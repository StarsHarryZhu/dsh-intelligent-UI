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

  it('lowers powers, factorials, and implicit products with math precedence', () => {
    expect(parseInfix('x^2')).toEqual(['pow', ['ref', 'x'], 2])
    expect(parseInfix('-x^2')).toEqual(['neg', ['pow', ['ref', 'x'], 2]])
    expect(parseInfix('2^3^2')).toEqual(['pow', 2, ['pow', 3, 2]])
    expect(parseInfix('2^-x')).toEqual(['pow', 2, ['neg', ['ref', 'x']]])
    expect(parseInfix('n!')).toEqual(['fn', 'fact', ['ref', 'n']])
    expect(parseInfix('a != b')).toEqual(['ne', ['ref', 'a'], ['ref', 'b']])
    expect(parseInfix('3x^2')).toEqual(['mul', 3, ['pow', ['ref', 'x'], 2]])
    expect(parseInfix('2(x + 1)')).toEqual(['mul', 2, ['add', ['ref', 'x'], 1]])
    expect(parseInfix('1.5e-3')).toEqual(['lit', 0.0015])
  })

  it('names constants and table functions, including common aliases', () => {
    expect(parseInfix('2pi')).toEqual(['mul', 2, ['const', 'pi']])
    expect(parseInfix('e^x')).toEqual(['pow', ['const', 'e'], ['ref', 'x']])
    expect(parseInfix('sin(x)')).toEqual(['fn', 'sin', ['ref', 'x']])
    expect(parseInfix('arctan(x)')).toEqual(['fn', 'atan', ['ref', 'x']])
    expect(parseInfix('nCr(5, 2)')).toEqual(['fn', 'comb', 5, 2])
    expect(parseInfix('max(1, 2, 3)')).toEqual(['max', 1, 2, 3])
  })

  it('lowers calculus calls with their bound variable', () => {
    expect(parseInfix('integral(x^2, x, 0, a)')).toEqual(['integral', 'x', ['pow', ['ref', 'x'], 2], 0, ['ref', 'a']])
    expect(parseInfix('deriv(sin(t), t, 0, 3)')).toEqual(['deriv', 't', ['fn', 'sin', ['ref', 't']], 0, 3])
    expect(parseInfix('lim(1/x, x, inf)')).toEqual(['limit', 'x', ['div', 1, ['ref', 'x']], ['const', 'inf']])
    expect(parseInfix('limit(x, x, 0, -1)')).toEqual(['limit', 'x', ['ref', 'x'], 0, -1])
    expect(parseInfix('solve(x^2 = 2, x, 0, 2)')).toEqual(['solve', 'x', ['sub', ['pow', ['ref', 'x'], 2], 2], 0, 2])
    expect(parseInfix('sum(1/k, k, 1, n)')).toEqual(['sum', 'k', ['div', 1, ['ref', 'k']], 1, ['ref', 'n']])
  })

  it('rejects a calculus call whose variable is not a plain name', () => {
    expect(parseInfix('integral(x, 1, 0, 1)')).toBeUndefined()
    expect(parseInfix('integral(x, pi, 0, 1)')).toBeUndefined()
    expect(parseInfix('integral(x, x, 0)')).toBeUndefined()
  })

  it('reads the symbols of typeset math', () => {
    expect(parseInfix('2π − x')).toEqual(['sub', ['mul', 2, ['const', 'pi']], ['ref', 'x']])
    expect(parseInfix('a × b ÷ c')).toEqual(['div', ['mul', ['ref', 'a'], ['ref', 'b']], ['ref', 'c']])
    expect(parseInfix('x² ≤ 4')).toEqual(['le', ['pow', ['ref', 'x'], 2], 4])
    expect(parseInfix('2**3')).toEqual(['pow', 2, 3])
  })

  it('rejects anything outside the vocabulary instead of guessing', () => {
    expect(parseInfix('x(1 - x)')).toBeUndefined()
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
