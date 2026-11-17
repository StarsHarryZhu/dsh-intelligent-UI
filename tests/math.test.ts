import { describe, expect, it } from 'vitest'
import { binomial, differentiate, erf, factorial, findRoot, gamma, integrate, limit, QUADRATURE_RULE } from '../src/frame/math.ts'

/** Assert a computed value within a relative tolerance (absolute below 1). */
function near(produced: number, expected: number, tolerance: number, label: string): void {
  expect(Number.isFinite(produced), `${label} = ${String(produced)}`).toBe(true)
  expect(Math.abs(produced - expected), `${label} = ${String(produced)}, expected ${expected}`)
    .toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)))
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

describe('integrate', () => {
  it('matches textbook values', () => {
    near(integrate(x => x * x, 0, 1), 1 / 3, 1e-12, 'x^2 on [0, 1]')
    near(integrate(Math.sin, 0, Math.PI), 2, 1e-12, 'sin on [0, pi]')
    near(integrate(x => 1 / x, 1, Math.E), 1, 1e-12, '1/x on [1, e]')
    near(integrate(x => Math.abs(x - 0.3), 0, 1), 0.29, 1e-9, '|x - 0.3| on [0, 1]')
  })

  it('handles infinite bounds', () => {
    near(integrate(x => Math.exp(-x * x), -Infinity, Infinity), Math.sqrt(Math.PI), 1e-9, 'gaussian')
    near(integrate(x => 1 / (1 + x * x), 0, Infinity), Math.PI / 2, 1e-9, '1/(1+x^2)')
    near(integrate(Math.exp, -Infinity, 0), 1, 1e-9, 'exp on (-inf, 0]')
  })

  it('resolves integrable endpoint singularities, nests, and reverses', () => {
    near(integrate(x => 1 / Math.sqrt(x), 0, 1), 2, 1e-8, '1/sqrt(x)')
    near(integrate(Math.log, 0, 1), -1, 1e-8, 'ln x')
    near(integrate(x => integrate(y => x * y, 0, 1), 0, 1), 0.25, 1e-12, 'nested')
    near(integrate(x => x, 1, 0), -0.5, 1e-12, 'reversed')
  })

  it('returns NaN for a divergent integral instead of a number', () => {
    expect(integrate(x => 1 / x, 0, 1)).toBeNaN()
    expect(integrate(x => 1 / x, 1, Infinity)).toBeNaN()
  })
})

describe('differentiate', () => {
  it('matches textbook values by extrapolated differences', () => {
    near(differentiate(x => x ** 3, 2, 1), 12, 1e-7, 'x^3 at 2')
    near(differentiate(Math.exp, 1, 2), Math.E, 1e-6, 'exp\'\' at 1')
    near(differentiate(Math.log, 2, 1), 0.5, 1e-7, 'ln at 2')
    near(differentiate(Math.atan, 1, 1), 0.5, 1e-7, 'atan at 1')
    near(differentiate(erf, 0, 1), 2 / Math.sqrt(Math.PI), 1e-7, 'erf at 0')
    near(differentiate(x => integrate(Math.sin, 0, x), 1, 1), Math.sin(1), 1e-7, 'integral of sin')
  })

  it('returns NaN where no derivative exists', () => {
    expect(differentiate(Math.abs, 0, 1)).toBeNaN()
    expect(differentiate(x => Math.abs(x - 1) + x, 1, 1)).toBeNaN()
    expect(differentiate(Math.sqrt, 0, 1)).toBeNaN()
  })

  it('still differentiates fast-turning smooth functions', () => {
    near(differentiate(x => Math.sin(50 * x), 0.1, 1), 50 * Math.cos(5), 1e-6, 'sin(50x)')
    near(differentiate(x => x * Math.abs(x), 0, 1), 0, 1e-6, 'x|x| at 0')
    near(differentiate(Math.log, 1e-5, 1), 1e5, 1e-6, 'ln at 1e-5')
    near(differentiate(x => Math.sin(200 * x), 0.1, 2), -40000 * Math.sin(20), 1e-6, 'sin(200x) second')
  })
})

describe('limit', () => {
  it('extrapolates removable singularities', () => {
    near(limit(x => Math.sin(x) / x, 0, 0), 1, 1e-9, 'sin x / x')
    near(limit(x => (1 - Math.cos(x)) / (x * x), 0, 0), 0.5, 1e-8, '(1 - cos x)/x^2')
    near(limit(x => (x * x - 1) / (x - 1), 1, 0), 2, 1e-9, '(x^2 - 1)/(x - 1)')
    near(limit(x => (1 + x) ** (1 / x), 0, 0), Math.E, 1e-9, '(1 + x)^(1/x)')
  })

  it('reaches infinity and takes one side when asked', () => {
    near(limit(n => (1 + 1 / n) ** n, Infinity, 0), Math.E, 1e-9, '(1 + 1/n)^n')
    near(limit(x => Math.sqrt(x * x + x) - x, Infinity, 0), 0.5, 1e-9, 'sqrt(x^2 + x) - x')
    near(limit(x => x * Math.log(x), 0, 1), 0, 1e-9, 'x ln x from above')
    near(limit(x => Math.abs(x) / x, 0, -1), -1, 1e-9, '|x|/x from below')
  })

  it('returns NaN for divergent, oscillating, and two-sided-disagreeing limits', () => {
    expect(limit(x => 1 / x, 0, 0)).toBeNaN()
    expect(limit(x => Math.sin(1 / x), 0, 0)).toBeNaN()
    expect(limit(x => Math.abs(x) / x, 0, 0)).toBeNaN()
  })
})

describe('findRoot', () => {
  it('finds the root inside the interval or returns NaN', () => {
    near(findRoot(x => x * x - 2, 0, 2), Math.SQRT2, 1e-14, 'x^2 - 2')
    near(findRoot(x => Math.cos(x) - x, 0, 1), 0.7390851332151607, 1e-14, 'cos x = x')
    near(findRoot(x => x ** 3 - x, 0.5, 2), 1, 1e-14, 'x^3 - x')
    expect(findRoot(x => x * x + 1, -5, 5)).toBeNaN()
  })
})

describe('special functions', () => {
  it('computes gamma, factorial, binomial, and erf', () => {
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
})
