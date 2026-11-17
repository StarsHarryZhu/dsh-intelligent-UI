/**
 * The numeric library behind `dsh.math` in a widget frame: special functions
 * and the calculus routines.
 *
 * Everything here works on plain numbers and callbacks. A routine that cannot
 * reach its accuracy target returns `NaN` instead of a doubtful number, so a
 * widget can show that no value could be computed rather than a wrong one.
 * @module dsh-intelligent-ui/frame/math
 */

/** Largest integer whose factorial is still a finite double. */
const MAX_FACTORIAL = 170

/** Lanczos approximation coefficients (g = 7, n = 9). */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/**
 * Gamma function by the Lanczos approximation, with the reflection formula
 * below one half. Relative error is near 1e-15 across the real line.
 */
export function gamma(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN
  if (Number.isInteger(x)) {
    if (x <= 0) return Number.NaN
    if (x - 1 <= MAX_FACTORIAL) return factorial(x - 1)
    return Number.POSITIVE_INFINITY
  }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x))
  const z = x - 1
  let sum = LANCZOS[0] as number
  for (let index = 1; index < LANCZOS.length; index += 1) sum += (LANCZOS[index] as number) / (z + index)
  const t = z + 7.5
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * sum
}

/** Natural log of |Γ(x)|, for binomials too large to multiply out. */
function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x)
  const z = x - 1
  let sum = LANCZOS[0] as number
  for (let index = 1; index < LANCZOS.length; index += 1) sum += (LANCZOS[index] as number) / (z + index)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum)
}

/** Factorials 0! … 170!, computed once by exact repeated multiplication. */
const FACTORIALS: readonly number[] = (() => {
  const table = [1]
  for (let index = 1; index <= MAX_FACTORIAL; index += 1) table.push((table[index - 1] as number) * index)
  return table
})()

/** n! for whole n (exact while the product fits a double), Γ(n+1) otherwise. */
export function factorial(n: number): number {
  if (!Number.isFinite(n)) return Number.NaN
  if (Number.isInteger(n)) {
    if (n < 0) return Number.NaN
    return n > MAX_FACTORIAL ? Number.POSITIVE_INFINITY : FACTORIALS[n] as number
  }
  return gamma(n + 1)
}

/** Binomial coefficient C(n, k); exact for whole numbers small enough to multiply out. */
export function binomial(n: number, k: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(k)) return Number.NaN
  if (Number.isInteger(n) && Number.isInteger(k)) {
    if (k < 0 || n < 0 || k > n) return k < 0 || k > n ? 0 : Number.NaN
    const small = Math.min(k, n - k)
    if (small <= 1000) {
      let result = 1
      // Multiplying and dividing in step keeps every intermediate a whole number.
      for (let index = 1; index <= small; index += 1) result = result * (n - small + index) / index
      return Math.round(result)
    }
  }
  return Math.exp(logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1))
}

/**
 * The error function. A power series below 2.5 and a continued fraction for
 * the complement above it; absolute error stays below 1e-14.
 */
export function erf(x: number): number {
  if (Number.isNaN(x)) return Number.NaN
  if (x < 0) return -erf(-x)
  if (x === Number.POSITIVE_INFINITY) return 1
  if (x < 2.5) {
    // erf x = 2/√π Σ (−1)^n x^(2n+1) / (n! (2n+1))
    let term = x
    let sum = x
    for (let n = 1; n < 200; n += 1) {
      term *= -x * x / n
      const piece = term / (2 * n + 1)
      sum += piece
      if (Math.abs(piece) < 1e-17 * Math.abs(sum)) break
    }
    return 2 / Math.sqrt(Math.PI) * sum
  }
  return 1 - erfcFraction(x)
}

