# Verifying cards in the running harness

The unit suite proves the compiler, the math engine, the tool definition, the skill, and the browser half in jsdom with real React. It cannot prove what a reader sees in the running harness, because that needs the harness serving this bundle. This checklist closes that gap in three parts: the web UI, the desktop apps (macOS and Windows), and what only Windows can show. Work each part top to bottom; a later step assumes the earlier ones passed.

The plugin requires DeepSeek Harness 0.2.1-rc.1 or later (`engines.dsh` `>=0.2.1-rc.1 <0.3.0-0`) and supports three hosts: the web UI, the macOS desktop app, and the Windows desktop app. All three parts are required. Part 1 passed on the web UI of 0.2.1-alpha.4, a build below the current range, and Parts 2 and 3 passed on the macOS and Windows apps of 0.2.1-rc.2; the one step without a recorded pass is W4, developing on Windows.

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

Pass: `true`, then `1`. The console shows no `client-modules` error, no `web boot: … did not activate`, and no `slot entry crashed` naming `tool.call.toolview` or `conversation.chat.node`, and no raw-data block labelled with the kind `dsh-intelligent-ui.card`.

## 3. A persisted card renders (no model call)

Open any session that holds a settled `ui_render` call made by a build that writes `version: 1` (every build from the program-version reset on). If the turn is above the loaded window, click "load earlier".

Pass: each card appears in that turn's reply, where the model called the tool. Moving a slider changes its figures at once, with no request in the network panel and no new turn.

A card persisted before the version fields existed (on the development machine: the `deepseek-harness` workspace session `9cecadfb…`, turn 11) shows its text version with the note that it comes from another version of the plugin, and the transcript around it is unaffected.

## 4. A math card, live

Start a new session in the standard mode and send:

> Make a card with a slider for the upper limit a from 0 to 3: show the integral of x² from 0 to a as a formula with its value, plot y = x² with the integral's area shaded, and draw the tangent at x = a.

Pass:

- While the model writes the call, a growing preview appears in the reply, below the call's row; the `Interactive` row itself shows only its status.
- When the turn finishes, its process folds and the card stays where it was drawn, between the text before the call and any text after it.
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

Pass: every card is still where it was drawn in its reply, back at the model's initial values. Switch the theme between light and dark: plots, formulas, and controls follow, with no unreadable text. With the interface language set to Chinese, the row label reads `交互界面` and the footer note is Chinese.

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

## 14. Pages, a checklist, a sortable table, and a flowchart

Send:

> 用一张卡片讲 HTTP 请求重试：分成“流程”“清单”“对比”三页。流程页画出发送请求、判断是否收到响应、成功解析或等待后重试的流程图，并能用滑块高亮当前步骤；清单页列出上线前要检查的 4 项，勾选后显示完成进度；对比页用表格比较三种重试策略的等待时间和适用场景，读者可以按列排序。

Pass: the program compiles with no repair and uses `tabs`, `checklist`, `table … sortable=true`, and `diagram`. Clicking a tab and the left and right arrow keys switch pages, and the open page is still open after a reload. Ticking items updates the done count and anything bound to it. A column header sorts ascending, then descending, then back to the written order. The flowchart's loop returns along the side without crossing a box, and the slider moves the highlight. No request appears in the network panel while doing any of this.

## 15. A code block

Keep the Browser window in view, as in step 13. Send:

> 用一张卡片演示这段 Python 求斐波那契数的代码逐行执行：语法高亮、显示行号、高亮当前执行的行，并显示每一步的变量。
>
> a, b = 0, 1
> for _ in range(5):
>     a, b = b, a + b
> print(a)

Pass: the program compiles with no repair and writes the listing as a `code lang=python … current= numbers=true` block between `"""` lines. Keywords, strings, comments, numbers, and called names take the colours of the host's own code blocks, in the light and in the dark theme. Playing moves the highlighted line; when it leaves the block's view, the block scrolls itself to it while the chat stays where it is. Copy puts the exact listing on the clipboard and the button says so (in the in-app browser, which may refuse the clipboard, it says it could not copy). No request appears in the network panel.

## 16. The skill is a part of the plugin

