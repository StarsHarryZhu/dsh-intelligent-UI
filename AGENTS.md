# AGENTS.md

## 1. Role

Intelligent UI for DeepSeek Harness: a **fully plugin-based** take on ChatGPT's
Intelligent UI architecture. Its Chinese name, which the Plugin Manager shows from
`locale/zh.json` and `README-zh.md` uses as its title, means "progressive
interaction". The model writes a small, catalogued interface
program, the chat renders it as a native card, and every control change
recomputes in the browser with **zero model calls**.

A reply can carry an interactive interface: an estimate the reader adjusts, a
comparison table, a small chart, a function plot with a tangent or a shaded
integral, a typeset formula with its live value, a short form, or a quiz question
answered with one click. The model never writes HTML, CSS, or JavaScript, and the
browser never evaluates model text. What crosses the wire is a validated program
over a fixed component catalog and a closed expression language, so a card
inherits the host's own typography, spacing, and theme instead of approximating
them.

Why it exists: answering "what does this cost if…" or "what is this integral
when…" with a sentence forces the reader to ask again for every variation. A card
keeps the answer and the exploration in one place without spending a request per
variation, and a button turns a choice into the next message without retyping it.

How it fits the host: the bundle mounts two rows. The tool row registers one
tool, `ui_render`, which compiles the model's source and persists the compiled
program as the tool result's presentation metadata; the skill row registers one
skill, `dsh-intelligent-ui`, which teaches the model when and how to use the
tool, the way the host's own skill packages register theirs. The browser half draws the
program in two places — in the tool row while the turn runs (with a live preview
while the arguments stream), and under the reply once the turn has finished,
because a finished turn folds its tool rows away. It supports DeepSeek Harness
0.2.1-rc.1 and later within 0.2.x on all three hosts it serves — the web UI,
the macOS desktop app, and the Windows desktop app — through one `dsh.client`
declaration, because the desktop apps wrap the same web client.

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

**Registered surface, exactly, all under this plugin's own names.** Host: two
bundle rows, `dsh-intelligent-ui` with one tool, `ui_render`, and
`dsh-intelligent-ui-skill` with one skill provider listing one skill,
`dsh-intelligent-ui`. Browser: one keyed `tool.call.toolview` cell under
`ui_render`, one `conversation.chat.turnTail` list entry with id
`dsh-intelligent-ui`, one data-only Conversation Definition of kind
`dsh-intelligent-ui` (it publishes Turn data and builds no view node), one
dictionary namespace, and one `<style data-plugin="dsh-intelligent-ui">`. No
store, no settings namespace, no replacement of a shipped cell, no agent-loop
change, no assistant renderer.

**The browser half imports nothing from the harness.** Only `react` and
`react/jsx-runtime` leave the bundle, and the build fails on any other request.
Host components are matched by copying their look into this plugin's own
stylesheet, never by requiring a harness client package — which is also why
formulas are typeset by this plugin rather than by the host's KaTeX.

**`apply` takes the context only.** Cordis calls `apply(ctx, config)`, and a page
entry's config is `undefined`; React comes from `require('react')`. Every browser
contribution is registered inside its own `try`/`catch`, because a throw from
`apply` marks the whole page's boot as failed.

**Model output is data.** A compiled program is lossless JSON: no functions, no
`eval`, no `new Function`, no element created from a model-supplied name. A
renderer is reached only through the fixed registry keyed by catalog type, so an
unknown type draws nothing; a math function is reached only through the fixed
function table. No iframe, no Worker, no network access, no timers, and no
browser storage in the browser half.

**Bounded work.** Every evaluation draws on a work budget, calculus nests at most
three deep, and a value that cannot be computed reliably is shown as "—", never
as a guess. A program can make a card show nothing; it cannot make the page stall.

**Three platforms, one registration.** The plugin must work on the web UI, the
macOS desktop app, and the Windows desktop app. `dsh.client.platform` is `"web"`
— the only value the module registry serves — and that one declaration is also
what both desktop apps load, because they wrap the same web client; support is
therefore a fact about this bundle, not a second build. `engines.dsh` is
`>=0.2.1-rc.1 <0.3.0-0`, the range the host enforces, so a desktop app below
it refuses the plugin rather than running it unverified. Nothing in either half
branches on the operating system, and a defect seen on one platform blocks a
release the same way a web one does. The package installs from a git checkout
without a build step, so `lib/` is committed, no install-time script exists, line
endings are pinned by `.gitattributes`, and the repository holds no symbolic link.

