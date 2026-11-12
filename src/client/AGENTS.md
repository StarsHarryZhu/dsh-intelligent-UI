# AGENTS.md

## 1. Role

The browser half. `index.ts` registers the plugin's contributions;
`card-node.ts` places each card in the reply, as its own Chat node where the
model called the tool, and `node-view.tsx` draws it there; `toolview.tsx` draws
the `ui_render` row among the process rows; `turn-data.ts` collects a turn's
cards from events the host already records; `card.tsx` draws one program with
its local state, and
`components.tsx` with `canvas.tsx`, `table.tsx`, `chart.tsx`, `plot.tsx`, `formula.tsx`, `blanks.tsx`, and
the other figure files maps each catalog type to exactly one renderer.

Everything a card draws comes from `tool/result.meta`, or, while the call streams,
from compiling its arguments in the browser. The half reads no other session data
and makes no request. The one thing it keeps beyond the page is the reader's own
edits, in this browser's local storage, so a reload that replays the log rebuilds
the same cards and shows them as the reader left them.

## 2. Constraints

**`apply(ctx)` only.** Cordis passes the entry config as a second argument, and a
page entry has none. React comes from `require('react')`; nothing is read from a
parameter. Each contribution is registered in its own `try`/`catch`, and the only
required services are `slots` and `locale`; `uiConversation` is waited for with
`ctx.inject`, so its absence never blocks the page's boot.

**Registration is injected, not assumed.** `slots.inject(slot, …)` waits for the
slot's declaration and removes the contribution when the slot collapses.

**The keys are this plugin's.** The row registers under the wire tool name
`ui_render`; the turn-data Definition, the Turn data key, and the dictionary
namespace are all `dsh-intelligent-ui`; the card node kind is
`dsh-intelligent-ui.card`, both the Definition that builds the nodes and the
`conversation.chat.node` key that draws them. A mismatch between the tool name
and the row key is silent — the row simply never renders.

**A card stands where it was called, outside the fold.** `card-node.ts` builds
one `chat` node per `ui_render` call, from the call's streamed argument deltas,
its `tool/call`, and its `tool/result`, anchored `AFTER_CALL` (1e-9) past the
call's first event, so it follows its own tool row and precedes anything later,
at the `turn` group-tree position, which keeps it out of the process a finished
turn folds. A failed compile, an errored call, and a preview whose turn stopped
build a hidden node, or none. The node renderer and the Definition are
registered in the same `slots.inject` callback and removed together, because a
node of a kind nobody draws shows as the host's raw-data fallback. The
Definition matches every tool-call delta, because only the first names its tool,
and keeps argument text for `ui_render` calls only, bounded by the source limit.

**One copy at a time.** A reply copy enters `presence.ts` while it is mounted;
the call's row then stays a status line, opens only to show a failure, and does
not open itself. Where no reply copy is on the page — a view that draws no Chat
nodes, or a call whose reply copy is hidden — the row previews and draws the
card itself as before.

**The registry is the allowlist.** `renderNode` looks up `REGISTRY[type]` with an
own-property check and draws nothing when there is no entry. Never create an
element from a model-supplied name.

**Read defensively.** A persisted program comes from a possibly different build:
every field is guarded, every guard has a fallback, and the `version` fields of
the envelope and the program decide whether it renders or shows its text. A
program without them predates the API version and shows its text, as does a
program of an API version this build does not know.

**What the reader sets on a component is card state, not program state.** The
open tab, the ticked items of a checklist, and a table's sort live in the edits
store under the node's id (`CardMemory.ui`), so both copies of a card agree; they
are kept like every edit. A table keeps its filter and page under the node's id
with `:q` and `:p` appended, a chart the series or slices the reader hid, and a
fill-in sentence its answers, one string per blank. A checklist writes ordinary states: `bind=` gets the
ticked count, or the sum of the items' `values=`, and `names=` a text state the
ticked names joined by "、" when any is CJK and ", " otherwise, so the
program's state kinds stay as they were.

**The boundary sits above the renderer.** `Card` wraps `CardBody` in its failure
boundary because a component's own render error is caught only by an ancestor;
the row and the reply copy sit inside `Contained` for the same reason.

