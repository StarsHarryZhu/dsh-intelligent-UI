# The architecture this plugin reproduces

## Sources

Neither OpenAI nor Anthropic has published a specification for its interactive answers. What is known comes from these:

- [How ChatGPT Intelligent UI works](https://www.openui.com/blog/how-chatgpt-intelligent-ui-works) — Thesys (OpenUI) engineering, published one day after the feature shipped. They reimplemented OpenAI's server compiler to byte parity and ran the unmodified sandbox runner locally, so the wire format and the operation stream below are observed, not inferred.
- [GPT-6 for everyone](https://openai.com/index/gpt-6-for-everyone/) — OpenAI's announcement, known here through press coverage such as [@DIME](https://dime.jp/genre/2162284/); the behaviour claims come from the teardown instead.
- Claude's inline visuals — Anthropic's version, known here from the guidance its own drawing tool hands the model, read in a Claude session on 2026-11-16, and from using it.
- [Open Intelligent UI](https://github.com/CopilotKit/OpenIntelligentUI) — CopilotKit's open-source answer, which takes the same branch as Claude.

Where a statement below is an inference rather than an observation, it says so.

## Two ways to answer with an interface

### A compiled language in a worker (ChatGPT)

The model writes DIL: Markdown prose, JSX-like component tags, and JavaScript for state and logic. The server compiles it into a program plus a constants table, repairing what is half-written and validating every property against a catalog of about seventy native components. The program runs in a Web Worker inside a sandboxed frame, stripped of its network, timers, and messaging before anything is evaluated; a small reconciler inside diffs each render and sends the page an operation list (`CREATE #9 slider`, `SET min=1`). The page draws its own components from those operations and rejects any type it does not know, so the result looks native and model output cannot introduce markup. For anything the catalog cannot express there is `AppBlock`: a whole HTML application in a sandboxed frame.

The teardown also measured what went wrong: 83% of streamed bytes were resent program, interaction state was lost on reload, the model could not see what the reader changed, a follow-up never modified an existing interface, logic errors were silent, and compiler diagnostics never reached the model.

### The model's own code in a sandboxed frame (Claude)

The model writes an HTML fragment or an SVG element, with styles first, content next, and scripts last. It streams into a sandboxed frame as it is written, and the scripts run once it is complete. The frame carries the host's colour variables and pre-styled controls, so bare HTML already looks like the host; it may load libraries from an allowlist of CDNs; and a `sendPrompt` function turns a click into the reader's next message. Written guidance carries the design judgement: when to draw, how to keep it on-brand, and that a diagram of a system with a control should give the reader that control.

That branch is more expressive — any chart library, a 3D scene, a physics simulation, a game — and its look is guidance rather than a guarantee. CopilotKit's version works the same way, with the parameter order (CSS before HTML) as a contract so that a styled skeleton appears first.

## What this plugin does

It takes the second branch, as one engine, and keeps what the plugin had built on DeepSeek Harness that neither original has. Each layer maps onto a mechanism the harness documents for plugins.

| Layer | This plugin |
|---|---|
| The model writes a widget | One tool, `ui_render`, with the widget in `source`: an HTML fragment or one `<svg>`, styles first, then content, then scripts; plus an optional `title` and `revises`. The description (under 4000 characters) names what the frame provides; a bundled skill carries the judgement and complete widgets. |
| Checked before it is shown | `src/host/check.ts` compiles each inline script, module, and handler with `node:vm` — compiled, never run — so a syntax error comes back with its line and the model rewrites the widget in the same turn. Blocked addresses and habits the sandbox defeats come back as notes on a widget that is shown. |
| Persisted with the message | The checked source rides in `output.presentationMeta` (`version: 2`), which the harness persists as `tool/result.meta` and replays on reload. The model reads a summary: shipped libraries, fetched addresses, control ids, what its buttons send, the visible text, and its card id. |
| Shown inside the answer | A Conversation Definition of the plugin's own builds one Chat node per call, a hair after the call's tool row and at the `turn` group-tree position, so the widget stands between the text written before the call and the text written after it, and a finished turn folds its process rows around it. The tool row stays a status line. Or the answer names the widget in a ```widget block holding its card id, and the widget stands there instead (see below). |
| Streaming | The node shows the widget while its arguments stream: the page posts each prefix to the frame, which morphs it into the body with every handler stripped and no script run, keeping unchanged elements so it does not flicker. When the result lands, the frame runs the scripts in document order, as a page load would. The frame is one element throughout and never reloads. |
| Native look | The page reads the chat's theme tokens and sends them into the frame as short variables; a base stylesheet styles bare buttons, inputs, sliders, selects, tables, and code like the host's, and adds a few classes, nine colour ramps, and six series colours, in both themes. |
| Libraries | Fifteen libraries ship with the plugin, pinned by version and digest. A widget names them by their usual CDN address; when the address names a shipped library and major version, the frame loads the shipped copy, so it works offline. Anything else loads from the allowlisted CDNs. |
| Clicks continue the conversation | `sendPrompt(text)`, a button with `data-prompt`, or a form with `data-send` sends the reader's next message into the session as an ordinary user message, through the host's own conversation service, leaving the composer and any draft in it alone. |

### The security boundary

The model's code never runs in the page. It exists only inside one kind of frame:

- `sandbox="allow-scripts allow-forms"`: no same origin, so no access to the page, its storage, or its cookies; no top navigation, popups, modals, or downloads. Forms are allowed only so that `submit` events fire for the widget's own handlers.
- An empty `allow`, so no camera, microphone, or location, and no referrer.
- A content policy in the frame's own document: `default-src 'none'`, with scripts, styles, fonts, images, and requests let through only inline, from `blob:` and `data:`, and from four CDNs (cdnjs, jsDelivr, unpkg, esm.sh) and Google Fonts; `frame-src`, `object-src`, `form-action`, and `base-uri` are `'none'`.
- The frame's document holds no part of the widget: the source arrives by message. Nothing the page sends in carries a token, a session id, or another card's data.
- The page trusts nothing the frame sends. Every message is checked against its shape and the limits; a message to send or a link to open goes out only when the reader has just clicked inside that frame, at most once a second; a link must be http or https; kept values are bounded JSON the page stores without reading.
- The reader's input inside a frame never reaches the page, yet the chat tells the reader's scrolling from its own by that input. So the frame names a wheel, a touch, or a scrolling key, and the page repeats it on the frame element as an event that does not bubble and scrolls nothing; otherwise the chat, while it keeps a reading anchor, would undo every scroll started over a widget.
- A frame that loads a second time has navigated away from its document, and is removed.
- The page's own code never writes markup: no `innerHTML`, no `dangerouslySetInnerHTML`. Only the runtime inside the frame parses HTML.

`tests/isolation.test.ts` holds the page code to these rules mechanically.

### Deliberate differences

**Errors reach the model.** A syntax error is caught before the widget is shown, with its line, while the model can still fix it in the same turn. A runtime error is listed under the widget with a button that sends it, with the card id, as the reader's next message, so the model redraws it with `revises`. The originals' diagnostics did not reach their models.

**What the reader set survives a reload.** The frame keeps every control with an id, and whatever a widget stores with `dsh.state`, by sending it to the page, which writes it to the browser's local storage, keyed by session and call, for the 200 most recent cards. A reload, a scroll back, or a restart shows the widget as the reader left it. It belongs to that viewer: another browser, and the session log, still start from the widget as the model wrote it.

**A follow-up revises a widget.** Each result tells the model its card id; a later call with `revises=` that id draws a new widget that starts from the earlier one's kept values. The earlier widget is not deleted — the session log keeps every result — but it is no longer shown in full: redrawn in the same turn, it leaves the reply; revised in a later turn, it folds to a line the reader can open.

**A widget can stand anywhere in the answer.** In the originals a widget stands where the model calls the tool, so an answer that interleaves text and widgets has to alternate writing and calling. The models this plugin serves tend to call every tool first and write the answer last, which gathers the widgets above the text. So each result also hands the model a ```widget block holding the card id: written into the answer, it marks where the widget stands, and the page moves the widget there and hides the block. The host's Markdown offers plugins no hook for this, so `src/client/placement.ts` finds the block among the host's rendered code blocks by its text, outside the reader's own messages; it only marks blocks and adds a container after the one a widget takes, and where the host's markup changes, the block stays an ordinary code block and the widget stays where it was called. A reader who copies the answer, or a client without the plugin, sees the block.

**A wrong block never shows the reader an id.** Models get the block wrong in a few ways, all seen in real sessions: they write one for a widget they never drew, name an earlier answer's widget to show it again, write it before the call it belongs to, or miscopy a character. `src/widget/blocks.ts` decides from the blocks and the cards: a block naming a card, or the card it replaced, takes it in that card's turn or a later one, the latest turn winning; a block that looks like a card id but names none takes the card of its turn that no block named; and every block that names a card or looks like one is hidden, filled or not. A block for a widget that was never drawn therefore leaves nothing in view, and the description, each result, and the skill tell the model that a block never draws a widget.

**A widget's layout holds still.** In the originals a number that grows beside a slider pushes the slider, so the thumb runs from the pointer and the answer jumps. Here, once a widget has run and before it is painted, the frame walks its controls through their values, measures what changes, and keeps the largest size each element reached; afterwards nothing the reader does makes an element shrink, and a dragged slider holds its place. The cost is some empty room beside a short value.

**Libraries are local first.** The originals load libraries from CDNs. Here the common ones ship with the plugin, as lazily loaded files fetched only when a widget names one, so a widget works offline and leaks nothing to a CDN; the CDN remains for everything else.

**Numbers come with error control.** `dsh.math` offers integration (adaptive Gauss–Kronrod, infinite bounds), derivatives (Ridders extrapolation, refusing at a corner), limits, and root finding; each returns `NaN` rather than a number it cannot vouch for.

**The judgement travels as a skill.** The description stays short because it is sent with every request; a bundled skill, registered the way the host's own skill packages register theirs, carries the rest, and the model loads it only when a task matches.

### Deliberate give-ups

**No native components.** ChatGPT draws its own seventy components from operations; here the look is the host's through variables and a base stylesheet, which a widget can override. It is guidance, not a guarantee.

**No services behind the widget.** Image search, entity and citation cards, map tiles, and product cards depend on services DeepSeek Harness does not offer plugins. A map can load its shapes from a CDN, as data.

**No attachments.** A widget cannot add a file to the conversation: the host does not open its attachment loader to plugins.

**The model does not see the widget.** It reads a summary of what it wrote, not a picture; the syntax check, the runtime error button, and `revises` are what close the loop.

**No half-written widget after a stop.** When a turn stops while the model is still writing a widget, the host hides the call's row and never records the arguments that had streamed.

**Cards from before the rewrite show text.** The DIL engine is gone; a card it drew shows the text version it stored.

## Known risks

- A widget's script can loop forever. Whether that freezes only the frame or the whole page depends on whether the browser puts the frame in its own process, and nothing in the page can stop a running script.
- A frame can navigate itself to an outside address. The request leaves before the page sees the second load and removes the frame; what it can carry is what the widget already showed, as with a remote image in Markdown.
- A widget is one to five thousand tokens rather than a few hundred, so it takes longer and costs more to write. Streaming shows it as it grows.

## Not verified

The rewrite is proven by the unit suite (jsdom with real React, the frame runtime read back out of the built bundle) and by headless Chrome on the built bundle: every widget the skill teaches ran with no error in both themes, shipped libraries loaded with the network refused, and a frame that navigated or sent without a click was stopped (`VERIFY.md`, Part 1). A live model has written a widget for this engine on the macOS desktop app (2026-11-17): it drew, its shipped library loaded offline, and its button sent the next message. The rest of Part 1 and the other two hosts are still open.
