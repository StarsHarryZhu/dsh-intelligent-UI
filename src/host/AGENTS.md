# AGENTS.md

## 1. Role

The harness-process half. It defines the one tool the model can call and the
description that teaches the model the language; it compiles the model's source
and returns either a short summary or the diagnostics the model repairs from. It
also registers the bundled skill, which carries the judgement the description
leaves out: when a card beats prose, how to shape one, and how to write math
cards.

It is a compiler, not a renderer. It never draws anything, never reads a session,
and holds no state between calls; the interface it validates travels to the
browser separately, as tool-result metadata.

## 2. Constraints

**One tool, one skill, one registration each.** `createUIRenderTool()` is the
tool. `loadSkill()` reads `skills/SKILL.md` once, at load, and the entry registers
it with the host's skill registry when that registry exists; a host without one
still gets the tool. Both registrations are effects of the plugin's context.

**One required argument.** `source` carries the program; `title` is optional.
Models confused a separate grammar switch with the grammar itself, so the
compiler detects the grammar from the source instead.

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
file, no clock, no network, no randomness. The only file this half reads is its
own skill, once, when the plugin loads, located with `fileURLToPath` so the path
is right on Windows too.

**Parameters are authored with `defineTool`, never hand-written.** `parameters` on
a `ToolDefinition` is JSON Schema that travels to the provider verbatim, and
`defineTool` also validates arguments before `execute`. The result schema is run
through the registry's own `assertSupportedJsonSchema` in the tests.

## 3. Contents

- `AGENTS.md` — this file: what the host half may do and what it must not.
- `tool.ts` — the `ui_render` definition: parameters, result schema, the
  model-facing text, the persisted metadata, and the compiling `execute`.
- `model-brief.ts` — the tool description, its four worked examples, the math
  vocabulary derived from the function table, and the repair hint appended to a
  failed call.
- `skill.ts` — the skill's location, its frontmatter reader (byte-order mark and
  Windows line endings accepted), and the registration it produces.

## 4. Progress

**Done.**

- Parameters are `source` (required) and `title`; arguments without `source` are
  rejected before compiling (`tests/tool.test.ts`).
- Success reports counts, the repairs made, and the text-only view with computed
  figures; failure reports capped diagnostics and the repair hint.
- Metadata is `{ v: 2, ok: true, program, title? }` on success and
  `{ v: 2, ok: false, diagnostics }` (at most five) on failure; the program inside
  carries its own format, 2 or 3.
- The description lists every component, the limits, the math vocabulary, and
  four examples that compile cleanly, at under nine thousand characters.
- The skill registers under `dsh-intelligent-ui` with its directory as the base
  for its two reference files (`tests/skill.test.ts`, `tests/isolation.test.ts`).
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
