# AGENTS.md

## 1. Role

The browser half. `index.ts` registers the plugin's contributions;
`card-node.ts` places each widget in the reply, as its own Chat node where the
model called the tool, and `node-view.tsx` draws it there, or, through a
portal, wherever the answer names it in a ```widget block that `placement.ts`
finds; `toolview.tsx` draws
the `ui_render` row among the process rows; `turn-data.ts` collects a turn's
cards from events the host already records. `widget.tsx` is the widget itself:
a sandboxed frame whose document `document.ts` writes once and which is then fed
by message, with `bridge.ts` checking everything the frame sends back,
`theme.ts` reading the chat's theme for it, `libraries.ts` and `chunks.ts`
fetching the libraries the plugin ships, and `edits.ts` keeping what each widget
stores.

Everything a widget shows comes from `tool/result.meta`, or, while the call
streams, from its arguments. The page never inserts the model's markup or runs
its code: both exist only inside the frame. The half reads no other session data
and makes no request of its own; the one thing it keeps beyond the page is what
each widget stores, in this browser's local storage.

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
and the row key is silent: the row simply never renders.

**A widget stands where it was called, outside the fold.** `card-node.ts` builds
one `chat` node per `ui_render` call, from the call's streamed argument deltas,
its `tool/call`, and its `tool/result`, anchored `AFTER_CALL` (1e-9) past the
call's first event, so it follows its own tool row and precedes anything later,
at the `turn` group-tree position, which keeps it out of the process a finished
turn folds. A failed check, an errored call, and a preview whose turn stopped
build a hidden node, or none. The node renderer and the Definition are
registered in the same `slots.inject` callback and removed together, because a
node of a kind nobody draws shows as the host's raw-data fallback. The
Definition matches every tool-call delta, because only the first names its tool,
and keeps argument text for `ui_render` calls only, bounded by the source limit.
`readArguments` reads string arguments from the streamed JSON prefix, decoding
each complete string and the one still growing, and never invents text.

**One copy at a time.** A reply copy enters `presence.ts` while it is mounted;
the call's row then stays a status line, opens only to show why a widget did not
pass the check, and does not open itself. Where no reply copy is on the page — a
view that draws no Chat nodes, or a call whose reply copy is hidden — the row
draws the widget itself, and a result that arrives while the reader watches
keeps the row open.

**The model's code lives only in the frame.** One `<iframe>` element, in
`widget.tsx`, with `sandbox={FRAME_SANDBOX}` (`allow-scripts allow-forms`), an
empty `allow`, no referrer, and a `srcdoc` that holds the content policy, the
theme, the base stylesheet, and the runtime, never the widget. The widget's
source reaches the frame by `postMessage` only. Nothing in this half uses
`innerHTML` or `dangerouslySetInnerHTML`; `document.ts` escapes the runtime so
no text in it can close its `<script>`. The isolation test holds all of this.

**The frame stays one element.** The document is written once, from the theme
the widget opens with, and never changes, so the frame never reloads while the
source streams or settles. A streamed source is posted at most every
`STREAM_INTERVAL_MS` and marked not final, so the runtime shows it without
running scripts or handlers; the settled source is posted at once, marked final,
after the shipped libraries it names have been sent. A settled widget's frame
mounts only when it comes within `NEAR_MARGIN` of the viewport, at the height
it last had. The frame element's `color-scheme` follows the theme, so a dark
frame stays transparent over the chat.

**Everything a frame sends is untrusted.** The widget's code shares the frame
with the runtime and can post anything, so `bridge.ts` reads each message
against the protocol's shapes and the policy's limits and drops the rest: a
height is clamped, kept values are bounded JSON, an error is cut short, and a
link must be http or https. A message to send or a link to open goes out only
when the reader has just clicked inside that very frame (a transient activation
with the frame focused), at most once every `SEND_INTERVAL_MS`; otherwise the
widget gets a notice that it was stopped. A frame that fires `load` a second time
has left its document, and is removed with a note.

**A widget the answer names stands there.** The model may write a ```widget
block whose only line is a card id; `placement.ts` finds it among the host's
code blocks, in the card's turn and after its row, marks it so the stylesheet
hides it, and adds one container after it, which `node-view.tsx` draws into
through `createPortal`; the card's own place is then empty, so the chat leaves
no gap. Only `placement.ts` reads or adds to the host's markup, and it never
removes or edits a host node. Each change of block gets a fresh container: the
widget remounts rather than having its frame moved, which would reload it under
the second-`load` rule. Before the card knows its row it renders only a hidden
marker, and the first report arrives in the same layout pass, so a reloaded
answer draws the widget once, already in place.

**The reader's scrolling over a frame reaches the chat.** Input events inside a
frame never reach the page, but a frame that cannot scroll passes the scroll on
to the chat, which tells the reader's scrolling from its own by the wheel,
touch, and key events it watches on the way down; without them it undoes the
scroll while it keeps a reading anchor. The frame names each such input and
`widget.tsx` repeats it on the frame element as a non-bubbling event that
scrolls nothing, at most once per `SCROLL_INTERVAL_MS` for each kind, a key only
while the frame has the focus. A widget that forges these can only make the chat
believe the reader scrolled.

**Messages go through the composer.** A widget's message calls
`inputActions.setDraft` and `submit` only when the composer is empty and idle;
otherwise the text is copied and the widget says so, and where the page refuses
the clipboard it shows the text to copy by hand.

**Runtime errors go back to the model on request.** Errors the frame reports
are listed under the widget with a button that sends them, with the card id, as
the reader's next message, so the model can redraw the widget with `revises`.

