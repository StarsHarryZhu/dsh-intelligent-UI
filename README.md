# dsh-intelligent-ui

Interactive cards in DeepSeek Harness chats. The model writes a small interface program; the chat draws it as a native card — sliders, inputs, choices, metrics, tables, charts, function plots, typeset formulas, and answer buttons — and every control recomputes in your browser without another model call.

[中文](README-zh.md)

![A calculus card under the model's reply: a slider for the upper limit, the typeset integral with its value, and the plot with the shaded area and the tangent](assets/calculus-in-chat.png)

## What it does

- Registers one tool, `ui_render`. The model passes a program in `source`; the plugin validates it against a fixed catalog of 26 components and stores the compiled program with the tool result.
- Draws the card in the tool row while the reply is being written (with a live preview as the program streams in), and under the reply once the turn is finished.
- Recomputes every figure locally when you move a control. Nothing is sent until you press a button, which sends its text as your next message.
- Computes mathematics in the card: integrals (including infinite bounds), derivatives, limits, sums and products, roots, and Taylor polynomials, shown with `plot` and `formula`. A value that cannot be computed reliably shows "—" instead of a guess, and the model receives the computed figures, so its reply matches the card.
- Ships a skill, `dsh-intelligent-ui`, that teaches the model when a card beats prose and how to build one; the model loads it on its own when a request fits.
- Uses the host's theme, fonts, and language; works in light and dark mode.
- Never runs model-written code: the program is data, drawn only by the plugin's own components.

A program looks like this:

```
@state a = 1 min=0 max=3 step=0.1
card "Area under y = x²"
  slider "Upper limit a" bind=a
  formula "integral(x^2, x, 0, a)" label="Area"
  plot fn="x^2" from=-0.5 to=3 shadeFrom=0 shadeTo=a mark=a tangent=true
  metric "Exact value a³/3" value=a^3/3 digits=6
```

![A Taylor approximation card in the light theme: sin x and its degree-n polynomial on one plot, the error at x = 2, and the typeset limit of sin(x)/x](assets/taylor-light.png)

## What you can put in a card

Twenty-six components, every one drawn with the host's own theme tokens, fonts, and 4px spacing grid:

| Group | Components |
|---|---|
| Layout | `card` `col` `row` `grid` |
| Text | `title` `text` `badge` `callout` `divider` `link` `image` |
| Data | `metric` `progress` `table` `keys` `list` `steps` `chart` |
| Math | `plot` `formula` |
| Controls | `slider` `numberInput` `textInput` `select` `checkbox` |
| Action | `button` |

[`docs/SAMPLES.md`](docs/SAMPLES.md) has one drawn card per component, with the exact program and the exact result of each.

## Install

In DeepSeek Harness, open Settings → Plugins → Add plugin and install from `https://github.com/StarsHarryZhu/dsh-intelligent-UI` (or from a local folder). Restart the harness after installing or rebuilding, and reload the page. Installing from GitHub needs `git` on your `PATH`; nothing is built during the install.

Then ask for something a card answers better than prose, for example: "Show me what a team plan costs at $29 per seat, with a slider for the number of seats", or "Plot y = x³ − 3x with a slider for the point where the tangent is drawn".

## Platforms

The web UI and the macOS and Windows desktop apps run the same web client, and this plugin's one browser bundle, so it behaves the same on all three. Two differences come from the host, not the plugin:

- The desktop apps keep their own plugin profile: install the plugin from the desktop app's own Settings → Plugins, even if it is already installed for the web UI.
- The desktop apps default to the Standard transcript view, which keeps a running turn's tool rows collapsed. The card appears under the reply when the turn finishes; expand the steps (or switch to Detailed in Settings) to watch the live preview.

## Uninstall

Disable or remove the bundle in Settings → Plugins, then restart. Sessions keep opening; earlier calls show as ordinary tool rows. The plugin adds no session event types.

## Compatibility

| Surface | Status |
|---|---|
| Harness | DeepSeek Harness `0.2.x` (`engines.dsh` `>=0.2.0-0 <0.3.0-0`) |
| Verified | Web UI, 0.2.1-alpha.4, 2026-10-16 (see `docs/VERIFY.md`) |
| Desktop | macOS and Windows apps load the same bundle; their checklist is in `docs/VERIFY.md` |
| Node | `^22.19.0 || >=24.0.0` |

## Development

```sh
node scripts/link-dev.mjs   # link the toolchain from the sibling harness checkout
node build.js               # type-check, build, and self-check the bundle
node node_modules/vitest/vitest.mjs run
```

See `AGENTS.md` for the rules of the tree and `docs/VERIFY.md` for the live checklist.

## License

[MIT License](LICENSE) © 2026 Starfield.
