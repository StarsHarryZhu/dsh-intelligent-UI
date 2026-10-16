# AGENTS.md

## 1. Role

Intelligent UI for DeepSeek Harness: a **fully plugin-based** take on ChatGPT's
Intelligent UI architecture. The model writes a small, catalogued interface
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

How it fits the host: the host half registers one tool, `ui_render`, which
compiles the model's source and persists the compiled program as the tool
result's presentation metadata, and one skill, `dsh-intelligent-ui`, which
teaches the model when and how to use the tool. The browser half draws the
program in two places — in the tool row while the turn runs (with a live preview
while the arguments stream), and under the reply once the turn has finished,
because a finished turn folds its tool rows away. The same browser bundle serves
the web UI and both desktop apps, which wrap the same web client.

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
`ui_render`, and, where the host composes a skill registry, one skill,
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

**One bundle for every platform.** `dsh.client.platform` is `"web"`, the only
value the module registry serves; the macOS and Windows desktop apps load that
same declaration. Nothing in either half branches on the operating system. The
package installs from a git checkout without a build step, so `lib/` is committed,
no install-time script exists, line endings are pinned by `.gitattributes`, and
the repository holds no symbolic link.

**No literal styling.** Every colour, radius, and font in `src/client/styles.css`
comes from a host theme token, every selector is scoped under a `.dsh-iui-` class,
and layout spacing is whole steps of 4px. Inside a typeset formula, spacing is in
em, as mathematical spacing must scale with the formula.

**Every registration is an effect.** Use the disposer a service's `register()`
returns, inside `ctx.effect`. Unloading the plugin must remove every contribution.

**Failures stay inside the card.** A malformed program, a newer program format, an
unexpected host prop, or a client-side defect degrades that one card to readable
text or to nothing. The surrounding transcript is not this plugin's to break.

**Naming.** `name` in `package.json` is the cordis row id, the client module id,
the skill name, and the `__ModuleLoader__.load({ id })` key: one string,
`dsh-intelligent-ui`, defined once in `src/lang/identity.ts`. The tool name is the
slot key.

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
  dependencies, test output, logs, local assistant memory, and editor and OS
  noise. `lib/` is deliberately kept, because it is the published artifact and no
  install step regenerates it.
- `.gitattributes` — LF line endings in every checkout, Windows included.
- `package.json` — the bundle manifest: entry points, the `dsh.bundle.patch` row,
  the `dsh.client` browser declaration, the supported harness range in
  `engines.dsh`, and the published file list.
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
- `screenshots.json` — the storefront screenshot list, read from the repository
  by plugin markets.
- `locale/zh.json`, `locale/en.json` — the display metadata the Plugin Manager
  reads (`meta.title`, `meta.description`).
- `icon.svg` — the plugin's icon, exported under `./icon`.
- `LICENSE` — the MIT license text.
- `lib/` — generated host and browser artifacts. Never edited by hand.
- `src/` — all source. See `src/AGENTS.md`.
- `skills/` — the bundled skill that teaches the model to use `ui_render`. See
  `skills/AGENTS.md`.
- `assets/` — the screenshots `screenshots.json` and the README show. See
  `assets/AGENTS.md`.
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
- The skill `dsh-intelligent-ui` (`skills/`) registers where the host has a skill
  registry; every program it teaches compiles without a repair
  (`tests/skill.test.ts`).
- The browser half registers through `apply(ctx)` alone and the build proves it
  on every run; the bundle is tested with real React 18.3.1, jsdom, and Testing
  Library through its own `__ModuleLoader__` registration (`tests/client.test.tsx`).
- Programs persisted by earlier builds (formats 1 and 2) still render; a newer
  format is shown as text; an unknown component is skipped and counted.
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
- **Live verification on the macOS desktop app, 2026-10-16**, DeepSeek Harness
  0.2.0-rc.2 (the app bundle) with DeepSeek-Flash, against Part 2 of
  `docs/VERIFY.md`, run by the app's own agent:
  - installed from the working checkout as a `link:` dependency, the way the
    Plugin Manager's switch writes it, and accepted by the engine range;
  - it activated without an app restart: `ui_render` joined the agent's tools,
    the live `tool.call.toolview` slot took one occupant keyed `ui_render` and
    `conversation.chat.turnTail` one entry `dsh-intelligent-ui`, and the skill
    loaded;
  - every card program compiled and its result carried the figures the web run
    recorded (-0.242631 at degree 3, -3.64234e-10 at degree 15), a deliberately
    malformed program reported its diagnostic instead of drawing, and a disable
    and re-enable cycle removed and restored every registration while the page
    stayed up;
  - a settled card's compiled program was in the host's own `meta` field on its
    ordinary `tool/result` event, and no session line held a plugin-owned event
    type, so a reload loses nothing and an uninstall cannot strand a session.
  - **the drawing failed.** Eight cards were written and none appeared in the
    app's page, checked twice, although every registration was live. The app
    bundle ships DeepSeek Harness 0.2.0-rc.2 while the browser half is built and
    verified against 0.2.1-alpha.4, and the declared engine range admits both, so
    that skew is the first thing to rule out; the cause was not established.

**Not done.**

- **Desktop card display.** The macOS run recorded above proved installation,
  activation, compilation, persistence, and the log invariants, and failed the
  one thing the plugin exists for: no card was drawn in the app's page. Until
  that is fixed, the drawing half of D3 and of steps 4, 5, 6, and 8 fails, and
  the desktop apps cannot be called verified.
- **Desktop verification, the interactive half.** The run above also leaves the
  steps that need a person at the page (the console expressions of step 2, the
  streaming preview and folded row of D3, the drag and network panel of step 5,
  the clipboard and click of step 8, all of step 10, and the disable-and-restart
  half of step 12) and the whole of Part 3 unrun.
- **Infinite series.** `sum` and `prod` take finite bounds only.
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
- A copy fallback announced "copied" even when the page refused the clipboard.
  It now shows the text to copy instead (`tests/client.test.tsx`).
- A spaced expression in a bare prop value was cut at its first space. Bare values
  now keep bracketed spaces and rejoin operator-led pieces (`tests/dil.test.ts`).
- Earlier: the parameter dialect reached a provider once, and an unsupported
  result schema failed activation once; `tests/tool.test.ts` pins both shapes.

**Known defects.**

- The macOS desktop app (0.2.0-rc.2) drew none of the eight cards a 2026-10-16
  run wrote, although `ui_render`, the `tool.call.toolview` cell, the
  `conversation.chat.turnTail` entry, and the skill were all live and the
  programs were persisted. The registration failure the symptom fits — the
  turn-data Definition — is swallowed into the console by design, so the page's
  console is where to look next. Cause not established.

- In the `verbose` transcript mode, and when a reader expands a folded turn, a
  card can appear both in its tool row and under the reply. Both copies share one
  state, so they never disagree.
- On the desktop apps' default `standard` transcript view, a running turn's tool
  rows are collapsed, so the streaming preview is hidden until the reader expands
  the step group; the card appears under the reply when the turn finishes.
- A tail needs the turn's `turn/start` event in the loaded history window; a turn
  that starts above the window keeps its card in the tool row only.
- An item in `keys.items` or a cell in `table.rows` is read as text, so
  `"Monthly: {monthly}"` interpolates while a bare expression there does not.
- `{fmt(x, 4)}` rounds a tiny value to `0.0000`; `{x}` shows it in exponent form.
  The skill says so, but a model may still choose `fmt`.

**Next goal.** Finish the desktop section of `docs/VERIFY.md`: the interactive
steps on macOS, then the whole of Part 3 on Windows, each appended to the recorded
runs.
