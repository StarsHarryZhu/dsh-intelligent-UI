# AGENTS.md

## 1. Role

Intelligent UI for DeepSeek Harness: interactive widgets in the chat, as Claude
and ChatGPT draw them, **fully plugin-based**. Its Chinese name, which the Plugin
Manager shows from `locale/zh.json` and `README-zh.md` uses as its title, means
"progressive interaction". The model writes a widget in HTML, SVG, CSS, and
JavaScript; the chat runs it in a sandboxed frame inside the reply, where the
model called the tool, styled like the host in both themes; every control
recomputes in the browser with **zero model calls**, and a click can send the
reader's next message.

A reply can carry anything a small web page can do: an estimate the reader
adjusts, a chart, a diagram the reader clicks, a typeset formula with a live
plot, a simulation, an animation stepped through, a quiz or a form whose answers
go back to the model, a small game. Fifteen common libraries ship with the
plugin and load offline; anything else loads from four allowlisted CDNs.

Why it exists: answering "what does this cost if…" or "how does this algorithm
work" with a paragraph forces the reader to ask again for every variation. A
widget keeps the answer and the exploration in one place without spending a
request per variation, and a button or a form turns a choice into the next
message without retyping it.

How it fits the host: the bundle mounts two rows. The tool row registers one
tool, `ui_render`, which checks the model's source — every script compiled for
its syntax, never run — and persists it as the tool result's presentation
metadata; the skill row registers one skill, `dsh-intelligent-ui`, which teaches
the model when and how to draw. The browser half draws each widget in the reply
as a Chat node of its own, outside the process a finished turn folds, so it sits
between the text written before the call and the text written after it, growing
as the arguments stream. It supports DeepSeek Harness 0.2.1-rc.1 and later within
0.2.x on all three hosts it serves — the web UI, the macOS desktop app, and the
Windows desktop app — through one `dsh.client` declaration, because the desktop
apps wrap the same web client.

## 2. Constraints

These apply to every file in this repository and every change to it.

