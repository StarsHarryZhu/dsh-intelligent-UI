# Verifying cards in the running harness

The unit suite proves the compiler, the tool definition, and the browser half in jsdom with real React. It cannot prove what a reader sees in the running harness, because that needs the harness serving this bundle. This checklist closes that gap. Work it top to bottom; a later step assumes the earlier ones passed.

## 0. Build and test

```sh
cd /Users/starfield/Documents/deepseek-harness/my_plugins/dsh-intelligent-UI
node scripts/link-dev.mjs
node build.js && node node_modules/vitest/vitest.mjs run
git -C ../../deepseek-harness status --porcelain
```

Pass: the build prints `self-check passed`, every test passes, and the last command prints nothing.

## 1. Enable the bundle and restart

The harness loads plugin code once per process, so a rebuilt bundle needs a restart. With the server stopped, make sure the profile selects the bundle: `~/.dsh/profiles/web/package.json` lists `"dsh-intelligent-ui"` under `dsh.profile.bundles` (the Plugin Manager's enable switch writes exactly this). Then start the server from the checkout and open the URL it prints:

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

Open the session in the `deepseek-harness` workspace that holds the first `ui_render` experiments (session `9cecadfb…`, turn 11, three calls titled 可拖动的报价器, 纯 SVG 图表, and 表格与标签).

Pass: under that turn's final reply, three cards appear: the price estimator with two sliders and a checkbox, the bar chart, and the table with its badge. Dragging the Seats slider in the first changes Monthly at once, with no request in the network panel and no new turn. These cards were compiled by the first build, so this step also proves format-1 programs still render.

## 4. A live card

Start a new session in the standard mode and send:

> Show me what a team plan costs at $29 per seat, with a slider for the number of seats.

Pass: while the model writes the call, the `Interactive` row shows a growing preview; once the result lands, the row shows the card; when the turn finishes, the turn folds and the card stays visible under the reply. Expanding the folded turn shows the row collapsed, with a status such as `5 components · 2 controls`.

## 5. Interaction costs nothing

Open the network panel, then move every control on the card.

Pass: every figure updates immediately; no request appears; no new turn or step appears in the transcript.

## 6. Buttons continue the conversation

Send:

> Ask me one multiple-choice question about probability as a card with answer buttons.

Pass: clicking an answer sends it as your message, the model replies to it, and the card's buttons lock with the chosen one marked `Sent`. Then type something into the composer without sending, ask for another question, and click an answer: the draft stays untouched, and the card says the answer was copied instead.

## 7. A bad program reports instead of breaking

Send:

> Call ui_render with source "hologram" exactly, then tell me what happened.

Pass: the row shows `The interface did not compile` with the diagnostic; the model reports the failure or repairs it; the rest of the transcript is intact.

## 8. Reload, themes, and language

Reload the page and reopen the session from step 4.

Pass: the card is still under the reply, back at the model's initial values. Switch the theme between light and dark: the card follows, with no unreadable text. With the interface language set to Chinese, the row label reads `交互界面` and the footer note is Chinese.

## 9. Nothing else moved

Pass: other tools' rows, the composer, and the sidebar look and behave as before; `git -C /Users/starfield/Documents/deepseek-harness/deepseek-harness status --porcelain` prints nothing.

## 10. Removing it changes nothing else

Disable the bundle in Settings → Plugins (or remove `"dsh-intelligent-ui"` from `dsh.profile.bundles`; restart if the change does not apply live), reload, and reopen the sessions from steps 3 and 4.

Pass: every session opens; the `ui_render` calls show as ordinary tool rows and no card appears under the replies; nothing else about the sessions changed. The session log holds no event type of this plugin's own:

```sh
zstd -dc "$HOME/.dsh/sessions/<encoded-cwd>/<session-dir>/session.v4.jsonl.zstd" | grep -c '"type":"dsh-intelligent-ui'
```

Pass: `0`. Then enable the bundle again and confirm the cards return.

## Not verified

Everything above step 0 needs the running harness. Until a run through this list is recorded in the root `AGENTS.md`, treat the page behaviour as proven in jsdom only.
