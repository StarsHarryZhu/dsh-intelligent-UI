# AGENTS.md

## 1. Role

The pins of the third-party libraries this plugin ships. A widget names a
library by its code-host address, as it would on any page; when the plugin ships
that library and major version, the frame loads the shipped copy instead, so the
widget works offline and reaches no outside host. `manifest.json` records, for
each library, the package, the exact version, the license, and every file the
plugin ships, each with its SHA-256. `scripts/vendor.mjs` downloads those files
into `cache/`, checking each digest, and `build.js` turns them into the
committed `lib/client.lib-<id>.js` files and the license copies in
`lib/licenses/`.

## 2. Constraints

**Pinned, never floating.** Every library names one exact version, and every
file a digest. A file that does not match stops `scripts/vendor.mjs` and the
build; nothing is ever replaced silently. `--pin` only fills in a digest that is
missing, never changes one.

**Only what may be redistributed.** A library enters only under a license that
allows it (MIT, BSD, ISC, Apache-2.0), with its license file listed (`"license":
true`) so the build copies it. Libraries whose license forbids it (GSAP, p5) or
that are too large (Plotly) stay on their code hosts.

**Runs offline once loaded.** A shipped library must work without a network: one
browser build, with fonts written into its stylesheet as data addresses
(`"font": true`), or collapsed into one `@font-face` (`fontFace`) where the
upstream stylesheet lists many formats.

**The cache is not the source.** `cache/` is ignored by git and may be deleted at
any time; `node scripts/vendor.mjs` restores it from the pins.

**The table agrees.** Every library here has an entry with the same title in
`src/widget/libs.ts`, whose path rules name only files listed here
(`tests/libs.test.ts`).

## 3. Contents

- `AGENTS.md` — this file: what the pins are and how they are kept.
- `manifest.json` — the fifteen shipped libraries: package, version, license,
  files, digests, and font handling.
- `cache/` — the downloaded files, ignored by git.

## 4. Progress

**Done.**

- Fifteen libraries pinned on 2026-11-17: Chart.js 4, ECharts 5, D3 7,
  topojson-client 3, KaTeX 0.16 with its fonts, Three.js r128 and 0.160,
  highlight.js 11, marked 12, Mermaid 11, math.js 14, Tabler Icons 3,
  Matter.js 0.20, Tone.js 14, and anime.js 3. Together they add about 9 MB to
  `lib/`, fetched only when a widget names one.

**Not done.**

- No update path beyond editing a version and running `--pin`; nothing reports
  that a newer release exists.

**Known defects.**

- A few shipped copies also answer the major before them, whose API they keep
  for what models write: Mermaid 11 for 10, math.js 14 for 12 and 13, Tabler
  Icons 3 for 2, and Matter.js 0.20 for 0.19. A widget relying on something the
  newer release removed would break.

**Next goal.** Review the versions when a major release of a shipped library
changes what models write.
