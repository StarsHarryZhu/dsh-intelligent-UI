# AGENTS.md

## 1. Role

The bundled skill that teaches the model to use `ui_render` well. The tool
description is the reference — what the frame provides and the sandbox's rules;
this skill is the judgement around it: when a widget beats prose, how to design
one, what to say around it, which library fits a chart, a diagram, or a formula,
how to write questions and forms, how to revise a widget, and how to fix one
that failed. It is about use, never about installation.

The skill row (`src/skill.ts`) reads the frontmatter of `SKILL.md` when the
plugin loads and lists the skill under the plugin's own name,
`dsh-intelligent-ui`. The model sees only the name and the description in its
skill catalog, loads the body with the host's `skill` tool when the description
matches the task, and reads the reference files from this directory, which the
host names as the skill's base. A reader can also load it by typing
`/dsh-intelligent-ui`. The body is read again on every load.

## 2. Constraints

**Use, not installation.** Nothing here explains how to install, enable, or build
the plugin.

**Say each fact once.** A rule that the tool description already states is not
repeated here; the skill adds judgement, patterns, and complete widgets.

**Every widget passes the check.** Each ```` ```html ```` block must pass the
host check with no problem at all and load nothing from a code host that the
plugin does not ship; each ```` ```js ```` block must parse
(`tests/skill.test.ts`). Every theme variable and `c-*` class the text names must
exist in `src/frame/base.css`. A widget here is a contract the model will copy,
so each one was also run in headless Chrome in both themes with no error.

**Written from scratch.** The guidance and every example are this project's own
words and code, not copied from another product's guide.

**Frontmatter the host accepts.** `name` is `dsh-intelligent-ui` (kebab case, the
plugin id and this folder's name); `description` is one line that starts with
"Use when", at most 500 characters, and mentions `ui_render`, because only the
description decides whether the model loads the skill.

**Small files.** Each file stays under 8192 code points, the size one tool result
carries without pruning.

**Plain relative names.** The body names its references by bare file name, and
the files live in this one directory, so the host's base-directory hint resolves
them on every platform.

**LF line endings.** The reader accepts Windows line endings, and
`.gitattributes` keeps them out of the checkout anyway.

## 3. Contents

- `AGENTS.md` — this file: what the skill is for and the rules it keeps.
- `SKILL.md` — the skill: when a widget is the right answer, where it stands and
  what to say, designing one, writing the code, sending and questions, revising,
  what to do when something fails, and the reference list.
- `interactive.md` — controls with live output, choices and tabs, animation the
  reader steps through, dragging, canvas, and keeping state and following the
  theme.
- `charts.md` — which charting tool to use, Chart.js in the chat's theme, D3,
  ECharts, and tables.
- `diagrams.md` — hand-written SVG with the colour ramps, Mermaid in the chat's
  theme, and choosing between them.
- `math.md` — formulas with KaTeX, plotting a function, `dsh.math`, typed
  expressions with math.js, and what makes a good math widget.
- `forms.md` — one question answered by clicking, typed and several answers at
  once with `data-send`, locking a sent form, and checklists that count.
- `recipes.md` — complete widgets: a loan with a follow-up question, code traced
  line by line, and a small game that remembers its board.

## 4. Progress

**Done.**

- Rewritten on 2026-11-17 for the sandboxed engine: the DIL files (`drawing.md`,
  `following.md`, and the DIL lessons in the others) are gone, and
  `interactive.md`, `charts.md`, `diagrams.md`, and `forms.md` are new. Thirteen
  complete widgets pass the check with no note, and ran in headless Chrome in
  both themes with no runtime error and the network refused; their figures (the
  savings total, the loan payment, the integral and its error) were checked
  against closed forms.
- 2026-11-22: “Where it stands and what to say” teaches the ```widget block
  that places a widget inside the answer.
- 2026-11-27: the same section says a block never draws a widget, and that a
  later answer shows an earlier widget again with its block.

**Not done.**

- **No live model has used it yet.** The guidance is written from how models
  write widgets elsewhere; the live run of `docs/VERIFY.md` will show what to
  add or cut.
- **No Chinese version.** The model answers in the user's language, and the
  examples tell it to label widgets in it, but the guidance itself is English.

**Known defects.**

- Course-review mode and the minimal preset do not offer the `skill` tool, so
  there the model works from the tool description alone.

**Next goal.** Collect the mistakes live models still make and turn each into one
line of guidance or one example.
