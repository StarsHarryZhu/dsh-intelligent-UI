# AGENTS.md

## 1. Role

What every part of the plugin shares about a widget: the plugin's names, what a
widget frame may reach and how large anything may be, the messages between a
frame and the page, the table of libraries the plugin ships, and a reader of
HTML that needs no DOM. The host half reads these to check a widget and to tell
the model what it drew; the browser half reads them to write the frame's
document, to check every message a frame sends, and to clean a source while it
streams; the frame runtime reads them to speak the same protocol.

A widget is the model's own HTML, SVG, CSS, and JavaScript. Nothing here runs
it or builds a document from it: this folder only reads it as text and states
the rules the frame enforces.

## 2. Constraints

**No environment.** Every file compiles under the host's Node types and under the
browser's and the frame's DOM types (`tsconfig.json`, `tsconfig.client.json`,
`tsconfig.frame.json`), so it may use neither: no `node:` import, no `document`,
no `window`. It imports nothing outside this folder.

**`identity.ts` imports nothing.** It holds every name the plugin registers
under, the API version, and the card id pattern, so the halves and the tests
agree on one list.

**One policy, written once.** `policy.ts` is the only place the frame's
`sandbox` tokens (`FRAME_SANDBOX`), its content policy (`framePolicy()`), the
code and font hosts, and every limit are defined. The host warns from it; the
browser writes the frame and checks messages from it. Widening any of them is a
security change and belongs in the root `AGENTS.md`'s security boundary first.

**The reader never throws and never builds a tree.** `scan.ts` lexes tags with
their attributes, the raw text of `script`, `style`, `textarea`, and `title`,
comments, and text; an unfinished tag at the end, as a streaming source has, is
reported as unfinished. Every function returns something for any input.

**The library table and the manifest agree.** `libs.ts` maps a code-host address
to a shipped file by package name, major version (an address without one, or
with `latest`, matches), and a path rule; each library's files and pins live in
`vendor/manifest.json`, and `tests/libs.test.ts` checks that every rule names a
file the manifest ships and every manifest library has a table entry with the
same title. An address the table does not answer loads from its code host.

**The protocol is closed.** `messages.ts` lists every message each way; both
sides mark them with `CHANNEL`, and the page reads what a frame sends only
through `client/bridge.ts`.

**API version.** The persisted meta envelope carries `version: API_VERSION`
(2). Version 1 was the DIL program, which the browser now shows as its text
only (`LEGACY_API_VERSION`). The release version is the maintainer's and is
independent of it.

## 3. Contents

- `AGENTS.md` — this file: what the shared layer holds and the rules it keeps.
- `identity.ts` — the plugin id, the tool name, the slot names, the card node
  kind, the Turn data key, the API versions, and the card id pattern.
- `policy.ts` — the code and font hosts, the frame's sandbox tokens and content
  policy, the address check, and every limit.
- `messages.ts` — the messages between a frame and the page, both ways.
- `libs.ts` — the shipped libraries, reading a code-host address, and matching
  it to a shipped file.
- `normalize.ts` — cleaning a source into the fragment the frame shows: fences,
  doctype, and document tags removed.
- `scan.ts` — the DOM-free reader: pieces, script blocks, inline handlers,
  addresses, module imports, control ids, prompt texts, and visible text.

## 4. Progress

**Done.**

- The rewrite of 2026-11-17 replaced the DIL language layer (catalog, grammar,
  expressions, compiler, typesetting) with this folder; `identity.ts` moved here
  from `lang/`, and the numeric routines moved to `src/frame/math.ts`.
- Fifteen shipped libraries, each matched from cdnjs, jsDelivr, unpkg, and,
  where it has a module build, esm.sh (`tests/libs.test.ts`).
- The reader handles unfinished tags, raw-text elements, entities, and import
  maps, and finds bare module imports through the widget's import map
  (`tests/scan.test.ts`).

**Not done.**

- jsDelivr's `gh/` and `combine/` addresses are loaded from the host, never
  from a shipped copy.

**Known defects.**

- A library loaded by a script at run time (an address built from strings, or a
  dynamic `import()` of a variable) is not seen by the reader, so it loads from
  its code host even when a shipped copy exists.

**Next goal.** Add a shipped library only when live use shows models reaching
for it, with its license checked first.
