# AGENTS.md

## 1. Role

The language layer: the one place that decides what a model-authored interface is
allowed to say. It holds the component catalog, the DIL grammar, the readable
expression syntax and its evaluator, the math engine, text interpolation, the
compiler that turns model text into a program, the vocabulary limits, and the
names every half agrees on.

Both halves run this layer. The host compiles; the browser compiles a streaming
preview and evaluates expressions against local state on every control change.
One evaluator means a program cannot mean one thing on the host and another in
the browser — the figures the model reads in its tool result are the figures the
reader sees.

## 2. Constraints

**The expression union is the sandbox.** No member access, no function value, no
string indexing, and no dynamic evaluation. A call names an entry of the fixed
function table in `math.ts`, looked up with an own-property check; a calculus
operator binds one variable name, visible only inside its body. The readable
syntax in `infix.ts` only lowers to operators `checkExpr` already accepts, so it
can never widen what an expression may do.

**Operands are numbers, booleans, or nested expressions.** A string literal is
always `["lit","text"]`; a bare name is always `["ref","name"]` and must be
declared or bound; `pi`, `e`, `tau`, and `inf` are constants and cannot be
declared. Equality compares two values of one type; ordering is numeric.

**Validation and evaluation are separate passes.** `checkExpr` runs against the
declared scope and returns diagnostics; `evalExpr` must be total — it returns the
failure symbol instead of throwing, even on a program that was never validated.

**Numbers are right or absent.** Each numerical routine has an accuracy target
and refuses a result it cannot vouch for: the integrator's error estimate, the
limit's agreement of sides, the root's sign change. Derivatives are exact by
Taylor arithmetic wherever the expression allows, and fall back to extrapolated
differences only for orders one and two. A refused value shows as "—".

**Work is bounded.** Every evaluation spends from a budget (400,000 node visits
by default, shareable across the samples of one plot), calculus nests at most
three deep, sums take at most 10,000 terms, and Taylor series at most order 30.

**One API version.** Every compiled program carries `version: API_VERSION`
(`identity.ts`), and the persisted envelope carries the same number; components,
props, and operators are not dated one by one. Programs and envelopes persisted
before the `version` fields existed are not read; the client shows their text.
The release version in `package.json` and the tags is the maintainer's. The compiler
accepts DIL nested by indentation only (no `#id`, `in=`, angle brackets, or kind
words) and the JSON envelope, and reports anything else with a repair.

**Text interpolation is checked, not trusted.** `{…}` in text becomes an
expression segment only when it parses and type-checks against the declared
names; otherwise it stays literal text and is reported.

**Forgiving form, reported.** An invalid optional prop is dropped on its own; an
invalid or missing required prop drops its component; a component without a
usable parent joins the nearest card; a duplicate id is renamed. Only an empty or
unreadable program fails. Every repair becomes a diagnostic the model reads.

**Tabs hold only tabs.** A run of sibling `tab` lines written without their
`tabs` line gets one, and a component written straight inside `tabs` joins the
tab before it (`arrangeTabs` in `compile.ts`); both are reported. A diagram's
arrows name their ends by a node's exact text or its 1-based number and compile
to number pairs; an arrow that names no node is dropped and reported.

**A player is its card's control bar.** The compiler moves every `player` to the
end of the outermost card above it (`dockPlayers` in `compile.ts`), whatever line
the source wrote it on, and the browser applies the same rule to every program it
reads, so the card, the preview, and the text view agree.

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
  prop, and prop specs, plus the semantic hash.
- `types.ts` — the wire vocabulary: expressions, declarations, nodes, templates,
  diagnostics, the program, and the operator set.
- `dil.ts` — the DIL line parser: declarations, indentation nesting, primary
  text, and bare expression values, producing the JSON envelope.
- `infix.ts` — the readable expression syntax and its lowering: powers,
  factorials, implicit products, typeset symbols, constants, function and calculus
  calls.
- `text.ts` — `{…}` interpolation parsing and the renderer for hoisted text.
- `expr.ts` — expression validation, static typing, bounded evaluation, the
  calculus operators, and number display.
- `math.ts` — the function table, the constants, special functions, adaptive
  Gauss–Kronrod integration, Ridders differentiation, extrapolated limits, Brent
  root finding, and significant-digit formatting.
- `series.ts` — exact derivatives and Taylor coefficients by truncated power
  series arithmetic over the expression tree.
- `print.ts` — expressions printed back as readable infix text, for text views and
  accessible names.
- `compile.ts` — grammar detection, prop validation against the catalog,
  hoisting, tree repair, tabs and diagram arrows, fallback text, and bounded JSON
  recovery.
- `limits.ts` — the vocabulary bounds and the spacing grid maximum.
- `identity.ts` — the plugin id, the tool name, the slot names, and the API
  version. Imports nothing.

## 4. Progress

**Done.**

- Thirty-one components, `player`, `tabs`, `tab`, `checklist`, and `diagram`
  among them; the catalog drives validation, the description, and the registry
  check (`tests/catalog.test.ts`).
- DIL nests by indentation, fills primary text from a bare quoted string, infers
  state kinds, keeps a spaced bare expression whole, and refuses the old explicit
  form with a repair (`tests/dil.test.ts`).
- `pick(i, a, b, …)` chooses the i-th option lazily, floored and held inside the
  options, and `current=` and `mono=` give `steps`, `list`, and `table` a
  highlighted item and code type (`tests/expr.test.ts`, `tests/compile.test.ts`).
- Expressions read as `seats * 29`, `3x^2 - 2x`, `n!`, and
  `integral(sin(x), x, 0, pi)` everywhere an expression is accepted, in both
  grammars (`tests/infix.test.ts`).
- The math engine matches textbook values to the stated tolerance and refuses
  divergent integrals, divergent or one-sided-only limits, missing derivatives,
  and rootless intervals (`tests/math.test.ts`).
- Text, list items, and table cells interpolate `{…}` (`tests/text.test.ts`).
- Every bound has a boundary pair, and malformed JSON recovery stays fast
  (`tests/limits.test.ts`).
- Every `ui_render` source recorded in real sessions compiles
  (`tests/compile.test.ts` pins the course-review quiz).

**Not done.**

- **Infinite series.** `sum` and `prod` need finite bounds; convergence
  acceleration for an infinite upper bound is not implemented.
- **Symbolic results.** Everything is numerical; a derivative is a number at a
  point, never a formula.
- **`@each` and `@if`.** A repeated row over a list and a conditional component
  need constructs the grammar does not have; `if(…)` covers value choice only.
- **Option labels distinct from option values.** A choice shows its values.

**Known defects.**

- A table row with fewer cells than columns is accepted and renders short.
- `fmtNum` returns text, so a numeric prop fed by it is read back as a number only
  when the text parses as one.
- A limit that converges slower than any power of the step, such as 1/ln(x) at 0,
  is refused rather than approximated.
- `x(1 - x)` is not read as a product, because a name followed by brackets is a
  call; write `x * (1 - x)`.

**Next goal.** Add `@each` over a declared list without widening the expression
union, through the same partial-line recovery.
