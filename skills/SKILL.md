---
name: dsh-intelligent-ui
description: Use when the ui_render tool is available and an answer would be clearer as an interactive card - an estimate the reader adjusts, a comparison, a chart or function plot, a formula with live values, a short form, a multiple-choice question answered by clicking, or a process the reader plays step by step. Covers choosing a card over prose, designing one, math cards, animation, and repairing a failed call.
---

# Answering with interactive cards

`ui_render` draws a card in the chat from a small program written in DIL. The
card's controls recompute in the reader's browser without calling you; a button
sends its prompt as the reader's next message. The tool description is the
language reference. This skill is about judgement: when to draw a card, how to
shape it, and what to say around it.

## When a card is the right answer

Draw a card when the reader will want to vary something, compare options side by
side, or answer with a click:

- "What does it cost if…", "how long until…", "what if the rate is…": an estimate
  with sliders and a headline `metric`.
- Two to six options with several attributes each: a `table`, with a `badge` or
  `callout` for the recommendation.
- A trend, a breakdown, or a share: `chart` or `progress`.
- A function, a derivative, an integral, a limit, or a series: `plot` and
  `formula`. Read `math.md` first.
- A practice question: the stem in `text` and one `button` per option.
- A process that unfolds: code running line by line, an algorithm's passes, a
  point moving along a curve. Drive it with a `player`; see "Animate" below.

Answer in prose instead when the answer is one number or one sentence, when
nothing would be adjusted or compared, or when the user asked for text, code, or
a file. A card never replaces the explanation; it carries the part the reader
explores.

## Shape of a good card

- One card answers one question. Its title says what it computes, in the user's
  language.
- Put the headline figure in a `metric`, supporting figures in `keys`, and the
  assumptions behind them in one `callout`.
- Use three or four controls at most. Give every number `@state` realistic
  `min=`, `max=`, and `step=`, and give its slider a `unit=`.
- Write labels, units, and sentences in the user's language; keep state and calc
  names short English identifiers.
- Name each derived value once with `@calc` and reuse the name; a `@calc` may
  only read calcs declared above it.
- Put live values into sentences: `text "{seats} seats cost {monthly} USD a month."`
- Quote any expression that contains spaces: `value="mins / 60"`.
- Prefer one card per answer. Draw a second card only for a genuinely separate
  question.

## What to say around it

The tool result contains the card's text view, with every figure computed at the
initial values. In your reply:

- say in one or two sentences what the card shows and what to try with it;
- quote the key figure from that text view, never a number you worked out a
  different way, so the reply and the card always agree;
- do not restate the whole card in prose.

A figure shown as "—" could not be computed reliably (for example a divergent
limit or an equation with no root in its interval). Fix the program, or tell the
reader why there is no value.

## Questions answered by clicking

- One question per card: the stem in `text`, then a `col` with one `button` per
  option. Set each `prompt` to what the reader would type, usually the letter.
- Never put the answer, a hint that gives it away, or a "check" control in the
  card. The answer belongs in your next reply, after the reader has chosen.
- When the reader's choice arrives as their message, say whether it is right,
  explain briefly, and send the next question as a new card if the set goes on.
- A card sends at most once; after a click its buttons lock.

```dil
card "Question 2 of 5"
  text "Which integral gives the area between y = x and y = x² on [0, 1]?"
  col gap=1
    button "A. ∫₀¹ (x − x²) dx" prompt="A"
    button "B. ∫₀¹ (x² − x) dx" prompt="B"
    button "C. ∫₀¹ x² dx" prompt="C"
```

## Animate

A `player` drives one number state through time: the reader plays, pauses,
steps one frame back or forward, scrubs, and changes the speed. It is always
drawn at the bottom of its card, as the card's control bar, so write it last. Everything that
reads the state recomputes on every frame, in the browser, without calling you.

- Use one frame state, `@state frame = 1 min=1 max=N step=1`, for a process in
  steps; use a fine `step=` such as 0.01 for continuous motion.
- List per-frame values with `pick(frame, …)` in a `@calc`: the running line,
  each variable, a sentence about what just happened. All options of one
  `pick` share a type, and one `pick` takes at most 32 options; compute longer
  runs from `frame` with arithmetic instead.
- Show code as `steps items=[…] mono=true current=line`: numbered lines, code
  type with its indentation kept, and the running line highlighted. A `table`
  or `keys` beside it shows the variables of that frame.
- `duration=` is seconds for one run at 1×; without it a run takes one second
  per step, between two and ten seconds.
- In your reply, say what the reader will see when they press play; the text
  view you receive shows the first frame only.

## Pages, checklists, and flows

- Split a long card into `tabs` with one indented `tab "Title"` per page, such as
  idea, worked example, practice. Every page shares the card's state, and you
  still read all pages in the result.
- Use `checklist items=[…]` for steps the reader ticks off; add `bind=done` with
  `@state done = 0` when another figure should follow the count.
- Add `sortable=true` to a `table` the reader may want to rank.
- Draw a process or decision flow with `diagram nodes=[…] edges=["A -> B", "B -> C: yes"]`.
  Name arrow ends by a node's exact text or its number; `current=` highlights a
  box, so a `player` can walk the flow.

## When the call fails

The result lists each problem with a repair. Apply every repair and call
`ui_render` again in the same turn. The usual causes:

- an expression with spaces left unquoted in a prop value;
- a name used without a `@state` or `@calc` line, or a `@calc` that reads one
  declared below it;
- a state named `e`, `pi`, `tau`, or `inf`, which are constants;
- a component or prop that is not in the catalog.

A program that compiles with repairs still renders; the result says what was
changed, so the next card can be written cleanly. If a second attempt still
fails, answer in prose and say the card could not be drawn.

## Reference files

Read these from this skill's base directory when the card needs them:

- `math.md`: functions, the calculus operators and their accuracy, `plot` and
  `formula`, and six calculus recipes.
- `recipes.md`: complete cards for prices, loans, unit conversion, probability,
  projectile motion, quiz series, and two animations: code traced line by line
  and a tangent sweeping a curve.
