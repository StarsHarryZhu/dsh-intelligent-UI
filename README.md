# dsh-intelligent-ui

Interactive cards in DeepSeek Harness chats. The model writes a small interface program, the chat draws it as a native card, and every control recomputes in your browser without another model call. A button sends its text as your next message.

[中文](README-zh.md)


| | |
|---|---|
| Requires | DeepSeek Harness **>= 0.2.1-alpha.1** (below 0.3.0) |
| Platforms | Web UI, macOS desktop app, and Windows desktop app — one bundle, because both desktop apps load the same web client |
| Verified | Web UI 0.2.1-alpha.4; macOS and Windows desktop apps 0.2.1-rc.2 |
| Install | Settings → Plugins → Add plugin → `https://github.com/StarsHarryZhu/dsh-intelligent-UI` (needs `git` on `PATH`), then restart the harness and reload the page |

## The 27 components

One card per component, drawn by this plugin in the host's light theme. The program behind each card is in [`docs/SAMPLES.md`](docs/SAMPLES.md).

| Component | Group | What it shows | Screenshot |
|---|---|---|---|
| `card` | Layout | The framed root: optional title, padding, and gap. | <img src="assets/catalog/card.png" alt="card" width="360"> |
| `col` | Layout | A vertical stack in reading order. | <img src="assets/catalog/col.png" alt="col" width="360"> |
| `row` | Layout | Equal-width cells side by side; they wrap on a narrow screen. | <img src="assets/catalog/row.png" alt="row" width="360"> |
| `grid` | Layout | An even grid of one to four columns. | <img src="assets/catalog/grid.png" alt="grid" width="360"> |
| `title` | Text | A headline line in five sizes. | <img src="assets/catalog/title.png" alt="title" width="360"> |
| `text` | Text | A sentence, with `{…}` live values. | <img src="assets/catalog/text.png" alt="text" width="360"> |
| `badge` | Text | A one-word status label in five tones. | <img src="assets/catalog/badge.png" alt="badge" width="360"> |
| `callout` | Text | One emphasized remark: an assumption, a caveat, a next step. | <img src="assets/catalog/callout.png" alt="callout" width="360"> |
| `divider` | Text | A hairline separator. | <img src="assets/catalog/divider.png" alt="divider" width="360"> |
| `link` | Text | A citation link, opened only when clicked. | <img src="assets/catalog/link.png" alt="link" width="360"> |
| `image` | Text | An inline `data:` image with alt text and a caption. | <img src="assets/catalog/image.png" alt="image" width="360"> |
| `metric` | Data | One prominent number that recomputes as controls move. | <img src="assets/catalog/metric.png" alt="metric" width="360"> |
| `progress` | Data | A proportion bar. | <img src="assets/catalog/progress.png" alt="progress" width="360"> |
| `table` | Data | A comparison table; `current=` highlights a row. | <img src="assets/catalog/table.png" alt="table" width="360"> |
| `keys` | Data | Label and value pairs for exact figures. | <img src="assets/catalog/keys.png" alt="keys" width="360"> |
| `list` | Data | A bulleted list; `current=` highlights an item. | <img src="assets/catalog/list.png" alt="list" width="360"> |
| `steps` | Data | A numbered procedure; with `mono=true` and `current=`, a code listing with the running line highlighted. | <img src="assets/catalog/steps.png" alt="steps" width="360"> |
| `chart` | Data | A bar or line chart. | <img src="assets/catalog/chart.png" alt="chart" width="360"> |
| `plot` | Math | Curves of y = f(x) with a marked point, its tangent, and a shaded integral. | <img src="assets/catalog/plot.png" alt="plot" width="360"> |
| `formula` | Math | A typeset expression with its live value. | <img src="assets/catalog/formula.png" alt="formula" width="360"> |
| `slider` | Controls | A range slider bound to a number. | <img src="assets/catalog/slider.png" alt="slider" width="360"> |
| `numberInput` | Controls | Exact number entry. | <img src="assets/catalog/numberInput.png" alt="numberInput" width="360"> |
| `textInput` | Controls | A one-line text field. | <img src="assets/catalog/textInput.png" alt="textInput" width="360"> |
| `select` | Controls | A dropdown choice. | <img src="assets/catalog/select.png" alt="select" width="360"> |
| `checkbox` | Controls | An on/off switch. | <img src="assets/catalog/checkbox.png" alt="checkbox" width="360"> |
| `button` | Action | Sends its text as your next message, then locks the card. | <img src="assets/catalog/button.png" alt="button" width="360"> |
| `player` | Animation | A control bar at the bottom of the card: plays, pauses, steps, and scrubs a number at 0.5× to 2×; everything that reads it follows. | <img src="assets/catalog/player.png" alt="player" width="360"> |

## How it works

- The plugin registers one tool, `ui_render`, and one skill, `dsh-intelligent-ui`, which teaches the model when a card beats prose. The model never writes HTML or JavaScript: its program is checked against the 27-component catalog and stored with the tool result.
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

## License

[MIT License](LICENSE) © 2026 Starfield.
