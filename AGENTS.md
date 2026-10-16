# AGENTS.md

## 1. Role

Intelligent UI for DeepSeek Harness: a **fully plugin-based** take on ChatGPT's
Intelligent UI architecture. The model writes a small, catalogued interface
program, the chat renders it as a native card, and every control change
recomputes in the browser with **zero model calls**.

A reply can carry an interactive interface: an estimate the reader adjusts, a
comparison table, a small chart, a proportion, a short form, or a quiz question
answered with one click. The model never writes HTML, CSS, or JavaScript, and the
browser never evaluates model text. What crosses the wire is a validated program
over a fixed component catalog, so a card inherits the host's own typography,
spacing, and theme instead of approximating them.

Why it exists: answering "what does this cost if…" with a sentence forces the
reader to ask again for every variation. A card keeps the answer and the
exploration in one place without spending a request per variation, and a button
turns a choice into the next message without retyping it.

How it fits the host: the host half registers one tool, `ui_render`, which
compiles the model's source and persists the compiled program as the tool
result's presentation metadata. The browser half draws that program in two
places — in the tool row while the turn runs (with a live preview while the
arguments stream), and under the reply once the turn has finished, because a
finished turn folds its tool rows away.

## 2. Constraints

These apply to every file in this repository and every change to it.

