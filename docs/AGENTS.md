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
  cards, math cards, the skill, buttons, a bad program, reload, themes, the
  uninstall regression, an animated card, the newer components, a code block,
  and the skill row), the macOS and Windows desktop apps, and what only
  Windows shows; plus the recorded runs. All three parts are required: Part 1
  passed on the web UI, Parts 2 and 3 on both desktop apps of 0.2.1-rc.2, and
  only W4 has no recorded pass.
- `SAMPLES.md` — the catalog tour: one drawn card per component, with the exact
  source and result of each, and the defects the tour found.
- `market/` — the awesome-dsh-plugin entry and how to submit it. See
  `market/AGENTS.md`. The folder is git-ignored and stays in the working tree:
  it is never published with the code.

## 4. Progress

**Done.**

- `PRINCIPLE.md` describes the two drawing surfaces, the turn data Definition,
  button sends, and the streaming preview as they are implemented.
- `VERIFY.md` covers every acceptance criterion with a runnable step, including a
  check that costs no model call: a persisted card, and a card from before the
  version fields showing its text. The web part was run on 2026-10-16 and the
  desktop parts on 2026-10-17; both are recorded there.
- `SAMPLES.md` carries all thirty-two components: samples 1 to 27 as they were
  actually drawn, samples 28 to 32 as compiled by the built tool (28 to 31 drew
  together in one web-UI card on 2026-10-19; a model-written code card drew
  live on both the web UI and the macOS app on 2026-10-22), and
  doubles as a compile corpus: `tests/compile.test.ts` compiles the two math
  samples a live model wrote.
- Screenshots of rendered cards live in the repository's `assets/`.

**Not done.**

- **W4 of `VERIFY.md` has no recorded pass.** Developing on Windows — link the
  toolchain, build, run the suite — failed on 2026-10-16 with its output lost, and
  no later attempt is recorded. Everything else in the checklist has passed.
- **No desktop record of its own yet.** Parts 2 and 3 passed on both desktop apps
  of 0.2.1-rc.2, and the root `AGENTS.md` and `VERIFY.md` carry that run; no
  separate capture or write-up from a desktop session exists in `docs/`.

**Known defects.**

- `VERIFY.md` names one specific historical session for the zero-cost check; on
  another machine, any session with a settled `ui_render` call serves instead.

**Next goal.** Rerun Parts 2 and 3 of `VERIFY.md` on each new desktop version, in
a throwaway session first, and record the output of W4.