This needs the restart of step 1 after an update, because the skill row is part of the host half. Open Settings → Plugins → 渐进式交互 / Intelligent UI.

Pass: the plugin's parts list two rows, 渐进式交互 / Intelligent UI and 渐进式交互 · 技能 / Intelligent UI · Skill, both active. Typing `/` in the composer lists `dsh-intelligent-ui` with the skills. Switching the skill row off removes it from that list and leaves cards drawing; switch it back on afterwards.

## 17. Kept edits, a revised card, a long table, and a chart of several series

The prompts are in English because the composer drops CJK text typed by automation; a reader typing by hand can send them in Chinese. Send:

> Make one card for a small shop's first quarter, reply in Chinese: a slider for the April ad budget; a stacked area chart of three revenue series (subscriptions, services, ads) over January to April with ads in April following the slider; a pie of April's revenue split; and a table of 30 orders (order number, customer, amount).

Pass, before any reload: the program compiles with no repair and uses `chart … shape=area stacked=true` with three indented `series` lines, a `chart shape=pie`, and a 30-row `table`. The legend hides and shows each series, always keeping one; hovering or focusing the chart and pressing ← and → moves the readout from month to month. The pie's legend shows each slice's share, and hiding a slice recomputes them. The table shows a filter box, a row count, and pages of 20; filtering narrows the rows and resets to the first page; Copy CSV and Copy Markdown paste as a spreadsheet range and as a Markdown table. No request appears in the network panel.

Then move the slider, hide a series, sort and filter the table, and turn to its second page. Reload the page. Pass: the card shows every one of those settings as it was left.

Then send:

> Change that card: make the slider go up to 20 and add a fourth series for refunds. Keep everything else.

Pass: the result names the earlier card in `revises`; the new card starts with the slider where it was left (held at 20 if it was past it), and the earlier card says that a newer version follows. A quiz card whose button was pressed before a reload stays locked after it.

## 18. A drawing the reader reshapes

Send, in a new session:

> Draw one card, reply in Chinese: a triangle with three draggable vertices on a canvas with y upward, its area as a metric, and a button that sends me the vertex coordinates.

Pass: the program compiles with no repair and uses `canvas view=` with `shape kind=point … drag=true`. Dragging a vertex with the pointer moves the triangle and the area together, on the state's steps and inside its limits; Tab reaches a vertex and the arrow keys move it the way the screen goes. No request appears in the network panel while dragging. The button sends the coordinates as they stand, and a reload leaves the vertices where they were dragged.

Then send:

> Draw a labelled desk lamp as SVG on a canvas, reply in Chinese, with an invisible area over each of the shade, the stem, and the base; clicking one shows a sentence about that part under the picture.

Pass: the card uses `svg="""` and `shape kind=hotspot`; a click and the Enter key both change the sentence and mark the area; the picture is legible in the light and dark themes. Then send:

> Draw a parabola on a canvas with a point that can only move along it, and a dashed tangent line through the point. Reply in Chinese.

Pass: the point stays on the curve however the pointer moves, and the tangent follows. With the pane at a phone width, dragging a point moves the point and does not scroll the page, and dragging elsewhere on the canvas scrolls it.

## 19. A drawing that plays by itself

Keep the Browser window in view, as for step 13. Send, in a new session:

> Draw one card, reply in Chinese: a wheel drawn as SVG that rolls along the ground by itself on repeat, with a dot on its rim leaving its path behind it.

Pass: the program compiles with no repair and uses `shape kind=use ref=…` with `rotate=`, `shape kind=curve fn=[…] var= from= to=`, and `player … loop=true autoplay=true`. The wheel starts rolling as soon as the card is drawn, turns as far as it travels, starts over after its last step, and the trail follows the dot. Pausing stops it where it is, and it stays paused when the card is scrolled away and back; a reload shows the frame it was paused on. With the card scrolled out of view, playback stops, and it resumes when the card returns. No request appears in the network panel while it plays. Then send:

> Show a travelling sine wave that moves by itself, with a slider for the wave number. Reply in Chinese.

Pass: the card uses `shape kind=curve fn="…"`; the wave moves smoothly, and the slider changes the wavelength while it plays. With the system set to reduce motion, a newly drawn card waits on its play button.

