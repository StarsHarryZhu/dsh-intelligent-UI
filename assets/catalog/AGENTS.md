# AGENTS.md

## 1. Role

One picture per catalog component, twenty-seven in all, for the README's component
gallery. Each is the card that one sample program of `docs/SAMPLES.md` draws,
cropped to the card's frame. Samples 1 to 24 were first drawn in a live chat on
2026-10-15 and samples 25 to 27 on 2026-10-16; these pictures redraw the same
programs with the current build, so the gallery shows the cards as they look
today.

## 2. Constraints

**Drawn by the plugin, not by hand.** Each image is produced by this build's own
browser bundle (`lib/client.js`) rendering the compiled sample through its
`conversation.chat.turnTail` component, in a static page that loads the host's
built stylesheets from `apps/web/dist` of the sibling harness checkout and the
light-theme token values read from a card in the running web UI. Headless Chrome
crops each card at twice its CSS size, 600 CSS pixels wide. The `player` card is
stepped forward to frame 10 with its own button first, so it shows a run in
progress. The calculus card was
compared with a live capture of the same card (`calculus-light.png` in the
parent folder) and matches it.

**No credentials and no live session.** The capture page needs neither a running
harness nor its access token, so it can be repeated on any machine with the
harness checkout built.

**One file per component, named after it** (`<component>.png`), PNG, under 300 KB
each.

**Light theme only.** One theme keeps the gallery even; the live captures in
the parent folder cover the dark theme.

## 3. Contents

- `AGENTS.md` — this file: what the gallery pictures are and how they are made.
- `card.png` — the `card` sample.
- `col.png` — the `col` sample.
- `row.png` — the `row` sample.
- `grid.png` — the `grid` sample.
- `title.png` — the `title` sample.
- `text.png` — the `text` sample.
- `badge.png` — the `badge` sample.
- `callout.png` — the `callout` sample.
- `divider.png` — the `divider` sample.
- `link.png` — the `link` sample.
- `image.png` — the `image` sample.
- `metric.png` — the `metric` sample.
- `progress.png` — the `progress` sample.
- `table.png` — the `table` sample.
- `keys.png` — the `keys` sample.
- `list.png` — the `list` sample.
- `steps.png` — the `steps` sample.
- `chart.png` — the `chart` sample.
- `plot.png` — the `plot` sample.
- `formula.png` — the `formula` sample.
- `slider.png` — the `slider` sample.
- `numberInput.png` — the `numberInput` sample.
- `textInput.png` — the `textInput` sample.
- `select.png` — the `select` sample.
- `checkbox.png` — the `checkbox` sample.
- `button.png` — the `button` sample.
- `player.png` — the `player` sample, at frame 10 of 24.

## 4. Progress

**Done.**

- All twenty-seven components, regenerated on 2026-10-16 after `player` was
  added and code-type lists got their wider gutter.

**Not done.**

- **The capture script is not in the repository.** It lives with the maintainer's
  tooling; the method above is enough to repeat it.

**Known defects.**

- `image` shows the 32×32 gradient the sample carries, scaled to the card width,
  so it looks soft; the sample in `docs/SAMPLES.md` elides its base64.
- The cards' text is Chinese, as the samples were written in a Chinese session.

**Next goal.** Redraw a picture in the same change that alters its component's
look.
