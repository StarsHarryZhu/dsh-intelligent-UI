# dsh-intelligent-ui

Interactive cards in DeepSeek Harness chats. The model writes a small interface program, the chat draws it as a native card, and every control recomputes in your browser without another model call. A button sends its text as your next message.

[中文](README-zh.md)

| | |
|---|---|
| Requires | DeepSeek Harness **>= 0.2.1-rc.1** (below 0.3.0) |
| Platforms | Web UI, macOS desktop app, and Windows desktop app — one bundle, because both desktop apps load the same web client |
| Verified | Web UI 0.2.1-alpha.4; macOS and Windows desktop apps 0.2.1-rc.2 |
| Install | Settings → Plugins → Add plugin → `https://github.com/StarsHarryZhu/dsh-intelligent-UI` (needs `git` on `PATH`), then restart the harness and reload the page |

## How it works

- The plugin registers one tool, `ui_render`, and one skill, `dsh-intelligent-ui`, which teaches the model when a card beats prose. The model never writes HTML or JavaScript: its program is checked against the 31-component catalog and stored with the tool result.
- A card draws in the tool row while the reply streams, and under the reply once it finishes. Moving a control recomputes every figure locally.
- A `player` animates a card: code traced line by line, an algorithm's passes, a point moving along a curve. Playback runs in the browser and sends nothing to the model.
- Cards compute integrals (including infinite bounds), derivatives, limits, sums and products, roots, and Taylor polynomials. A value that cannot be computed reliably shows "—", never a guess.
- Uninstalling leaves every session opening as before; earlier calls show as ordinary tool rows.

## Development

```sh
node scripts/link-dev.mjs   # link the toolchain from the sibling harness checkout
node build.js               # type-check, build, and self-check the bundle
node node_modules/vitest/vitest.mjs run
```

`AGENTS.md` holds the rules of the tree; `docs/VERIFY.md` is the live checklist.

## The 31 components

One card per component, drawn by this plugin in the host's light theme. The program behind each card is in [`docs/SAMPLES.md`](docs/SAMPLES.md).

### `card` — Layout

<img src="assets/catalog/card.png" alt="card" width="720">

The framed root: optional title, padding, and gap.

### `col` — Layout

<img src="assets/catalog/col.png" alt="col" width="720">

A vertical stack in reading order.

### `row` — Layout

<img src="assets/catalog/row.png" alt="row" width="720">

Equal-width cells side by side; they wrap on a narrow screen.

### `grid` — Layout

<img src="assets/catalog/grid.png" alt="grid" width="720">

An even grid of one to four columns.

### `tabs` — Layout

<img src="assets/catalog/tabs.png" alt="tabs" width="720">

Pages the reader switches between, by click or arrow key; only the open page is drawn.

### `tab` — Layout

<img src="assets/catalog/tab.png" alt="tab" width="720">

One page of `tabs`, labelled by its title; pages share the card's state.

### `title` — Text

<img src="assets/catalog/title.png" alt="title" width="720">

A headline line in five sizes.

### `text` — Text

<img src="assets/catalog/text.png" alt="text" width="720">

A sentence, with `{…}` live values.

### `badge` — Text

<img src="assets/catalog/badge.png" alt="badge" width="720">

A one-word status label in five tones.

### `callout` — Text

<img src="assets/catalog/callout.png" alt="callout" width="720">

One emphasized remark: an assumption, a caveat, a next step.

### `divider` — Text

<img src="assets/catalog/divider.png" alt="divider" width="720">

A hairline separator.

### `link` — Text

<img src="assets/catalog/link.png" alt="link" width="720">

A citation link, opened only when clicked.

### `image` — Text

<img src="assets/catalog/image.png" alt="image" width="720">

An inline `data:` image with alt text and a caption.

### `metric` — Data

<img src="assets/catalog/metric.png" alt="metric" width="720">

One prominent number that recomputes as controls move.

### `progress` — Data

<img src="assets/catalog/progress.png" alt="progress" width="720">

A proportion bar.

### `table` — Data

<img src="assets/catalog/table.png" alt="table" width="720">

A comparison table; `current=` highlights a row, and `sortable=true` lets the reader sort by any column.

### `keys` — Data

<img src="assets/catalog/keys.png" alt="keys" width="720">

Label and value pairs for exact figures.

### `list` — Data

<img src="assets/catalog/list.png" alt="list" width="720">

A bulleted list; `current=` highlights an item.

### `steps` — Data

<img src="assets/catalog/steps.png" alt="steps" width="720">

A numbered procedure; with `mono=true` and `current=`, a code listing with the running line highlighted.

### `chart` — Data

<img src="assets/catalog/chart.png" alt="chart" width="720">

A bar or line chart.

### `diagram` — Data

<img src="assets/catalog/diagram.png" alt="diagram" width="720">

A flowchart laid out in layers; loops return along the side, and `current=` highlights a box.

### `plot` — Math

<img src="assets/catalog/plot.png" alt="plot" width="720">

Curves of y = f(x) with a marked point, its tangent, and a shaded integral.

### `formula` — Math

<img src="assets/catalog/formula.png" alt="formula" width="720">

A typeset expression with its live value.

### `slider` — Controls

<img src="assets/catalog/slider.png" alt="slider" width="720">

A range slider bound to a number.

### `numberInput` — Controls

<img src="assets/catalog/numberInput.png" alt="numberInput" width="720">

Exact number entry.

### `textInput` — Controls

<img src="assets/catalog/textInput.png" alt="textInput" width="720">

A one-line text field.

### `select` — Controls

<img src="assets/catalog/select.png" alt="select" width="720">

A dropdown choice.

### `checkbox` — Controls

<img src="assets/catalog/checkbox.png" alt="checkbox" width="720">

An on/off switch.

### `checklist` — Controls

<img src="assets/catalog/checklist.png" alt="checklist" width="720">

Items to tick off with a done count; `bind=` hands the count to the rest of the card.

### `button` — Action

<img src="assets/catalog/button.png" alt="button" width="720">

Sends its text as your next message, then locks the card.

### `player` — Animation

<img src="assets/catalog/player.png" alt="player" width="720">

A control bar at the bottom of the card: plays, pauses, steps, and scrubs a number at 0.5× to 2×; everything that reads it follows.

## License

[MIT License](LICENSE) © 2026 Starfield.
