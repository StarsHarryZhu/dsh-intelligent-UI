# AGENTS.md

## 1. Role

The code that runs inside each widget frame, beside the model's own code.
`main.ts` starts `runtime.ts` once in the frame's window; the runtime receives
the theme, the widget's source as it streams, the shipped libraries it names,
and its saved values, all by message from the page, and turns them into the
widget: it shows each streamed prefix without running anything, then, once the
whole widget has arrived and passed the host's check, restores the saved values
and runs the scripts in document order, the way a page load would. It gives the
widget its helpers — `sendPrompt`, `openLink`, `dsh.state`, `dsh.math`,
`dsh.theme` and the `dsh:theme` event — and the two markers that need no script,
`data-prompt` on a button and `data-send` on a form. It reports the frame's
height and the widget's errors. `base.css` makes bare HTML look like the host
and gives the model a small vocabulary of variables and classes; `math.ts` is
the numeric library behind `dsh.math`.

## 2. Constraints

**It guards nothing.** The runtime shares its window with the model's code, which
can replace any helper or post any message. Every safety rule therefore lives
outside: in the frame's `sandbox` tokens and content policy
(`src/widget/policy.ts`) and in the page's checks (`src/client/bridge.ts`). Never
add a check here and count on it.

**No dependency.** The runtime imports only this folder and `src/widget/`, and the
build bundles it into one script that may require nothing; it is written into
the frame's document as text. It never touches the page: no `parent` or `top`
access beyond `postMessage`, no storage (the frame has none), and it is the only
code allowed to use `innerHTML`-style parsing, through a `<template>`.

**Streaming shows, it never runs.** A render not marked final is morphed into
the body with every `on*` attribute removed and no script executed, so a
half-written handler or script cannot fire. Resource errors are ignored until
the widget starts running, because a stylesheet or image may fail on its way to
a shipped copy. Morphing keeps the elements that did not change, so the widget
does not flicker as it grows.

**Running follows the page-load order.** On the final render, saved control
values are restored, then each script is re-created so it runs: a script written
without `async` keeps document order, and an external classic script is awaited
before the next one. Then `DOMContentLoaded` and `load` fire, with
`document.readyState` moving through `interactive` and `complete`.

**Shipped libraries stand in for their addresses.** The runtime turns each
shipped file into a `blob:` address, rewrites `script.src`, `link.href`, and
`setAttribute` for the addresses the widget wrote, and installs an import map
that merges the widget's own maps with the shipped modules, their bare-name
aliases (`three`), and exact entries under the widget's prefix keys
(`three/addons/`).

**Kept values are small JSON.** A control with an id and a kept type is saved by
id unless `data-keep="false"` is on it or around it; passwords, files, hidden
fields, and buttons never are. `dsh.state.set` refuses a value that is not JSON
or is over `LIMITS.maxStateChars`.

**A form sends what the reader filled in.** `formMessage` walks `form.elements`
in document order: each named, enabled field gives its trimmed value, a checked
box or radio its value or its label, a select its chosen options; submit,
button, reset, image, file, and password fields are never sent. The message is
the form's `data-send` text followed by one `name: value` line per field.

**Styling is the host's, in variables.** `base.css` maps the page's theme into
short variables (`--text-primary`, `--surface-1`, `--border`, `--accent`,
`--font-sans`, and the rest), styles bare elements to match the host, and
defines the classes `.card`, `.metric`, `.badge`, `.note`, `.row`, `.stack`,
`.grid`, nine colour ramps `.c-*` for SVG and HTML, the SVG text classes `.t`,
`.ts`, and `.th`, and `--series-1` to `--series-6` for data. Light and dark
values both live here; the ramps and series colours are Tailwind CSS's palette
(MIT). A name the skill or the description uses must exist here
(`tests/skill.test.ts`).

**Numbers it cannot trust come back as `NaN`.** Each routine in `math.ts` either
reaches its accuracy target or returns `NaN`, so a widget can say that no value
could be computed rather than show a wrong one.

## 3. Contents

- `AGENTS.md` — this file: what runs inside a frame and what it may assume.
- `main.ts` — the entry: starts the runtime in the frame's window.
- `runtime.ts` — the runtime: messages, streaming morph, script activation,
  shipped libraries, helpers, kept values, forms, height, and errors.
- `base.css` — the frame's base stylesheet: theme variables, styled elements,
  classes, colour ramps, and series colours.
- `math.ts` — special functions and the calculus routines behind `dsh.math`:
  adaptive Gauss–Kronrod integration, Ridders derivatives with a corner check,
  extrapolated limits, and Brent root finding.

## 4. Progress

**Done.**

- The rewrite of 2026-11-17 introduced this folder; `math.ts` came from the DIL
  engine, keeping its integrator, limits, and root finder and gaining a
  derivative that refuses corners (`tests/math.test.ts`).
- Streaming, activation order, external script order, kept values, forms, both
  markers, theme changes, and error reporting are tested in jsdom
  (`tests/runtime.test.ts`), and every widget the skill teaches ran with no
  error in headless Chrome in both themes (`docs/VERIFY.md`, Part 1).

**Not done.**

- `dsh.math` has no series or symbolic routines; a widget that needs symbols
  loads math.js.

**Known defects.**

- A widget that replaces `sendPrompt` or posts its own messages can send
  anything the page's checks let through; the page still requires a click
  inside the frame.
- `position: fixed` content leaves the measured flow, so the frame can shrink
  under it; the host check warns the model.

**Next goal.** Add helpers only where live use shows models writing the same
code again and again.
