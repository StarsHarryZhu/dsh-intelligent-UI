# AGENTS.md

## 1. Role

Longer-form documentation that does not belong in a README: the architecture this
plugin follows and how it differs from the original, the catalogue as it was drawn
component by component, and the checklist that proves the cards work in the running
harness.

A README states what the plugin is and how to install it. These three files hold what
a contributor needs before changing behaviour, what the model's output looks like
when it is right, and what a verifier needs after a restart.

## 2. Constraints

**One fact, one home.** Installation lives in the README. The click-through
verification lives in `VERIFY.md`. The architecture comparison lives in
`PRINCIPLE.md`. The drawn catalogue lives in `SAMPLES.md`. Do not restate a step in
two files.

**State current behaviour, not history.** A mechanism is described as it is. What
it replaced belongs in a commit or in the root `AGENTS.md` defect list.

**Attribute the sources.** `PRINCIPLE.md` describes the original architecture,
which comes from third-party reverse engineering and one open-source
reimplementation. Name those sources and mark what is inferred rather than
observed.

**`VERIFY.md` steps must be runnable as written.** Every step names the exact
place, command, or console expression, and states what a pass looks like.

**Say what is unverified.** Both files carry a section for what has not been
proven.

**English, one physical line per paragraph.**

## 3. Contents

- `AGENTS.md` — this file: what belongs in this directory.
- `PRINCIPLE.md` — how the original Intelligent UI works, source by source; the
  layers this plugin reproduces on DeepSeek Harness mechanisms; the deliberate
  differences; and what was given up.
- `VERIFY.md` — the post-restart checklist: activation, persisted cards, a live
  card, interaction, buttons, reload, themes, and the uninstall regression.
- `SAMPLES.md` — the catalog tour: one drawn card per component, with the exact
  source and result of each, and the defects the tour found.

## 4. Progress

**Done.**

- `PRINCIPLE.md` describes the two drawing surfaces, the turn data Definition,
  button sends, and the streaming preview as they are implemented.
- `VERIFY.md` covers every acceptance criterion with a runnable step, including a
  check that costs no model call: cards persisted by an earlier build.
- `SAMPLES.md` carries all twenty-four components as they were actually drawn, and
  doubles as a compile corpus for the two defects the tour found.

**Not done.**

- **No screenshot of a rendered card.** It belongs here once a verified run exists.

**Known defects.**

- `VERIFY.md` names one specific historical session for the zero-cost check; on
  another machine, any session with a settled `ui_render` call serves instead.

**Next goal.** Record the first complete `VERIFY.md` run, with its date, in the
root `AGENTS.md`.
