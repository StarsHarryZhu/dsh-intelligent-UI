# dsh-intelligent-ui

Interactive cards in DeepSeek Harness chats. The model writes a small interface program; the chat draws it as a native card — sliders, inputs, choices, metrics, tables, charts, progress bars, and answer buttons — and every control recomputes in your browser without another model call.

[中文](README-zh.md)

## What it does

- Registers one tool, `ui_render`. The model passes a program in `source`; the plugin validates it against a fixed component catalog and stores the compiled program with the tool result.
- Draws the card in the tool row while the reply is being written (with a live preview as the program streams in), and under the reply once the turn is finished.
- Recomputes every figure locally when you move a control. Nothing is sent until you press a button, which sends its text as your next message.
- Uses the host's theme, fonts, and language; works in light and dark mode.
- Never runs model-written code: the program is data, drawn only by the plugin's own components.

A program looks like this:

```
@state seats = 8 min=1 max=50
@calc monthly = seats * 29
card "Team plan"
  slider "Seats" bind=seats
  metric "Monthly cost" value=monthly unit=USD
  text "{seats} seats cost {monthly} USD a month."
```

## Install

Install the package into a profile with the Plugin Manager (Settings → Plugins → install from a local folder), or from a DSH agent with `plugin_manager` `install_bundle`. Restart the harness after installing or rebuilding, and reload the page.

Then ask for something a card answers better than prose, for example: “Show me what a team plan costs at $29 per seat, with a slider for the number of seats.”

## Uninstall

Disable or remove the bundle in Settings → Plugins. Sessions keep opening; earlier calls show as ordinary tool rows. The plugin adds no session event types.

## Compatibility

| Surface | Status |
|---|---|
| Harness | DeepSeek Harness `0.2.x` web UI |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | All (no native code, no network access) |

## Development

```sh
node scripts/link-dev.mjs   # link the toolchain from the sibling harness checkout
node build.js               # type-check, build, and self-check the bundle
node node_modules/vitest/vitest.mjs run
```

See `AGENTS.md` for the rules of the tree and `docs/VERIFY.md` for the live checklist.

## License

[MIT License](LICENSE) © 2026 Starfield.
