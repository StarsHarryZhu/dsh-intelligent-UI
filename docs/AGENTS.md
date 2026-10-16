# AGENTS.md

## 1. Role

Longer-form documentation that does not belong in a README: the architecture this
plugin follows and how it differs from the original, the catalogue as it was drawn
component by component, the checklist that proves the cards work in the running
harness on each platform, and the plugin-list submission.

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
place, command, or console expression, and states what a pass looks like. A run
is recorded with its date, platform, and harness version, and with every step it
did not exercise.

**Say what is unverified.** Both files carry a section for what has not been
proven.

**English, one physical line per paragraph.**

## 3. Contents

- `AGENTS.md` — this file: what belongs in this directory.
- `PRINCIPLE.md` — how the original Intelligent UI works, source by source; the
  layers this plugin reproduces on DeepSeek Harness mechanisms; the deliberate
  differences; and what was given up.
- `VERIFY.md` — the checklist in three parts: the web UI (activation, persisted
  cards, math cards, the skill, buttons, a bad program, reload, themes, and the
  uninstall regression), the macOS and Windows desktop apps, and what only
  Windows shows; plus the recorded runs.
- `SAMPLES.md` — the catalog tour: one drawn card per component, with the exact
  source and result of each, and the defects the tour found.
- `market/` — the awesome-dsh-plugin entry and how to submit it. See
  `market/AGENTS.md`.

## 4. Progress

**Done.**

- `PRINCIPLE.md` describes the two drawing surfaces, the turn data Definition,
  button sends, and the streaming preview as they are implemented.
- `VERIFY.md` covers every acceptance criterion with a runnable step, including a
  check that costs no model call: cards persisted by an earlier build. The web
  part was run on 2026-10-16 and is recorded there.
- `SAMPLES.md` carries all twenty-six components as they were actually drawn, and
  doubles as a compile corpus: `tests/compile.test.ts` compiles the two math
  samples a live model wrote.
- Screenshots of rendered cards live in the repository's `assets/`.

**Not done.**

- **The desktop parts of `VERIFY.md` have no recorded run.**

**Known defects.**

- `VERIFY.md` names one specific historical session for the zero-cost check; on
  another machine, any session with a settled `ui_render` call serves instead.

**Next goal.** Record the first desktop run of `VERIFY.md`, on macOS and on
Windows.
