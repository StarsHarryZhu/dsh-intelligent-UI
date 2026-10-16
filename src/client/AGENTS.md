# AGENTS.md

## 1. Role

The browser half. `index.ts` registers the plugin's contributions; `toolview.tsx`
draws the `ui_render` row while its turn runs; `tail.tsx` draws a finished turn's
cards under its reply; `turn-data.ts` collects those cards from events the host
already records; `card.tsx` draws one program with its local state, and
`components.tsx` and `chart.tsx` map each catalog type to exactly one renderer.

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
and the card says so. A card sends at most once.

**Styling is tokens only.** Class names under `dsh-iui-`, rules in `styles.css`,
theme tokens for every colour, radius, and font. The only inline styles are
spacing steps and grid tracks computed from validated whole numbers.

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
- Format-1 programs render; newer formats show their text; a renderer failure
  degrades the card to its text and leaves the transcript intact.

**Not done.**

- **Attachment images.** Only inline `data:image/…` sources render.
- **Persisted edits.** A reload resets a card to the model's initial values.

**Known defects.**

- In `verbose` mode, or with a finished turn expanded, a card can show in both
  its row and the tail; both copies share one state.
- A turn whose `turn/start` lies above the loaded history window gets no tail.

**Next goal.** Verify both surfaces in the live page in light and dark themes, per
`docs/VERIFY.md`.