## 20. A card redrawn in its turn, and a card replaced in a later one

Send, in a new session:

> Draw a card with a slider for x from 0 to 10 and a metric of x squared. Once it is drawn, redraw it in the same turn with a second metric for the square root of x, as a revision of that card. Reply in Chinese.

Pass: the second call carries `revises=` with the card id the first result reported. Once the second result lands, the first card leaves the reply and its row's status reads 已被新版本替换; only the second card stays, where it was called. Move the slider, then send:

> Change the slider's maximum to 20. Reply in Chinese.

Pass: the new card starts from the slider value you set; the card of the first turn shows only 这张卡片已被后文的新版本替换。 and 显示旧版本, which opens it with its values and 收起旧版本 folds it again. A reload keeps it folded.

## 21. A fill-in question

Send, in a new session:

> Give me one fill-in-the-blank question about the chemistry of water, with two blanks, as a card. Reply in Chinese.

Pass: the program compiles with no repair and uses `blanks "…___…"` with no `@state` for the answers. Each blank sits inside the sentence and widens as you type Chinese into it; Submit stays disabled until both are filled. Enter in the first blank moves to the second, and Enter in the second sends. While a Chinese input method is composing, Enter picks the word and sends nothing. The message that arrives reads as the sentence with each answer in brackets, the model grades it in its reply, and the blanks and Submit lock. A reload keeps the answers and the lock.

## 22. A card inside the answer

Send, in a new session:

> Explain compound interest in three short parts, reply in Chinese: first one paragraph on the idea; then a card with sliders for principal, rate, and years and the final amount as a metric; then a paragraph on what to try with it and a closing tip.

Pass: the model writes the first paragraph and calls `ui_render` in the same message, and the result's second line says the card stands there. The card builds up in the reply under that paragraph while the arguments stream, in the `standard` view as well; the process shows the `Interactive` row as a status line. After the result the model goes on writing below the card. When the turn completes, its process folds and the card stays between the two paragraphs. Expanding the process shows the row as one line that does not open, and a reload keeps the card in place. With Settings → General → Replies after collapse set to Final answer only, the first paragraph folds with the process and the card stays.

# Part 2 — Desktop apps (macOS and Windows)

**Passed on 0.2.1-rc.2, on both apps.** D1 to D4 passed on the macOS app and on the Windows app of DeepSeek Harness 0.2.1-rc.2, installed on macOS from the working checkout as a `link:` dependency and on Windows through W1. The failure of 2026-10-16 on 0.2.0-rc.2 — no card drawn, and past conversations that would not open with the plugin loaded — did not recur on this build. Run this part again on any new desktop version, in a throwaway session first, before claiming that version.

The desktop apps wrap the same web client and load the same `dsh.client` declaration, so every step of Part 1 from step 2 on applies unchanged. What differs is how the plugin gets into the desktop profile, and one default.

## D1. Install into the desktop profile

The desktop app keeps its own profile, `~/.dsh/profiles/desktop` (on Windows `%USERPROFILE%\.dsh\profiles\desktop`), so a plugin installed for the web UI is not installed there. Install it from the app itself, on either platform: Settings → Plugins → 添加插件 / Add plugin, with the GitHub URL `https://github.com/StarsHarryZhu/dsh-intelligent-UI`. On Windows, `git` must be on `PATH`.