**Zero intrusion (the project's hard requirement).** Nothing here may modify the
DeepSeek Harness checkout: no change to `packages/`, `apps/`, `docs/`, or any
tracked file, no pnpm workspace membership, no tsconfig aggregate entry.
`git -C deepseek-harness status --porcelain` stays empty. The plugin reaches the
host only through the published plugin contract: services on its context, slot
registrations, and the module table's `react`.

**Zero new session data.** No new session event type, ever, and no direct writes
to a session log. A button sends an ordinary user message through the session's
own composer. Whatever reaches the model is reconstructable from events the host
already defines, which is what makes "uninstall the plugin and every session still
opens" true.

**Registered surface, exactly, all under this plugin's own names.** Host: one tool,
`ui_render`. Browser: one keyed `tool.call.toolview` cell under `ui_render`, one
`conversation.chat.turnTail` list entry with id `dsh-intelligent-ui`, one
data-only Conversation Definition of kind `dsh-intelligent-ui` (it publishes Turn
data and builds no view node), one dictionary namespace, and one
`<style data-plugin="dsh-intelligent-ui">`. No store, no settings namespace, no
replacement of a shipped cell, no agent-loop change, no assistant renderer.

**The browser half imports nothing from the harness.** Only `react` and
`react/jsx-runtime` leave the bundle, and the build fails on any other request.
Host components are matched by copying their look into this plugin's own
stylesheet, never by requiring a harness client package.

**`apply` takes the context only.** Cordis calls `apply(ctx, config)`, and a page
entry's config is `undefined`; React comes from `require('react')`. Every browser
contribution is registered inside its own `try`/`catch`, because a throw from
`apply` marks the whole page's boot as failed.

**Model output is data.** A compiled program is lossless JSON: no functions, no
`eval`, no `new Function`, no element created from a model-supplied name. A
renderer is reached only through the fixed registry keyed by catalog type, so an
unknown type draws nothing. No iframe, no Worker, no network access, no timers,
and no browser storage in the browser half.

**No literal styling.** Every colour, radius, and font in `src/client/styles.css`
comes from a host theme token, every selector is scoped under a `.dsh-iui-` class,
and spacing is whole steps of 4px.

**Every registration is an effect.** Use the disposer a service's `register()`
returns, inside `ctx.effect`. Unloading the plugin must remove every contribution.

**Failures stay inside the card.** A malformed program, a newer program format, an
unexpected host prop, or a client-side defect degrades that one card to readable
text or to nothing. The surrounding transcript is not this plugin's to break.

**Naming.** `name` in `package.json` is the cordis row id, the client module id,
and the `__ModuleLoader__.load({ id })` key: one string, `dsh-intelligent-ui`,
defined once in `src/lang/identity.ts`. The tool name is the slot key.

**Every folder documents itself.** Each directory holds an `AGENTS.md` with exactly
the four sections of this file, in order, in English. The `Contents` list names
the files that actually exist; `tests/agents-md.test.ts` enforces both rules.

**Build and test.** `node scripts/link-dev.mjs` links the toolchain from the
sibling harness checkout. `node build.js` is the only build command and ends with
a self-check that activates the bundle the way cordis does. `node build.js && node
node_modules/vitest/vitest.mjs run` is the full check. `lib/` is generated: edit
`src/`, never `lib/`.

## 3. Contents

- `AGENTS.md` — this file: the project introduction and the rules for the tree.
- `.gitignore` — what git must not carry: the client transpile scratch directory,
  dependencies, test output, logs, and editor and OS noise. `lib/` is deliberately
  kept, because it is the published artifact and no install step regenerates it.
- `package.json` — the bundle manifest: entry points, the `dsh.bundle.patch` row,
  the `dsh.client` browser declaration, and the published file list.
- `cordis.patch.yml` — the bundle's own patch layer, which inserts this package's
  row into a profile.
- `build.js` — the build: type-check, emit the host half, compile and wrap the
  browser half, and self-check the bundle. See its JSDoc for the exact steps.
- `tsconfig.json` — the host-half type check (no DOM types).
- `tsconfig.build.json` — the host-half emit (`src` → `lib`).
- `tsconfig.client.json` — the browser-half compile (`src` → `.client-build`, no
  Node types).
- `vitest.config.ts` — the test runner configuration.
- `README.md` and `README-zh.md` — the package documentation in English and
  Chinese.
- `locale/zh.json`, `locale/en.json` — the display metadata the Plugin Manager
  reads (`meta.title`, `meta.description`).
- `icon.svg` — the plugin's icon, exported under `./icon`.
- `LICENSE` — the MIT license text.
- `lib/` — generated host and browser artifacts. Never edited by hand.
- `src/` — all source. See `src/AGENTS.md`.
- `tests/` — the unit, contract, and isolation suite. See `tests/AGENTS.md`.
- `docs/` — the architecture write-up, the drawn component catalogue, and the live
  verification checklist. See `docs/AGENTS.md`.
- `scripts/` — the development toolchain linker. See `scripts/AGENTS.md`.

## 4. Progress

**Done.**

- The host tool `ui_render` takes one required argument, `source`, plus an
  optional `title`, and compiles both grammars: indentation-nested DIL and a JSON
  envelope with nested `children` (`tests/compile.test.ts`, `tests/dil.test.ts`).
- The browser half registers through `apply(ctx)` alone and the build proves it
  on every run; the bundle is tested with real React 18.3.1, jsdom, and Testing
  Library through its own `__ModuleLoader__` registration (`tests/client.test.tsx`).
- The tool row previews the card while the source streams, shows the settled card
  when the result lands, and opens itself only for a fresh result.
- Finished turns show their cards under the reply through the turn tail, fed by
  the data-only Definition; edits are shared between the row and the tail.
- Buttons send their prompt through the session composer once, then lock the
  card; a composer with unsent text is never overwritten.
- Programs persisted by the first build (format 1) still render; a newer format is
  shown as text; an unknown component is skipped and counted.
- The pluggability invariants above are checked mechanically
  (`tests/isolation.test.ts`), and the harness checkout is unchanged.

**Not done.**

- **Live verification of this rebuild.** `docs/VERIFY.md` must be worked through
  against the running harness after a restart; until then, treat the page
  behaviour as proven in jsdom only.
- **Image attachments.** `image` accepts only inline `data:image/…` sources; the
  conversation's attachment loader is not wired.
- **A `ui_catalog` query tool.** The catalog travels in the tool description; past
  roughly forty components it should move behind a `deferLoading` tool.
- **Persisted reader edits.** Edits live for the page's lifetime only; a reload
  starts from the model's initial values, and nothing claims otherwise.

**Defects found by live use, and the guard each now has.**

- The browser half read React from `apply`'s second parameter, which cordis fills
  with the entry config, so the tool row threw inside its slot registration and
  never rendered. Guarded by the build self-check and `tests/client.test.tsx`.
- A card drawn only in the tool row vanished when a finished turn folded its tool
  rows. The turn tail now carries settled cards.
- Models confused the old `mode` and `source` parameters, and wrote comments with
  `#`, which the old grammar read as nodes. One argument and `//` comments remain.
- Earlier: the parameter dialect reached a provider once, and an unsupported
  result schema failed activation once; `tests/tool.test.ts` pins both shapes.

**Known defects.**

- In the `verbose` transcript mode, and when a reader expands a folded turn, a
  card can appear both in its tool row and under the reply. Both copies share one
  state, so they never disagree.
- A tail needs the turn's `turn/start` event in the loaded history window; a turn
  that starts above the window keeps its card in the tool row only.
- A bare `expr` prop value ends at the first space, so `value=mins / 60` is read as
  `value=mins`. Quoting or parenthesizing it works; the diagnostic does not say so.
- Expressions are accepted in `metric`, `progress`, `chart` and `{…}` interpolation,
  but an item in `keys.items` or a cell in `table.rows` is read as text, so
  `"Monthly: {monthly}"` interpolates while a bare expression there does not.

**Next goal.** Work `docs/VERIFY.md` top to bottom on the restarted harness,
including the uninstall regression, and record the result here.