**No literal styling.** Every colour, radius, and font in `src/client/styles.css`
comes from a host theme token, every selector is scoped under a `.dsh-iui-` class,
and layout spacing is whole steps of 4px. Inside a typeset formula, spacing is in
em, as mathematical spacing must scale with the formula.

**Every registration is an effect.** Use the disposer a service's `register()`
returns, inside `ctx.effect`. Unloading the plugin must remove every contribution.

**Failures stay inside the card.** A malformed program, a program of another version, an
unexpected host prop, or a client-side defect degrades that one card to readable
text or to nothing. The surrounding transcript is not this plugin's to break.

**One API version.** Programs and their envelope carry a `version` field set to
`API_VERSION` (`src/lang/identity.ts`), currently 1. A client draws an API
version it knows and shows the text of anything else, including cards persisted
before the field existed. Fields are not dated one by one. The release version
in `package.json` and the git tags is the maintainer's, and is independent of the
API version. See `src/lang/AGENTS.md`.

**Naming.** `name` in `package.json` is the cordis row id, the client module id,
the skill name, and the `__ModuleLoader__.load({ id })` key: one string,
`dsh-intelligent-ui`, defined once in `src/lang/identity.ts`. The tool name is the
slot key.

**Every folder documents itself.** Each directory holds an `AGENTS.md` with exactly
the four sections of this file, in order, in English. The `Contents` list names
the files that actually exist; `tests/agents-md.test.ts` enforces both rules.

**Release tags are short and bilingual.** An annotated tag's message is a
Chinese version, then an English version of the same items. Each version has
exactly two parts, Added and Fixed, with one short phrase or sentence per item,
and nothing else: no title line, no scope notes, no other prose. The English half
reads `English version:`, then `Added:` and `Fixed:`, each followed by `- ` items;
the Chinese half has the same shape with Chinese labels.

**Build and test.** `node scripts/link-dev.mjs` links the toolchain from the
sibling harness checkout. `node build.js` is the only build command and ends with
a self-check that activates the bundle the way cordis does. `node build.js && node
node_modules/vitest/vitest.mjs run` is the full check. `lib/` is generated: edit
`src/`, never `lib/`.

## 3. Contents

- `AGENTS.md` — this file: the project introduction and the rules for the tree.
- `.gitignore` — what git must not carry: the client transpile scratch directory,
  dependencies, test output, logs, local assistant memory, the unpublished market
  submission in `docs/market/`, and editor and OS noise. `lib/` is deliberately
  kept, because it is the published artifact and no install step regenerates it.
- `.gitattributes` — LF line endings in every checkout, Windows included.
- `package.json` — the bundle manifest: entry points, the `dsh.bundle.patch` row,
  the `dsh.client` browser declaration, the supported harness range in
  `engines.dsh`, and the published file list.
- `cordis.patch.yml` — the bundle's own patch layer, which inserts this package's
  two rows into a profile: the tool row and the skill row.
- `build.js` — the build: type-check, emit the host half, compile and wrap the
  browser half, and self-check the bundle. See its JSDoc for the exact steps.
- `tsconfig.json` — the host-half type check (no DOM types).
- `tsconfig.build.json` — the host-half emit (`src` → `lib`).
- `tsconfig.client.json` — the browser-half compile (`src` → `.client-build`, no
  Node types).
- `vitest.config.ts` — the test runner configuration.
- `README.md` and `README-zh.md` — the package documentation in English and
  Chinese.
- `screenshots.json` — the storefront screenshot list, read from the repository
  by plugin markets.
- `locale/zh.json`, `locale/en.json` — the display metadata the Plugin Manager
  reads (`meta.title`, `meta.description`); `locale/skill/` holds the skill
  row's, exported under `./skill/locale/`.
- `icon.svg` — the plugin's icon, exported under `./icon`.
- `LICENSE` — the MIT license text.
- `lib/` — generated host and browser artifacts. Never edited by hand.
- `src/` — all source. See `src/AGENTS.md`.
- `skills/` — the bundled skill that teaches the model to use `ui_render`, in the
  `skills/<name>/SKILL.md` layout. See `skills/AGENTS.md`.