/** erfc x for x ≥ 2.5, by Lentz's evaluation of its continued fraction. */
function erfcFraction(x: number): number {
  // erfc x = e^(−x²)/√π · 1/(x + 1/2/(x + 1/(x + 3/2/(x + …))))
  const tiny = 1e-300
  let f = x
  let c = x
  let d = 0
  for (let n = 1; n < 300; n += 1) {
    const a = n / 2
    d = x + a * d
    d = Math.abs(d) < tiny ? tiny : d
    c = x + a / c
    c = Math.abs(c) < tiny ? tiny : c
    d = 1 / d
    const delta = c * d
    f *= delta
    if (Math.abs(delta - 1) < 1e-16) break
  }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f
}

// ── calculus ────────────────────────────────────────────────────────────────

/** A real function of one variable. NaN means "no value here". */
export type RealFunction = (x: number) => number

/** Gauss–Kronrod 21-point abscissae on [-1, 1], non-negative half, outermost first (QUADPACK qk21). */
const KRONROD_NODES = [
  0.995657163025808080735527280689003, 0.973906528517171720077964012084452,
  0.930157491355708226001207180059508, 0.865063366688984510732096688423493,
  0.780817726586416897063717578345042, 0.679409568299024406234327365114874,
  0.562757134668604683339000099272694, 0.433395394129247190799265943165784,
  0.294392862701460198131126603103866, 0.148874338981631210884826001129720,
  0,
]

/** Kronrod weights matching {@link KRONROD_NODES}. */
const KRONROD_WEIGHTS = [
  0.011694638867371874278064396062192, 0.032558162307964727478818972459390,
  0.054755896574351996031381300244580, 0.075039674810919952767043140916190,
  0.093125454583697605535065465083366, 0.109387158802297641899210590325805,
  0.123491976262065851077208977864541, 0.134709217311473325928054001771707,
  0.142775938577060080797094273138717, 0.147739104901338491374841515972068,
  0.149445554002916905664936468389821,
]

/** 10-point Gauss weights for the odd-indexed Kronrod nodes (1, 3, 5, 7, 9). */
const GAUSS_WEIGHTS = [
  0.066671344308688137593568809893332, 0.149451349150580593145776339657697,
  0.219086362515982043995534934228163, 0.269266719309996355091226921569469,
  0.295524224714752870173892994651338,
]

/** Exposed for the tests that pin the rule's constants. */
export const QUADRATURE_RULE = { nodes: KRONROD_NODES, kronrod: KRONROD_WEIGHTS, gauss: GAUSS_WEIGHTS } as const

/** Most intervals the adaptive integrator may split into. */
const MAX_INTERVALS = 400

/** One integrated piece with its error estimate. */
interface Piece { a: number; b: number; value: number; error: number }

/** Apply the 21-point rule on [a, b]; NaN when the integrand has no value at a node. */
function kronrod(f: RealFunction, a: number, b: number): Piece {
  const center = (a + b) / 2
  const half = (b - a) / 2
  let kronrodSum = 0
  let gaussSum = 0
  for (let index = 0; index < KRONROD_NODES.length; index += 1) {
    const offset = half * (KRONROD_NODES[index] as number)
    const weight = KRONROD_WEIGHTS[index] as number
    const values = offset === 0 ? [f(center)] : [f(center - offset), f(center + offset)]
    for (const value of values) {
      if (!Number.isFinite(value)) return { a, b, value: Number.NaN, error: Number.POSITIVE_INFINITY }
      kronrodSum += weight * value
      if (index % 2 === 1) gaussSum += (GAUSS_WEIGHTS[(index - 1) / 2] as number) * value
    }
  }
  const value = kronrodSum * half
  const error = Math.abs((kronrodSum - gaussSum) * half)
  return { a, b, value, error }
}

/**
 * Definite integral by adaptive Gauss–Kronrod quadrature.
 *
 * The interval with the largest error estimate is bisected until the total
 * estimate meets 1e-10 relative (or 1e-12 absolute). Infinite bounds are mapped
 * onto a finite interval first. The nodes never touch an endpoint, so an
 * integrable endpoint singularity such as 1/√x on [0, 1] is resolved by
 * subdivision. A result whose error estimate stays above 1e-6 relative is
 * refused.
 * @param f - the integrand.
 * @param a - lower bound, possibly -Infinity.
 * @param b - upper bound, possibly +Infinity.
 * @returns the integral, or NaN when it cannot be computed to that accuracy.
 */
