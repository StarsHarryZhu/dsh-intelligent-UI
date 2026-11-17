# Recipes

Complete widgets to adapt. Change the labels to the reader's language and the
numbers to their case; keep the structure.

## A loan, with a follow-up question

```html
<style>.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }</style>
<div class="cols">
  <label>Amount <input id="amount" type="range" min="50000" max="1000000" step="10000" value="300000"> <b id="amount-out">$300,000</b></label>
  <label>Rate <input id="rate" type="range" min="1" max="12" step="0.1" value="6.5"> <b id="rate-out">6.5%</b></label>
  <label>Years <select id="years"><option>15</option><option>20</option><option selected>30</option></select></label>
</div>
<div class="cols" style="margin-top:12px">
  <div class="metric"><span class="label">Monthly payment</span><span class="value" id="monthly">$1,896</span></div>
  <div class="metric"><span class="label">Total interest</span><span class="value" id="interest">$382,633</span></div>
</div>
<p><button id="ask" data-prompt="Is a 15-year loan better for me at these numbers?">Is a shorter loan better? ↗</button></p>
<script>
const $ = id => document.getElementById(id)
const money = v => '$' + Math.round(v).toLocaleString('en-US')
function update() {
  const amount = Number($('amount').value)
  const rate = Number($('rate').value) / 100 / 12
  const months = Number($('years').value) * 12
  const growth = (1 + rate) ** months
  const monthly = amount * rate * growth / (growth - 1)
  $('amount-out').textContent = money(amount)
  $('rate-out').textContent = Number($('rate').value).toFixed(1) + '%'
  $('monthly').textContent = money(monthly)
  $('interest').textContent = money(monthly * months - amount)
  $('ask').dataset.prompt = `Is a shorter loan better than ${$('years').value} years for ${money(amount)} at ${$('rate').value}%?`
}
document.addEventListener('input', update)
update()
</script>
```

The button's question follows the controls, so your next reply starts from the
reader's actual numbers.

## Code traced line by line

```html
<style>
.code { font-family: var(--font-mono); font-size: 13px; background: var(--surface-1); border-radius: var(--radius); padding: 8px 0; margin-bottom: 8px; }
.code div { padding: 0 12px; white-space: pre; }
.code div.on { background: var(--bg-accent); }
.cells { display: flex; gap: 4px; margin-bottom: 8px; }
.cells span { flex: 1; text-align: center; padding: 4px 0; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }
.cells span.in { background: var(--bg-accent); }
.cells span.mid { border-color: var(--accent); font-weight: 600; }
</style>
<div class="code" id="code"></div>
<div class="cells" id="cells"></div>
<p id="say">Search the whole list</p>
<div class="row">
  <button id="back" aria-label="Previous step">◀</button>
  <input id="step" type="range" min="0" max="12" value="0" style="flex:1" aria-label="Step">
  <button id="next" aria-label="Next step">▶</button>
</div>
<script>
const code = [
  'def search(items, target):',
  '    lo, hi = 0, len(items) - 1',
  '    while lo <= hi:',
  '        mid = (lo + hi) // 2',
  '        if items[mid] == target:',
  '            return mid',
  '        if items[mid] < target:',
  '            lo = mid + 1',
  '        else:',
  '            hi = mid - 1',
  '    return -1',
]
const items = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
const target = 23
const steps = []
let lo = 0, hi = items.length - 1, mid
const note = (line, text) => steps.push({ line, lo, hi, mid, text })
note(2, 'Search the whole list')
for (;;) {
  note(3, lo <= hi ? `lo ${lo} ≤ hi ${hi}: keep going` : 'lo > hi: not found')
  if (lo > hi) { note(11, 'Return -1'); break }
  mid = Math.floor((lo + hi) / 2)
  note(4, `The middle index ${mid} holds ${items[mid]}`)
  if (items[mid] === target) { note(6, `Found ${target} at index ${mid}`); break }
  note(7, items[mid] < target ? `${items[mid]} < ${target}: look right` : `${items[mid]} > ${target}: look left`)
  if (items[mid] < target) { lo = mid + 1; note(8, `lo = ${lo}`) } else { hi = mid - 1; note(10, `hi = ${hi}`) }
}
const slider = document.getElementById('step')
slider.max = steps.length - 1
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
function draw() {
  const s = steps[Number(slider.value)]
  document.getElementById('code').innerHTML = code.map((line, i) => `<div class="${i + 1 === s.line ? 'on' : ''}">${escape(line) || ' '}</div>`).join('')
  document.getElementById('cells').innerHTML = items.map((v, i) => `<span class="${i >= s.lo && i <= s.hi ? 'in' : ''} ${i === s.mid ? 'mid' : ''}">${v}</span>`).join('')
  document.getElementById('say').textContent = s.text
}
document.getElementById('back').onclick = () => { slider.value = Number(slider.value) - 1; draw() }
document.getElementById('next').onclick = () => { slider.value = Number(slider.value) + 1; draw() }
slider.addEventListener('input', draw)
draw()
</script>
```

For colours in longer code, load highlight.js and its `github` and
`github-dark` styles, and highlight each line with
`hljs.highlight(line, { language: 'python' }).value`.

## A small game that remembers the board

```html
<style>
.board { display: grid; grid-template-columns: repeat(3, 64px); gap: 6px; margin-bottom: 8px; }
.board button { height: 64px; font-size: 28px; padding: 0; }
</style>
<p id="turn">X to play</p>
<div class="board" id="board"></div>
<div class="row">
  <button id="reset">New game</button>
  <button id="hint" data-prompt="What is the best move for X on an empty board?">Ask for a hint ↗</button>
</div>
<script>
const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
let cells = dsh.state.get()?.cells ?? Array(9).fill('')
const winner = () => lines.map(([a, b, c]) => (cells[a] && cells[a] === cells[b] && cells[a] === cells[c] ? cells[a] : '')).find(Boolean) ?? ''
const player = () => (cells.filter(Boolean).length % 2 === 0 ? 'X' : 'O')
function draw() {
  const won = winner()
  const full = cells.every(Boolean)
  const board = document.getElementById('board')
  board.replaceChildren(...cells.map((mark, i) => {
    const button = document.createElement('button')
    button.textContent = mark
    button.disabled = Boolean(mark || won)
    button.setAttribute('aria-label', mark || `Square ${i + 1}`)
    button.onclick = () => { cells[i] = player(); dsh.state.set({ cells }); draw() }
    return button
  }))
  document.getElementById('turn').textContent = won ? `${won} wins` : full ? 'A draw' : `${player()} to play`
  const rows = [0, 3, 6].map(i => cells.slice(i, i + 3).map(mark => mark || '·').join(' ')).join(' / ')
  document.getElementById('hint').dataset.prompt = `In tic-tac-toe the board is ${rows}. What is the best move for ${player()}?`
}
document.getElementById('reset').onclick = () => { cells = Array(9).fill(''); dsh.state.set({ cells }); draw() }
draw()
</script>
```

The board survives a reload through `dsh.state`, and the hint button carries the
current position, so you can answer about the real game.
