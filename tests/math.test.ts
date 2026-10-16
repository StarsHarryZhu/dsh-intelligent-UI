import { describe, expect, it } from 'vitest'
import { createBudget, evalExpr, EXPR_FAILURE, formatNumber } from '../src/lang/expr.ts'
import { parseInfix } from '../src/lang/infix.ts'
import { binomial, erf, factorial, formatSignificant, gamma, integrate, QUADRATURE_RULE } from '../src/lang/math.ts'

/** Evaluate readable math with optional declared values. */
function value(text: string, state: Record<string, number> = {}): number | string | boolean | typeof EXPR_FAILURE {
  const node = parseInfix(text)
  expect(node, `parses: ${text}`).toBeDefined()
  return evalExpr(node, key => state[key])
}

/** Assert a computed value within a relative tolerance (absolute below 1). */
function near(text: string, expected: number, tolerance = 1e-9, state: Record<string, number> = {}): void {
  const produced = value(text, state)
  expect(typeof produced, text).toBe('number')
  expect(Math.abs((produced as number) - expected), `${text} = ${String(produced)}, expected ${expected}`)
    .toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)))
}

/** Assert that a value is refused rather than guessed. */
function refused(text: string): void {
  expect(value(text), text).toBe(EXPR_FAILURE)
}

describe('the quadrature rule itself', () => {
  it('has Kronrod and Gauss weights that each integrate 1 to 2 on [-1, 1]', () => {
    const { nodes, kronrod, gauss } = QUADRATURE_RULE
    const kronrodTotal = kronrod.reduce((sum, weight, index) => sum + (nodes[index] === 0 ? weight : 2 * weight), 0)
    const gaussTotal = gauss.reduce((sum, weight) => sum + 2 * weight, 0)
    expect(kronrodTotal).toBeCloseTo(2, 14)
    expect(gaussTotal).toBeCloseTo(2, 14)
  })

  it('integrates polynomials exactly up to degree 31 in one panel', () => {
    for (const degree of [0, 1, 7, 19, 30, 31]) {
      expect(integrate(x => x ** degree, 0, 1), `x^${degree}`).toBeCloseTo(1 / (degree + 1), 14)
    }
  })
})

describe('definite integrals', () => {
  it('matches textbook values', () => {
    near('integral(x^2, x, 0, 1)', 1 / 3)
    near('integral(sin(x), x, 0, pi)', 2)
    near('integral(1/x, x, 1, e)', 1)
    near('integral(abs(x - 0.3), x, 0, 1)', 0.29)
  })

  it('handles infinite bounds', () => {
    near('integral(exp(-x^2), x, -inf, inf)', Math.sqrt(Math.PI))
    near('integral(1/(1 + x^2), x, 0, inf)', Math.PI / 2)
    near('integral(exp(x), x, -inf, 0)', 1)
  })

  it('resolves integrable endpoint singularities', () => {
    near('integral(1/sqrt(x), x, 0, 1)', 2, 1e-8)
    near('integral(ln(x), x, 0, 1)', -1, 1e-8)
  })

  it('nests, reverses, and reads state in its bounds', () => {
    near('integral(integral(x*y, y, 0, 1), x, 0, 1)', 0.25)
    near('integral(x, x, 1, 0)', -0.5)
    near('integral(x^2, x, 0, a)', 8 / 3, 1e-9, { a: 2 })
  })

  it('refuses a divergent integral instead of reporting a number', () => {
    refused('integral(1/x, x, 0, 1)')
    refused('integral(1/x, x, 1, inf)')
  })
})