On macOS the app's own command line does the same, with the app quit:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/StarsHarryZhu/dsh-intelligent-UI
```

Pass: the install reports success with no compatibility error (the plugin declares `engines.dsh` `>=0.2.1-rc.1 <0.3.0-0`; a host older than 0.2.1-rc.1 is refused, which is expected). Restart the app, then open an existing conversation and confirm it still loads before going on.

## D2. The plugin is live

Open the app's developer tools (View → Toggle Developer Tools, or the shortcut the app shows) and run the two console expressions of step 2.

Pass: `true`, then `1`, and Settings → Plugins lists 渐进式交互 / Intelligent UI as enabled, with the skill row of step 16 among its parts; typing `/` lists `dsh-intelligent-ui` with the skills.

## D3. The standard transcript view

The desktop apps default to the `standard` transcript view, which keeps a running turn's tool rows collapsed. Run step 4.

Pass: while the turn runs, the step group is collapsed, and the card's preview still grows in the reply, outside it; when the turn finishes, the card stays where it was drawn. Switching the transcript view to `detailed` in Settings changes the process rows only, not where the card stands.

## D4. The rest

Run steps 5 to 10 and step 12 in the app.

Pass: as written for the web. In step 8 the desktop app grants the clipboard, so the card says the answer was copied, and pasting shows it.

# Part 3 — Windows only

These can only be seen on Windows; everything else is shared with macOS. W1 and W3 need the Windows desktop app and belong to Part 2; W2 and W4 check a clone of this repository and apply whenever someone develops on Windows. W1, W2, and W3 passed on 0.2.1-rc.2; W4 has no recorded pass.

## W1. Installing from GitHub

Pass: the install in D1 succeeds from a machine where `git` is on `PATH`. Without git, the install fails with `GIT_FETCHER_GIT_NOT_FOUND`; install Git for Windows and retry.

## W2. Line endings

In a clone of this repository on Windows:

```powershell
git ls-files --eol skills/dsh-intelligent-ui/SKILL.md lib/client.js
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

- 2026-10-16, maintainer's verdict on Parts 2 and 3 after the run above and a Windows attempt: D1 passed (installed into the desktop profile from the local build, accepted by the engine range of the time, active without a restart). D2 partly: the slot and skill registrations were live; the console expressions and the stylesheet count were not taken. D3 failed: the standard-view settings held, but no card appeared under the reply when the turn ended. D4 failed: the host half of steps 7, 9, and 12 passed, while the visual and interactive criteria of steps 5, 6, 8, and 10 could not pass with no card on screen. W1 and W3 were not run (Windows-only, and W3 needs a visible card). W2 passed on macOS (`git ls-files --eol` shows `w/lf` for both files). W4 failed on Windows; the output was not recorded. **With the plugin loaded, every past conversation in the desktop app failed to open.** Decision: desktop adaptation is paused, the engine range was raised to `>=0.2.1-alpha.1 <0.3.0-0` so the desktop app of today refuses the plugin, and Parts 2 and 3 resume when the desktop app ships 0.2.1-alpha.1 or later. (2026-10-17: the pause was lifted — the three hosts are the supported target — but this run's results stand, and Part 2 is still unpassed on a qualifying build.)

- 2026-10-17, both desktop apps, DeepSeek Harness 0.2.1-rc.2 (the macOS app bundle and the Windows app), maintainer-run: D1 to D4 passed on each, so every card drew in the row while the turn ran and under the reply when it finished, the controls recomputed without a request, and past conversations opened with the plugin loaded — the two failures of 2026-10-16 on 0.2.0-rc.2 did not recur. W1 passed on Windows, installing from the GitHub URL; W2 passed; W3 passed at 100% and 150% display scaling. W4 was not run.