**Zero intrusion (the project's hard requirement).** Nothing here may modify the
DeepSeek Harness checkout: no change to `packages/`, `apps/`, `docs/`, or any
tracked file, no pnpm workspace membership, no tsconfig aggregate entry.
`git -C deepseek-harness status --porcelain` stays empty. The plugin reaches the
host only through the published plugin contract: services on its context, slot
registrations, the module table's `react` and `react-dom`, and the module
loader's lazy files.

**Zero new session data.** No new session event type, ever, and no direct writes
to a session log. A widget's message is an ordinary user message sent through the
session's own composer. Whatever reaches the model is reconstructable from
events the host already defines, which is what makes "uninstall the plugin and
every session still opens" true.

**Registered surface, exactly, all under this plugin's own names.** Host: two
bundle rows, `dsh-intelligent-ui` with one tool, `ui_render`, and
`dsh-intelligent-ui-skill` with one skill provider listing one skill,
`dsh-intelligent-ui`. Browser: one keyed `tool.call.toolview` cell under
`ui_render`; one keyed `conversation.chat.node` cell under
`dsh-intelligent-ui.card` with the Conversation Definition of that kind that
builds its nodes, one per `ui_render` call, registered and removed together; one
data-only Conversation Definition of kind `dsh-intelligent-ui`; one dictionary
namespace; and one `<style data-plugin="dsh-intelligent-ui">`. No store, no
settings namespace, no replacement of a shipped cell, no agent-loop change, no
assistant renderer.

**The answer's text is read, never rewritten.** To stand a widget inside the
answer, the browser half reads three hooks the host renders: a code block's
`.md-code-block` root and `[data-code-block-content]` body, and each chat row's
`data-chat-turn`. On a ```widget block whose only line is a card id, in that
card's turn and after its row, it sets one attribute (`data-dsh-iui-placed`,
which its stylesheet hides) and adds one container right after the block, and
takes both back when the card or the block goes. It never removes, moves, or
edits a host node. All of it lives in `src/client/placement.ts`
(`tests/isolation.test.ts`). Where a hook is missing, the block stays an
ordinary code block and the widget stays where it was called.

**The security boundary.** The model's code runs only inside a widget frame, and
the page treats the frame as hostile. `tests/isolation.test.ts` enforces each
rule that can be checked in code.
1. One kind of frame: an `<iframe>` with `sandbox="allow-scripts allow-forms"`
   (`FRAME_SANDBOX`) — no same origin, top navigation, popups, modals, or
   downloads; forms only so `submit` events fire — an empty `allow`, and no
   referrer.
2. The frame's own document carries a content policy (`framePolicy()`):
   `default-src 'none'`; scripts, styles, fonts, images, and requests only
   inline, from `blob:` and `data:`, and from cdnjs, jsDelivr, unpkg, esm.sh,
   and Google Fonts; `frame-src`, `object-src`, `form-action`, and `base-uri`
   `'none'`.
3. The page never writes the model's markup and never runs its code: no
   `innerHTML` and no `dangerouslySetInnerHTML` outside `src/frame/`, no
   evaluation, no timers; the widget reaches the frame by `postMessage` only.
4. The frame receives only the widget's source, the theme, the language, the
   shipped libraries it names, and what that card itself kept: never a token, a
   session id, or another card's data.
5. Every message from a frame is checked against its shape and the limits in
   `src/widget/policy.ts`. A message to send or a link to open (http or https
   only) goes out only right after the reader clicked inside that frame, at most
   once a second; kept values are bounded JSON; heights are clamped; errors are
   cut short. A scroll the reader starts inside a frame (wheel, touch, or a
   scrolling key while the frame has the focus) is repeated on the frame element
   as a non-bubbling event, at most once per 50 ms for each kind, so the chat
   does not take back a scroll the frame passes on to it.
6. A frame that fires `load` a second time has navigated away and is removed.
7. Kept values are stored and handed back to the same frame; the page never
   interprets them.
Widening any of these is a security change: argue it here first.

**The host half never runs the model's code.** `src/host/check.ts` compiles
scripts with `node:vm`'s `new Script`, which parses without executing, and is
the only file that imports `node:vm`.

**The browser half imports nothing from the harness.** Only `react`,
`react/jsx-runtime`, and `react-dom` (its `createPortal`, in the reply card
only) leave the bundle, plus `require.async` of this package's own
`client.lib-*.js` files; the build fails on any other request. Host components
are matched by copying their look into this plugin's own stylesheets, never by
requiring a harness client package.

**`apply` takes the context only.** Cordis calls `apply(ctx, config)`, and a page
entry's config is `undefined`; React comes from `require('react')`. Every browser
contribution is registered inside its own `try`/`catch`, because a throw from
`apply` marks the whole page's boot as failed.

**Shipped libraries are pinned and licensed.** Each is listed in
`vendor/manifest.json` with an exact version, a SHA-256 per file, and a license
that allows redistribution, whose text ships in `lib/licenses/`. The build
refuses a file that does not match.

**Three platforms, one registration.** The plugin must work on the web UI, the
macOS desktop app, and the Windows desktop app. `dsh.client.platform` is `"web"`
— the only value the module registry serves — and that one declaration is also
what both desktop apps load. `engines.dsh` is `>=0.2.1-rc.1 <0.3.0-0`, the range
the host enforces. Nothing branches on the operating system. The package
installs from a git checkout without a build step, so `lib/` is committed, no
install-time script exists, line endings are pinned by `.gitattributes`, and the
repository holds no symbolic link.

**No literal styling in the chrome.** Every colour, radius, and font in
`src/client/styles.css` comes from a host theme token, every selector is scoped
under a `.dsh-iui-` class, and layout spacing is whole steps of 4px. Inside the
frame, `src/frame/base.css` maps the same tokens to short variables and carries
the palette for the model's drawings.

**Every registration is an effect.** Use the disposer a service's `register()`
returns, inside `ctx.effect`. Unloading the plugin must remove every contribution.

**Failures stay inside the widget.** Malformed meta, meta of another version, an
unexpected host prop, a widget that throws, or a client-side defect degrades
that one widget to a note, its text, or nothing. The surrounding transcript is
not this plugin's to break.

**One API version.** The persisted meta carries a `version` field set to
`API_VERSION` (`src/widget/identity.ts`), currently 2: the widget's source.
Version 1 was a DIL program; a card of version 1, or one without the field,
shows the text version it carried. The release version in `package.json` and the
git tags is the maintainer's, and is independent of the API version.

**Naming.** `name` in `package.json` is the cordis row id, the client module id,
the skill name, and the `__ModuleLoader__.load({ id })` key: one string,
`dsh-intelligent-ui`, defined once in `src/widget/identity.ts`. The tool name is
the slot key.

**Every folder documents itself.** Each directory holds an `AGENTS.md` with exactly
the four sections of this file, in order, in English. The `Contents` list names
the files that actually exist; `tests/agents-md.test.ts` enforces both rules.

**Release tags are short and bilingual.** An annotated tag's message starts with
the tag name alone on its first line — GitHub shows that line as the release
title — then one blank line. After it come two versions of the same items, the
Chinese one first and then the English one. Each version has two parts, Added
and Fixed, with one short phrase or sentence per item, and nothing else: no scope
notes, no other prose. A release that fixes nothing leaves Fixed out rather than
writing an empty section or inventing a fix. The English half reads `English version:`, then
`Added:` and `Fixed:`, each followed by `- ` items; the Chinese half has the same
shape with Chinese labels.

**Build and test.** `node scripts/link-dev.mjs` links the toolchain from the
sibling harness checkout, and `node scripts/vendor.mjs` downloads and checks the
pinned libraries into `vendor/cache/`. `node build.js` is the only build command
and ends with a self-check that loads every library file and activates the
bundle the way cordis does. `node build.js && node node_modules/vitest/vitest.mjs
run` is the full check. `lib/` is generated: edit `src/`, never `lib/`.

## 3. Contents

- `AGENTS.md` — this file: the project introduction and the rules for the tree.
- `.gitignore` — what git must not carry: the transpile scratch directories, the
  library downloads in `vendor/cache/`, dependencies, test output, logs, local
  assistant memory, the unpublished market submission in `docs/market/`, and
  editor and OS noise. `lib/` is deliberately kept, because it is the published
  artifact and no install step regenerates it.
- `.gitattributes` — LF line endings in every checkout, Windows included.
- `package.json` — the bundle manifest: entry points, the `dsh.bundle.patch` row,
  the `dsh.client` browser declaration, the supported harness range in
  `engines.dsh`, and the published file list.
- `cordis.patch.yml` — the bundle's own patch layer, which inserts this package's
  two rows into a profile: the tool row and the skill row.
- `build.js` — the build: type-check, emit the host half, bundle the frame
  runtime, compile and wrap the browser half, write the shipped library files,
  and self-check. See its JSDoc for the exact steps.
- `tsconfig.json` — the host-half type check (no DOM types).
- `tsconfig.build.json` — the host-half emit (`src` → `lib`).
- `tsconfig.client.json` — the browser-half compile (`src` → `.client-build`, no
  Node types).
- `tsconfig.frame.json` — the frame-runtime compile (`src` → `.frame-build`, no
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
- `lib/` — generated host and browser artifacts, the shipped library files, and
  their licenses. Never edited by hand.
- `src/` — all source. See `src/AGENTS.md`.
- `vendor/` — the pins of the shipped libraries. See `vendor/AGENTS.md`.
- `skills/` — the bundled skill that teaches the model to use `ui_render`, in the
  `skills/<name>/SKILL.md` layout. See `skills/AGENTS.md`.
- `assets/` — the screenshots `screenshots.json` and the README show. See
  `assets/AGENTS.md`.
- `tests/` — the unit, contract, isolation, and packaging suite. See
  `tests/AGENTS.md`.
- `docs/` — the architecture write-up, the live verification checklist, and the
  market submission. See `docs/AGENTS.md`.
- `scripts/` — the toolchain linker and the library downloader. See
  `scripts/AGENTS.md`.

## 4. Progress

**Done.**

- **The rewrite of 2026-11-17.** The DIL engine — a declarative language over a
  catalog of 36 components, compiled on the host and drawn by React — was
  replaced by a sandboxed engine that runs the model's own HTML, SVG, CSS, and
  JavaScript, to reach what Claude's and ChatGPT's interactive answers can do.
  What the plugin had built on the harness carried over: the widget stands in
  the reply where it was called, streams as it is written, keeps what the
  reader set across reloads, and is revised with `revises`, folding the earlier
  one away.
- The host check: scripts, modules, and inline handlers compiled for their
  syntax with their source lines; blocked addresses, shipped libraries, and
  habits the sandbox defeats reported (`tests/check.test.ts`). The description
  fell from 9978 characters to under 4000 (`tests/tool.test.ts`).
- The frame: one fixed document per widget, fed by message; streaming without
  running, then activation in document order; the theme as variables and a base
  stylesheet; `sendPrompt`, `openLink`, `dsh.state`, `dsh.math`, `data-prompt`,
  and `data-send`; kept control values (`tests/runtime.test.ts`,
  `tests/client.test.tsx`).
- The boundary: the sandbox, the content policy, the checked bridge, the
  click requirement, and navigation removal (`tests/bridge.test.ts`,
  `tests/isolation.test.ts`).
- Fifteen shipped libraries, pinned and checked, loaded lazily and offline
  (`tests/libs.test.ts`).
- Scrolling over a widget, fixed 2026-11-17: input inside a frame never reaches
  the page, so while the chat kept a reading anchor (after a turn jump or
  loading earlier turns) it undid every scroll started over a widget. The frame
  now names the reader's wheel, touch, and scrolling keys, and the page repeats
  them on the frame element (`tests/client.test.tsx`, `docs/VERIFY.md` step 14).
- Widgets inside the answer, 2026-11-22: models tend to call every tool first
  and write the answer last, so widgets gathered above the text. A widget now
  stands wherever the answer writes a ```widget block holding its card id; the
  result hands the model that block (`tests/placement.test.ts`,
  `tests/client.test.tsx`, `docs/VERIFY.md` step 4).
- The skill, rewritten: seven files, thirteen complete widgets, every one
  passing the check (`tests/skill.test.ts`).
- Checked in headless Chrome on the built bundle (`docs/VERIFY.md`, recorded
  runs): every skill widget ran with no error in both themes with the network
  refused, and the sandbox probes behaved as written.
- A live run on the macOS desktop app, 2026-11-17 (0.2.2-rc.1): a model wrote a
  compound-interest widget, the check passed, the widget drew in the reply with
  its shipped Chart.js copy loaded offline, and its `data-prompt` button sent
  the next message as an ordinary user turn.
- A live run on the macOS desktop app, 2026-11-22 (0.2.2-rc.3): an answer wrote
  three widgets, each in a ```widget block after the paragraph about it, and
  redrew four of them with `revises`; each widget stood at its block, the blocks
  were hidden, and the calls left no row of height (`docs/VERIFY.md` step 4).
- Unchanged from before: the pluggability and packaging invariants
  (`tests/isolation.test.ts`, `tests/manifest.test.ts`), and the harness
  checkout is unchanged.

**Not done.**

- **The rest of the live checklist.** Steps 5 to 13 of `docs/VERIFY.md` have at
  most one live pass each, and step 4's first prompt has none: streaming, the
  form, runtime errors, reload, and themes still need a full run, and the
  description and skill need tuning from it.
- **The web UI and the Windows desktop app** have not loaded this build; macOS
  has, by `link:` to the checkout.
- **Native components, image search, entity cards, and attachments**, which
  ChatGPT offers through services the harness does not give plugins.
- **Sibling plugins** that teach DIL need their prompts updated: the
  `/ddl` checklist of the assistant mode plugin and the course-review mode's
  notes on `canvas` and `shape`.

**Known defects.**

- A widget's script can loop forever, and nothing in the page can stop it;
  whether it freezes the page as well depends on the browser's process model.
- A frame can navigate itself to an outside address; the request leaves before
  the frame is removed. It can carry only what the widget already showed.
- A widget is several times the output of a DIL card, so it takes longer to
  write.
- The model reads a summary of its widget, not a picture of it; a layout that
  looks wrong reaches it only when the reader says so.
- Developing on Windows (W4 of `docs/VERIFY.md`) failed on 2026-10-16 with its
  output lost, and has not been retried.

**Next goal.** Run `docs/VERIFY.md` Part 1 with a real model in the web UI, then
Part 2 on the macOS desktop app, and fix what they find before a release.