export function integrate(f: RealFunction, a: number, b: number): number {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN
  if (a === b) return 0
  if (a > b) return -integrate(f, b, a)
  if (a === Number.NEGATIVE_INFINITY && b === Number.POSITIVE_INFINITY) {
    // x = t / (1 − t²), dx = (1 + t²) / (1 − t²)² dt on (−1, 1)
    return adaptive((t) => {
      const q = 1 - t * t
      return f(t / q) * (1 + t * t) / (q * q)
    }, -1, 1)
  }
  if (b === Number.POSITIVE_INFINITY) {
    // x = a + t / (1 − t), dx = 1 / (1 − t)² dt on [0, 1)
    return adaptive(t => f(a + t / (1 - t)) / ((1 - t) * (1 - t)), 0, 1)
  }
  if (a === Number.NEGATIVE_INFINITY) {
    return adaptive(t => f(b - t / (1 - t)) / ((1 - t) * (1 - t)), 0, 1)
  }
  return adaptive(f, a, b)
}

/** The adaptive loop on a finite interval. */
function adaptive(f: RealFunction, a: number, b: number): number {
  const pieces: Piece[] = [kronrod(f, a, b)]
  for (;;) {
    let total = 0
    let error = 0
    let worst = 0
    for (const [index, piece] of pieces.entries()) {
      if (!Number.isFinite(piece.value)) return Number.NaN
      total += piece.value
      error += piece.error
      if (piece.error > (pieces[worst] as Piece).error) worst = index
    }
    if (error <= Math.max(1e-12, 1e-10 * Math.abs(total))) return total
    const split = pieces[worst] as Piece
    const middle = (split.a + split.b) / 2
    // An interval that no longer splits in double precision cannot improve.
    if (pieces.length >= MAX_INTERVALS || middle <= split.a || middle >= split.b) {
      return error <= Math.max(1e-9, 1e-6 * Math.abs(total)) ? total : Number.NaN
    }
    pieces.splice(worst, 1, kronrod(f, split.a, middle), kronrod(f, middle, split.b))
  }
}

/**
 * Numerical derivative by Ridders' extrapolation of central differences. A
 * first derivative also needs the slopes from the left and the right to agree,
 * so a corner such as |x| at 0 has none.
 * @param f - the function.
 * @param x - the point.
 * @param order - 1 or 2.
 * @returns the derivative, or NaN when the extrapolation does not settle.
 */
export function differentiate(f: RealFunction, x: number, order: 1 | 2): number {
  if (order === 1 && hasCorner(f, x)) return Number.NaN
  // A wide first step suits slow functions and a narrow one fast ones; near
  // zero a step sized to x keeps the samples inside a domain such as x > 0.
  // Take the first that settles.
  const size = Math.abs(x)
  const starts = [0.1, 0.01, 0.001, 1e-5].map(part => part * Math.max(1, size))
  if (size > 0 && size < 1) starts.push(0.1 * size, 0.01 * size)
  for (const start of starts) {
    const { value, error } = ridders(f, x, order, start)
    if (Number.isFinite(value) && error <= 1e-6 * Math.max(1, Math.abs(value))) return value
  }
  return Number.NaN
}

/** One Ridders table from a first step: the best estimate and its error bound. */
function ridders(f: RealFunction, x: number, order: 1 | 2, first: number): { value: number; error: number } {
  const shrink = 1.4
  const shrink2 = shrink * shrink
  const size = 10
  let h = first
  const difference = (step: number): number => (order === 1
    ? (f(x + step) - f(x - step)) / (2 * step)
    : (f(x + step) - 2 * f(x) + f(x - step)) / (step * step))
  const table: number[][] = [[difference(h)]]
  let best = Number.NaN
  let error = Number.POSITIVE_INFINITY
  for (let i = 1; i < size; i += 1) {
    h /= shrink
    const row = [difference(h)]
    let factor = shrink2
    for (let j = 1; j <= i; j += 1) {
      const above = (table[i - 1] as number[])[j - 1] as number
      const next = ((row[j - 1] as number) * factor - above) / (factor - 1)
      row.push(next)
      factor *= shrink2
      const local = Math.max(Math.abs(next - (row[j - 1] as number)), Math.abs(next - above))
      if (local <= error) {
        error = local
        best = next
      }
    }
    table.push(row)
    if (Math.abs((row[i] as number) - ((table[i - 1] as number[])[i - 1] as number)) >= 2 * error) break
  }
  return { value: best, error }
}

