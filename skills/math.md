# Math cards

Every expression on a card is evaluated in the reader's browser, again on every
control change. Trigonometry uses radians.

## Vocabulary

- Operators: `+ - * / % ^`, postfix `n!`, implicit products (`2x`, `3(x + 1)`,
  `(a + b)(a - b)`), comparisons, `&& || !`, and `c ? a : b`. `-x^2` is
  `-(x^2)` and `2^3^2` is `2^9`.
- Constants: `pi`, `e`, `tau`, and `inf`, which is meaningful only as an
  integral or limit bound. None of them can be a state name.
- Functions: `sqrt cbrt root(x, n) exp ln log(x[, base]) log10 log2`,
  `sin cos tan sec csc cot asin acos atan atan2(y, x)`,
  `sinh cosh tanh asinh acosh atanh`,
  `abs floor ceil round(x, d) sign trunc min max clamp(x, lo, hi) hypot`,
  `gamma fact comb(n, k) perm(n, k) gcd lcm erf deg rad`.

## Calculus

The second argument names the variable. It exists only inside the first
argument, and it may reuse a state name: the body sees the variable, the other
arguments see the state. So `deriv(x^2, x, x)` is the slope at the slider's `x`.

| Call | Value | Notes |
|---|---|---|
| `integral(f, x, a, b)` | ∫ₐᵇ f dx | adaptive Gauss–Kronrod; `a` or `b` may be `-inf` or `inf`; integrable endpoint singularities such as 1/√x work |
| `deriv(f, x, at[, n])` | the n-th derivative at `at` | exact for smooth expressions; n up to 20 |
| `limit(f, x, at[, side])` | the limit as x → at | `side` 1 is from above, -1 from below; `at` may be `inf`; sides that disagree give "—" |
| `sum(f, k, a, b)`, `prod(f, k, a, b)` | Σ or Π over whole k from a to b | at most 10000 terms; for an infinite series use a large bound or the closed form |
| `solve(f = g, x, lo, hi)` | a root inside [lo, hi] | the leftmost sign change of f − g; "—" when there is none |
| `taylor(f, x, c, n, at)` | the degree-n Taylor polynomial around c, at `at` | n up to 30, and it may come from a slider |

Results are good to about ten significant digits. "—" means the value could not
be computed reliably: a divergent integral or limit, a point where the derivative
does not exist, no root in the interval, or more work than one card may spend.
It is never a guess. Calculus may nest three deep, so a double integral works.

## Showing results

- `formula "integral(x^2, x, 0, a)" label="Area"` typesets the expression and
  appends its live value. `digits=` sets significant digits (default 6). An
  equation such as `formula "a^2 + b^2 = c^2"` is shown without a value.
- `metric "Area" value="integral(x^2, x, 0, a)" digits=6` gives the headline
  figure.
- In sentences, `{area}` shows a value with tiny ones in exponent form, while
  `{fmt(area, 4)}` fixes four decimals and so rounds a tiny value to 0.0000.
- `plot fn="f(x)"` draws up to four curves. Its options are `from=` and `to=`
  (default -5 to 5), `ymin=` and `ymax=`, `labels=`, and `var=t` for another
  variable name. `mark=` puts a point on the first curve, `tangent=true` draws
  the tangent there, and `shadeFrom=` with `shadeTo=` shades the area under the
  first curve. The plot prints the marked point, the slope, and the shaded area
  beneath itself.

## Recipes

Area under a curve:

```dil
@state b = 2 min=0.5 max=4 step=0.1
card "Area under y = x² from 0 to b"
  slider "Upper limit b" bind=b
  formula "integral(x^2, x, 0, b)" label="Area"
  plot fn="x^2" from=0 to=4 shadeFrom=0 shadeTo=b
  callout "The exact area is b³/3."
```

A derivative and its tangent:

```dil
@state p = 1 min=-2 max=2 step=0.1
@calc slope = deriv(x^3 - 3x, x, p)
card "Tangent to y = x³ − 3x"
  slider "Point p" bind=p
  plot fn="x^3 - 3x" from=-2.5 to=2.5 mark=p tangent=true
  metric "Slope f′(p)" value=slope digits=4
  text "The tangent is flat where f′(p) = 3p² − 3 = 0, at p = ±1."
```

A Taylor approximation that improves with its degree:

```dil
@state n = 3 min=1 max=15 step=1
card "Taylor polynomial of sin x at 0"
  slider "Degree n" bind=n
  plot fn=["sin(x)", "taylor(sin(t), t, 0, n, x)"] from=-6 to=6 ymin=-2 ymax=2 labels=["sin x", "degree n"]
  formula "taylor(sin(t), t, 0, n, 2) - sin(2)" label="Error at x = 2" digits=3
```

A limit approached numerically:

```dil
@state h = 0.5 min=0.01 max=1 step=0.01
card "sin(x)/x near 0"
  slider "x" bind=h
  formula "sin(h)/h" label="Value at x"
  formula "limit(sin(x)/x, x, 0)" label="Limit"
  plot fn="sin(x)/x" from=-10 to=10 mark=h
```

An equation solved inside an interval:

```dil
@state c = 2 min=0.5 max=10 step=0.5
card "Where does cos x = x / c?"
  slider "c" bind=c
  formula "solve(cos(x) = x / c, x, 0, 10)" label="x" digits=8
  plot fn=["cos(x)", "x / c"] from=0 to=6 labels=["cos x", "x / c"]
```

Partial sums of a series:

```dil
@state n = 10 min=1 max=1000 step=1
card "Σ 1/k² approaches π²/6"
  slider "Terms n" bind=n
  formula "sum(1/k^2, k, 1, n)" label="Partial sum" digits=8
  formula "pi^2/6 - sum(1/k^2, k, 1, n)" label="Remaining" digits=3
```
