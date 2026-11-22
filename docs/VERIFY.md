# Verifying widgets in the running harness

The unit suite proves the host check, the tool, the frame runtime in jsdom, and the browser half in jsdom with real React. It cannot prove what a reader sees in the running harness, because that needs the harness serving this bundle and a model writing widgets. This checklist closes that gap in three parts: the web UI, the desktop apps (macOS and Windows), and what only Windows can show. Work each part top to bottom; a later step assumes the earlier ones passed.

The plugin requires DeepSeek Harness 0.2.1-rc.1 or later (`engines.dsh` `>=0.2.1-rc.1 <0.3.0-0`) and supports three hosts: the web UI, the macOS desktop app, and the Windows desktop app. All three parts are required. Only the macOS desktop app has run the sandboxed engine live, on 2026-11-17; see "Recorded runs".

The prompts below cost a few model calls. Run them in a new session whose title marks it as a test, and keep it afterwards as a record. Automation that types into the composer may drop Chinese text; write the prompt in English and add "Reply in Chinese" where the step needs Chinese.

# Part 1 — Web UI

## 0. Build and test

```sh
cd /Users/starfield/Documents/deepseek-harness/my_plugins/dsh-intelligent-UI
node scripts/link-dev.mjs
node scripts/vendor.mjs
node build.js && node node_modules/vitest/vitest.mjs run
git -C ../../deepseek-harness status --porcelain
```

Pass: the vendor script reports every file present and matching, the build prints `self-check passed` and the number of shipped libraries, every test passes, and the last command prints nothing.

## 1. Enable the bundle and restart