- 2026-10-22, web UI and the macOS desktop app, DeepSeek Harness 0.2.1-rc.2, DeepSeek-V4.1-Flash, both profiles linked to the working checkout, run by Claude Code (the web UI in its browser pane, the desktop app's own window over a local debugging port): steps 15 and 16 and D2 passed on both hosts, with notes.
  - Step 16 / D2: the plugin's parts list two rows, 渐进式交互 and 渐进式交互 · 技能, both running; `/` lists `dsh-intelligent-ui` with the skills. On the web UI the skill row was switched off — `/` stopped listing it and the code card kept drawing — and on again, without a restart.
  - Step 15: the prompt went in English with "Reply in Chinese", because the composer drops CJK text typed by automation. On both hosts the model loaded the skill first and drew a `code lang=python current=line numbers=true` block traced frame by frame, with a correct trace (a, b = 1,1 → 1,2 → 2,3 → 3,5 → 5,8; print shows 5). Keyword, number, and called-name colours equal the host's syntax tokens in the dark theme (web UI) and the light theme (both); stepping and playing moved the highlight line by line and the page did not scroll; no request left the card while it played. Copy wrote the exact listing to the clipboard in the desktop app; the in-app browser refused the clipboard and the button said it could not copy, as the step allows. A history session from 2026-10-16 opened in the desktop app with its three cards drawn.
  - Found and fixed in this run: the running host defines no `--shiki-background`, so the block fell back to a lighter layer than the host's code blocks; it now falls back to `--dsw-alias-markdown-code-block`. And on its first desktop call the model opened the block with `"""` on a line of its own under `code`, which dropped the block until the model retried; such a block now attaches to the component above it, with a repair note.

- 2026-10-26, web UI and the macOS desktop app, DeepSeek Harness 0.2.1-rc.2, DeepSeek-V4.1-Flash, both profiles linked to the working checkout, run by Claude Code as on 2026-10-22: step 17 passed on both hosts, with notes.
  - Both programs of each host compiled with zero repairs: one card with a slider, a stacked area chart of three `series`, a pie, and a 30-row table, and its revision. Each result named its card id, and each revision carried `revises` with that id.
  - The legend hid a series and the area chart redrew without it; ← and Home moved the readout to March and January; hiding a pie slice recomputed the other shares (41.6% and 58.4%). The table showed its filter, "30 / 30 行", and two pages; filtering for one customer left one row with no pages, a filter matching nothing said so, and the next-page button turned to rows 21 to 30. No `/api` request left the page while doing any of this. Copy said it could not copy in the in-app browser, which refuses the clipboard, as step 15 allows.
  - After a page reload (web UI) and after quitting and reopening the app (desktop), the slider, the hidden series and slice, the filter, and the second table page were all as left, in the dark and the light theme.
  - Asked to lower the slider's maximum and add a fourth series, the model revised the card: the new card started from the slider value the reader had set, held at the new maximum (30000 → 25000 on the web UI, 36000 → 30000 on the desktop app), drew four series, and the earlier card said a newer version follows. A quiz button locked across a reload was not tried live; `tests/client.test.tsx` covers it.
  - Found and fixed in this run: the chart's keyboard focus ring used the brand colour, near black in the light theme; it now takes the host's focus ring like every other control.
- 2026-11-05, web UI, DeepSeek Harness 0.2.2-alpha.2 (the working checkout), DeepSeek-V4.1-Flash at Max, the profile linked to the working checkout: step 18 passed. The triangle compiled with no repair; a real mouse drag moved a vertex onto its 0.5 steps with the area following (C to (6.5, 5.5), area 14), the arrow keys moved another, no request of the plugin's appeared while dragging, a reload kept the vertices, and the button sent `A(3.5, 3)、B(9.5, 3)、C(6.5, 5.5)`. An SVG lamp of 135 elements with gradients compiled with no repair and read well in both themes; clicking a hotspot changed the sentence and marked the area, and a reload kept it. The first lamp prompt told the model to read no file but the skill, so it missed `drawing.md` and drew with shapes, wrote `tone=<calc>`, was told of the repair, and revised its own card with `revises=`; `drawing.md` now says that a tone is a fixed word. The parabola compiled with no repair: the dragged point stayed on the curve at (2.4, 1.44) and the tangent followed; asked for a lower limit, the revision started at 2 and the earlier card kept 2.4 and said a newer version follows. In Chrome with touch emulation, a touch on a point moved the point and left the page still, and a touch elsewhere on the canvas scrolled the page. Two defects were found and fixed in this run: a pointer left the keyboard focus ring on a shape, and at a phone's width the canvas shrank its text and points with it, so its viewBox now takes the canvas's width on the page. The macOS desktop app was **not** run: the app was open, did not exit when asked to quit, and the command line refuses to change its profile, so D1 to D4 have no record for drawings.
- 2026-11-05, the built bundle in headless Chrome, on a static page with the host's built stylesheets (no running harness and no model): step 19 is **not** run live yet. The two moving recipes of `drawing.md` and an orbit compiled with no repair. The wheel started by itself, its part changed 61 times in two seconds and had turned 181° after two of its four seconds, and its trail was drawn; nothing was written to storage while it played, and pausing kept that frame (`a = 3.45`). A card below the fold showed its play button and frame 1 until scrolled to, then played. With reduced motion emulated, the wheel waited on its play button.
- 2026-11-07, the built bundle in headless Chrome, on the same kind of static page: step 20 is **not** run live yet. A card in one turn and its revision in a later turn: the earlier card showed only 这张卡片已被后文的新版本替换。 with 显示旧版本, its tool row's status read 已被新版本替换, and the toggle opened the old card with its values and folded it again. A card and its redraw in one turn: the reply drew only the redraw. No page error.
- 2026-11-08, the built bundle in headless Chrome, on the same kind of static page: step 21 is **not** run live yet. Sample 36 compiled with no repair; with H2O and 18 typed in, Submit sent `水的化学式是 [H2O]，1 mol 水的质量约为 [18] g。`, the button said 已发送, and the blanks locked. No page error. Input-method composition was checked only in jsdom (`keyCode` 229).
- 2026-11-11, DeepSeek Harness 0.2.2-alpha.2 (the working checkout) served by a separate `pnpm dsh web --port 3097` with `DSH_HOME` set to a throwaway directory whose web profile held only this plugin, linked to the working checkout; no model, driven by headless Chrome: step 22 is **not** run live yet. The session of the 2026-11-05 drawing run was copied in, with a lead-in sentence added before each of its two `ui_render` calls. The host's own conversation engine placed each card's node after its row and outside the process (no `data-turn-process-member`), so each turn read lead-in, card, closing reply with the process folded; the turn-1 card, revised in turn 2, showed only its fold line between the two texts. Expanding turn 2's process showed the `ui_render` row as `交互界面 · … 16 个组件 · 3 个控件`, with no card and no disclosure, and the card right below it. No page errors. The throwaway instance created an empty `default-workspace` folder beside the harness checkout, removed afterwards; `~/.dsh` was not touched. The streaming preview and a model placing its own card need a live run.
- 2026-11-11, macOS desktop app, DeepSeek Harness 0.2.2-rc.1, desktop profile linked to the working checkout, run by the app's own agent: the placement half of step 22, step 21, and the same-turn half of step 20 passed live, with notes.
  - Step 22: the model wrote its lead-in, called `ui_render` in the same message, and went on writing after the result. In the finished turn the card stood between the two paragraphs, the process folded around it, and its row read as a status line that did not open. The preview building up while the arguments streamed was not watched, and "Final answer only" was not tried.
  - Step 21: a `blanks` card asked for the mass of 1 mol of water and water's formula. The submitted message arrived as `1 mol 水的质量约为 [18] g，它的化学式是 [h2o]。`, the model graded both answers, and the blanks locked. The reader typed into both blanks; Enter, an input method, and a reload were not tried.
  - Step 20, same turn: a second call carrying `revises=` with the first result's card id replaced the card, and its result said the earlier card folds away and states with the same names keep the reader's values. The later-turn fold was not tried.
  - A drawing card's vertices were dragged and the card followed with no request, as the reader reported.
  - Found in this run: a bare expression item in a list prop, `points=[ax, ay, -3, -2.5, 3, -2.5]`, is split at its commas and the repair drops the prop (`"ay," is not attached to a prop`, `must be a list of numbers or expressions`); quoting each item compiled with zero repairs. Recorded as a known defect, with sample 35 as the pattern to copy.

# Not verified

Part 2 as a checklist is passed on 0.2.1-rc.2 only: D1 to D4 and W1, W2, and W3 passed on both apps of that version, cards drawn and history opening. On 0.2.2-rc.1 the macOS app loaded the linked checkout and passed steps 21 and 22 (placement) and the same-turn half of step 20, but Part 2 was not rerun as a checklist and Windows was not run. Nothing here proves an older or a newer desktop release, and W4 (link the toolchain, build, run the suite on Windows) has no recorded pass: the 2026-10-16 attempt failed with its output lost, and no later attempt is recorded. The one earlier desktop run, on 0.2.0-rc.2, failed both visually and on history; that build is below the plugin's engine range and the plugin now refuses it.

Steps 19 and 20 have no complete live run: step 19 has run only in headless Chrome on the built bundle, and step 20's later-turn fold only there, while its same-turn half passed live on 2026-11-11. Step 22's placement and the model's lead-in passed live the same day, but the preview building up in the reply while a model streams its arguments has not been seen in a live DSH. Step 21's live pass typed into both blanks but did not try Enter, an input method, or a reload.