/**
 * Whether the one-sided slopes at x differ by a gap that does not shrink with
 * the step. For a smooth function the gap is about f''(x)·h; at a corner it
 * stays the size of the jump in slope.
 */
function hasCorner(f: RealFunction, x: number): boolean {
  const at = f(x)
  const gap = (h: number): number => Math.abs((f(x + h) - at) / h - (at - f(x - h)) / h)
  const h = 1e-4 * (x === 0 ? 1 : Math.abs(x))
  const wide = gap(h)
  const narrow = gap(h / 10)
  if (!Number.isFinite(wide) || !Number.isFinite(narrow)) return false
  return narrow > 1e-6 * Math.max(1, Math.abs(at)) && narrow > 0.5 * wide
}

/**
 * Numerical limit of f at a point, from one side or both.
 *
 * Samples approach the point geometrically and are extrapolated to a zero step
 * (Neville's scheme in the step), which is exact in the limit for removable
 * singularities such as sin(x)/x. When the extrapolation does not settle the
 * raw samples are checked for convergence instead. A two-sided limit needs both
 * sides to agree. Limits at ±Infinity substitute x = ±1/t.
 * @param f - the function.
 * @param at - the point, possibly ±Infinity.
 * @param side - +1 from above, -1 from below, 0 for both.
 * @returns the limit, or NaN for a divergent, oscillating, or one-sided-only limit.
 */
export function limit(f: RealFunction, at: number, side: -1 | 0 | 1): number {
  if (Number.isNaN(at)) return Number.NaN
  if (at === Number.POSITIVE_INFINITY) return oneSided(t => f(1 / t), 0, 1, 1)
  if (at === Number.NEGATIVE_INFINITY) return oneSided(t => f(-1 / t), 0, 1, 1)
  const scale = Math.max(1, Math.abs(at))
  if (side !== 0) return oneSided(f, at, side, scale)
  const above = oneSided(f, at, 1, scale)
  const below = oneSided(f, at, -1, scale)
  if (!Number.isFinite(above) || !Number.isFinite(below)) return Number.NaN
  return Math.abs(above - below) <= 1e-6 * Math.max(1, Math.abs(above)) ? (above + below) / 2 : Number.NaN
}

/**
 * One side of {@link limit}.
 *
 * The samples stop at a step of about 2e-5 of the scale: closer in, rounding in
 * expressions such as (1 − cos x)/x² swamps the value, and the extrapolation
 * already has what it needs. The tableau is searched the way Ridders' method
 * searches it, and the search stops as soon as rounding noise starts to grow.
 */
function oneSided(f: RealFunction, at: number, side: -1 | 1, scale: number): number {
  const rows = 12
  let step = 0.1 * scale
  const first = f(at + side * step)
  if (Number.isFinite(first)) {
    const table: number[][] = [[first]]
    let best = Number.NaN
    let error = Number.POSITIVE_INFINITY
    for (let i = 1; i < rows; i += 1) {
      step /= 2
      const sample = f(at + side * step)
      if (!Number.isFinite(sample)) break
      // Neville to a zero step with steps halving: T[i][j] = T[i][j−1] + (T[i][j−1] − T[i−1][j−1]) / (2^j − 1)
      const row = [sample]
      for (let j = 1; j <= i; j += 1) {
        const here = row[j - 1] as number
        const above = (table[i - 1] as number[])[j - 1] as number
        const next = here + (here - above) / (2 ** j - 1)
        row.push(next)
        const local = Math.max(Math.abs(next - here), Math.abs(next - above))
        if (local <= error) {
          error = local
          best = next
        }
      }
      table.push(row)
      if (Math.abs((row[i] as number) - ((table[i - 1] as number[])[i - 1] as number)) >= 2 * error) break
    }
    if (Number.isFinite(best) && error <= 1e-8 * Math.max(1, Math.abs(best))) return best
  }
  return rawLimit(f, at, side, scale)
}