describe('derivatives', () => {
  it('are exact through Taylor arithmetic', () => {
    near('deriv(x^3, x, 2)', 12, 1e-12)
    near('deriv(sin(x), x, 0, 5)', 1, 1e-12)
    near('deriv(exp(x), x, 1, 2)', Math.E, 1e-12)
    near('deriv(ln(x), x, 2)', 0.5, 1e-12)
    near('deriv(x^x, x, 1)', 1, 1e-12)
    near('deriv(atan(x), x, 1)', 0.5, 1e-12)
    near('deriv(sqrt(x), x, 4)', 0.25, 1e-12)
    near('deriv(asin(x), x, 0.5)', 1 / Math.sqrt(0.75), 1e-12)
    near('deriv(erf(x), x, 0)', 2 / Math.sqrt(Math.PI), 1e-12)
    near('deriv(tan(x), x, 0, 3)', 2, 1e-10)
  })

  it('evaluates at a point that state controls, shadowing a same-named key inside the body', () => {
    near('deriv(x^2, x, x)', 6, 1e-12, { x: 3 })
  })

  it('falls back to extrapolated differences where Taylor arithmetic cannot follow', () => {
    near('deriv(integral(sin(t), t, 0, x), x, 1)', Math.sin(1), 1e-7)
  })

  it('refuses a derivative that does not exist', () => {
    refused('deriv(abs(x), x, 0)')
    refused('deriv(sqrt(x), x, 0)')
  })
})

describe('limits', () => {
  it('extrapolates removable singularities', () => {
    near('limit(sin(x)/x, x, 0)', 1)
    near('limit((1 - cos(x))/x^2, x, 0)', 0.5, 1e-8)
    near('limit((x^2 - 1)/(x - 1), x, 1)', 2)
    near('limit((exp(x) - 1)/x, x, 0)', 1)
    near('limit((1 + x)^(1/x), x, 0)', Math.E, 1e-9)
  })

  it('reaches infinity', () => {
    near('limit((1 + 1/n)^n, n, inf)', Math.E)
    near('limit(atan(x), x, inf)', Math.PI / 2)
    near('limit(sqrt(x^2 + x) - x, x, inf)', 0.5)
  })

  it('takes one side when asked', () => {
    near('limit(x*ln(x), x, 0, 1)', 0)
    near('limit(x^x, x, 0, 1)', 1, 1e-9)
    near('limit(abs(x)/x, x, 0, 1)', 1)
    near('limit(abs(x)/x, x, 0, -1)', -1)
  })

  it('refuses divergent, oscillating, and two-sided-disagreeing limits', () => {
    refused('limit(1/x, x, 0)')
    refused('limit(sin(1/x), x, 0)')
    refused('limit(abs(x)/x, x, 0)')
  })
})

describe('sums, products, roots, and Taylor polynomials', () => {
  it('sums and multiplies over whole numbers', () => {
    near('sum(k, k, 1, 100)', 5050, 0)
    near('prod(k, k, 1, 10)', 3628800, 0)
    near('sum(1/k^2, k, 1, 1000)', 1.6439345666815598, 1e-14)
    near('sum(k, k, 5, 4)', 0, 0)
    near('sum(1/n!, n, 0, 20)', Math.E, 1e-14)
  })

  it('refuses more terms than the limit and fractional bounds', () => {
    refused('sum(k, k, 1, 10001)')
    refused('sum(k, k, 0.5, 3)')
  })

  it('finds a root inside the interval or refuses', () => {
    near('solve(x^2 - 2, x, 0, 2)', Math.SQRT2, 1e-14)
    near('solve(cos(x) = x, x, 0, 1)', 0.7390851332151607, 1e-14)
    near('solve(x^3 - x, x, 0.5, 2)', 1, 1e-14)
    refused('solve(x^2 + 1, x, -5, 5)')
  })

  it('evaluates Taylor polynomials exactly', () => {
    near('taylor(sin(x), x, 0, 7, 1)', 1 - 1 / 6 + 1 / 120 - 1 / 5040, 1e-15)
    near('taylor(exp(x), x, 0, n, 1)', 2.7182818011463845, 1e-15, { n: 10 })
    near('taylor(ln(x), x, 1, 1, 2)', 1, 1e-15)
  })
})