The harness loads the host half once per process, so a rebuilt host half or a changed skill needs a restart; the browser bundle and the library files are read again on every page load. With the server stopped, make sure the profile selects the bundle: `~/.dsh/profiles/web/package.json` lists `"dsh-intelligent-ui"` under `dsh.profile.bundles` (the Plugin Manager's switch writes exactly this). Then start the server from the checkout and open the URL it prints:

```sh
cd /Users/starfield/Documents/deepseek-harness/deepseek-harness && pnpm dsh web --no-open
```

Pass: the server starts without an activation error naming `dsh-intelligent-ui`.

## 2. Both halves are live

In the page's developer console:

```js
window.__DSH_BOOT__.entries.some(entry => entry.id === 'dsh-intelligent-ui')
document.querySelectorAll('style[data-plugin="dsh-intelligent-ui"]').length
```

Pass: `true`, then `1`. The console shows no `client-modules` error, no `web boot: … did not activate`, no `slot entry crashed` naming `tool.call.toolview` or `conversation.chat.node`, and no raw-data block labelled with the kind `dsh-intelligent-ui.card`.

## 3. A card from before the rewrite shows its text (no model call)

Open a session that holds a settled `ui_render` call made by a DIL build (version 0.1.8 or earlier). If the turn is above the loaded window, click "load earlier".

Pass: where the card stood, its text version appears with the note that it comes from an earlier version of the plugin; its row reads as an earlier card; the transcript around it is unaffected and nothing reaches the network.

## 4. A widget, live

Start a new session in the standard mode and send:

> I put $300 a month into an index fund. Show me how it grows over 30 years with sliders for the monthly amount and the yearly return, as a chart of the total against what I paid in.

Pass:

- The model loads the skill and reads `charts.md` before writing (visible in its process).
- While the model writes the call, the widget appears in the reply below the call's row and grows as it is written, with its controls styled and no chart yet; the row shows only its status.
- When the result lands, the chart draws in place without the widget reloading or jumping; the row reads `Shown · N lines`.
- When the turn finishes, its process folds and the widget stays between the text written before the call and the text after it.
- Moving a slider redraws the chart and the total at once, with no request in the network panel and no new turn. The total at $300 and 5% reads about $249,678.

Then, in a new session, send:

> Explain the three MIPS instruction formats, R, I, and J. Give each format an interactive widget that lets me pick an instruction and see its fields, and put each widget inside your answer right after the paragraph about that format.

Pass:

- Each widget stands inside the final answer, right after the paragraph about its format, where the answer wrote a ```widget block with its card id; the blocks themselves are not shown, and nothing is left where the calls were.
- The browser console shows no React error. Reloading the page and reopening the session show the widgets in the same places, with what was set in them.
- With the plugin disabled (step 16), each place shows a code block holding the card id.

## 5. Shipped libraries load from the plugin

With the network panel open, reload the page and scroll to the widget of step 4.

Pass: the page fetches `client.lib-chartjs.js` from the plugin's own module route, once, and nothing from `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `unpkg.com`, or `esm.sh`. The model's result for step 4 listed `Chart.js 4` under the shipped libraries.

## 6. A click sends the next message

Send:

> Estimate the monthly payment on a $300,000 mortgage with sliders for the amount and the rate and a choice of term, and add a button that asks whether a shorter loan is better.

Pass: with the composer empty, the button sends its question as an ordinary user message, and the model answers it. With text typed in the composer first, the press leaves that draft untouched and the widget says the question was copied instead (or shows it to copy, where the page refuses the clipboard).

## 7. A form sends several answers at once

Send:

> Quiz me on basic chemistry: two fill-in blanks and one question with several correct options, all sent together.

Pass: the reader fills in the blanks, ticks options, and presses the form's button; one user message arrives with the form's lead text and one `name: value` line per field, the ticked options by their labels. The model grades the answers. A second press does not send again if the widget locks itself, as `forms.md` teaches.

## 8. A syntax error comes back before anything is shown

Send:

> Call ui_render with exactly this source, then fix whatever it reports: `<p id="out">0</p><script>let n = ; document.getElementById('out').textContent = n</script>`

Pass: the first result says the widget was not shown and names the `SyntaxError` with its line; nothing is drawn for that call in the reply, and its row says the widget did not pass the check and opens to show why; the model calls again in the same turn with a fixed script, which is shown.

## 9. A runtime error goes back on request

Send:

> Call ui_render with exactly this source: `<p class="note">Throws on purpose.</p><script>undefinedFunction(1)</script>`

Pass: the widget is shown with the runtime error listed under it and a button to have the model fix it. Pressing the button sends the error and the card id as the reader's next message; the model calls `ui_render` with `revises=` that id, and the earlier widget folds to one line that can open it again.

## 10. What the reader set survives a reload

On the widget of step 4, move both sliders. Reload the page, and separately quit and restart DSH web.

Pass: after each, the widget comes back with the sliders where they were left and the chart and total to match, at its last height with no jump.

## 11. Themes and language

Switch the host between the light and the dark theme, and between Chinese and English.

Pass: every widget follows the theme at once (text, surfaces, controls, and the chart's series colours where the widget redraws on `dsh:theme`); a frame never paints an opaque block behind its content; the chrome around a widget (row status, notes, buttons) follows the language.

## 12. The sandbox holds

Send, as one message:

> Call ui_render with exactly this source: `<p id="a">probe</p><script>const out = []; try { out.push(String(parent.document.title)) } catch (e) { out.push('no parent') } try { localStorage.setItem('x', '1'); out.push('storage') } catch (e) { out.push('no storage') } fetch('https://example.com/').then(() => out.push('fetched'), () => out.push('no fetch')).finally(() => { document.getElementById('a').textContent = out.join(', ') }); setTimeout(() => sendPrompt('sent by a timer'), 500)</script><button onclick="location.href = 'https://example.com/'">Leave</button>`

Pass: the widget reads `no parent, no storage, no fetch`; the timer's message is not sent and the widget says a message was stopped; pressing Leave removes the widget with the note that it tried to leave its frame. The host check warned about the storage habit in the result.

## 13. A library the plugin does not ship

Send:

> Call ui_render with a widget that draws a bouncing ball with p5.js from https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js.

Pass: the result lists the address under fetched addresses, not shipped libraries; the network panel shows it loaded from jsDelivr; the ball moves.

## 14. Scrolling over a widget

Open a session whose earlier turns hold several widgets. Jump to one of those turns with the turn navigator, or press the button that loads earlier turns. Then, with the pointer over a widget, scroll up and down with the wheel or the trackpad; click inside a widget and scroll with Page Up and Page Down.

Pass: the chat scrolls under the pointer as it does over text, and is never pulled back to where it was.

## 15. Nothing else moved

```sh
git -C /Users/starfield/Documents/deepseek-harness/deepseek-harness status --porcelain
```

Pass: no output.

## 16. Removing it changes nothing else

Disable the plugin in Settings → Plugins and restart DSH web. Open the sessions of steps 3 to 14.

Pass: every session opens; the calls show as ordinary tool rows with no widget; no session line holds a plugin-owned event type (`grep -c '"type":"dsh-intelligent-ui' <session file>` reads 0 after decompressing it with `zstd -dc`). Re-enable the plugin and restart: the widgets come back with what the reader set.

## 17. The skill is a part of the plugin

Pass: Settings → Plugins lists two rows, 渐进式交互 and 渐进式交互 · 技能 (Intelligent UI and Intelligent UI · Skill), both running; typing `/` lists `dsh-intelligent-ui` among the skills. Switching the skill row off removes it from `/` without a restart while widgets keep drawing.

# Part 2 — Desktop apps (macOS and Windows)

The desktop apps wrap the same web client and load the same `dsh.client` declaration, so every step of Part 1 from step 2 on applies unchanged. What differs is how the plugin gets into the desktop profile, and one default. Run this part on any new desktop version, in a throwaway session first, before claiming that version.

## D1. Install into the desktop profile

The desktop app keeps its own profile, `~/.dsh/profiles/desktop` (on Windows `%USERPROFILE%\.dsh\profiles\desktop`), so a plugin installed for the web UI is not installed there. Install it from the app itself, on either platform: Settings → Plugins → 添加插件 / Add plugin, with the GitHub URL `https://github.com/StarsHarryZhu/dsh-intelligent-UI`. On Windows, `git` must be on `PATH`. Recent apps manage the desktop profile themselves and refuse changes from the command line.

Pass: the install reports success with no compatibility error (a host older than 0.2.1-rc.1 is refused, which is expected). Restart the app, then open an existing conversation and confirm it still loads before going on.

## D2. The plugin is live

Open the app's developer tools and run the two console expressions of step 2.

Pass: `true`, then `1`, and Settings → Plugins lists both rows of step 17.

## D3. The standard transcript view

The desktop apps default to the `standard` transcript view, which keeps a running turn's tool rows collapsed. Run step 4.

Pass: while the turn runs, the step group is collapsed and the widget still grows in the reply, outside it; when the turn finishes, the widget stays where it was drawn.

## D4. The rest

Run steps 5 to 14 and step 16 in the app.

Pass: as written for the web. The desktop app grants the clipboard, so in step 6 the widget says the question was copied, and pasting shows it.

# Part 3 — Windows only

These can only be seen on Windows; everything else is shared with macOS. W1 and W3 need the Windows desktop app and belong to Part 2; W2 and W4 check a clone of this repository and apply whenever someone develops on Windows.

## W1. Installing from GitHub

Pass: the install in D1 succeeds from a machine where `git` is on `PATH`. Without git, the install fails with `GIT_FETCHER_GIT_NOT_FOUND`; install Git for Windows and retry.

## W2. Line endings

In a clone of this repository on Windows:

```powershell
git ls-files --eol skills/dsh-intelligent-ui/SKILL.md lib/client.js
```

Pass: both show `w/lf`; `.gitattributes` keeps them LF whatever `core.autocrlf` says.

## W3. Rendering

On the widgets of steps 4 and 7, at 100% and at 150% display scaling:

- Pass: Chinese and Latin text both use the host's fonts (Segoe UI and Microsoft YaHei), with no SimSun fallback.
- Pass: the chart's lines and labels are crisp, and the frame's height fits its content with no inner scrollbar.
- Pass: nothing of a widget sits under the window's caption buttons.

## W4. Development on Windows

```powershell
node scripts/link-dev.mjs
node scripts/vendor.mjs
node build.js; node node_modules/vitest/vitest.mjs run
```

Pass: the linker creates directory junctions without asking for administrator rights, the vendor script's digests match, and every test passes.

# Recorded runs

- 2026-11-22, live on the macOS desktop app (0.2.2-rc.3, DeepSeek-V4.1-Flash at Max), `link:` to this checkout, a new standard-mode session, the second prompt of step 4. The model loaded the skill, called `ui_render` seven times (three widgets and four redraws with `revises`), then wrote the answer with three ```widget blocks, each right after the paragraph on its format and each naming the latest card. In the window, all three widgets stood inside the answer at their blocks, the blocks were not shown, the seven card rows at the calls were empty (0 px, no gap), and each frame loaded with its own height (311–344 px) when scrolled near. Cards of earlier answers in another session, which have no blocks, still stood at their calls. Not yet run: the reload, the prompt without a placement request, the screenshot, and the plugin switched off.
- 2026-11-17, live on the macOS desktop app (0.2.2-rc.1), the plugin installed by `link:` from this checkout, in the standard view. A model wrote a compound-interest widget with three sliders, a Chart.js line chart, a `dsh.state` pin button, and a `data-prompt` button; the host check passed, the result named the shipped Chart.js copy, the widget drew in the reply, and the prompt button sent its text as the reader's next message (step 6). The sliders and the pin button were not separately reported; steps 4, 5, and 7 to 13 have no live pass.
- 2026-11-17, the built bundle in headless Chrome (playwright-core with the system Chrome), on a static page that loads the host's built stylesheets and draws each widget through the plugin's registered card node renderer, after each source passed the built tool; no running harness and no model. Steps 4 to 13 have **not** run live yet; this run covered their mechanics.
  - Every complete widget in the skill (thirteen) ran with no runtime error in the light theme and, with stand-in values for the host's dark tokens, in the dark theme, with every request outside the page refused. The dark run found the frame painting an opaque background (fixed: the frame element's `color-scheme` follows the theme) and Mermaid's edge labels on black boxes (fixed in `diagrams.md`).
  - With the network refused, the shipped copies of Chart.js 4 (written as cdnjs 4.4.1), KaTeX 0.16 with its fonts and auto-render, Three.js 0.160 through an import map with `three/addons/` and OrbitControls, Mermaid (written as 10, served 11), and Tabler Icons drew.
  - A click on `data-prompt` sent its text once; `sendPrompt` from a timer was stopped with a note; a frame that set `location.href` was removed with a note; a form submitted by script to an outside address stayed in place; inline `onclick` and `oninput` handlers worked after streaming; a streamed source showed its content before its script ran, ran it only after the result, in the same frame element; a slider and a `dsh.state` counter came back after a page reload.
- 2026-11-17, headless Chrome, scrolling over a widget (step 14's mechanics). A wheel over a sandboxed frame scrolled the page while no `wheel` event reached the page's listeners. On the static page with a stand-in for the chat's reading anchor (any scroll that no wheel, touch, or scrolling key started is undone, as the chat does after a turn jump or loading earlier turns), four wheel ticks over the estimate widget were all pulled back with the 0.2.0 bundle; with this build the page saw four reader inputs and scrolled 480 px with nothing pulled back. Not yet run in the real chat.
- Runs of the DIL builds, from 2026-10-16 to 2026-11-16, verified an engine this build no longer has; their records are in the git history of this file.

# Not verified

Steps 5 and 7 to 14 have no full live pass, and step 4's first prompt has none: streaming, the form, runtime errors, reload, and themes were exercised only in headless Chrome. Step 4's second prompt passed live on 2026-11-22, including four `revises` redraws. The web UI and the Windows desktop app have not loaded this build, and W4 has never passed. Whether a widget that loops forever freezes only its frame or the whole page has not been tried in the web UI or either desktop app.
