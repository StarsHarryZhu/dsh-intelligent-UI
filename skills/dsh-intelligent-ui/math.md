# Math widgets

## Formulas with KaTeX

Typeset with KaTeX rather than writing math as text. For a few formulas, call
`katex.render`; for formulas inside prose, load auto-render and write `$…$` and
`$$…$$` in the HTML.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
<p>The area under $f(x) = x^2$ from $0$ to $a$ is</p>
<p id="result">$$\int_0^{a} x^2\,dx = \frac{a^3}{3}$$</p>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js"></script>
<script>
renderMathInElement(document.body, {
  delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
  throwOnError: false,
})
</script>
```

A formula that follows a slider is redrawn with
`katex.render(tex, element, { displayMode: true, throwOnError: false })` in the
update function. In a JavaScript string, double every backslash: `'\\frac{1}{2}'`.

## Plotting a function

Sample the function across the visible range, a few hundred points, and break
the curve where the value is not finite or jumps off the plot, so an asymptote
is not drawn as a vertical line. Keep axes, ticks, and the sampled range in one
place:

```js
function plotPath(f, x0, x1, y0, y1, width, height) {
  const X = x => (x - x0) / (x1 - x0) * width
  const Y = y => height - (y - y0) / (y1 - y0) * height
  let d = ''
  let pen = false
  for (let i = 0; i <= 400; i++) {
    const x = x0 + (x1 - x0) * i / 400
    const y = f(x)
    if (!Number.isFinite(y) || y < y0 - (y1 - y0) || y > y1 + (y1 - y0)) { pen = false; continue }
    d += `${pen ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`
    pen = true
  }
  return d
}
```

Put the result in a `<path>` with `style="stroke: var(--series-1); fill: none"`.
Label the axes, mark the point the reader controls, and print its coordinates.

## dsh.math

Plain sampling gets integrals, derivatives, and limits wrong near trouble.
`dsh.math` computes them to about ten digits, and returns `NaN` where it cannot
reach that accuracy, instead of a wrong number. Show `—` for `NaN`, and say why.

- `dsh.math.integrate(f, a, b)`: adaptive Gauss–Kronrod. Takes `-Infinity` and
  `Infinity` as bounds and integrable endpoint singularities such as
  `1 / Math.sqrt(x)` on `[0, 1]`. A divergent integral gives `NaN`.
- `dsh.math.derivative(f, x, order)`: order 1 (the default) or 2, by Ridders'
  extrapolation. A corner such as `Math.abs` at 0 gives `NaN`.
- `dsh.math.limit(f, x, side)`: side `-1`, `1`, or `0` for both, which must
  agree. `x` may be `Infinity`. Handles removable singularities such as
  `Math.sin(x) / x` at 0.
- `dsh.math.root(f, lo, hi)`: a root where `f` changes sign in `[lo, hi]`, the
  leftmost one found; `NaN` when there is none.
- `dsh.math.gamma`, `erf`, `factorial`, and `binomial(n, k)`.

```html
<label>Upper limit a <input id="a" type="range" min="0.5" max="3" step="0.1" value="2"> <span id="a-out">2.0</span></label>
<div class="row">
  <div class="metric"><span class="label">Exact ∫₀ᵃ sin(x)/x dx</span><span class="value" id="exact">1.605</span></div>
  <div class="metric"><span class="label">Left sum with 6 strips</span><span class="value" id="rough">1.692</span></div>
</div>
<p class="muted" id="gap">The rough sum is off by 0.087.</p>
<script>
const f = x => (x === 0 ? 1 : Math.sin(x) / x)
function update() {
  const a = Number(document.getElementById('a').value)
  const exact = dsh.math.integrate(f, 0, a)
  let rough = 0
  for (let i = 0; i < 6; i++) rough += f(i * a / 6) * a / 6
  document.getElementById('a-out').textContent = a.toFixed(1)
  document.getElementById('exact').textContent = Number.isNaN(exact) ? '—' : exact.toFixed(3)
  document.getElementById('rough').textContent = rough.toFixed(3)
  document.getElementById('gap').textContent = `The rough sum is off by ${Math.abs(rough - exact).toFixed(3)}.`
}
document.addEventListener('input', update)
update()
</script>
```

## Typed expressions with math.js

When the reader types the function, parse it with math.js instead of `eval`,
and show a parse error beside the field:

```js
let f = () => NaN
function read(text) {
  try {
    const compiled = math.compile(text)
    f = x => compiled.evaluate({ x })
    f(1)
    note.textContent = ''
  } catch (error) {
    note.textContent = error.message
  }
}
```

`math.derivative(text, 'x').toString()` gives a symbolic derivative to show, and
`math.simplify` tidies it.

## What makes a good math widget

- Show the object, not just the number: the shaded area, the tangent line, the
  partial sums approaching the limit.
- Let the reader move the one quantity the lesson is about, and print the exact
  value next to the approximation.
- Typeset every formula, including the ones in labels.
- Keep the scale fixed while a slider moves, so changes are visible, unless the
  lesson is about scale.