describe('the function table', () => {
  it('computes special functions', () => {
    expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 14)
    expect(gamma(5)).toBe(24)
    expect(gamma(-0.5)).toBeCloseTo(-2 * Math.sqrt(Math.PI), 13)
    expect(factorial(20)).toBe(2432902008176640000)
    expect(binomial(10, 3)).toBe(120)
    expect(binomial(60, 30)).toBe(118264581564861424)
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 14)
    expect(erf(3)).toBeCloseTo(0.9999779095030014, 14)
    expect(erf(-0.5)).toBeCloseTo(-0.5204998778130465, 14)
  })

  it('reads the function forms models write', () => {
    near('5!', 120, 0)
    near('comb(10, 3) + perm(5, 2)', 140, 0)
    near('cbrt(-8) + root(-27, 3)', -5, 1e-15)
    near('log(100, 10) + log10(1000) + log2(8) + ln(e)', 9, 1e-15)
    near('atan2(1, 1)', Math.PI / 4, 1e-15)
    near('hypot(3, 4)', 5, 0)
    near('gcd(12, 18) + lcm(4, 6)', 18, 0)
    near('deg(pi) + rad(180)', 180 + Math.PI, 1e-13)
    near('max(1, 5, 3) - min(4, 2, 8)', 3, 0)
    near('clamp(12, 0, 10)', 10, 0)
  })

  it('refuses values outside a function\'s domain', () => {
    refused('sqrt(-1)')
    refused('ln(0)')
    refused('(-8)^(1/3)')
    refused('fact(-1)')
  })
})

describe('precedence of the math syntax', () => {
  it('binds powers before signs and to the right', () => {
    near('-2^2', -4, 0)
    near('2^3^2', 512, 0)
    near('2^-1', 0.5, 0)
    near('3!^2', 36, 0)
    near('2**10', 1024, 0)
  })

  it('reads implicit products, scientific notation, and typeset symbols', () => {
    near('2pi', 2 * Math.PI, 0)
    near('3x^2', 12, 0, { x: 2 })
    near('(1 + 2)(3 + 4)', 21, 0)
    near('1e-3 * 2', 0.002, 0)
    near('2π − 1', 2 * Math.PI - 1, 0)
    near('3 × 4 ÷ 2', 6, 0)
    near('x² + x³', 12, 0, { x: 2 })
    near('√(16)', 4, 0)
  })
})

describe('the work budget', () => {
  it('stops a runaway program quickly and yields no value', () => {
    const node = parseInfix('sum(sum(1, j, 1, 10000), k, 1, 10000)')
    const started = performance.now()
    expect(evalExpr(node, () => undefined)).toBe(EXPR_FAILURE)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('is shared when one budget is passed to several evaluations', () => {
    const budget = createBudget(50)
    const node = parseInfix('1 + 1')
    let produced = 0
    for (let index = 0; index < 100; index += 1) if (evalExpr(node, () => undefined, budget) === 2) produced += 1
    expect(produced).toBeLessThan(100)
    expect(produced).toBeGreaterThan(0)
  })

  it('refuses calculus nested more than three deep', () => {
    refused('integral(integral(integral(integral(1, w, 0, 1), z, 0, 1), y, 0, 1), x, 0, 1)')
    near('integral(integral(integral(1, z, 0, 1), y, 0, 1), x, 0, 1)', 1)
  })
})

describe('number display', () => {
  it('never shows a small value as zero', () => {
    expect(formatNumber(0.000123)).toBe('0.000123')
    expect(formatNumber(1.5e-7)).toBe('1.5e-7')
    expect(formatNumber(2.5e21)).toBe('2.5e21')
    expect(formatNumber(3.14159)).toBe('3.14')
    expect(formatNumber(1234)).toBe('1234')
  })

  it('formats significant digits for computed results', () => {
    expect(formatSignificant(1 / 3, 6)).toBe('0.333333')
    expect(formatSignificant(Math.PI * 1e6, 4)).toBe('3142000')
    expect(formatSignificant(1.23456789e-9, 3)).toBe('1.23e-9')
    expect(formatSignificant(0, 6)).toBe('0')
  })
})