**The preview reads the growing arguments during render.** The preparing block
grows in place, so the source is read on every render and the preview is
memoized by the text itself, never by the block's identity. The reply copy reads
its string arguments from the streamed JSON prefix with `readArguments`, which
decodes each complete string and the one still growing, and never invents text.

**State is local and shared by call.** Edits live in one store created by `apply`,
keyed by session and call, so the row and the reply copy show the same values
and a remount loses nothing. `edits.ts` writes each card's memory through to local
storage — one key per card plus an index of at most 200 cards, oldest dropped
first — and is the only file of this half that touches storage; the isolation
test holds it to that. A memory over 16 KB, a damaged entry, or a storage that
refuses leaves the edit for the page only. Values read back are checked again by
`acceptEdit` against the card's own declarations, and a sent button stays locked.

**A revision starts where the reader left off.** A card whose meta names
`revises` starts from the earlier card's values for the states it still declares,
without writing anything until the reader edits; open tabs, ticks, sorts, and a
sent button stay with the earlier card, because node ids do not carry over. Once
the revision's result has settled, the earlier card is marked `revisedBy`, folds
to one line with a toggle that opens it for that view, and its row's status says
it was replaced; a streaming preview carries values but marks nothing. A reply
copy disappears once a later card of the same turn revises it, read from the
turn's own data, so a card the model redrew in the same answer never stays in
the reply.

**Buttons go through the composer.** A press calls `inputActions.setDraft` and
`submit` only when the composer is empty and idle; otherwise the prompt is copied
and the card says so. When the page refuses the clipboard, the card shows the
prompt as selectable text instead of claiming a copy. A card sends at most once.

**Playback is local.** `player` advances its bound state on animation frames,
at most about 30 values a second, through the same edit path a slider uses; the
browser half still sets no timers. The pace comes from the clock, and one frame
never advances more than a second of run time, so a throttled page keeps its
pace and a tab that slept does not jump. A page that paints no frames, such as a
hidden tab, pauses. Whether it plays and how fast belong to that copy of the
card; the frame is in the shared store, as a passing value storage does not keep,
and the frame a run stops on is kept. Scrubbing, stepping, and unmounting stop
it, and nothing reaches the model. `loop=` starts a run over after its last step;
`autoplay=` runs it while its card is on screen (an `IntersectionObserver`), never
under `prefers-reduced-motion`, until the reader presses a control. A copy that
starts a run takes the player over (`RUNNING`, keyed by card and node), and the
other copy stops. The player always sits at the bottom of its
card, under a hairline: `readProgram` docks it there even in a program saved
before the compiler did.

**Plots and formulas compute with the shared evaluator.** A plot samples its
curves through `evalExpr` on one shared budget, takes its tangent's slope from an
exact derivative and its shaded area from the integrator, and clips curves to the
box arithmetically. A diagram lays itself out from its texts and arrows alone,
estimating text width from the characters. A formula is typeset from the expression tree with this
half's own spans, because React 18 cannot create MathML elements and the host's
KaTeX is not a plugin dependency. Neither measures the DOM.

**Styling is tokens only.** Class names under `dsh-iui-`, rules in `styles.css`,
theme tokens for every colour, radius, and font. The only inline styles are
spacing steps and grid tracks computed from validated whole numbers. Typeset math
spaces itself in em; layout spacing stays on the 4px grid.

**One bundle, three platforms, no platform branches.** This bundle serves the web
UI and both desktop apps (macOS and Windows) of 0.2.1-rc.1 and later; the apps
load this same bundle, so add no platform-specific code here and let nothing
branch on the operating system. The clipboard is the one optional browser
feature, degrading as described above.

**No harness client package.** Host controls are matched by copying their look
into `styles.css`; requiring `@deepseek-ai/dsh-client-ui-primitives` or any other
client package is forbidden.

**Table tools appear by size.** A table offers CSV and Markdown copies of what
its filter and sort leave; past 8 rows it gains a filter box, and past 20
matching rows it pages, turning to the current row's page when `current=` moves.

**A chart draws from values, with the reader's choice of series.** One `values=`
series draws as it always has. Indented `series` lines draw grouped or stacked
bars, lines, or areas in the plot's four curve colours, with dashes on lines past
the first; the legend hides and shows a series, always keeping one, and a readout
names one column, moved by pointer or arrow keys. Only that pointer position is
read from the DOM. A pie draws one series with its shares in the legend.

