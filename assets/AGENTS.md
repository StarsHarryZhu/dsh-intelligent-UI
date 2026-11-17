# AGENTS.md

## 1. Role

Screenshots of real widgets, for the README and for plugin storefronts.
`screenshots.json` at the repository root lists the images markets show, in
order, and the README shows them under the widget each one comes from. Each
image is this build's own rendering of a widget the bundled skill teaches: the
widget's source passed through the `ui_render` tool, drawn by the built browser
bundle in a sandboxed frame inside a static page that carries the host's own
stylesheet, and captured by headless Chrome with the network refused, so every
library came from the plugin's shipped copy. None is a mock-up.

They live in the repository rather than in the installed package: markets read
them from the repository, so they are left out of the published `files` and cost
an install nothing.

## 2. Constraints

**Real drawings only.** Each image comes from this build's bundle and a widget
the skill ships, captured element by element; nothing is drawn or edited by
hand. When a widget in the skill changes, its image is captured again.

**Nothing private.** A capture shows one widget, never the host's sidebar,
which lists the user's own workspaces and sessions.

**PNG, under 300 KB each, at twice the CSS pixel size,** so text stays sharp on
high-density screens without bloating the repository. The storefront list holds
at most eight (`tests/manifest.test.ts`).

**Names say what is shown.** `<subject>[-dark].png`; light theme is the default,
and a dark capture uses stand-in values for the host's dark theme tokens.

## 3. Contents

- `AGENTS.md` — this file: what the images are and how they are made.
- `savings-chart.png` — a savings estimate: two sliders, a metric, and a
  Chart.js area chart in the series colours (`charts.md`).
- `code-trace.png` — binary search traced line by line, with the list it
  searches and a step slider (`recipes.md`).
- `loan.png` — a loan estimate in the dark theme, with a button that asks the
  follow-up question (`recipes.md`).
- `svg-diagram.png` — a hand-written SVG diagram in the colour ramps, whose boxes
  ask about their step when clicked (`diagrams.md`).
- `quiz-form.png` — a quiz with typed blanks and ticked answers sent at once
  with `data-send` (`forms.md`).
- `sorting-steps.png` — bubble sort as an animation the reader plays or steps
  through (`interactive.md`).
- `mermaid-dark.png` — a Mermaid flowchart in the dark theme (`diagrams.md`).

## 4. Progress

**Done.**

- Replaced on 2026-11-17: the DIL captures and the thirty-six component images
  in `catalog/` went with the DIL; these seven come from the rewritten skill.

**Not done.**

- No capture of a widget in a live chat yet: a real model's widget in the
  transcript column, with its lead-in and follow-up, belongs here after the live
  run of `docs/VERIFY.md`.

**Known defects.**

- The captures use a static page, not the running web UI, so the chat's own
  spacing around a widget is not shown.

**Next goal.** Add one live capture of a widget between a model's lead-in and its
follow-up, in each theme.
