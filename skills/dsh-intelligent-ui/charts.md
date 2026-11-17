# Charts and tables

## Which tool

- Chart.js: bar, line, area, pie, scatter, and mixed charts, with tooltips and a
  legend. The default choice.
- D3: a chart no library draws, axes you control, force layouts, and maps.
- ECharts: dense dashboards, heat maps, Sankey, tree maps, and large data.
- Plain SVG or CSS: a single bar, a progress meter, a sparkline. No library.

Use the shipped versions from the tool description. Give every chart a box with
a height (`position: relative; height: 240px`), because charts fill their box.

## Chart.js in the chat's theme

Read the theme variables before drawing, set them as Chart.js defaults, colour
the series from `--series-1` to `--series-6`, and redraw on `dsh:theme`. Turn
off the opening animation for charts that follow a slider.

```html
<div class="row">
  <label>Each month <input id="save" type="range" min="50" max="2000" step="50" value="300"> <span id="save-out">$300</span></label>
  <label>Return <input id="rate" type="range" min="0" max="10" step="0.5" value="5"> <span id="rate-out">5%</span></label>
</div>
<div class="metric"><span class="label">After 30 years</span><span class="value" id="total">$249,678</span></div>
<div style="position:relative;height:240px"><canvas id="chart" role="img" aria-label="Savings over 30 years"></canvas></div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script>
const $ = id => document.getElementById(id)
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const money = v => '$' + Math.round(v).toLocaleString('en-US')
const years = Array.from({ length: 31 }, (_, year) => year)
function series() {
  const monthly = Number($('save').value)
  const rate = Number($('rate').value) / 100 / 12
  const total = years.map(year => rate === 0 ? monthly * 12 * year : monthly * ((1 + rate) ** (12 * year) - 1) / rate)
  return { paid: years.map(year => monthly * 12 * year), total }
}
const chart = new Chart($('chart'), {
  type: 'line',
  data: { labels: years, datasets: [{ label: 'Total', data: [], fill: true }, { label: 'Paid in', data: [], fill: true }] },
  options: {
    animation: false, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    elements: { point: { radius: 0 } },
    scales: { x: { title: { display: true, text: 'Years' } }, y: { ticks: { callback: money } } },
    plugins: { tooltip: { callbacks: { label: item => `${item.dataset.label}: ${money(item.raw)}` } } },
  },
})
function theme() {
  Chart.defaults.color = css('--text-secondary')
  Chart.defaults.borderColor = css('--border')
  Chart.defaults.font.family = css('--font-sans')
  chart.data.datasets.forEach((set, i) => {
    set.borderColor = css(`--series-${i + 1}`)
    set.backgroundColor = css(`--series-${i + 1}`) + '33'
  })
}
function update() {
  const { paid, total } = series()
  chart.data.datasets[0].data = total
  chart.data.datasets[1].data = paid
  $('save-out').textContent = money($('save').value)
  $('rate-out').textContent = $('rate').value + '%'
  $('total').textContent = money(total[30])
  chart.update()
}
document.addEventListener('input', update)
addEventListener('dsh:theme', () => { theme(); chart.update() })
theme()
update()
</script>
```

Appending `33` to a hex colour gives a 20% tint; the series variables are hex
values.

## D3

D3 axes draw in `currentColor`, so set `color: var(--text-secondary)` on the
SVG and they follow the theme. Draw into a `viewBox`, not fixed pixels:

```js
const width = 680, height = 260, margin = { top: 10, right: 16, bottom: 28, left: 44 }
const svg = d3.select('#plot').attr('viewBox', `0 0 ${width} ${height}`).style('color', 'var(--text-secondary)')
const x = d3.scaleLinear([0, 10], [margin.left, width - margin.right])
const y = d3.scaleLinear([0, 100], [height - margin.bottom, margin.top])
svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x))
svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5))
svg.append('path').datum(points).attr('fill', 'none').attr('stroke-width', 2).style('stroke', 'var(--series-1)')
  .attr('d', d3.line(d => x(d.x), d => y(d.y)))
```

Set a theme colour with `.style(…)`, not `.attr(…)`: an SVG attribute does not
read CSS variables.

### Maps

Load world shapes from a code host with `fetch`, then draw with
topojson-client and a D3 projection. The shapes need a connection, so show a
note when the request fails:

```js
fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
  .then(response => response.json())
  .then((world) => {
    const countries = topojson.feature(world, world.objects.countries)
    const path = d3.geoPath(d3.geoNaturalEarth1().fitSize([680, 340], countries))
    d3.select('#map').attr('viewBox', '0 0 680 340').selectAll('path').data(countries.features)
      .join('path').attr('d', path).style('fill', 'var(--surface-1)').style('stroke', 'var(--border-strong)')
  })
  .catch(() => { document.getElementById('map-note').hidden = false })
```

## ECharts

Draw with the SVG renderer, take colours from the theme, and resize with the box:

```js
const box = document.getElementById('board')
const chart = echarts.init(box, null, { renderer: 'svg' })
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
chart.setOption({
  color: [1, 2, 3, 4, 5, 6].map(i => css(`--series-${i}`)),
  textStyle: { color: css('--text-secondary'), fontFamily: css('--font-sans') },
  backgroundColor: 'transparent',
  // … series, axes
})
new ResizeObserver(() => chart.resize()).observe(box)
```

## Tables

A bare `<table>` is styled already. Add `class="num"` to number cells to align
them right. To sort, keep the rows as data and redraw the body:

```js
let rows = [/* { name, price, rating } */]
let order = { key: 'price', up: true }
function draw() {
  const sorted = rows.slice().sort((a, b) => (a[order.key] > b[order.key] ? 1 : -1) * (order.up ? 1 : -1))
  document.querySelector('tbody').innerHTML = sorted.map(r => `<tr><td>${r.name}</td><td class="num">${r.price}</td><td class="num">${r.rating}</td></tr>`).join('')
}
for (const th of document.querySelectorAll('th[data-key]')) th.addEventListener('click', () => {
  order = { key: th.dataset.key, up: order.key === th.dataset.key ? !order.up : true }
  draw()
})
draw()
```

Mark the best value in each column with a `badge` instead of colour alone.