- `assets/` — the screenshots `screenshots.json` and the README show, including
  one drawn card per component in `assets/catalog/`. See `assets/AGENTS.md`.
- `tests/` — the unit, contract, isolation, and packaging suite. See
  `tests/AGENTS.md`.
- `docs/` — the architecture write-up, the drawn component catalogue, the live
  verification checklist, and the market submission. See `docs/AGENTS.md`.
- `scripts/` — the development toolchain linker. See `scripts/AGENTS.md`.

## 4. Progress

**Done.**

- The host tool `ui_render` takes one required argument, `source`, plus an
  optional `title`, and compiles both grammars: indentation-nested DIL and a JSON
  envelope with nested `children` (`tests/compile.test.ts`, `tests/dil.test.ts`).
- The math engine: powers, factorials, implicit products, constants, a table of
  thirty-seven functions, and seven calculus operators — integrals with infinite bounds,
  exact derivatives by Taylor arithmetic, limits, finite sums and products, roots,
  and Taylor polynomials — each pinned against known values
  (`tests/math.test.ts`). `plot` and `formula` draw them.
- The skill `dsh-intelligent-ui` (`skills/dsh-intelligent-ui/`) is its own
  bundle row and registers as a bundled skill provider, so the Plugin Manager
  lists it as a part of the plugin; every program it teaches compiles without a
  repair (`tests/skill.test.ts`, `tests/isolation.test.ts`).
- The browser half registers through `apply(ctx)` alone and the build proves it
  on every run; the bundle is tested with real React 18.3.1, jsdom, and Testing
  Library through its own `__ModuleLoader__` registration (`tests/client.test.tsx`).
- Animation: `player` plays, pauses, steps, and scrubs a number state, with a
  duration and a reader-chosen speed; `pick` and the `current=` and `mono=`
  props let a card trace code line by line (`tests/client.test.tsx`).
- Code blocks (2026-10-22): `code` shows code or preformatted text exactly as
  written, from a `"""` text block or a text state, colours fifteen languages
  with the host's syntax tokens, numbers its lines, highlights `current=` while
  scrolling only itself, and copies its exact text (`tests/highlight.test.ts`,
  `tests/compile.test.ts`, `tests/client.test.tsx`).
- **Live run of 2026-10-22, web UI and macOS desktop app** (`docs/VERIFY.md`
  steps 15, 16, D2): the Plugin Manager lists the skill row on both hosts and
  `/` lists the skill; the model loaded the skill and drew a code card traced
  line by line, with the host's syntax colours in both themes, a moving
  highlight, and copying.
- Pages, checklists, sortable tables, and flowcharts:
  `tabs` and `tab` switch pages by click or arrow key, `checklist` counts ticked
  items into an optional bound state, `table sortable=true` sorts by any column,
  and `diagram` lays out boxes and arrows in layers with loops on a side lane
  (`tests/compile.test.ts`, `tests/client.test.tsx`); one card using all four
  drew in the web UI on 2026-10-19.
- Programs and envelopes carry the API version; API version 1 renders, any
  other version and anything persisted before the field existed shows its text;
  an unknown component is skipped and counted.
- The pluggability and packaging invariants are checked mechanically
  (`tests/isolation.test.ts`, `tests/manifest.test.ts`), and the harness checkout
  is unchanged.
- **Live verification on the web UI, 2026-10-16**, DeepSeek Harness
  0.2.1-alpha.4 with DeepSeek-V4.1-Flash, against `docs/VERIFY.md`:
  - the plugin boots and mounts one stylesheet;
  - a calculus card streamed a preview in its row, settled, and moved under the
    reply when the turn folded; moving the slider to a = 3 showed area 9 and
    slope 6 with no request;
  - the model loaded the skill unprompted, read `math.md`, and wrote a correct
    program on the first call, then quoted the computed figures in its reply;
  - a Taylor card's error at degree 15 read -3.642e-10;
  - a quiz button left a typed draft untouched (and, with the clipboard refused,
    showed the text to copy), then sent "C" once the composer was empty and
    locked the card;
  - a malformed program showed a failed row and the model reported its
    diagnostics;
  - a reload rebuilt every card at its initial values, and the light theme drew
    correctly;
  - disabling the plugin in Settings → Plugins and restarting left every session
    opening with no cards and no plugin event type in the logs; re-enabling
    restored the cards.

