# AGENTS.md

## 1. Role

The bundled skill that teaches the model to use `ui_render` well. The tool
description is the language reference; this skill is the judgement around it:
when a card beats prose, how to shape a card, what to say beside it, how to write
math and code cards, and how to repair a failed call. It is about use, never
about installation.

The skill row (`src/skill.ts`) reads the frontmatter of `SKILL.md` when the
plugin loads and lists the skill under the plugin's own name,
`dsh-intelligent-ui`. The model sees only the name and the description in its
skill catalog, loads the body with the host's `skill` tool when the description
matches the task, and reads the two reference files from this directory, which
the host names as the skill's base. A reader can also load it by typing
`/dsh-intelligent-ui`. The body is read again on every load.

## 2. Constraints

**Use, not installation.** Nothing here explains how to install, enable, or build
the plugin.

**Say each fact once.** A rule that the tool description already states is not
repeated here; the skill adds judgement, patterns, and recipes. When the language
changes, the description changes, and the recipes are recompiled by the tests.

**Every program compiles cleanly.** Each ```` ```dil ```` block must compile with
zero diagnostics; `tests/skill.test.ts` compiles all of them. A recipe is a
contract the model will copy.

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
- `SKILL.md` — the skill: when to draw a card, how to shape one, what to say
  around it, code blocks, quiz rules, revising a card, the repair loop, and the
  reference list.
- `math.md` — the math vocabulary, the calculus operators and their accuracy,
  `plot` and `formula`, and six calculus recipes.
- `recipes.md` — complete cards for a subscription estimate, a loan, a unit
  conversion, binomial and normal probabilities, projectile motion, a quiz
  series, priced add-ons on a checklist with `values=` and `names=`, revenue
  by source as stacked series with a pie, and code played line by line.

## 4. Progress

**Done.**

- The programs across the three files compile without a repair, and their
  computed figures were checked against closed forms (the mortgage payment, the
  binomial probabilities, the Taylor error, the projectile range).
- In the live run on 2026-10-16, the model loaded the skill unprompted for a
  calculus request, read `math.md`, and wrote a correct program on its first
  call.
- Code blocks (2026-10-22): when to use `code` rather than `steps mono=true`,
  and the `"""` text block.
- Revisions, series, and long tables (2026-10-26): revising a card with
  `revises=` and keeping state names, when to compare series or draw a pie, and
  giving a table all its rows; the quiz example moved to `recipes.md` to keep
  `SKILL.md` under its size.
- Checklist sums and names (2026-10-26): one line in `SKILL.md` and the priced
  add-ons recipe; room was made by shortening the animation intro and dropping a
  line the tool description already carries.

**Not done.**

- **No Chinese version.** The model answers in the user's language, and the
  recipes show labels written in it, but the guidance itself is English.

**Known defects.**

- Course-review mode and the minimal preset do not offer the `skill` tool, so
  there the model works from the tool description alone.

**Next goal.** Collect the repairs live models still need and turn each into one
line of guidance or one recipe.
