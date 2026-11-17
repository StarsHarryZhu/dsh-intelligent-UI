# AGENTS.md

## 1. Role

All source for both halves of the plugin and for the runtime that runs inside
each widget frame. `index.ts` and `skill.ts` are the two Node entries the cordis
loader imports, one per bundle row: the tool row and the skill row. `host/` is
the half that runs in the harness process: the tool, its description, the check
every widget passes before it is shown, and the skill provider. `client/` is the
browser half that runs in the chat page: the card in the reply, the tool row, the
sandboxed frame, and the checks on every message that frame sends. `frame/` is
the code that runs inside a widget frame, beside the model's code. `widget/` is
what all three share: the plugin's names, the frame's policy and limits, the
message protocol, the shipped-library table, and a reader of HTML that needs no
DOM.

The split exists because the parts are compiled differently and trust different
inputs. The host half checks the model's source and never runs it; the browser
half never holds the model's markup or code in the page and trusts nothing a
frame sends or a persisted record says; the frame runtime shares its window with
the model's code and therefore guards nothing.

## 2. Constraints

**Three compiles, three sets of globals.** `tsconfig.json` checks `index.ts`,
`skill.ts`, `host/`, and `widget/` with Node types and no DOM;
`tsconfig.client.json` compiles `client/` and `widget/` with DOM types and no Node
types; `tsconfig.frame.json` compiles `frame/` and `widget/` the same way.
`widget/` therefore compiles under all three, which keeps it free of every
environment.

**The browser half is bundled as CommonJS modules.** `build.js` compiles
`client/` and `widget/` to CommonJS and wraps each module in its own function
inside one module-loader factory. Only `react` and `react/jsx-runtime` may leave
the bundle. The frame runtime is bundled separately into one script and enters
the browser half as a text module, never as code the page runs.

**`widget/identity.ts` imports nothing.** It is the one file every half and every
test reads for the plugin's names.

**File extensions.** Relative imports are written with `.ts` or `.tsx`, and the
compiler rewrites them to `.js`. Keep that convention.

**Types describe intent, validation describes reality.** The host may trust its
own types. The browser half must not: it reads meta persisted by a possibly
different build and messages a model's code may have forged, so every read in
`client/` goes through a guard and falls back rather than throwing.

**No runtime dependency.** The host half imports only `@deepseek-ai/dsh-tools`
(`defineTool`) at runtime, `@deepseek-ai/cordis` for types, `node:vm` in
`host/check.ts` alone, and `node:fs` and `node:url` in `host/skill.ts` alone; the
browser half imports only React; the frame runtime imports nothing outside
`frame/` and `widget/`.

**Exports.** `index.ts` exports `name`, `inject`, and `apply`, plus re-exports a
test or consumer needs. The browser entry exports the same three names.

## 3. Contents

- `AGENTS.md` — this file: how the parts share code and what each may assume.
- `index.ts` — the tool row's Node entry: `name`, `inject`, `apply`, and the
  public re-exports.
- `skill.ts` — the skill row's Node entry: registers the bundled skill's
  provider.
- `host/` — the harness-process half: the tool, its description, the widget
  check, and the skill provider. See `host/AGENTS.md`.
- `client/` — the browser half: the card in the reply and the Definition that
  places it, the tool row, the frame and its message checks, and what each
  widget keeps. See `client/AGENTS.md`.
- `frame/` — the runtime inside each widget frame, its base stylesheet, and the
  numeric library behind `dsh.math`. See `frame/AGENTS.md`.
- `widget/` — what every part shares: identity, policy and limits, the message
  protocol, the shipped-library table, and the DOM-free HTML reader. See
  `widget/AGENTS.md`.

## 4. Progress

**Done.**

- `index.ts` registers exactly one tool, and `skill.ts` exactly one skill
  provider, each as an effect of its own row's context
  (`tests/isolation.test.ts`).
- The rewrite of 2026-11-17 replaced the DIL language layer (`lang/`) with
  `widget/` and `frame/`: the model writes HTML, SVG, CSS, and JavaScript, which
  runs in a sandboxed frame.
- The three compiles are separate and each forbids the others' globals; the
  build fails on a type error in any of them.
- The browser bundle's external requests are checked on every build.

**Not done.**

- No plugin configuration: nothing here varies by deployment. A value that ever
  does must become a validated `Config` field rather than a constant.

**Known defects.**

- A browser-half type error is reported against the `src/` path by `tsc`, but the
  build message names the compile step rather than the file's half; read the
  path in the message.

**Next goal.** Keep every part free of new runtime imports as features land.
