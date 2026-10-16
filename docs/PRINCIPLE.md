# The architecture this plugin reproduces

## Sources

OpenAI has published no specification or API for Intelligent UI. Everything known about the original comes from third parties:

- [How ChatGPT Intelligent UI works](https://www.openui.com/blog/how-chatgpt-intelligent-ui-works) — Thesys (OpenUI) engineering, published one day after the feature shipped. They reimplemented OpenAI's server compiler to byte parity and ran the unmodified sandbox runner locally, so the wire format, the compiled program, and the operation stream below are observed, not inferred. This is the primary source for everything in "The original".
- [GPT-6 for everyone](https://openai.com/index/gpt-6-for-everyone/) — OpenAI's announcement. It returned 403 to automated readers, so its wording is known only through press coverage such as [@DIME](https://dime.jp/genre/2162284/). The behaviour claims here come from the teardown instead.
- [Open Intelligent UI](https://github.com/CopilotKit/OpenIntelligentUI) — CopilotKit's open-source answer to the same problem, which took the other architectural branch (free HTML in a sandbox) and is cited here as the contrast.
- [A2UI](https://github.com/a2ui-project/a2ui) — Google's declarative generative-UI specification, whose flat component list this plugin's compiled program resembles.

Where a statement below is an inference rather than an observation, it says so.

## The original

### The model writes a language, not markup

The model emits **DIL**: Markdown prose, JSX-like component tags, and JavaScript for state and logic.

```
## Team plan estimate
Drag the slider to see the **monthly price** for your team.
{@body const [seats,setSeats] = DIL.useState(8)}
{@body const price = seats*29}
<box border padding={3} gap={2}>
  <slider min={1} max={50} value={seats} onChange={setSeats}/>
  <title size="xl">${price}/mo</title>
</box>
```

One design constraint explains the whole language: it must be writable token by token **and usable while half-written**. Statements occupy their own lines and any open element can be auto-closed, so the server can cut the source at its last complete construct and still compile something.

### The server compiles, and the compiler is where the value is

The response is compiled into a JavaScript program plus a JSON document, stored on the message under a metadata key. Five things happen there, and all five are the reason the result feels native:

1. **Lowering.** Tags become `__dil.jsx(…)` calls, so the client needs no parser for the language.
2. **Error isolation.** Every expression is wrapped in a safe-evaluation helper, so one throwing expression drops one element instead of the render.
3. **Text and constants separate.** Static text is hoisted into a `constants` table, so as the answer streams "the growing text changes the data rather than the program".
4. **Stable state keys.** A state value carries its key, so a slider the reader moved to 9 does not snap back on the next recompilation.
5. **Repair and validation.** Incomplete statements are dropped, unclosed elements are closed, and invalid properties are removed against the component catalog and recorded as diagnostics such as `unknown_prop` and `invalid_literal`.

### The sandbox runs the program and sends back operations

The compiled program runs in a hidden `runner.html` frame with `sandbox="allow-scripts"` and a `default-src 'none'` policy, which starts a Web Worker. Before evaluating anything the worker removes its own network, timer, messaging, and dynamic-evaluation capabilities and freezes what remains; the program is then evaluated with `new Function` under a watchdog.

The runtime inside is a small reconciler. It renders, keeps hook state in keyed slots, diffs against the previous tree, and encodes the difference as an operation list — `CREATE #9 slider`, `SET min=1`, `PLACE under #8 at 0`. **Functions never leave the worker**: a handler crosses as an identifier such as `fn#1`. The page applies operations by instantiating its own components and rejects any operation naming a type it does not know, so model output cannot introduce markup or styling.

Dragging the slider sends a handler identifier and its arguments to the worker, which recomputes and returns a new operation list. **No model call happens.**

### The catalog is the real interface

Around seventy native components, design tokens for spacing, radius, colour, and size, and a 4px scale — `padding={3}` renders as 12px, `gap={2}` as 8px. The teardown's own conclusion matches the designers': the hard part of generative UI is not generating it, but making it "feel like it actually belongs".

### What the original got wrong

The same teardown measured the shipped behaviour, and the failures are more useful than the successes:

- **83% of streamed bytes were resent program.** A 6,341-character answer produced about 275 KB of patches because the program is one nested expression whose closing brackets change on every recompile, so it cannot be appended — only replaced.
- **State resets on reload.** Interaction state was sent to a view-state endpoint and lost.
- **The model cannot see interface state.** Asked directly, it could not report values the reader had changed; it only ever receives the text a follow-up button constructed.
- **A follow-up never modifies the existing interface.** Every turn produces a new program.
- **One click resent unchanged properties**: 158 operations, 4 of which changed anything.
- **Logic errors are silent.** One captured dashboard changed a revenue figure from $6,930 to $256,410 when the metric was switched, and nothing reported it.
- **Compiler diagnostics did not reach the model**, which repeated the same rejected property in later answers.

## The other branch

CopilotKit's Open Intelligent UI sends the model's raw HTML, CSS, and JavaScript into a null-origin iframe with a content policy that allowlists four CDNs, and reaches the host through a validated message bridge. Its parameter order is a contract — `initialHeight`, `placeholderMessages`, `css`, `html`, `jsFunctions`, `jsExpressions` — because CSS arriving first lets the reader see a styled skeleton before the markup lands.

That branch is more expressive and much harder to keep on-brand; its own documentation calls the output "unpredictable" and styling it "a dial, not a guarantee". Google's A2UI takes the third position explicitly: a declarative data format, never executable code, "safe like data, but expressive like code".

## What this plugin reproduces

The architecture, not the training. Each layer maps onto a mechanism DeepSeek Harness already documents for plugins.

| Original layer | This plugin |
|---|---|
| Model emits a component language | The model calls one tool, `ui_render`, with a DIL program in `source`: one statement per line, components nested by indentation, a quoted string filling a component's main text, and `{…}` interpolation in any text. A JSON envelope is also accepted. |
| Server compiles to a program plus constants | `src/lang/compile.ts` validates against the catalog, lowers readable expressions such as `seats * 29` to a closed JSON union, hoists literal text into a constants table, and repairs the tree instead of failing it, reporting every repair to the model. |
| Program persisted with the message | The compiled program rides in `output.presentationMeta`, which the harness persists as `tool/result.meta` and replays on reload. |
| Sandboxed runtime, operations to the page | The browser evaluates the program's expressions with the same total evaluator the host used and draws through a fixed registry keyed by catalog type. No model text is ever executed. |
| Interface shown with the answer | Two surfaces. While the turn runs, the `ui_render` tool row shows the card, with a preview compiled in the browser from the arguments as they stream. When the turn finishes and folds its tool rows, a turn-tail entry shows the settled cards under the reply; a data-only Conversation Definition collects them from the turn's own `tool/call` and `tool/result` events. |
| Component catalog plus design tokens | One table in `src/lang/catalog.ts` is the model's documentation, the validator's schema, and the renderer's allowlist; every colour, radius, and font is a host theme token. |
| Buttons continue the conversation | A button sends its prompt through the session's own composer, as an ordinary user message, and the card locks after one send. |

### Deliberate differences

**No code execution.** The original evaluates model-authored JavaScript in a hardened worker. This plugin has no such layer: expressions are a closed JSON union with no member access, no call form beyond named arithmetic helpers, and no dynamic evaluation, so the sandbox is the type system. A program is lossless JSON.

**The streamed channel is the source, not the program.** The original recompiles partial source and resends the whole program, which is where its 83% waste comes from. Here the browser compiles the arriving lines itself for the preview, and the compiled program is persisted once, when the result lands. Nothing is resent.

**Failures are visible and forgiving.** A rejected prop names itself, the accepted values, and the repair. A bad optional prop is dropped on its own, a component without a parent joins the nearest card, and only an empty program fails. A truncated program says so to the model. Dividing by zero renders an empty figure rather than a wrong one.

**The model sees what it built.** The tool result tells the model what a text-only reader sees, with the figures computed, and lists what the compiler repaired, so the next call is cleaner — the original's diagnostics never reached its model.

**The catalog is scoped to what the host can style natively.** Twenty-four components rather than seventy, each drawn from theme tokens. A smaller catalog the model uses correctly is worth more than a large one it half-remembers.

### Deliberate give-ups

**No free-form escape hatch.** The original offers `AppBlock`, an entire embedded web app. A plugin may not host a page in a slot, and a generated page belongs in the document preview as a file, not as a card.

**No cross-turn patch.** Following the original, a follow-up produces a new card rather than mutating the old one. Each card keeps its own state and its own numbers, which is honest about what the model saw when it wrote each one.

**Reader edits are not persisted.** They live for the page's lifetime and are shared between a card's two surfaces; a reload starts from the model's initial values, and nothing claims otherwise.

## Not verified

The behaviour above is proven by the unit suite in jsdom with real React. What a reader sees in the running harness is proven only by working through `VERIFY.md`.