**Not done.**

- **Infinite series.** `sum` and `prod` take finite bounds only.
- **Image attachments.** `image` accepts only inline `data:image/…` sources; the
  conversation's attachment loader is not wired.
- **A `ui_catalog` query tool.** The catalog travels in the tool description; past
  roughly forty components it should move behind a `deferLoading` tool.
- **Persisted reader edits.** Edits live for the page's lifetime only; a reload
  starts from the model's initial values, and nothing claims otherwise.
- **Cards in the exported session log as clean text.** Deferred (2026-10-22): the
  tool result would carry the card's text view as its own block.

**Defects found by live use, and the guard each now has.**

- The browser half read React from `apply`'s second parameter, which cordis fills
  with the entry config, so the tool row threw inside its slot registration and
  never rendered. Guarded by the build self-check and `tests/client.test.tsx`.
- A card drawn only in the tool row vanished when a finished turn folded its tool
  rows. The turn tail now carries settled cards.
- Models confused the old `mode` and `source` parameters, and wrote comments with
  `#`, which the old grammar read as nodes. One argument and `//` comments remain.
- A copy fallback announced "copied" even when the page refused the clipboard.
  It now shows the text to copy instead (`tests/client.test.tsx`).
- A spaced expression in a bare prop value was cut at its first space. Bare values
  now keep bracketed spaces and rejoin operator-led pieces (`tests/dil.test.ts`).
- Earlier: the parameter dialect reached a provider once, and an unsupported
  result schema failed activation once; `tests/tool.test.ts` pins both shapes.
- A model opened a code block with `"""` on a line of its own under the
  component, and the block was dropped. Such a block now attaches to the
  component above it, with a repair note (`tests/dil.test.ts`).

**Known defects.**

- In the `verbose` transcript mode, and when a reader expands a folded turn, a
  card can appear both in its tool row and under the reply. Both copies share one
  state, so they never disagree.
- In the `standard` transcript view, a running turn's tool rows are collapsed, so
  the streaming preview is hidden until the reader expands the step group; the
  card appears under the reply when the turn finishes.
- A tail needs the turn's `turn/start` event in the loaded history window; a turn
  that starts above the window keeps its card in the tool row only.
- An item in `keys.items` or a cell in `table.rows` is read as text, so
  `"Monthly: {monthly}"` interpolates while a bare expression there does not.
- `{fmt(x, 4)}` rounds a tiny value to `0.0000`; `{x}` shows it in exponent form.
  The skill says so, but a model may still choose `fmt`.
- Developing on Windows (Part 3, W4 of `docs/VERIFY.md`: link the toolchain,
  build, run the suite) failed in the maintainer's 2026-10-16 run. The output was
  not recorded, so the failing step is unknown, and no later attempt has been
  made. Using the plugin on any of the three hosts does not depend on it.

**Desktop apps: verified on 0.2.1-rc.2.** The web UI, the macOS app, and the
Windows app draw the same cards from one bundle. On 0.2.1-rc.2, Part 2 of
`docs/VERIFY.md` passed on both apps — the card drew in the row while the turn ran
and under the reply when it finished, controls recomputed with no request, and
past conversations opened with the plugin loaded — and W1, W2, and W3 passed, W3
at 100% and 150% display scaling, the macOS app loading the plugin from the
working checkout as a `link:` and the Windows app installing it from the GitHub
URL.

The earlier desktop run, on 0.2.0-rc.2, drew no card and, with the plugin loaded,
**every past conversation failed to open**. That build is below the engine range
and the plugin now refuses it, so the failure was never shipped; the version skew
is the explanation that fits it, and the 0.2.1-rc.2 pass is what supersedes the
record rather than a fix with a named cause. W4, developing on Windows, has still
not passed.

**Next goal.** Rerun Part 2 of `docs/VERIFY.md` on each new desktop version, and
collect the output of W4 on Windows. Then submit the market entry in
`docs/market/`, which is git-ignored and stays in the working tree.
