# AGENTS.md

## 1. Role

Longer-form documentation that does not belong in a README: the architecture this
plugin follows and how it differs from the interfaces it reproduces, the
checklist that proves widgets work in the running harness on each platform, and
the plugin-list submission.

A README states what the plugin is and how to install it. These files hold what a
contributor needs before changing behaviour and what a verifier needs after a
restart.

## 2. Constraints

**One fact, one home.** Installation lives in the README. The click-through
verification lives in `VERIFY.md`. The architecture and the security boundary's
reasons live in `PRINCIPLE.md`. Do not restate a step in two files.

**State current behaviour, not history.** A mechanism is described as it is. What
it replaced belongs in a commit or in the root `AGENTS.md`.

**Attribute the sources.** `PRINCIPLE.md` describes ChatGPT's and Claude's
interactive answers, known from third-party reverse engineering, an
announcement, and the guidance Claude's own tool hands its model. Name those
sources and mark what is inferred rather than observed.

**`VERIFY.md` steps must be runnable as written.** Every step names the exact
place, prompt, command, or console expression, and states what a pass looks
like. A run is recorded with its date, platform, and harness version, and with
every step it did not exercise.

**Say what is unverified.** Both files carry a section for what has not been
proven.

**English, one physical line per paragraph.**

## 3. Contents

- `AGENTS.md` — this file: what belongs in this directory.
- `PRINCIPLE.md` — how ChatGPT's and Claude's interactive answers work, the
  layers this plugin builds on DeepSeek Harness mechanisms, the security
  boundary, the deliberate differences and give-ups, and the known risks.
- `VERIFY.md` — the checklist in three parts: the web UI (build, activation, an
  earlier card's text, a live widget, shipped libraries, sending, forms, the
  syntax check, runtime errors, kept values, themes, the sandbox, an unshipped
  library, the harness untouched, removal, the skill row), the macOS and
  Windows desktop apps, and what only Windows shows; plus the recorded runs.
- `market/` — the awesome-dsh-plugin entry and how to submit it. See
  `market/AGENTS.md`. The folder is git-ignored and stays in the working tree:
  it is never published with the code.

## 4. Progress

**Done.**

- Rewritten on 2026-11-17 for the sandboxed engine. `SAMPLES.md`, the drawn tour
  of the DIL catalog, went with the DIL; the widgets the skill teaches take its
  place as examples.
- `VERIFY.md` records the headless Chrome run of 2026-11-17 on the built bundle.

**Not done.**

- **No live run of the new engine.** Parts 1 to 3 of `VERIFY.md` have not been
  run against it; the DIL builds' records are in the file's git history.
- **W4 of `VERIFY.md` has never passed.** Developing on Windows failed on
  2026-10-16 with its output lost.

**Known defects.**

- Steps 8, 9, 12, and 13 of `VERIFY.md` ask the model to call the tool with a
  given source; a model may still change it, and the step then needs a second
  try.

**Next goal.** Run Part 1 with a real model, record it, and tune the tool
description and the skill from what it shows.
