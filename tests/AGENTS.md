# AGENTS.md

## 1. Role

The unit, contract, isolation, and packaging suite. The shared layer, the host
check, the tool, and the numeric library are tested directly; the frame runtime
is tested by running the very script the build inlines, inside a jsdom frame;
the browser half is tested through the built bundle, with real React, jsdom, and
Testing Library, activated through its own module-loader registration exactly
as the page activates it. What a reader sees in a real browser and in the
running harness is `docs/VERIFY.md`'s job.

## 2. Constraints

**Test the real contract, not a convenient one.** The browser spec calls
`apply(ctx, undefined)` because that is what cordis does; an earlier spec passed
React as the second argument and hid the defect that kept every card off the
page. React is the real library, never a stub, and the runtime under test is the
one read back out of `lib/client.js` (`helpers.ts`).

**Every spec asserts behaviour, not implementation.** A test names the contract it
pins: what the model is told, what the reader sees, what a frame may and may not
make the page do.

**Each guard gets a passing and a failing case.** A bound is tested at its limit
and one unit past it; a rejected message is tested together with the accepted
one beside it.

**The security boundary is checked mechanically.** `isolation.test.ts` fails when
a file imports what its layer may not (`node:vm` outside `host/check.ts`, any
harness package from the browser half), when the bundle requests anything but
React and its own `client.lib-*.js` files, when the browser half uses timers,
code evaluation, or a way to write markup, when it touches storage outside
`src/client/edits.ts`, when it draws a frame other than the one sandboxed
`<iframe>`, when anything but `widget.tsx` posts to or hears from a frame, when
the frame runtime reaches above its own window, and when a style rule escapes
the `.dsh-iui-` scope or uses a literal colour or radius.

**Shipped files are checked against their pins.** `libs.test.ts` reads every
`lib/client.lib-*.js` and checks each file against `vendor/manifest.json`, the
fonts written in, and the license copies.

**Numbers are pinned to known values.** A math spec states the exact value and
the tolerance it is held to, and every refusal (a divergent integral, a corner)
is pinned as a refusal, not just as "not a crash".

**Packaging is checked as the host reads it.** `manifest.test.ts` evaluates the
version ranges with the harness's own prerelease rule and node-semver's default,
and checks the one browser declaration the web UI loads.

**Documentation is checked mechanically.** `agents-md.test.ts` fails when a folder
has no `AGENTS.md`, when a file lacks the four sections in order, or when a
`Contents` entry names a file that does not exist.

**No test may need the network, a key, a port, or a session.** The bundle specs
need the build first: run `node build.js` before the suite.

## 3. Contents

- `AGENTS.md` — this file: what the suite covers and how a spec is written.
- `helpers.ts` — the repository root, the built bundle, and the text modules
  read back out of it.
- `scan.test.ts` — the DOM-free reader: pieces, unfinished tags, script blocks,
  handlers, addresses, module imports, control ids, and cleaning a source.
- `check.test.ts` — the host check: compiled scripts, modules, and handlers with
  their lines, addresses, sandbox habits, and limits.
- `libs.test.ts` — code-host addresses, matching them to shipped files, the
  shipped files against the manifest, fonts, licenses, and the frame's policy.
- `tool.test.ts` — the tool definition's wire shape, its result schema, the
  description, what the model is told, and what is persisted.
- `bridge.test.ts` — every message a frame may send, checked and bounded, and
  the frame's document.
- `runtime.test.ts` — the frame runtime in jsdom: streaming without running,
  activation order, kept values, forms and markers, room kept for what
  changes (with a stand-in layout), held sliders, theme, scroll inputs, and
  messages.
- `client.test.tsx` — the browser half through its real registration: the frame,
  streaming, sending and links, scrolling over a frame, kept values, revisions,
  the tool row, cards from before the rewrite, Turn data, cards in the reply,
  theme, and libraries.
- `placement.test.ts` — finding the answer's ```widget block for a card on a
  page laid out like the host's chat, and adding and taking back its container.
- `math.test.ts` — the quadrature rule's constants, integrals, derivatives and
  corners, limits, roots, and special functions.
- `skill.test.ts` — the bundled skill: its layout, size, and frontmatter; every
  widget it teaches passing the check; its scripts parsing; and every variable
  and class it names existing.
- `manifest.test.ts` — the packaging contract: the client declaration, the
  skill row's exports, the install-from-git invariants, the storefront
  screenshots, and the version ranges.
- `isolation.test.ts` — the pluggability and security invariants of the root
  `AGENTS.md`.
- `agents-md.test.ts` — the documentation rules this file describes.

## 4. Progress

**Done.**

- The rewrite of 2026-11-17 removed the DIL specs (catalog, grammar,
  expressions, compiler, typesetting, highlighting, SVG reading, limits) and
  added the scan, check, libs, bridge, and runtime specs.
- Every spec runs without the network; the browser and runtime specs run the
  built bundle.
- 2026-11-22: `placement.test.ts`, and the isolation rules that keep the host's
  markup read and added to from one file only.

**Not done.**

- No spec runs a real browser; the headless Chrome checks of `docs/VERIFY.md`
  Part 1 are scripts outside the suite.

**Known defects.**

- jsdom does not lay out, so heights and the morph's visual stability are
  checked only in headless Chrome.

**Next goal.** Move the headless Chrome checks into a script the repository
keeps, so they run without a session's scratch folder.
