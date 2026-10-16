# Verifying cards in the running harness

The unit suite proves the compiler, the math engine, the tool definition, the skill, and the browser half in jsdom with real React. It cannot prove what a reader sees in the running harness, because that needs the harness serving this bundle. This checklist closes that gap in three parts: the web UI, the desktop apps (macOS and Windows), and what only Windows can show. Work each part top to bottom; a later step assumes the earlier ones passed.

The plugin requires DeepSeek Harness 0.2.1-alpha.1 or later (`engines.dsh` `>=0.2.1-alpha.1 <0.3.0-0`) and supports the web UI only. **Parts 2 and 3 are suspended**: desktop adaptation is paused until the desktop app ships 0.2.1-alpha.1 or later (see the root `AGENTS.md`). They are kept for that day.

The prompts below cost a few model calls. Run them in a new session whose title marks it as a test, and keep it afterwards as a record.

# Part 1 — Web UI

## 0. Build and test

```sh
cd /Users/starfield/Documents/deepseek-harness/my_plugins/dsh-intelligent-UI
node scripts/link-dev.mjs
node build.js && node node_modules/vitest/vitest.mjs run
git -C ../../deepseek-harness status --porcelain
```

Pass: the build prints `self-check passed`, every test passes, and the last command prints nothing.

## 1. Enable the bundle and restart

