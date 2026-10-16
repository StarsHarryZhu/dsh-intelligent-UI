# AGENTS.md

## 1. Role

Development helpers that are not part of the build. The only one links the
toolchain — the TypeScript compiler, the test runner, React, jsdom, Testing
Library, and the harness's own type packages — from the sibling DeepSeek Harness
checkout into this package's `node_modules`, so development needs no network and
no second copy of anything the host already ships.

## 2. Constraints

**Write only inside this package.** The linker creates symlinks in this package's
`node_modules` and nowhere else; the harness checkout is read, never changed.

**Never replace a real directory.** An existing symlink is repointed when stale; a
real directory is kept and reported.

**No network.** Every package is resolved from the checkout the way Node would
resolve it from one of the checkout's own packages.

**Runnable as written.** `node scripts/link-dev.mjs`, with `DSH_CHECKOUT` set when
the checkout is not the `deepseek-harness` directory beside `my_plugins`.

## 3. Contents

- `AGENTS.md` — this file: what the helpers may do.
- `link-dev.mjs` — the toolchain linker.

## 4. Progress

**Done.**

- Links TypeScript 6, vitest 4, React 18.3.1, react-dom, their types, jsdom,
  Testing Library, `@deepseek-ai/cordis`, and `@deepseek-ai/dsh-tools`, and
  reports each link it made, kept, or moved.

**Not done.**

- No check that the linked versions match `devDependencies`; the checkout's
  versions are authoritative.

**Known defects.**

- A checkout that has not installed its own dependencies resolves nothing; run
  `pnpm install` there first.

**Next goal.** Warn when a linked package's version drifts from the range in
`package.json`.
