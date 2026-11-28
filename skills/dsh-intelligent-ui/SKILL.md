---
name: dsh-intelligent-ui
description: Use when the ui_render tool is available and an answer would work better as something the reader uses than as text to read - an estimate to adjust, a comparison, a chart, a function or formula, a diagram, a simulation or animation, a question to answer or a form to fill in, a small game. Covers choosing a widget over prose, designing and writing one, libraries, charts, diagrams, math, forms, and fixing a widget that failed.
---

# Answering with interactive widgets

`ui_render` shows a widget you write in HTML, SVG, CSS, and JavaScript, in the
chat, where you call it. It runs in a sandboxed frame in the reader's browser:
sliders, charts, and simulations respond without calling you, and a click can
send the reader's next message. The tool description lists what the frame
provides; this skill is about when and how to use it well.

## When a widget is the right answer

Draw one when the reader will do something with the answer:

- vary an input and watch the result: an estimate, a loan, a conversion, a
  what-if;
- compare options on several attributes, or explore data: a sortable table, a
  chart (`charts.md`);
- see a function, a formula, or a quantity change (`math.md`);
- follow a structure or a process: a labelled diagram, a flow, an algorithm
  stepping through its data (`diagrams.md`, `interactive.md`);
- watch something move: a simulation or an animation with play and step
  controls (`interactive.md`);
- answer a question or fill in a form (`forms.md`);
- play: a small game or toy that makes an idea tangible.

Answer in prose when the answer is a fact or a sentence, when nothing would be
varied or compared, or when the reader asked for text, code to copy, or a file.
A widget never replaces the explanation; it carries the part the reader explores.

## Where it stands and what to say

A widget stands in your reply where you call the tool. To put it at a chosen
place in your answer instead, call the tool first, then write the answer and,
where the widget belongs, a block that holds only the card id from the result:

````
The R format has three register fields:

```widget
call_00_Xy12
```

Next, the I format …
````

The widget moves there and the block is not shown. Use one block per widget;
an answer with several parts can call every widget first and then place each
under its own paragraph. Without a block, write the sentence that leads into the
widget before the call, and continue after the result.

A block only moves a widget you have drawn; it never draws one. Copy the id
from the result, and never write a block for a widget you mean to draw later
or in another message: call the tool for it first. To show a widget from an
earlier answer again, write its block in the new answer; it moves there.

Around a widget, say what it shows and what to try; do not restate its
contents. You never see the widget: the result reports its text before scripts
run, its controls, and any problem. Quote a figure only if your code computes it
the way you describe.

## Designing one

- One widget answers one question. Lead with the result: a `metric` for the
  headline number, then the controls, then the detail.
- Use four controls at most. Give each slider a realistic min, max, and step,
  and show its value beside it. Write every label in the reader's language.
- Put the starting state in the HTML itself: the first numbers, the first
  frame, or placeholders of the right size. The widget then looks finished while
  it streams in and before its scripts run.
- The frame is as wide as the reply, about 680px on a desktop and less on a
  phone. Lay out with flex, grid, and percentages; never a fixed width over
  640px. Keep it under about 600px tall; prefer tabs or steps to a long scroll.
- Colour only with the theme variables and the `c-*` classes, so the widget
  reads in light and dark. Text sits on the transparent background; use a
  `card` only to group.
- Format numbers with `toLocaleString` or `Intl.NumberFormat`, and round them.
- Animate with `requestAnimationFrame`, give the reader a pause control, and
  start paused when `matchMedia('(prefers-reduced-motion: reduce)')` matches.

## Writing the code

- Order it as a short `<style>`, the content, then scripts last. Scripts run once
  the whole widget has arrived, in order, as on a page that has just loaded.
- Give every input, select, and textarea an `id`: its value comes back after a
  reload by itself, and your input and change handlers run once with it. For
  anything else worth keeping, such as a board or a list the reader built, call
  `dsh.state.set(value)` on each change and start from `dsh.state.get()`.
- Use a library for what it does well: Chart.js for standard charts, D3 for
  custom charts and maps, ECharts for dense dashboards, KaTeX for formulas,
  Mermaid for flowcharts and sequence diagrams, Three.js for 3D, Matter.js for
  physics, Tone.js for sound, highlight.js for code, marked for Markdown. The
  versions the tool description lists ship with the plugin and work offline;
  write their usual address with that version. Any other version or library
  loads from its code host while the reader is online.
- Keep data in the widget. The frame reaches only the code hosts; it cannot see
  the conversation, the reader's files, or other sites.
- Keep it short: build repeated parts in a loop instead of writing them out. A
  long widget streams in slowly.

## Sending, links, and questions

- `<button data-prompt="…">` sends its text as the reader's next message. Write
  it as the reader would ask: "Explain step 3", "Show the annual plan".
- `<form data-send="Lead">` sends `Lead — Label: value · …`, built from its
  named fields, as one message (`forms.md`).
- Only a click inside the widget sends; a script cannot send on its own.
- A practice question never shows its answer or a "check" control. The answer
  belongs in your next reply, after the reader has answered.
- `<a href>` and `openLink(url)` open a page in a new tab, after a click.

## Revising a widget

When the reader asks for a change, or a widget you just drew came out wrong,
call `ui_render` again with `revises=` set to its card id and send the whole
widget. Keep the control ids and the shape of `dsh.state` you are not changing:
the new widget starts from the reader's values, and the old one folds away. A
different question gets a new widget, without `revises=`.

## When something fails

- A syntax error keeps the widget from showing; the result lists each one with
  its line. Fix every one and call again in the same turn.
- A warning, such as an address the frame blocks or `localStorage`, does not
  stop the widget; fix it when the feature matters.
- An error while the widget runs shows under it with an "Ask to fix" button,
  which sends it to you with the card id. Fix the cause and call again with
  `revises=`.
- After two failed attempts, answer in prose and say the widget could not be
  shown.

## Reference files

Read these from this skill's base directory when the widget needs them:

- `interactive.md`: controls with live output, choices and tabs, animation,
  dragging, canvas drawing, and keeping state.
- `charts.md`: Chart.js, D3, and ECharts in the chat's theme, charts that follow
  controls, tables, and maps.
- `diagrams.md`: SVG diagrams with the colour ramps, arrows, clickable parts,
  and Mermaid.
- `math.md`: formulas with KaTeX, function plots, and `dsh.math` for integrals,
  derivatives, limits, and roots.
- `forms.md`: practice questions, typed answers, several answers in one
  message, and checklists.
- `recipes.md`: complete widgets to adapt.
