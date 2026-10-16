# Verifying cards in the running harness

The unit suite proves the compiler, the math engine, the tool definition, the skill, and the browser half in jsdom with real React. It cannot prove what a reader sees in the running harness, because that needs the harness serving this bundle. This checklist closes that gap in three parts: the web UI, the desktop apps (macOS and Windows), and what only Windows can show. Work each part top to bottom; a later step assumes the earlier ones passed.

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

Open any session that holds a settled `ui_render` call from an earlier build (on the development machine: the `deepseek-harness` workspace session `9cecadfb…`, turn 11). If the turn is above the loaded window, click "load earlier".

Pass: the cards appear under that turn's reply. Moving a slider changes its figures at once, with no request in the network panel and no new turn. This also proves that older program formats still render.

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

# Part 2 — Desktop apps (macOS and Windows)

The desktop apps wrap the same web client and load the same `dsh.client` declaration, so every step of Part 1 from step 2 on applies unchanged. What differs is how the plugin gets into the desktop profile, and one default.

## D1. Install into the desktop profile

The desktop app keeps its own profile, `~/.dsh/profiles/desktop` (on Windows `%USERPROFILE%\.dsh\profiles\desktop`), so a plugin installed for the web UI is not installed there. Install it from the app itself, on either platform: Settings → Plugins → 添加插件 / Add plugin, with the GitHub URL `https://github.com/StarsHarryZhu/dsh-intelligent-UI`. On Windows, `git` must be on `PATH`.

On macOS the app's own command line does the same, with the app quit:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/StarsHarryZhu/dsh-intelligent-UI
```

Pass: the install reports success with no compatibility error (the plugin declares `engines.dsh` `>=0.2.0-0 <0.3.0-0`). Restart the app.

## D2. The plugin is live

Open the app's developer tools (View → Toggle Developer Tools, or the shortcut the app shows) and run the two console expressions of step 2.

Pass: `true`, then `1`, and Settings → Plugins lists 智能界面 / Intelligent UI as enabled.

## D3. The standard transcript view

The desktop apps default to the `standard` transcript view, which keeps a running turn's tool rows collapsed. Run step 4.

Pass: while the turn runs, the step group is collapsed (expand it to see the row's live preview); when the turn finishes, the card appears under the reply. Switching the transcript view to `detailed` in Settings shows the preview in place, as on the web.

## D4. The rest

Run steps 5 to 10 and step 12 in the app.

Pass: as written for the web. In step 8 the desktop app grants the clipboard, so the card says the answer was copied, and pasting shows it.

# Part 3 — Windows only

These can only be seen on Windows; everything else is shared with macOS.

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

# Not verified

Part 2 and Part 3 have not been run with this build. Until a run is recorded above, treat the desktop apps as covered by the shared web client and the unit suite only.