/**
 * Fallback for limits that are not power series in the step, such as x·ln x at
 * 0⁺: the samples themselves must settle, each step closer than the last.
 */
function rawLimit(f: RealFunction, at: number, side: -1 | 1, scale: number): number {
  let previous = Number.NaN
  let previousGap = Number.POSITIVE_INFINITY
  let shrinking = 0
  for (let k = 2; k <= 24; k += 1) {
    const value = f(at + side * scale * 10 ** (-k / 2))
    if (!Number.isFinite(value)) return Number.NaN
    if (Number.isFinite(previous)) {
      const gap = Math.abs(value - previous)
      shrinking = gap <= previousGap ? shrinking + 1 : 0
      previousGap = gap
      if (shrinking >= 3 && gap <= 1e-9 * Math.max(1, Math.abs(value))) {
        // A value no larger than its own uncertainty is zero.
        return Math.abs(value) <= 2 * gap ? 0 : value
      }
    }
    previous = value
  }
  return Number.NaN
}

/**
 * A root of f in [lo, hi]: the interval is scanned in 64 steps for the first
 * sign change, which Brent's method then narrows to full precision.
 * @param f - the function.
 * @param lo - left end.
 * @param hi - right end.
 * @returns the leftmost root found, or NaN when f never changes sign.
 */
export function findRoot(f: RealFunction, lo: number, hi: number): number {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return Number.NaN
  if (lo > hi) return findRoot(f, hi, lo)
  const slices = 64
  let left = lo
  let fLeft = f(left)
  if (fLeft === 0) return left
  for (let index = 1; index <= slices; index += 1) {
    const right = lo + (hi - lo) * index / slices
    const fRight = f(right)
    if (fRight === 0) return right
    if (Number.isFinite(fLeft) && Number.isFinite(fRight) && Math.sign(fLeft) !== Math.sign(fRight)) {
      return brent(f, left, right, fLeft, fRight)
    }
    left = right
    fLeft = fRight
  }
  return Number.NaN
}

/** Brent's method on a bracketing interval. */
function brent(f: RealFunction, lo: number, hi: number, fLo: number, fHi: number): number {
  let a = lo
  let b = hi
  let fa = fLo
  let fb = fHi
  let c = a
  let fc = fa
  let d = b - a
  let e = d
  for (let iteration = 0; iteration < 200; iteration += 1) {
    if (Math.sign(fb) === Math.sign(fc)) {
      c = a
      fc = fa
      d = b - a
      e = d
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b
      b = c
      c = a
      fa = fb
      fb = fc
      fc = fa
    }
    const tolerance = 2 * Number.EPSILON * Math.abs(b) + 1e-15
    const middle = (c - b) / 2
    if (Math.abs(middle) <= tolerance || fb === 0) return b
    if (Math.abs(e) >= tolerance && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa
      let p: number
      let q: number
      if (a === c) {
        p = 2 * middle * s
        q = 1 - s
      } else {
        const r = fb / fc
        const t = fa / fc
        p = s * (2 * middle * t * (t - r) - (b - a) * (r - 1))
        q = (t - 1) * (r - 1) * (s - 1)
      }
      if (p > 0) q = -q
      else p = -p
      if (2 * p < Math.min(3 * middle * q - Math.abs(tolerance * q), Math.abs(e * q))) {
        e = d
        d = p / q
      } else {
        d = middle
        e = d
      }
    } else {
      d = middle
      e = d
    }
    a = b
    fa = fb
    b += Math.abs(d) > tolerance ? d : (middle > 0 ? tolerance : -tolerance)
    fb = f(b)
    if (!Number.isFinite(fb)) return Number.NaN
  }
  return b
}
