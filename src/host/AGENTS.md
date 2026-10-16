# AGENTS.md

## 1. Role

The harness-process half. It defines the one tool the model can call and the
description that teaches the model the language; it compiles the model's source
and returns either a short summary or the diagnostics the model repairs from.

It is a compiler, not a renderer. It never draws anything, never reads a session,
and holds no state between calls; the interface it validates travels to the
browser separately, as tool-result metadata.

## 2. Constraints

**One tool, one registration.** `createUIRenderTool()` is the whole surface. The
entry registers it through `ctx.tools.register`, which is an effect of the
plugin's context.

**One required argument.** `source` carries the program; `title` is optional.
Models confused a separate grammar switch with the grammar itself, so the
compiler detects the grammar from the source instead.

**The model sees the summary, never the program.** `output.render` projects the
result into model-visible text — counts, repairs, and the text-only view;
`output.presentationMeta` selects what is persisted for the browser. The compiled
program appears only in the metadata.

**`presentationMeta` output is lossless JSON** with a format version `v`. The
harness snapshots it and rejects anything else.

**The description is derived from the catalog** and its examples must compile
without a diagnostic; `tests/tool.test.ts` checks both. The description is the
capability: treat a change to its text as a behaviour change.

**Diagnostics are written for the model.** Each names what is wrong, where, and
the action that removes it; repairs the compiler made are reported too, so the
next call is cleaner. `LIMITS.maxDiagnosticsReported` caps the list.

**No I/O.** `execute` reads its arguments and returns a value: no file, no clock,
no network, no randomness.

**Parameters are authored with `defineTool`, never hand-written.** `parameters` on
a `ToolDefinition` is JSON Schema that travels to the provider verbatim, and
`defineTool` also validates arguments before `execute`. The result schema is run
through the registry's own `assertSupportedJsonSchema` in the tests.

## 3. Contents

- `AGENTS.md` — this file: what the host half may do and what it must not.
- `tool.ts` — the `ui_render` definition: parameters, result schema, the
  model-facing text, the persisted metadata, and the compiling `execute`.
- `model-brief.ts` — the tool description, its three worked examples, and the
  repair hint appended to a failed call.

## 4. Progress

**Done.**

- Parameters are `source` (required) and `title`; arguments without `source` are
  rejected before compiling (`tests/tool.test.ts`).
- Success reports counts, the repairs made, and the text-only view; failure
  reports capped diagnostics and the repair hint.
- Metadata is `{ v: 2, ok: true, program, title? }` on success and
  `{ v: 2, ok: false, diagnostics }` (at most five) on failure.
- The description lists every component, the limits, and three examples that
  compile cleanly, at under nine thousand characters.

**Not done.**

- A `deferLoading` catalog query tool, for when the catalog outgrows the
  description.
- A `presentCall` view: a pending call is drawn by the browser half instead.

**Known defects.**

- The description is English only; models answer in the user's language anyway,
  but non-English examples might lift success rates further.

**Next goal.** Measure how often live models need a repair round, and tighten the
examples where they do.