**A drawing is checked again, and drawn through a table.** `canvas.tsx` reads a
stored SVG tree through `checkDrawing` and draws it through `ELEMENTS`, one literal
element per allowed name, so a stored name not in the table cannot become an
element. Its ids and their references get a `useId` prefix, since every drawing on
a page shares one id space. Shapes map by arithmetic to a viewBox as wide as the
canvas is on the page, so weights, text, and points are real pixels whatever the
coordinates and however narrow the screen. A dragged point and a clicked shape
write through `setValue`, so a state's limits hold and the change is kept like any
edit. `rotate=`, `scale=`, and `opacity=` go on a shape's group as a transform and
an opacity, turning the way the canvas's y axis goes; a `curve` is sampled here on
a work budget, and a `use` shape places a part of the drawing by its prefixed id,
inheriting the drawing's root colours rather than a tone. That width and the pointer during a drag are all it reads from the page. Colours inside a
drawing are the model's; every shape's colour is a theme token.

**A code block scrolls itself, never the page.** When `current=` moves, the
block sets its own `scrollTop` so the line stays in view; it never calls
`scrollIntoView`, which would move the chat. Its colours are the host's syntax
tokens (`--shiki-token-*`), each with a `--dsw-` theme fallback, so a listing
reads like the host's own code blocks in both themes; the stylesheet test
accepts no other non-theme colour. Copying writes the block's exact text.

## 3. Contents

- `AGENTS.md` — this file: what the browser half may do and what it must not.
- `index.ts` — the browser entry: `name`, `inject`, `apply`, and the stylesheet mount.
- `card-node.ts` — the Conversation Definition that places each card in the
  reply, and the reader of streamed string arguments.
- `node-view.tsx` — the renderer of a card in the reply: preview, settled card,
  and leaving out a card its own turn redrew.
- `presence.ts` — the record of reply copies on the page that tool rows defer to.
- `toolview.tsx` — the `ui_render` row: its status, failure details, and, where
  no reply copy is drawn, the preview, the card, and the fresh-result disclosure.
- `turn-data.ts` — the data-only Conversation Definition that collects cards per turn.
- `card.tsx` — the card: values, edits, revisions and the replaced fold, button sends, notices, and the boundaries.
- `clipboard.ts` — the page clipboard, shared by the button fallback and the
  code block's copy button.
- `components.tsx` — the type-to-renderer registry, the number field, the
  animation player, tabs, and the checklist.
- `parts.tsx` — prop readers and the glyph that several renderers share.
- `canvas.tsx` — drawings: shapes, the checked SVG layer, dragged points, and
  clicked shapes.
- `table.tsx` — tables: sorting, filtering, pages, and CSV and Markdown copies.
- `blanks.tsx` — fill-in sentences: blanks in the line, Enter to move on, and one send that locks them.
- `diagram.tsx` — flowcharts: the layered layout and its SVG drawing.
- `code.tsx` — code blocks: coloured lines, line numbers, the current line kept
  in view, and copying.
- `chart.tsx` — bar, line, area, and pie charts of one series or several, with
  the legend and the readout.
- `plot.tsx` — function plots: sampled curves, ranges, the marked point and
  tangent, the shaded area, the legend, and the readout.
- `formula.tsx` — the formula typesetter and its live value.
- `program.ts` — defensive reading of persisted programs and metadata, preview
  compilation, value computation, and edit validation.
- `edits.ts` — the store of reader edits, written through to local storage.
- `locales.ts` — the card chrome's Chinese and English copy and the translator.
- `host.ts` — structural types for the host props and services this half reads.
- `styles.css` — the stylesheet, inlined by the build.
- `css.d.ts` — the type of the inlined stylesheet module.

## 4. Progress

**Done.**

- `apply(ctx)` registers the row, the card node renderer and its Definition, the
  turn-data Definition, the dictionaries, and the stylesheet, and unloading
  removes all of them (`tests/client.test.tsx`).
