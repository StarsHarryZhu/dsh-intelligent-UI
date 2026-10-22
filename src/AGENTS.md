# AGENTS.md

## 1. Role

All source for both halves of the plugin. `index.ts` and `skill.ts` are the two
Node entries the cordis loader imports, one per bundle row: the tool row and the
skill row; `host/` is the compiler side that runs in the harness process, with
the tool and the skill provider; `client/` is the renderer side that
runs in the browser; `lang/` is the part both halves share, including the math
engine.

The split exists because the two halves are compiled differently and trust
different inputs. The host half trusts its own types and validates the model's
text; the browser half trusts nothing it reads out of a persisted program and
degrades to text instead of throwing.

## 2. Constraints

**Two compiles, two sets of globals.** `tsconfig.json` checks `index.ts`,
`skill.ts`, `host/`, and `lang/` with Node types and no DOM; `tsconfig.client.json` compiles `client/`
and `lang/` with DOM types and no Node types. `lang/` therefore compiles under
both, which is what keeps it free of either environment.

**The browser half is bundled as CommonJS modules.** `build.js` compiles `client/`
and `lang/` to CommonJS and wraps each module in its own function inside one
module-loader factory. Relative imports between these files are real module
imports; only `react` and `react/jsx-runtime` may leave the bundle.

**`lang/identity.ts` imports nothing.** It is the one file every half and every
test reads for the plugin's names.

**File extensions.** Relative imports are written with `.ts` or `.tsx`, and the
compiler rewrites them to `.js`. Keep that convention.

**Types describe intent, validation describes reality.** The host may trust
`lang/types.ts`. The browser half must not: it reads a program persisted by a
possibly different build, so every read in `client/` goes through a guard and
returns a fallback rather than throwing.

**One definition source per fact.** The component catalog lives only in
`lang/catalog.ts`; the model-facing description, the validator, the DIL reader's
primary-text mapping, and the render registry all derive from it or are checked
against it by `tests/catalog.test.ts`.

**No runtime dependency.** The host half imports only `@deepseek-ai/dsh-tools`
(`defineTool`) at runtime, `@deepseek-ai/cordis` for types, and — in
`host/skill.ts` alone — `node:fs` and `node:url` to read its own skill file; the
browser half imports only React. The language layer imports nothing outside
itself.

**Exports.** `index.ts` exports `name`, `inject`, and `apply`, plus re-exports a
test or consumer needs. The browser entry exports the same three names.

## 3. Contents

- `AGENTS.md` — this file: how the two halves share code and what each may assume.
- `index.ts` — the tool row's Node entry: `name`, `inject`, `apply`, and the
  public re-exports.
- `skill.ts` — the skill row's Node entry: registers the bundled skill's
  provider.
- `host/` — the harness-process half: the tool definition, the model-facing
  contract, and the skill provider. See `host/AGENTS.md`.
- `client/` — the browser half: the tool row, the turn tail, the turn data
  Definition, and the card. See `client/AGENTS.md`.
- `lang/` — the shared language layer: catalog, grammar, expressions, the math
  engine, compiler, limits, and identity. See `lang/AGENTS.md`.

## 4. Progress

**Done.**

- `index.ts` registers exactly one tool, and `skill.ts` exactly one skill
  provider, each as an effect of its own row's context
  (`tests/isolation.test.ts`).
- The host and browser compiles are separate and each forbids the other's
  globals; the build fails on either half's type error.
- The browser bundle's external requests are checked on every build.

**Not done.**

- No plugin configuration: nothing here varies by deployment. A value that ever
  does must become a validated `Config` field rather than a constant.

**Known defects.**

- A browser-half type error is reported against the `src/` path by `tsc`, but the
  build message names the client compile step rather than the file's half; read
  the path in the message.

**Next goal.** Keep both halves free of new runtime imports as features land.
