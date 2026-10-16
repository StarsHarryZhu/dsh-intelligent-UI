# AGENTS.md

## 1. Role

The language layer: the one place that decides what a model-authored interface is
allowed to say. It holds the component catalog, the DIL grammar, the readable
expression syntax and its evaluator, text interpolation, the compiler that turns
model text into a program, the vocabulary limits, and the names every half agrees
on.

Both halves run this layer. The host compiles; the browser compiles a streaming
preview and evaluates expressions against local state on every control change.
One evaluator means a program cannot mean one thing on the host and another in
the browser.

## 2. Constraints

**The expression union is the sandbox.** No member access, no call form beyond the
named functions, no string indexing, and no dynamic evaluation. The readable
syntax in `infix.ts` only lowers to operators `checkExpr` already accepts, so it
can never widen what an expression may do.

**Operands are numbers, booleans, or nested expressions.** A string literal is
always `["lit","text"]`; a bare name is always `["ref","name"]` and must be
declared. Equality compares two values of one type; ordering is numeric.

**Validation and evaluation are separate passes.** `checkExpr` runs against the
declared scope and returns diagnostics; `evalExpr` must be total — it returns the
failure symbol instead of throwing, even on a program that was never validated.

**Text interpolation is checked, not trusted.** `{…}` in text becomes an
expression segment only when it parses and type-checks against the declared
names; otherwise it stays literal text and is reported.

**Forgiving form, reported.** An invalid optional prop is dropped on its own; an
invalid or missing required prop drops its component; a component without a
usable parent joins the nearest card; a duplicate id is renamed. Only an empty or
unreadable program fails. Every repair becomes a diagnostic the model reads.

**Literal text is hoisted.** Static text moves into the program's `constants`
table, interned, so the structure stays fixed while content varies.

**Limits are invariant and bound work.** The values in `limits.ts` bound what
model text may cost the host, the session log, and the browser; JSON recovery and
the nested-children walk are bounded too. They are not configuration.

**Line-oriented recovery is a requirement.** DIL exists so the browser can compile
the lines that have arrived; partial compiles skip the trailing line and report
nothing.

**Content that could reach outside the card is refused.** Links must be http or
https, images must be inline `data:image/…` rasters.

## 3. Contents

- `AGENTS.md` — this file: what the language permits and why.
- `catalog.ts` — the component table: name, purpose, container flag, primary text
  prop, and prop specs, plus the catalog version and semantic hash.
- `types.ts` — the wire vocabulary: expressions, declarations, nodes, templates,
  diagnostics, and the program.
- `dil.ts` — the DIL line parser: declarations, indentation nesting, primary
  text, and the legacy explicit form, producing the JSON envelope.
- `infix.ts` — the readable expression syntax and its lowering.
- `text.ts` — `{…}` interpolation parsing and the renderer for hoisted text.
- `expr.ts` — expression validation, static typing, evaluation, and formatting.
- `compile.ts` — grammar detection, prop validation against the catalog,
  hoisting, tree repair, fallback text, and bounded JSON recovery.
- `limits.ts` — the vocabulary bounds and the spacing grid maximum.
- `identity.ts` — the plugin id, the tool name, the slot names, and the format
  versions. Imports nothing.

## 4. Progress

**Done.**

- Twenty-four components; the catalog drives validation, the description, and
  the registry check (`tests/catalog.test.ts`).
- DIL nests by indentation, fills primary text from a bare quoted string, infers
  state kinds, and still reads the explicit `#id … in=#parent` form
  (`tests/dil.test.ts`).
- Expressions read as `seats * 29` and `plan == "Pro" ? 29 : 12` everywhere an
  expression is accepted, in both grammars (`tests/infix.test.ts`).
- Text, list items, and table cells interpolate `{…}` (`tests/text.test.ts`).
- Every bound has a boundary pair, and malformed JSON recovery stays fast
  (`tests/limits.test.ts`).
- Every `ui_render` source recorded in real sessions compiles
  (`tests/compile.test.ts` pins the course-review quiz).

**Not done.**

- **`@each` and `@if`.** A repeated row over a list and a conditional component
  need constructs the grammar does not have; `if(…)` covers value choice only.
- **Option labels distinct from option values.** A choice shows its values.

**Known defects.**

- A table row with fewer cells than columns is accepted and renders short.
- `fmtNum` returns text, so a numeric prop fed by it is read back as a number only
  when the text parses as one.
- A bare `expr` prop value ends at the first space: `value=mins / 60` compiles as
  `value=mins` plus two stray tokens, and the diagnostic names only the second
  one (`"/" is not attached to a prop`). Written `value="mins / 60"` or
  `value=(mins / 60)`, the same expression is correct. Found drawing the samples
  in `docs/SAMPLES.md`; the fix is to read an `expr` value to end of line.

**Next goal.** Add `@each` over a declared list without widening the expression
union, through the same partial-line recovery.