- Cards in the reply (2026-11-11): each card stands where its call stands,
  after its row and outside the folded process, previewing while the arguments
  stream and drawing the settled card after; failures build nothing; a card its
  own turn redrew leaves the reply; the row stays a status line while the reply
  copy is on the page and draws the card itself where there is none
  (`tests/client.test.tsx`, and headless Chrome on the built bundle). Not yet
  run live in DSH.
- The row, where it draws the card, previews a streaming source, recomputes on
  control changes without a request, keeps old results collapsed, and shows
  failures with their reasons.
- Buttons send once through the composer and never overwrite a draft.
- API version 1 renders; any other version, and programs from before the
  version fields, show their text; a renderer failure degrades the card to its
  text and leaves the transcript intact.
- The player plays to the end in its duration and stops, restarts from the
  beginning, steps one frame, pauses when scrubbed, stepped, or unmounted, and
  cycles 1×, 2×, and 0.5×; `current=` and `mono=` highlight and set code type
  (`tests/client.test.tsx`).
- A canvas maps shapes both ways up, follows state, moves a dragged point by
  pointer and arrow keys on its state's steps, stores a click, keeps both after a
  reload, and draws nothing a forged program adds off the lists
  (`tests/client.test.tsx`).
- Tabs switch by click and arrow keys and keep their page in both copies; a
  checklist counts, sums, and names into its bound states; a sortable table cycles ascending,
  descending, and written order with the highlight on its row; a diagram
  highlights the current box and lays out loops on a side lane
  (`tests/client.test.tsx`); one card using all four drew in the web UI on
  2026-10-19.
- Code blocks colour their syntax with the host's tokens, number their lines,
  move the highlight with a player while scrolling only themselves, follow a
  text state through `value=`, and copy their exact text, saying so when the
  page refuses (`tests/client.test.tsx`).
- Reader edits, ticks, sorts, and sent buttons survive a reload; damaged or
  oversized entries and a refusing storage fall back to the page; a revision
  starts from the earlier card's values, clamped by its own declarations, and
  marks the earlier card (`tests/client.test.tsx`).
- Fill-in sentences (2026-11-08): each `___` is a blank in the line, as wide as
  its run and growing with the answer; Enter moves to the next blank and sends
  from the last once all are filled, but never while an input method composes;
  Submit sends the sentence with the answers in brackets, once, and the blanks
  lock; answers and the lock survive a reload (`tests/client.test.tsx`, and
  headless Chrome on the built bundle). Not yet run live in DSH.
- Replaced cards (2026-11-07): a card revised in a later turn folds to one line
  that opens it again and its row says it was replaced; a card redrawn in its own
  turn is left out of the reply (`tests/client.test.tsx`, and headless Chrome on
  the built bundle). Not yet run live in DSH.
- Long tables filter, page, follow `current=` across pages, and copy CSV and
  Markdown; charts group, stack, and fill several series, toggle them from the
  legend, read a column out by keyboard, and draw pies with their shares
  (`tests/client.test.tsx`); all of it, kept settings and revisions included,
  ran live on the web UI and the macOS app on 2026-10-26.
- Plots break at asymptotes, label several curves, and print the point, slope,
  and area they draw; chart and plot dots stay round when the SVG stretches;
  formulas typeset fractions, radicals, scripts, integrals, sums, limits, and
  derivatives (`tests/client.test.tsx`).
- Verified live on 2026-10-16 in dark and light themes, across a reload, with
  the clipboard refused and with a draft in the composer.

**Not done.**

- **Attachment images.** Only inline `data:image/…` sources render.

**Known defects.**

- A card's place is where the model called the tool. A model that writes all its
  text after the call puts the card first; the skill and the tool description
  teach it to write the lead-in before calling. With the host's "Final answer
  only" choice, text written before the call folds with the process while the
  card stays.
- A card called after the last text of a turn, with no reply after it, stands
  after the closing reply; the host then offers no branch from that reply.
- On the macOS desktop app 0.2.0-rc.2, a build below the engine range, no card was
  drawn and past conversations would not open. On 0.2.1-rc.2 both apps draw every
  card and open history, so the earlier failure did not survive the version bump;
  no root cause was ever named for it.

**Next goal.** Keep the half free of platform branches as the desktop apps move
through 0.2.x.
