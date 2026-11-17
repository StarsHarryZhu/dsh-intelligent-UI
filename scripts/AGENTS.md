# AGENTS.md

## 1. Role

Development helpers that run before the build. `link-dev.mjs` links the
toolchain — the TypeScript compiler, the test runner, React, jsdom, Testing
Library, and the harness's own type packages — from the sibling DeepSeek Harness
checkout into this package's `node_modules`, so development needs no second copy
of anything the host already ships. `vendor.mjs` downloads the libraries
`vendor/manifest.json` pins into `vendor/cache/` and checks every file against
its digest, so the build can write the shipped library files.

## 2. Constraints

**Write only inside this package.** The linker creates links in this package's
`node_modules` and nowhere else, and the vendor script writes only
`vendor/cache/` and, with `--pin`, missing digests in `vendor/manifest.json`; the harness checkout is read, never changed. On
Windows the links are directory junctions, which need neither Developer Mode nor
an administrator; elsewhere they are directory symlinks.

**Never replace a real directory.** An existing symlink is repointed when stale; a
real directory is kept and reported.

**Network only for pinned downloads.** The linker resolves every package from the
checkout the way Node would resolve it from one of the checkout's own packages,
with no network. The vendor script downloads only the files the manifest lists,
from jsDelivr, never runs them, and stops at the first digest that does not
match; a file already in the cache is checked, not downloaded again.

**Runnable as written.** `node scripts/link-dev.mjs`, with `DSH_CHECKOUT` set when
the checkout is not the `deepseek-harness` directory beside `my_plugins`; then
`node scripts/vendor.mjs` once per fresh clone, or after a pin changes.

## 3. Contents

- `AGENTS.md` — this file: what the helpers may do.
- `link-dev.mjs` — the toolchain linker.
- `vendor.mjs` — the shipped-library downloader and digest check.

## 4. Progress

**Done.**

- Links TypeScript 6, vitest 4, React 18.3.1, react-dom, their types, jsdom,
  Testing Library, `@deepseek-ai/cordis`, and `@deepseek-ai/dsh-tools`, and
  reports each link it made, kept, or moved.
- `vendor.mjs` (2026-11-17) downloads and checks the fifteen pinned libraries;
  `--pin` records a digest that is missing.

**Not done.**

- No check that the linked versions match `devDependencies`; the checkout's
  versions are authoritative.

**Known defects.**

- A checkout that has not installed its own dependencies resolves nothing; run
  `pnpm install` there first.

**Next goal.** Warn when a linked package's version drifts from the range in
`package.json`.
