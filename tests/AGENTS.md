# AGENTS.md

## 1. Role

The unit, contract, isolation, and packaging suite. The language layer and the host tool are
tested directly; the browser half is tested through the built bundle, with real
React, jsdom, and Testing Library, activated through its own module-loader
registration exactly as the page activates it. The one thing the suite cannot
prove is what a reader sees in the running harness, which is `docs/VERIFY.md`'s
job.

## 2. Constraints

**Test the real contract, not a convenient one.** The browser spec calls
`apply(ctx, undefined)` because that is what cordis does; an earlier spec passed
React as the second argument and hid the defect that kept every card off the page.
React is the real library, never a stub.

**Every spec asserts behaviour, not implementation.** A test names the contract it
pins — what the model sees, what the reader sees, what a rejected program reports.

**Each guard gets a passing and a failing case.** A bound is tested at its limit
and one unit past it; a rejection is tested together with what must still work
around it.

**No snapshot of a whole program.** A program is asserted field by field.

**Fixtures are inline.** Worked examples and the one card persisted before the
version fields are written out in the spec that uses them.

**Pluggability is checked mechanically.** `isolation.test.ts` fails when a source
file imports a harness package it may not, when the bundle requests anything but
React, when the browser half uses the network, timers, storage, or code
evaluation, when the host registers anything beyond its tool and its skill, and
when a style rule escapes the `.dsh-iui-` scope or uses a literal colour or
radius.

**Numbers are pinned to known values.** A math spec states the exact value and
the tolerance it is held to, and every refusal (a divergent integral, a missing
derivative) is pinned as a refusal, not just as "not a crash".

**Packaging is checked as the host reads it.** `manifest.test.ts` evaluates the
version ranges with the harness's own prerelease rule and node-semver's default,
and checks the one browser declaration the web UI loads.

**Documentation is checked mechanically.** `agents-md.test.ts` fails when a folder
has no `AGENTS.md`, when a file lacks the four sections in order, or when a
`Contents` entry names a file that does not exist.

**No test may need the network, a key, a port, or a session.** The browser spec
needs the build first: run `node build.js` before the suite.

## 3. Contents

- `AGENTS.md` — this file: what the suite covers and how a spec is written.
- `expr.test.ts` — expression typing and evaluation, totality, text equality,
  the `concat` restrictions, and `pick`.
- `infix.test.ts` — the readable expression syntax: precedence, logic, ternaries,
  quoted text, named functions, and rejections.
- `text.test.ts` — `{…}` interpolation, escapes, rejected interpolations, and
  hoisted-text rendering.
- `dil.test.ts` — the line grammar: indentation nesting, flat lines, the refused
  old forms, primary text, quoting, declarations, comments, fences, and streaming.
- `compile.test.ts` — both grammars end to end, interpolation in lists and
  tables, choices, every repair the compiler makes, what still fails, real model
  sources, content safety, streaming compiles, the program version, and the
  animation props.
- `limits.test.ts` — each bound at its limit and one past it, and bounded JSON
  recovery.
- `catalog.test.ts` — the catalog and the render registry in both directions,
  each descriptor's internal consistency, and the version every field records.
- `tool.test.ts` — the tool definition's wire shape, its result schema, what the
  model is told, and the persisted metadata.
- `client.test.tsx` — the browser half through its real registration: the row's
  stages, buttons, the turn data Definition, the tail, shared edits, the player,
  and every degradation path.
- `math.test.ts` — the quadrature rule's constants, integrals, derivatives,
  limits, sums, products, roots, Taylor polynomials, special functions,
  precedence, the work budget, and number display, each against known values.
- `skill.test.ts` — the bundled skill: frontmatter, size, references, every
  program it teaches compiling cleanly, and Windows line endings.
- `manifest.test.ts` — the packaging contract: the client declaration, no
  install-time script, published files, no symbolic links, LF line endings, the
  claimed harness versions (from 0.2.1-alpha.1, refusing the 0.2.0-rc.2 desktop
  app), and the screenshot list.
- `isolation.test.ts` — the pluggability invariants of the root `AGENTS.md`.
- `agents-md.test.ts` — the documentation rules this file describes.

## 4. Progress

**Done.**

- Fourteen specs cover the language layer, the math engine, the host tool and
  skill, the browser half, the pluggability and packaging invariants, and the
  documentation rules; `node build.js && node node_modules/vitest/vitest.mjs run`
  runs them all.
- The browser spec found two defects before any live run: a turn-tail snapshot
  that looped when the host offered no observable source, and a card whose own
  render error escaped its boundary. Both are fixed and pinned.

**Not done.**

- **No recorded-session replay.** The suite does not assemble a transcript from a
  real session log; the live checklist covers that.
- **No visual check.** Theme tokens are asserted, not looked at.

**Known defects.**

- The browser spec reads `lib/client.js`, so it fails on a stale build rather
  than compiling the browser half itself.

**Next goal.** Add a replay spec that feeds a recorded session's events through
the turn data Definition and renders the resulting tail.
