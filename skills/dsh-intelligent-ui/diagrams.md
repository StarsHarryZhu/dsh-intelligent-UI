# Diagrams

## Hand-written SVG

Draw a diagram as one `<svg>` with a `viewBox` 680 wide and no `width`: it then
fills the reply on any screen. Colour with classes, never with fixed colours:

- `c-blue`, `c-teal`, `c-green`, `c-amber`, `c-orange`, `c-red`, `c-purple`,
  `c-pink`, `c-gray` on a shape or a group give a soft fill, a stronger stroke,
  and readable text, in both themes. Use colour for meaning: one ramp per kind
  of thing, gray for the rest.
- `t`, `ts`, and `th` on `<text>` give body, small, and heading text. Keep text
  at 12px or more; the SVG never scales below the reply's width on a desktop,
  but it does on a phone.
- A line or arrow without a ramp: `style="stroke: var(--text-secondary)"`.

Size boxes from their text: about 8px per character at 14px, plus 24px of
padding. Leave 40px between boxes for arrows. Keep it to about seven boxes in a
row and three or four rows; split a bigger picture into steps or tabs.

```html
<svg viewBox="0 0 680 210" role="img" aria-label="How a request reaches the database">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" style="fill: var(--text-secondary)"/>
    </marker>
  </defs>
  <g class="c-blue" data-prompt="Explain what the browser does here" style="cursor:pointer">
    <rect x="20" y="70" width="150" height="64" rx="10"/>
    <text class="th" x="95" y="98" text-anchor="middle">Browser</text>
    <text class="ts" x="95" y="118" text-anchor="middle">sends a request</text>
  </g>
  <g class="c-teal" data-prompt="Explain what the server does here" style="cursor:pointer">
    <rect x="265" y="70" width="150" height="64" rx="10"/>
    <text class="th" x="340" y="98" text-anchor="middle">Server</text>
    <text class="ts" x="340" y="118" text-anchor="middle">checks and queries</text>
  </g>
  <g class="c-amber" data-prompt="Explain what the database does here" style="cursor:pointer">
    <rect x="510" y="70" width="150" height="64" rx="10"/>
    <text class="th" x="585" y="98" text-anchor="middle">Database</text>
    <text class="ts" x="585" y="118" text-anchor="middle">returns rows</text>
  </g>
  <g style="stroke: var(--text-secondary); stroke-width: 1.5; fill: none">
    <path d="M172 92 H262" marker-end="url(#arrow)"/>
    <path d="M417 92 H507" marker-end="url(#arrow)"/>
    <path d="M507 114 H417" marker-end="url(#arrow)"/>
    <path d="M262 114 H172" marker-end="url(#arrow)"/>
  </g>
  <text class="ts" x="340" y="180" text-anchor="middle" style="fill: var(--text-secondary)">Click a box to ask about that step</text>
</svg>
```

Every `data-prompt` part sends its text when clicked, so a diagram doubles as a
menu of follow-up questions. Say so in the diagram, as above.

### Highlighting a step

To walk through a process, give each box an id, keep the current step in a range
input, and toggle a class:

```js
const ids = ['browser', 'server', 'database']
function show() {
  ids.forEach((id, i) => document.getElementById(id).style.opacity = i === Number(step.value) ? 1 : 0.35)
}
step.addEventListener('input', show)
show()
```

## Mermaid

Use Mermaid when the layout is the hard part: flowcharts with many branches,
sequence diagrams, state machines, class and entity diagrams, Gantt charts.
Give it the theme's colours and draw after setting them:

```html
<pre class="mermaid">
flowchart LR
  A[Order placed] --> B{In stock?}
  B -- yes --> C[Ship]
  B -- no --> D[Back-order]
  D --> C
</pre>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    darkMode: dsh.theme === 'dark',
    background: 'transparent',
    primaryColor: css('--surface-1'),
    primaryTextColor: css('--text-primary'),
    primaryBorderColor: css('--border-strong'),
    lineColor: css('--text-secondary'),
    edgeLabelBackground: css('--surface-1'),
    fontFamily: css('--font-sans'),
  },
})
mermaid.run()
</script>
```

Mermaid draws once; a diagram whose colours must follow a theme switch should
redraw on `dsh:theme`, keeping the source text in a variable and calling
`mermaid.render`. Write node labels in the reader's language, and quote a label
that holds punctuation: `A["Step 1: read"]`.

## Choosing between them

- A few boxes, a picture of a thing, anything the reader clicks: hand-written
  SVG. It streams in as you write it and looks right before any script runs.
- Many nodes, or a layout you would have to compute: Mermaid.
- A graph whose nodes move or the reader drags: D3's force layout
  (`charts.md`).
