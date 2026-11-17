# Interactive widgets

## Controls with live output

Read the controls in one `update()` function, write every output from it, and
call it on `input` and once at the start. Keep the numbers the HTML starts with
equal to what `update()` computes, so nothing jumps when the script runs.

```js
const $ = id => document.getElementById(id)
const money = new Intl.NumberFormat(navigator.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
function update() {
  $('rate-out').textContent = $('rate').value + '%'
  $('total').textContent = money.format(Number($('amount').value) * (1 + Number($('rate').value) / 100))
}
document.addEventListener('input', update)
update()
```

A control with an `id` gets its value back after a reload, and the frame then
fires its `input` and `change` events once, so the same handler redraws it.

## Choices and tabs

For two to five options, use buttons with `aria-pressed`; the frame styles the
pressed one. Buttons keep no value, so keep the choice with `dsh.state`:

```js
let view = dsh.state.get()?.view ?? 'month'
function choose(next) {
  view = next
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view))
  dsh.state.set({ view })
  update()
}
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => choose(button.dataset.view))
choose(view)
```

Tabs are the same pattern: the buttons choose, and each panel gets `hidden`
unless it is the chosen one. For a long list of options, use a `<select>` with
an `id` instead; it keeps itself.

## Animation you can step through

Precompute every step into an array, draw one step from it, and drive the step
from a range input. Play, pause, step, and scrub then all come for free, and the
step survives a reload.

```html
<style>
.bars { display: flex; align-items: flex-end; gap: 6px; height: 140px; margin-bottom: 8px; }
.bar { flex: 1; background: var(--series-1); border-radius: 4px 4px 0 0; color: var(--on-primary); font-size: 12px; text-align: center; }
.bar.cmp { background: var(--series-3); }
</style>
<div class="bars" id="bars"></div>
<p id="say" class="muted">Compare 5 and 2: swap</p>
<div class="row">
  <button id="play" class="primary">Play</button>
  <button id="back" aria-label="Previous step">◀</button>
  <button id="next" aria-label="Next step">▶</button>
  <input id="step" type="range" min="0" max="15" value="0" style="flex:1" aria-label="Step">
</div>
<script>
const steps = []
const a = [5, 2, 8, 1, 9, 3]
for (let i = 0; i < a.length - 1; i++) {
  for (let j = 0; j < a.length - 1 - i; j++) {
    const swap = a[j] > a[j + 1]
    steps.push({ values: a.slice(), pair: [j, j + 1], text: `Compare ${a[j]} and ${a[j + 1]}: ${swap ? 'swap' : 'keep'}` })
    if (swap) [a[j], a[j + 1]] = [a[j + 1], a[j]]
  }
}
steps.push({ values: a.slice(), pair: [], text: 'Sorted' })
const slider = document.getElementById('step')
slider.max = steps.length - 1
function draw() {
  const step = steps[Number(slider.value)]
  document.getElementById('bars').innerHTML = step.values
    .map((v, i) => `<div class="bar${step.pair.includes(i) ? ' cmp' : ''}" style="height:${v / 9 * 100}%">${v}</div>`).join('')
  document.getElementById('say').textContent = step.text
}
let playing = false
let last = 0
function tick(time) {
  if (!playing) return
  if (time - last > 600) {
    last = time
    if (Number(slider.value) >= steps.length - 1) return setPlaying(false)
    slider.value = Number(slider.value) + 1
    draw()
  }
  requestAnimationFrame(tick)
}
function setPlaying(on) {
  playing = on
  document.getElementById('play').textContent = on ? 'Pause' : 'Play'
  if (on) requestAnimationFrame(tick)
}
document.getElementById('play').onclick = () => {
  if (Number(slider.value) >= steps.length - 1) slider.value = 0
  setPlaying(!playing)
}
document.getElementById('back').onclick = () => { setPlaying(false); slider.value = Number(slider.value) - 1; draw() }
document.getElementById('next').onclick = () => { setPlaying(false); slider.value = Number(slider.value) + 1; draw() }
slider.addEventListener('input', () => { setPlaying(false); draw() })
draw()
</script>
```

For continuous motion, advance a time variable by the frame's real elapsed time
(`time - last`), so the speed is the same on every screen. A loop that runs by
itself should stop when the reader pauses and should not start when the reader
asks for reduced motion.

## Dragging

Drag in SVG with pointer events: capture the pointer on `pointerdown`, convert
the pointer to SVG coordinates with the inverse screen matrix, and save on
`pointerup`. Put `touch-action: none` on what is dragged, so a finger drags it
instead of scrolling the page.

```html
<svg id="pad" viewBox="0 0 680 260" role="img" aria-label="Drag the blue point">
  <line x1="40" y1="220" x2="640" y2="220" class="c-gray"/>
  <line id="arm" x1="80" y1="220" x2="300" y2="100" class="c-blue" stroke-width="2"/>
  <circle cx="80" cy="220" r="6" class="c-gray"/>
  <circle id="knob" cx="300" cy="100" r="12" class="c-blue" style="cursor:grab;touch-action:none"/>
  <text id="readout" x="40" y="30" class="t">Distance: 251</text>
</svg>
<script>
const svg = document.getElementById('pad')
const knob = document.getElementById('knob')
let at = dsh.state.get() ?? { x: 300, y: 100 }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
function draw() {
  knob.setAttribute('cx', at.x)
  knob.setAttribute('cy', at.y)
  document.getElementById('arm').setAttribute('x2', at.x)
  document.getElementById('arm').setAttribute('y2', at.y)
  document.getElementById('readout').textContent = 'Distance: ' + Math.round(Math.hypot(at.x - 80, at.y - 220))
}
knob.addEventListener('pointerdown', event => knob.setPointerCapture(event.pointerId))
knob.addEventListener('pointermove', (event) => {
  if (!knob.hasPointerCapture(event.pointerId)) return
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse())
  at = { x: Math.round(clamp(p.x, 40, 640)), y: Math.round(clamp(p.y, 20, 240)) }
  draw()
})
knob.addEventListener('pointerup', () => dsh.state.set(at))
draw()
</script>
```

## Canvas

Size a canvas to its box times `devicePixelRatio`, redraw from a
`ResizeObserver`, and read colours from the theme when drawing:

```js
const canvas = document.getElementById('plot')
const ctx = canvas.getContext('2d')
const color = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
function draw() {
  const { width, height } = canvas.getBoundingClientRect()
  canvas.width = width * devicePixelRatio
  canvas.height = height * devicePixelRatio
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  ctx.strokeStyle = color('--series-1')
  // … draw in CSS pixels
}
new ResizeObserver(draw).observe(canvas)
addEventListener('dsh:theme', draw)
```

## Keeping state and following the theme

- `dsh.state.get()` returns a copy of the value last set, or `undefined`.
  `dsh.state.set(value)` keeps any JSON up to 16 KB; set it on each change,
  never on a timer.
- When the chat switches between light and dark, the variables change by
  themselves; anything drawn by script with colours read once must redraw on the
  `dsh:theme` event, as above. `dsh.theme` is `'light'` or `'dark'`.
- Keys reach the widget only while the reader has clicked into it. For a game,
  offer buttons too, and say "click the board, then use the arrow keys".
