# AGENTS.md

## 1. Role

The browser half. `index.ts` registers the plugin's contributions; `toolview.tsx`
draws the `ui_render` row while its turn runs; `tail.tsx` draws a finished turn's
cards under its reply; `turn-data.ts` collects those cards from events the host
already records; `card.tsx` draws one program with its local state, and
`components.tsx`, `chart.tsx`, `plot.tsx`, and `formula.tsx` map each catalog type
to exactly one renderer.

Everything a card draws comes from `tool/result.meta`, or, while the call streams,
from compiling its arguments in the browser. The half reads no other session data,
makes no request, and keeps nothing beyond the page's lifetime, so a reload that
replays the log rebuilds the same cards.

## 2. Constraints

**`apply(ctx)` only.** Cordis passes the entry config as a second argument, and a
page entry has none. React comes from `require('react')`; nothing is read from a
parameter. Each contribution is registered in its own `try`/`catch`, and the only
required services are `slots` and `locale`; `uiConversation` is waited for with
`ctx.inject`, so its absence never blocks the page's boot.

**Registration is injected, not assumed.** `slots.inject(slot, …)` waits for the
slot's declaration and removes the contribution when the slot collapses.

**The keys are this plugin's.** The row registers under the wire tool name
`ui_render`; the tail entry, the Definition, the Turn data key, and the dictionary
namespace are all `dsh-intelligent-ui`. A mismatch between the tool name and the
row key is silent — the row simply never renders.

**The registry is the allowlist.** `renderNode` looks up `REGISTRY[type]` with an
own-property check and draws nothing when there is no entry. Never create an
element from a model-supplied name.

**Read defensively.** A persisted program comes from a possibly different build:
every field is guarded, every guard has a fallback, and the format version
decides whether it renders or shows its text.

**The boundary sits above the renderer.** `Card` wraps `CardBody` in its failure
boundary because a component's own render error is caught only by an ancestor;
the row and the tail sit inside `Contained` for the same reason.

**The preview reads the growing arguments during render.** The preparing block
grows in place, so the source is read on every render and the preview is
memoized by the text itself, never by the block's identity.

**State is local and shared by call.** Edits live in one store created by `apply`,
keyed by session and call, so the row and the tail show the same values and a
remount loses nothing. They are not persisted.

**Buttons go through the composer.** A press calls `inputActions.setDraft` and
`submit` only when the composer is empty and idle; otherwise the prompt is copied
and the card says so. When the page refuses the clipboard, the card shows the
prompt as selectable text instead of claiming a copy. A card sends at most once.

**Plots and formulas compute with the shared evaluator.** A plot samples its
curves through `evalExpr` on one shared budget, takes its tangent's slope from an
exact derivative and its shaded area from the integrator, and clips curves to the
box arithmetically. A formula is typeset from the expression tree with this
half's own spans, because React 18 cannot create MathML elements and the host's
KaTeX is not a plugin dependency. Neither measures the DOM.

**Styling is tokens only.** Class names under `dsh-iui-`, rules in `styles.css`,
theme tokens for every colour, radius, and font. The only inline styles are
spacing steps and grid tracks computed from validated whole numbers. Typeset math
spaces itself in em; layout spacing stays on the 4px grid.

**One bundle for web and desktop.** The desktop apps run this same bundle inside
the same web client, so nothing here may branch on the platform or rely on a
browser feature the desktop shell restricts; the clipboard is the one optional
feature, and it degrades as described above.

**No harness client package.** Host controls are matched by copying their look
into `styles.css`; requiring `@deepseek-ai/dsh-client-ui-primitives` or any other
client package is forbidden.

## 3. Contents

- `AGENTS.md` — this file: what the browser half may do and what it must not.
- `index.ts` — the browser entry: `name`, `inject`, `apply`, and the stylesheet mount.
- `toolview.tsx` — the `ui_render` row: header, streaming preview, settled card,
  failure details, and the fresh-result disclosure.
- `tail.tsx` — the turn-tail entry that draws a completed turn's cards.
- `turn-data.ts` — the data-only Conversation Definition that collects cards per turn.
- `card.tsx` — the card: values, edits, button sends, notices, and the boundaries.
- `components.tsx` — the type-to-renderer registry and the number field.
- `chart.tsx` — bar and line charts as inline SVG.
- `plot.tsx` — function plots: sampled curves, ranges, the marked point and
  tangent, the shaded area, the legend, and the readout.
- `formula.tsx` — the formula typesetter and its live value.
- `program.ts` — defensive reading of persisted programs and metadata, preview
  compilation, value computation, and edit validation.
- `edits.ts` — the page-lifetime store of reader edits.
- `locales.ts` — the card chrome's Chinese and English copy and the translator.
- `host.ts` — structural types for the host props and services this half reads.
- `styles.css` — the stylesheet, inlined by the build.
- `css.d.ts` — the type of the inlined stylesheet module.

## 4. Progress

**Done.**

- `apply(ctx)` registers the row, the tail, the Definition, the dictionaries, and
  the stylesheet, and unloading removes all of them (`tests/client.test.tsx`).
- The row previews a streaming source, recomputes on control changes without a
  request, keeps old results collapsed, and shows failures with their reasons.
- The tail draws only completed turns, follows the observable Turn data source,
  and shares edits with the row.
- Buttons send once through the composer and never overwrite a draft.
- Format-1 and format-2 programs render; newer formats show their text; a
  renderer failure degrades the card to its text and leaves the transcript intact.
- Plots break at asymptotes, label several curves, and print the point, slope,
  and area they draw; formulas typeset fractions, radicals, scripts, integrals,
  sums, limits, and derivatives (`tests/client.test.tsx`).
- Verified live on 2026-10-16 in dark and light themes, across a reload, with
  the clipboard refused and with a draft in the composer.

**Not done.**

- **Attachment images.** Only inline `data:image/…` sources render.
- **Persisted edits.** A reload resets a card to the model's initial values.

**Known defects.**

- In `verbose` mode, or with a finished turn expanded, a card can show in both
  its row and the tail; both copies share one state.
- A turn whose `turn/start` lies above the loaded history window gets no tail.
- The desktop apps default to the `standard` transcript view, which collapses a
  running turn's tool rows; the streaming preview is then out of sight until the
  reader expands the step group, and the card appears when the turn finishes.

**Next goal.** Verify the same surfaces in the macOS and Windows desktop apps, per
`docs/VERIFY.md`.
