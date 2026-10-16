# AGENTS.md

## 1. Role

Screenshots of real cards, for the README and for plugin storefronts.
`screenshots.json` at the repository root lists the images markets show, in
order. The README opens with one live capture and then shows every component in
`catalog/`. The images here are captures of cards the model drew in a live
DeepSeek Harness session; the ones in `catalog/` are the plugin's own rendering of
the sample programs in `docs/SAMPLES.md` (see `catalog/AGENTS.md`). None is a
mock-up.

They live in the repository rather than in the installed package: markets read
them from the repository, so they are left out of the published `files` and cost
an install nothing.

## 2. Constraints

**Real drawings only.** Each image here comes from the running web UI with this
build, captured element by element by a headless browser; each image in
`catalog/` comes from this build's own browser bundle. Nothing is drawn or edited
by hand.

**Nothing private.** A capture shows the transcript column or a single card,
never the sidebar: the sidebar lists the user's own workspaces and sessions.
Other plugins' floating widgets are hidden while capturing.

**PNG, under 300 KB each, at twice the CSS pixel size,** so text stays sharp on
high-density screens without bloating the repository.

**Names say what is shown.** `<subject>[-light].png`; dark theme is the default.

## 3. Contents

- `AGENTS.md` — this file: what the images are and how they are made.
- `calculus-in-chat.png` — a calculus card under the model's reply, dark theme:
  slider, metrics, a typeset integral, and the plot with its shaded area and
  tangent.
- `calculus-light.png` — the same card alone, light theme.
- `taylor-light.png` — a Taylor approximation card with two curves, a legend,
  and a typeset limit, light theme.
- `quiz.png` — a multiple-choice question answered with one click, dark theme.
- `catalog/` — one card per component, twenty-seven in all, light theme, for the
  README. See `catalog/AGENTS.md`.

## 4. Progress

**Done.**

- Four captures from the live run of 2026-10-16, listed in `screenshots.json`.
- All twenty-seven components in `catalog/`, embedded in both READMEs.

**Not done.**

- **No desktop capture.** The desktop apps are not supported for now (root
  `AGENTS.md`), so there is nothing to capture there.

**Known defects.**

- The captures show Chinese card text, because the session was in Chinese; the
  card chrome follows the reader's interface language.

**Next goal.** Regenerate `catalog/` whenever a component's look changes, so the
README never shows an old drawing.