**What a widget keeps is the page's to store, not to read.** `edits.ts` keeps
each card's `dsh.state` value, its control values by element id, and its last
height, keyed by session and call, and writes each card's memory through to
local storage: one `dsh-intelligent-ui.card.v2:` key per card and an index of at
most 200 cards, oldest dropped first. A memory over 40 KB, a damaged entry, or a
storage that refuses leaves it for the page only. It is the only file of this
half that touches storage, and the page passes what it stored back to the frame
without interpreting it.

**A revision starts where the reader left off.** A widget whose meta names
`revises` starts from the earlier card's kept values. Once the revision's
result has settled, the earlier card is marked `revisedBy`, folds to one line
with a toggle that opens it for that view, and its row's status says it was
replaced. A reply copy disappears once a later card of the same turn revises it,
read from the turn's own data, so a widget the model redrew in the same answer
never stays in the reply.

**Read defensively.** Persisted meta comes from a possibly different build: every
field is guarded and every guard has a fallback (`read.ts`). Meta of API version
2 runs; a card of version 1, or one without a version, is from the DIL era and
shows the text version it carried; anything else shows nothing.

**Libraries load lazily, and only this package's.** `chunks.ts` takes the host
loader's `require.async` from the bundle wrapper, which serves only this
package's `client.lib-*.js` files. `libraries.ts` loads the files a widget's
addresses and module imports name, once per frame, and a host without lazy
loading leaves the widget to its code hosts.

**Styling is tokens only.** Class names under `dsh-iui-`, rules in `styles.css`,
theme tokens for every colour, radius, and font, and layout spacing in whole
steps of 4px. The stylesheet styles only the chrome around a widget: inside the
frame, `src/frame/base.css` applies.

**One bundle, three platforms, no platform branches.** This bundle serves the web
UI and both desktop apps of 0.2.1-rc.1 and later; add no platform-specific code
here and let nothing branch on the operating system.

**No harness client package.** Host controls are matched by copying their look
into `styles.css`; requiring any `@deepseek-ai/dsh-client-*` package is
forbidden.

## 3. Contents

- `AGENTS.md` — this file: what the browser half may do and what it must not.
- `index.ts` — the browser entry: `name`, `inject`, `apply`, and the stylesheet mount.
- `card-node.ts` — the Conversation Definition that places each widget in the
  reply, and the streamed-argument reader.
- `node-view.tsx` — the renderer of a widget in the reply: preview, settled
  widget, the replaced fold, and the earlier-version text.
- `placement.ts` — finding the answer's ```widget block for a card and
  adding the container it stands in.
- `presence.ts` — the record of reply copies on the page that tool rows defer to.
- `toolview.tsx` — the `ui_render` row: its status, why a widget failed the
  check, and, where no reply copy exists, the widget itself.
- `turn-data.ts` — the data-only Conversation Definition that collects cards per turn.
- `widget.tsx` — the widget: its sandboxed frame, the messages to and from it,
  sending, links, errors, kept values, and the replaced and earlier-version views.
- `document.ts` — the frame's fixed document: policy, theme, base styles, runtime.
- `bridge.ts` — the check on every message a frame sends.
- `theme.ts` — the chat's theme read as the frame's variables, and its watcher.
- `libraries.ts` — loading the shipped libraries a widget names.
- `chunks.ts` — the host's lazy loader, as the bundle wrapper hands it over.
- `read.ts` — defensive reading of persisted meta and slot props.
- `edits.ts` — what each widget keeps, written through to local storage.
- `clipboard.ts` — the page clipboard, where a message goes when the composer cannot take it.
- `locales.ts` — the chrome's Chinese and English copy and the translator.
- `host.ts` — structural types for the host props and services this half reads.
- `styles.css` — the chrome's stylesheet, inlined by the build.
- `text.d.ts` — the type of the modules the build inlines as text.

## 4. Progress

**Done.**

- `apply(ctx)` registers the row, the card node renderer and its Definition, the
  turn-data Definition, the copy, and the stylesheet, each as an effect
  (`tests/client.test.tsx`).
- The rewrite of 2026-11-17: widgets run in a sandboxed frame fed by message;
  the source streams in without running, then runs in document order; sending,
  links, kept values, revisions, runtime errors, shipped libraries, and theme
  changes all pass through checked messages (`tests/client.test.tsx`,
  `tests/bridge.test.ts`, `tests/runtime.test.ts`, `tests/isolation.test.ts`).
- Cards drawn by the DIL builds show the text version they carried.
- A widget stands where the answer writes a ```widget block naming it
  (`tests/placement.test.ts`, `tests/client.test.tsx`).
- The reader's wheel, touch, and scrolling keys inside a frame are repeated to
  the chat, which no longer pulls back a scroll started over a widget while it
  keeps a reading anchor (`tests/client.test.tsx`; headless Chrome in
  `docs/VERIFY.md`, step 14).
- Checked in headless Chrome on the built bundle (`docs/VERIFY.md`, Part 1):
  every widget the skill teaches runs with no error in both themes, shipped
  libraries load with the network refused, and a frame that navigates or sends
  without a click is stopped.

**Not done.**

- A widget cannot read the conversation's attachments; the host does not offer
  plugins that loader.

**Known defects.**

- A widget's script can loop forever. The frame shares the page's process in
  some browsers, and nothing in the page can stop a running script.
- A frame can navigate itself to an outside address; the request leaves before
  the second `load` removes the frame. What it can carry is what the widget
  already showed.
- The live streaming path has not run against a real model since the rewrite.

**Next goal.** Run the live checklist with a real model, and tune the row and
the notes from what it shows.
