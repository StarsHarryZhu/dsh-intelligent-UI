---
name: dsh-intelligent-ui
description: Use when the ui_render tool is available and an answer would be clearer as an interactive card - an estimate the reader adjusts, a comparison, a chart or function plot, a drawing, a formula with live values, a short form, a question to click or fill in, or a process the reader plays step by step. Covers choosing a card over prose, designing one, math cards, drawings, code blocks, animation, and repairing a failed call.
---

# Answering with interactive cards

`ui_render` draws a card in the chat from a small program written in DIL. The
card's controls recompute in the reader's browser without calling you; a button
sends its prompt as the reader's next message. The tool description is the
language reference; this skill is the judgement around it.

## When a card is the right answer

Draw a card when the reader will want to vary something, compare options side by
side, or answer with a click:

- "What does it cost if…", "how long until…", "what if the rate is…": an estimate
  with sliders and a headline `metric`.
- Two to six options with several attributes each: a `table`, with a `badge` or
  `callout` for the recommendation.
- A trend, a breakdown, or a share: `chart` or `progress`. Compare up to four
  quantities with indented `series` lines; show one whole's split with `shape=pie`.
- A function, a derivative, an integral, a limit, or a series: `plot` and
  `formula`. Read `math.md` first.
- A drawing to reshape or watch move: a triangle, a force diagram, a labelled
  picture. `canvas`, with draggable points and areas to click; read `drawing.md`.
- A practice question: one `button` per option, or `blanks` to fill in.
- A process that unfolds: code running line by line, an algorithm's passes, a
  point moving along a curve. Drive it with a `player`; see "Animate" below.

Answer in prose when the answer is one number or sentence, when nothing would be
adjusted or compared, or when the user asked for text, code, or a file. A card never replaces the explanation; it carries the part the reader
explores.

## Shape of a good card

- One card answers one question; draw a second only for a separate question.
  Its title says what it computes, in the user's language.
- Put the headline figure in a `metric`, supporting figures in `keys`, and the
  assumptions behind them in one `callout`.
- Use three or four controls at most. Give every number `@state` realistic
  `min=`, `max=`, and `step=`, and give its slider a `unit=`.
- Write labels, units, and sentences in the user's language; keep state and calc
  names short English identifiers.
- Name each derived value once with `@calc` and reuse the name; a `@calc` may
  only read calcs declared above it.
- Put live values into sentences: `text "{seats} seats cost {monthly} USD a month."`

## Where it stands and what to say

The card stands in your reply where you call `ui_render`. Write the text that
leads up to it first, in the same message as the call; after the result,
continue below the card:

- say in a sentence or two what the card shows and what to try with it;
- quote the key figure from the text view the result carries, computed at the
  initial values, never a number you worked out a different way;
- do not restate the whole card in prose.

A figure shown as "—" could not be computed reliably. Fix the program, or tell
the reader why there is no value.

## Practice questions

- One question per card: the stem in `text`, then a `col` with one `button` per
  option. Set each `prompt` to what the reader would type, usually the letter.
- To have the answer typed, write the sentence in `blanks` with `___` for each
  answer; you receive it filled in, each answer in brackets.
- Never put the answer, a hint that gives it away, or a "check" control in the
  card. The answer belongs in your next reply, after the reader has answered.
- When the answer arrives as their message, say whether it is right,
  explain briefly, and send the next question as a new card if the set goes on.
- A card sends at most once; then its buttons and blanks lock. `recipes.md` has
  a quiz series and a fill-in question.

## Animate

A `player` drives one number state through time. It is always drawn at the bottom
of its card, so write it last. Everything that reads the state recomputes on every
frame, in the browser, without calling you.

- Use one frame state, `@state frame = 1 min=1 max=N step=1`, for a process in
  steps; use a fine `step=` such as 0.01 for continuous motion.
- List per-frame values with `pick(frame, …)` in a `@calc`: the running line,
  each variable, a sentence about what just happened. All options of one
  `pick` share a type, and one `pick` takes at most 32 options; compute longer
  runs from `frame` with arithmetic instead.
- Show code as a `code` block with `current=line numbers=true`: the running
  line is highlighted and the block scrolls to it. A `table` or `keys` beside
  it shows the variables of that frame.
- `duration=` is seconds per run at 1×; by default a second per step, two to ten.
- `loop=true autoplay=true` plays a cycle by itself while the card is on screen,
  like a GIF; see `drawing.md` for moving pictures.
- In your reply, say what the reader will see when it plays; the text view you
  receive shows the first frame only.

## Pages, checklists, and flows

- Split a long card into `tabs` with one indented `tab "Title"` per page, such as
  idea, worked example, practice. Every page shares the card's state, and you
  still read all pages in the result.
- Use `checklist items=[…]` for steps the reader ticks off; add `bind=done` with
  `@state done = 0` when another figure should follow the count. For priced
  options add `values=[…]` and `bind=` gets the sum; `names=` fills a text state
  with the ticked names, so a button's prompt can say which (see `recipes.md`).
- Add `sortable=true` to a `table` the reader may want to rank. Give a table all
  its rows: past 8 the reader can filter, past 20 it pages, and any table copies.
- Draw a process or decision flow with `diagram nodes=[…] edges=["A -> B", "B -> C: yes"]`.
  Name arrow ends by a node's exact text or its number; `current=` highlights a
  box, so a `player` can walk the flow.

## Code and preformatted text

- Put code, command output, a log, or any text whose spacing matters in `code`,
  written as a text block: end the line with `"""`, write the lines, and close
  with a line of only `"""`. The text is kept exactly as written: no `{…}`, no
  escapes, indentation measured from the block's left edge.
- Set `lang=` for syntax colours; leave it out for prose-like text, which wraps.

## Revising a card

When the reader asks to change a card you drew, or one you just drew came out
wrong, call `ui_render` with `revises=` set to the card id its result reported,
and write the whole program again. Keep the names of states you are not
changing: the new card starts from the reader's values for them, and the earlier
card folds away. A different question gets a new card, without `revises=`.

## When the call fails

The result lists each problem with a repair. Apply every repair and call
`ui_render` again in the same turn. The usual causes:

- an expression with spaces left unquoted in a prop value;
- a name used without a `@state` or `@calc` line, or a `@calc` that reads one
  declared below it;
- a state named `e`, `pi`, `tau`, or `inf`, which are constants;
- a component or prop that is not in the catalog.

A program that compiles with repairs still renders, and the result says what
changed. If a second attempt fails, answer in prose and say the card could not be
drawn.

## Reference files

Read these from this skill's base directory when the card needs them:

- `math.md`: functions, the calculus operators and their accuracy, `plot` and
  `formula`, and six calculus recipes.
- `drawing.md`: `canvas` and `shape`, coordinates, SVG rules, moving pictures,
  and five recipes.
- `recipes.md`: complete cards for prices, loans, units, probability, projectiles,
  quizzes, priced add-ons, several series, code traced line by line, and a tangent
  sweeping a curve.
