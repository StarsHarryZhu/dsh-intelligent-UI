# AGENTS.md

## 1. Role

The harness-process half. It defines the one tool the model can call and the
description that teaches the model the language; it compiles the model's source
and returns either a short summary or the diagnostics the model repairs from. It
also provides the bundled skill, which carries the judgement the description
leaves out: when a card beats prose, how to shape one, and how to write math and
code cards; the skill row mounts that provider.

It is a compiler, not a renderer. It never draws anything, never reads a session,
and holds no state between calls; the interface it validates travels to the
browser separately, as tool-result metadata.

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

**One required argument.** `source` carries the program; `title` and `revises`
are optional. Models confused a separate grammar switch with the grammar itself,
so the compiler detects the grammar from the source instead.

**A card's id is its call id.** A successful result tells the model `Card id:`
with the call id from `exec.callId`; a later call passes it as `revises` to
replace that card, and the reader's values for states with the same names carry
over in the browser. A `revises` without a card id's shape (`CARD_ID_PATTERN`),
or naming the call itself, is ignored with a note; a valid one is persisted as
`meta.revises`. The host checks only the shape: whether that card exists is the
browser's to find out, and a missing one carries nothing.

**The model sees the summary, never the program.** `output.render` projects the
result into model-visible text — counts, repairs, and the text-only view, which
carries every figure the card computes at its initial values, so the reply can
quote them; `output.presentationMeta` selects what is persisted for the browser.
The compiled program appears only in the metadata.

**`presentationMeta` output is lossless JSON** with a format version `version`. The
harness snapshots it and rejects anything else.

**The description is derived from the catalog and the function table,** and its
examples must compile without a diagnostic; `tests/tool.test.ts` checks both. The
description is the capability: treat a change to its text as a behaviour change.

**The skill does not repeat the description.** The description is the language
reference; the skill is judgement and recipes. A fact lives in one of them.

**Diagnostics are written for the model.** Each names what is wrong, where, and
the action that removes it; repairs the compiler made are reported too, so the
next call is cleaner. `LIMITS.maxDiagnosticsReported` caps the list.

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
  model-facing text, the persisted metadata, and the compiling `execute`.
- `model-brief.ts` — the tool description, its five worked examples, the math
  vocabulary derived from the function table, and the repair hint appended to a
  failed call.
- `skill.ts` — the skill's location, its frontmatter reader (byte-order mark and
  Windows line endings accepted), its catalog entry, and the provider the skill
  row registers.

## 4. Progress

**Done.**

- Parameters are `source` (required), `title`, and `revises`; arguments without
  `source` are rejected before compiling (`tests/tool.test.ts`).
- A result names its card id, and a valid `revises` reaches the metadata while
  an invalid one is reported (`tests/tool.test.ts`).
- Success reports counts, the repairs made, and the text-only view with computed
  figures; failure reports capped diagnostics and the repair hint.
- Metadata is `{ version: 1, ok: true, program, title?, revises? }` on success and
  `{ version: 1, ok: false, diagnostics }` (at most five) on failure; the program
  inside carries the same API version.
- The description lists every component, the limits, the math vocabulary, and
  five examples that compile cleanly, at under nine thousand characters.
- The skill lists under `dsh-intelligent-ui` from its own row, as a bundled
  provider whose base directory holds its two reference files
  (`tests/skill.test.ts`, `tests/isolation.test.ts`); the move from the runtime
  registration followed the desktop app showing no skill (2026-10-22).
  In the live run the model loaded it unprompted before its first card.

**Not done.**

- A `deferLoading` catalog query tool, for when the catalog outgrows the
  description.
- A `presentCall` view: a pending call is drawn by the browser half instead.

**Known defects.**

- The description and the skill are English only; models answer in the user's
  language anyway, but non-English examples might lift success rates further.
- The skill is read once at load; an edited skill file takes effect after a
  restart.

**Next goal.** Measure how often live models need a repair round, and tighten the
examples where they do.
