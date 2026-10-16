# AGENTS.md

## 1. Role

Screenshots of real cards, for the README and for plugin storefronts.
`screenshots.json` at the repository root lists the images markets show, in
order, and the README embeds two of them. Every image is a capture of a card the
model drew in a live DeepSeek Harness session, never a mock-up.

They live in the repository rather than in the installed package: markets read
them from the repository, so they are left out of the published `files` and cost
an install nothing.

## 2. Constraints

**Real captures only.** Each image comes from the running web UI with this build,
captured element by element by a headless browser; nothing is drawn or edited by
hand.

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

## 4. Progress

**Done.**

- Four captures from the live run of 2026-10-16, listed in `screenshots.json`.

**Not done.**

- **No desktop capture.** The desktop apps draw the same cards; none has been
  captured there yet.

**Known defects.**

- The captures show Chinese card text, because the session was in Chinese; the
  card chrome follows the reader's interface language.

**Next goal.** Add a capture from the macOS or Windows desktop app once the
desktop section of `docs/VERIFY.md` has been run.
