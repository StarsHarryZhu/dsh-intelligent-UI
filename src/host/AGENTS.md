# AGENTS.md

## 1. Role

The harness-process half. It defines the one tool the model can call and the
description it writes widgets from; it checks each widget before it is shown and
returns either a short summary or the problems the model fixes, with their
lines. It also provides the bundled skill, which carries the judgement the
description leaves out: when a widget beats prose, how to design one, which
library fits, how to write math, forms, and diagrams, and how to repair a failed
call; the skill row mounts that provider.

It is a checker, not a renderer. It never runs the model's code, never draws
anything, never reads a session, and holds no state between calls; the widget it
checks travels to the browser separately, as tool-result metadata, and runs
there in a sandboxed frame.

## 2. Constraints

**One tool and one skill, each from its own row.** The bundle mounts two rows.
The tool row (`src/index.ts`) registers `createUIRenderTool()` and nothing else.
The skill row (`src/skill.ts`, `inject = ['skills']`) registers one skill
provider the way the host's own skill packages do — `bundled` source, bundled
rank 600, model and reader invocation — so the Plugin Manager lists the skill as
a part of the plugin and the host lists it wherever it lists its own skills.
`readSkillCandidate()` reads the frontmatter of
`skills/dsh-intelligent-ui/SKILL.md` when the row loads; when it cannot, the row
logs why and registers nothing, and the tool is unaffected. Every registration is
an effect of its row's context. Never use the registry's runtime `register()`.

**The model's code is compiled, never run.** `check.ts` compiles each inline
script and each inline event handler with `node:vm`'s `new Script`, which parses
without executing; a module is first turned into an async function body with the
same lines. A syntax error is an error, with its line in the source, and keeps
the widget from being shown, so the model rewrites it in the same turn.
Everything else is read as text: an unclosed `<script>`, an import map that is
not JSON, and an empty or oversized source are errors; an address the frame
will block, a habit the sandbox defeats (`position: fixed`, browser storage,
dialogs, cookies, `window.open`, nested frames, `document.write`), and a form
whose own submission goes nowhere are warnings, reported with the shown widget.
`check.ts` is the only file that imports `node:vm`.

**One required argument.** `source` carries the widget; `title` and `revises`
are optional.

**A card's id is its call id.** A successful result tells the model `Card id:`
with the call id from `exec.callId`, and that passing it as `revises` redraws
or changes that widget, which the reader then sees alone, with the saved values
carried over. A `revises` without a card id's shape (`CARD_ID_PATTERN`), or
naming the call itself, is ignored with a note; a valid one is persisted as
`meta.revises`. Whether that card exists is the browser's to find out.

**A widget stands where it is called, or where the answer names it, and the
model is told so.** The description's Placement paragraph says both; every
successful result says it again on its second line (`PLACEMENT_NOTE`) and then
gives the ```widget block holding that card's id (`placementBlock`), ready to
copy into the answer. Both say a block never draws a widget, because a model
that has written many blocks starts writing them for widgets it never drew.

**The model sees a summary, never its source back.** `output.render` projects
the result into text: lines and scripts, the shipped libraries and fetched
addresses, the control ids the frame keeps, the messages its buttons send, the
visible text before any script runs (at most 600 characters), and the warnings.
`output.presentationMeta` persists `{ version: 2, ok: true, source, title?,
revises? }` for a shown widget and `{ version: 2, ok: false, problems }` (at most
six) for one that was not.

**The description is short and complete.** It names what the frame provides —
the theme variables, the styled elements and classes, the helpers, and the
shipped libraries by title — and the sandbox's rules, with one example that
passes the check without a note. It stays under 4000 characters, because it is
sent with every request (`tests/tool.test.ts`). Treat a change to its text as a
behaviour change.

**The skill does not repeat the description.** The description is the
reference; the skill is judgement and complete widgets. A fact lives in one of
them.

**Problems are written for the model.** Each names what is wrong, where, and the
action that removes it. `LIMITS.maxDiagnostics` caps the list.

**No I/O inside a call.** `execute` reads its arguments and returns a value: no
file, no clock, no network, no randomness. The only files this half reads are its
own skill's: the frontmatter when the skill row loads, and the body each time the
host loads the skill, so an edited skill needs no restart. Both are located with
`fileURLToPath`, so the path is right on Windows too.

**Parameters are authored with `defineTool`, never hand-written.** `parameters` on
a `ToolDefinition` is JSON Schema that travels to the provider verbatim, and
`defineTool` also validates arguments before `execute`. The result schema is run
through the registry's own `assertSupportedJsonSchema` in the tests.

## 3. Contents

- `AGENTS.md` — this file: what the host half may do and what it must not.
- `tool.ts` — the `ui_render` definition: parameters, result schema, the
  model-facing summary, the persisted metadata, and `execute`.
- `check.ts` — the widget check: compiled scripts and handlers, addresses,
  shipped libraries, and the habits the sandbox defeats.
- `model-brief.ts` — the tool description, its example, the shipped-library
  list derived from `widget/libs.ts`, and the repair hint of a failed call.
- `skill.ts` — the skill's location, its frontmatter reader (byte-order mark and
  Windows line endings accepted), its catalog entry, and the provider the skill
  row registers.

## 4. Progress

**Done.**

- The rewrite of 2026-11-17: the DIL compiler gave way to `check.ts`; metadata
  moved to API version 2 and carries the checked source.
- 2026-11-22: the description's Placement paragraph and each result's
  ```widget block with the card id let the model stand a widget inside its
  answer (`tests/tool.test.ts`); the description stays under 4000 characters.
- 2026-11-27: the Placement paragraph and `PLACEMENT_NOTE` add that a block
  never draws a widget; the revision sentence and the opening paragraph were
  cut to keep the description at 3988 characters.
- Syntax errors in classic scripts, modules, and inline handlers come back with
  their source lines; blocked addresses, shipped libraries, and sandbox habits
  are reported (`tests/check.test.ts`).
- A result names its card id and how a redraw replaces it, and a valid `revises`
  reaches the metadata while an invalid one is reported (`tests/tool.test.ts`).
- The description fell from 9978 characters to under 4000.
- The skill lists under `dsh-intelligent-ui` from its own row, as a bundled
  provider whose base directory holds its reference files
  (`tests/skill.test.ts`, `tests/isolation.test.ts`).

**Not done.**

- The model cannot see the widget it drew. Runtime errors come back only when the
  reader sends them with the widget's fix button.

**Known defects.**

- The check reads scripts for syntax only: a reference error, a wrong library
  call, or a layout that looks wrong passes it.
- The description and the skill are English only; models answer in the user's
  language anyway.

**Next goal.** Tune the description and the skill from a live run with a real
model.