The harness loads the host half once per process, so a rebuilt host half or a changed skill needs a restart; the browser bundle is read again on every page load. With the server stopped, make sure the profile selects the bundle: `~/.dsh/profiles/web/package.json` lists `"dsh-intelligent-ui"` under `dsh.profile.bundles` (the Plugin Manager's switch writes exactly this). Then start the server from the checkout and open the URL it prints:

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

Pass: `true`, then `1`. The console shows no `client-modules` error, no `web boot: … did not activate`, and no `slot entry crashed` naming `tool.call.toolview` or `conversation.chat.turnTail`.

## 3. A persisted card renders (no model call)

Open any session that holds a settled `ui_render` call made by a build that writes `version: 1` (every build from the program-version reset on). If the turn is above the loaded window, click "load earlier".

Pass: the cards appear under that turn's reply. Moving a slider changes its figures at once, with no request in the network panel and no new turn.

A card persisted before the version fields existed (on the development machine: the `deepseek-harness` workspace session `9cecadfb…`, turn 11) shows its text version with the note that it comes from another version of the plugin, and the transcript around it is unaffected.

## 4. A math card, live

Start a new session in the standard mode and send:

> Make a card with a slider for the upper limit a from 0 to 3: show the integral of x² from 0 to a as a formula with its value, plot y = x² with the integral's area shaded, and draw the tangent at x = a.

Pass:

- While the model writes the call, the `Interactive` row shows a growing preview.
- When the turn finishes, it folds and the card stays under the reply.
- The card shows the typeset integral, its value, and a plot with a shaded area, a marked point, and a dashed tangent.
- At the initial a, the figures read area = a³/3 and slope = 2a.
- The reply quotes the same figures the card shows.

## 5. Interaction costs nothing, and the figures are right

Open the network panel, then move the slider to its maximum (a = 3).

Pass: the integral and the shaded area read 9 and the slope reads 6; the readout under the plot says `x = 3 · y = 9 · slope = 6 · area = 9`. No request appears and no new turn or step appears.

## 6. Two curves and a degree slider

Send:

> Make a card showing the Taylor polynomial of sin x at 0: a slider for the degree n from 1 to 15, sin x and the polynomial on one plot, the error at x = 2, and the limit of sin(x)/x at 0 as a formula.

Pass: two curves with a legend; the limit formula shows `= 1`; at degree 3 the error at x = 2 reads about -0.2426, and at degree 15 about -3.64e-10. The polynomial's curve leaves the plot box cleanly instead of stretching it.

## 7. The skill

In the trajectory of step 4, look for a `skill` call naming `dsh-intelligent-ui`. Then type `/dsh-intelligent-ui` in the composer and send it.

Pass: the model loaded the skill before its first card, or the slash command injects the skill's text. Either proves the registration.

## 8. Buttons continue the conversation

Send:

> Ask me one multiple-choice question about derivatives as a card with A/B/C/D buttons.

Then type a sentence into the composer without sending it, and click an answer.

Pass: the draft stays untouched and the card says the answer was copied — or, where the page refuses the clipboard, shows the answer's text to copy by hand. Clear the composer and click the answer again: it is sent as your message, the model replies, and the card's buttons lock with the chosen one marked `Sent`.

## 9. A bad program reports instead of breaking

Send:

> Call ui_render once with source set to exactly "hologram", then tell me what the result said. Do not retry.

Pass: the row shows `The interface did not compile`; the model reports the diagnostic; the rest of the transcript is intact.

## 10. Reload, themes, and language

Reload the page and reopen the session from step 4.

Pass: every card is still under its reply, back at the model's initial values. Switch the theme between light and dark: plots, formulas, and controls follow, with no unreadable text. With the interface language set to Chinese, the row label reads `交互界面` and the footer note is Chinese.

## 11. Nothing else moved

Pass: other tools' rows, the composer, and the sidebar look and behave as before; `git -C /Users/starfield/Documents/deepseek-harness/deepseek-harness status --porcelain` prints nothing.

## 12. Removing it changes nothing else

Turn the plugin off in Settings → Plugins, restart the server, reload, and reopen the sessions from steps 3 and 4.

Pass: every session opens; the `ui_render` calls show as ordinary tool rows and no card appears under the replies; `/dsh-intelligent-ui` is no longer offered. The session log holds no event type of this plugin's own:

```sh
zstd -dc "$HOME/.dsh/sessions/<encoded-cwd>/<session-dir>/session.v4.jsonl.zstd" | grep -c '"type":"dsh-intelligent-ui'
```

Pass: `0`. Then turn the plugin on again, restart, and confirm the cards return.

## 13. An animated card

Keep the Browser window in view: a hidden page paints no animation frames, so playback pauses there. Send:

> 用一张卡片演示冒泡排序在数组 [4, 2, 3, 1] 上逐行执行的过程：要能播放/暂停、单步前进后退，高亮当前执行的代码行，并显示每一步的 i、j 和数组状态。

Pass: the program compiles with no repair and uses `player`, `pick`, and `steps … current= mono=true`. The player sits at the bottom of the card, wherever the program wrote it. Play runs from the first frame to the last in the card's `duration` and stops; pressing play again starts over. Step back and step forward move one frame; dragging the bar jumps and pauses; the speed button cycles 1×, 2×, 0.5×, and 2× halves the run. The highlighted line, the variables, and anything else bound to the frame follow every frame, with no request in the network panel.

# Part 2 — Desktop apps (macOS and Windows)

**Suspended.** On the desktop app of 2026-10-16 (0.2.0-rc.2) the install now fails the compatibility check by design. When the desktop app reaches 0.2.1-alpha.1, run this part again, first in a throwaway session: in the last run, with the plugin loaded, past conversations in the desktop app failed to open.

The desktop apps wrap the same web client and load the same `dsh.client` declaration, so every step of Part 1 from step 2 on applies unchanged. What differs is how the plugin gets into the desktop profile, and one default.

## D1. Install into the desktop profile

The desktop app keeps its own profile, `~/.dsh/profiles/desktop` (on Windows `%USERPROFILE%\.dsh\profiles\desktop`), so a plugin installed for the web UI is not installed there. Install it from the app itself, on either platform: Settings → Plugins → 添加插件 / Add plugin, with the GitHub URL `https://github.com/StarsHarryZhu/dsh-intelligent-UI`. On Windows, `git` must be on `PATH`.

On macOS the app's own command line does the same, with the app quit:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/StarsHarryZhu/dsh-intelligent-UI
```

Pass: the install reports success with no compatibility error (the plugin declares `engines.dsh` `>=0.2.1-alpha.1 <0.3.0-0`; a desktop app older than 0.2.1-alpha.1 is refused, which is expected). Restart the app, then open an existing conversation and confirm it still loads before going on.

## D2. The plugin is live

Open the app's developer tools (View → Toggle Developer Tools, or the shortcut the app shows) and run the two console expressions of step 2.

Pass: `true`, then `1`, and Settings → Plugins lists 渐进式交互 / Intelligent UI as enabled.

## D3. The standard transcript view

The desktop apps default to the `standard` transcript view, which keeps a running turn's tool rows collapsed. Run step 4.

Pass: while the turn runs, the step group is collapsed (expand it to see the row's live preview); when the turn finishes, the card appears under the reply. Switching the transcript view to `detailed` in Settings shows the preview in place, as on the web.

## D4. The rest

Run steps 5 to 10 and step 12 in the app.

Pass: as written for the web. In step 8 the desktop app grants the clipboard, so the card says the answer was copied, and pasting shows it.

# Part 3 — Windows only

These can only be seen on Windows; everything else is shared with macOS. W1 and W3 need the desktop app and are suspended with Part 2; W2 and W4 check a clone of this repository and apply whenever someone develops on Windows.

## W1. Installing from GitHub

Pass: the install in D1 succeeds from a machine where `git` is on `PATH`. Without git, the install fails with `GIT_FETCHER_GIT_NOT_FOUND`; install Git for Windows and retry.

## W2. Line endings

In a clone of this repository on Windows:

```powershell
git ls-files --eol skills/SKILL.md lib/client.js
```

Pass: both show `w/lf`; `.gitattributes` keeps them LF whatever `core.autocrlf` says.

## W3. Rendering

On the card from step 4, at 100% and at 150% display scaling:

- Pass: Chinese and Latin text both use the host's fonts (Segoe UI and Microsoft YaHei), with no SimSun fallback in the formula or the plot labels.
- Pass: the formula's fraction bars, radical line, and integral limits line up with the text; the plot's curve, tangent, and dot are crisp.
- Pass: a wide table scrolls horizontally with a thin scrollbar.
- Pass: nothing of the card sits under the window's caption buttons.

## W4. Development on Windows

```powershell
node scripts/link-dev.mjs
node build.js; node node_modules/vitest/vitest.mjs run
```

Pass: the linker creates directory junctions without asking for administrator rights, and every test passes.

# Recorded runs

- 2026-10-16, web UI, DeepSeek Harness 0.2.1-alpha.4, macOS, DeepSeek-V4.1-Flash: steps 0 to 12 passed, with three notes. Step 3 was covered by the cards of steps 4 to 8 rebuilding after a reload (and, the day before, by the session named there). Step 7 passed through the trajectory; the slash command was not tried. In step 8 the in-app browser refused the clipboard, and the card showed the answer's text to copy. In step 12 the absence of the slash command was not checked.

- 2026-10-16, web UI, after the program-version reset, DeepSeek Harness 0.2.1-alpha.4, macOS, DeepSeek-V4.1-Flash: step 13 passed. The model loaded the skill, read `recipes.md`, and wrote a 24-frame trace with zero repairs (it is sample 27 of `SAMPLES.md`). With the Browser pane in view the run went from frame 1 to 24 in its twelve seconds and stopped; step back, a drag to frame 5, and 2× behaved as stated, with Chinese control labels. While the pane was hidden, no frame was painted and playback held, as described above. Step 3's second half passed too: the cards persisted before the reset showed their text with the "another version" note.

- 2026-10-16, macOS desktop app, DeepSeek Harness 0.2.0-rc.2 (the app bundle; the development checkout is 0.2.1-alpha.4), DeepSeek-Flash, run by the app's own agent: D1 passed with the package installed from the working checkout (`link:`, not the GitHub URL, so this is the build the suite above covers), and D1's compatibility check passed — the plugin declares `engines.dsh` `>=0.2.0-0 <0.3.0-0`, which admits the app's `0.2.0-rc.2`. The bundle activated without an app restart: `ui_render` reached the agent's tool set, the live `tool.call.toolview` slot held one occupant (`key: ui_render`, `registrant: dsh-intelligent-ui`, active) and `conversation.chat.turnTail` one entry (`id: dsh-intelligent-ui`, order -10), and `skill dsh-intelligent-ui` loaded — the registration half of D2 and step 7. The host half of the cards in D3 and steps 4, 5, 6, 8, and 9 passed — every program compiled and its result carried the figures — but the page drew none: the reader looked twice and saw no card under any reply, so the drawing half **failed** in this run: the calculus card read area 0.333333 and tangent slope 2 at a = 1; the Taylor card put two labelled curves on one plot, read the limit of sin(x)/x at 0 as 1, and its error at x = 2 was -0.242631 at degree 3 and -3.64234e-10 at degree 15, matching the figures written in steps 5 and 6; the malformed `hologram` program listed its diagnostic and named the catalog instead of drawing. Step 5's figures were checked by a second card rather than a drag: at a = 3 it read `x: 3 · y: 9 · slope: 6 · area: 9`, the readout step 5 asks for. Step 11 passed: `git -C deepseek-harness status --porcelain` printed nothing. Step 12's log check passed, and its premise held: a settled card's compiled program sat in the host's own `meta` field on its ordinary `tool/result` event (`v: 3`, `catalogHash`), and no session line held a plugin-owned event type (`grep -c '"type":"dsh-intelligent-ui'` read 0). Not exercised, and left to a reader at the page: the two step-2 console expressions (the slot inspection above is their equivalent), the streaming preview and folded row of D3, the drag and network panel of step 5, the plot's legibility in step 6, the clipboard and click of step 8, all of step 10, and the disable-and-restart half of step 12. One observation: the `keys` row of the Taylor card printed these errors rounded to two decimals (-0.24, -3.64e-10); a `metric digits=6` printed -0.242631 and -3.64234e-10, so the digits the checklist quotes need a `metric`, not `keys`. **What this run did not settle:** whether the app's page draws a card at all. The reader saw none of the eight cards, so the drawing half of D3 and of steps 4, 5, 6, and 8 failed and their pass criteria are unmet; every claim above is about the host half, the slot registrations, or the log, never about pixels.

- 2026-10-16, maintainer's verdict on Parts 2 and 3 after the run above and a Windows attempt: D1 passed (installed into the desktop profile from the local build, accepted by the engine range of the time, active without a restart). D2 partly: the slot and skill registrations were live; the console expressions and the stylesheet count were not taken. D3 failed: the standard-view settings held, but no card appeared under the reply when the turn ended. D4 failed: the host half of steps 7, 9, and 12 passed, while the visual and interactive criteria of steps 5, 6, 8, and 10 could not pass with no card on screen. W1 and W3 were not run (Windows-only, and W3 needs a visible card). W2 passed on macOS (`git ls-files --eol` shows `w/lf` for both files). W4 failed on Windows; the output was not recorded. **With the plugin loaded, every past conversation in the desktop app failed to open.** Decision: desktop adaptation is paused, the engine range was raised to `>=0.2.1-alpha.1 <0.3.0-0` so the desktop app of today refuses the plugin, and Parts 2 and 3 resume when the desktop app ships 0.2.1-alpha.1 or later.

# Not verified

The desktop apps are not verified and not supported. Part 2 was run once, on the macOS app 0.2.0-rc.2 as recorded above: installation, activation, and the compilation and persistence of cards passed, but the page drew no card and, with the plugin loaded, past conversations would not open. Part 3 has only W2 (passed on macOS) and W4 (failed on Windows, output not recorded) on record. Desktop work resumes when the desktop app ships 0.2.1-alpha.1 or later.
