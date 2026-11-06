# Drawing on a canvas

Read this before writing a `canvas`. Use `plot` for a function, `chart` for data,
and `diagram` for a flow. Use a canvas when the answer has a shape of its own: a
triangle, a force diagram, a floor plan, a circuit, a labelled illustration.

A `canvas` holds indented `shape` lines, drawn in order, each above the last. An
SVG written in `svg="""` sits under all of them.

## Coordinates

`view=[left, right, bottom, top]` names the edges of the canvas. Its proportions
set the drawing's shape, and the card's width sets its size, so keep it wider
than it is tall.

- For maths and physics, let y grow upward with `bottom` below `top`:
  `view=[-5, 5, -3, 3]`.
- For a layout, let y grow downward, which is the default `view=[0, 320, 200, 0]`.
- With `svg=` the coordinates are the SVG's own viewBox; leave `view=` out.

Line weights and text keep their size whatever the coordinates are; give them no
sizes in your units. A `rect` runs from `x y` to `x + w`, `y + h`. Text is centred
on `x y` unless `anchor=` says otherwise.

## Shapes or SVG

Write `shape` lines when anything moves, or when a colour from the theme is
enough. Every coordinate is an expression, so sliders, a `player`, and dragged
points move shapes with no wiring. `fill=`, `dash=`, and `show=` are expressions
too: `show="step > 2"` reveals a part, and `fill="part == \"lid\""` marks a chosen
one. `tone=` is a fixed word, not an expression: to recolour a part, draw it again in
the other tone with `show=`. Tones follow the reader's theme.

Write `svg=` for a detailed picture: an object, an organ, a map, a logo-free
illustration. It does not read state, so put whatever moves in `shape` lines above
it, or draw a moving part inside `<defs>` and place it with `kind=use` (see
"Moving pictures"). Keep it to what a card can draw:

- `g path rect circle ellipse line polyline polygon text tspan title desc defs use`,
  gradients, `stop`, `clipPath`, `mask`, `pattern`, `marker`, and `symbol`;
- colours and sizes as attributes such as `fill=` and `stroke-width=`, never
  `style=` or `class=`;
- ids only for references inside the drawing, such as `fill="url(#shade)"`.

Scripts, styles, links, images, nested `svg`, filters, and animation are left out
and reported. Write lines and text in `black` or leave their fill unset, and they
follow the theme; on a dark theme a picture must stay readable, so choose colours
that are neither very pale nor very dark for anything else.

## What the reader can do

- Drag: `shape kind=point x=a y=b drag=true` moves whichever of `x=` and `y=` is
  one number `@state`. If only one is, the other can be a calc, so the point
  follows a curve. The state's `min=`, `max=`, and `step=` hold while dragging; set
  them, because they are what keep a drag sensible.
- Click: any shape with `bind=part value="lid"` stores that value in the state. A
  true/false state with no `value=` toggles. `kind=hotspot` is an invisible area
  to click, made for marking the parts of an SVG.

None of this calls you. To hear what the reader chose, add a `button` whose
`prompt` names the states, and describe the drawing in your reply: you cannot see
the picture, and the text view you receive lists only its words and its states.

## Moving pictures

A `player` animates a drawing: shapes read the state it plays, and each frame
redraws them in the browser. For motion that cycles, such as a wheel, a wave, or
an orbit, write `loop=true autoplay=true`: the card plays by itself while it is on
screen, like a GIF, and the reader can still pause, step, and scrub. A reader who
asked their system for less motion presses play themselves. Give the played state
a fine `step=`, such as 0.01, so the motion is smooth.

- `rotate=` turns a shape by degrees and `scale=` sizes it, both about its `x y`;
  with y upward a positive angle turns counter-clockwise, with y downward
  clockwise. `opacity=` from 0 to 1 fades it.
- `polygon`, `polyline`, `path`, `curve`, and `use` are drawn around their own
  0 0: `x=` and `y=` move them, and they turn about where that point lands.
- `kind=curve fn="sin(x - t)"` draws y of x across the canvas, or from `from=` to
  `to=`. A pair `fn=["cos(s)", "sin(s)"] var=s from=0 to=t` traces a curve by its
  own variable, so `to=` set to the played state draws the trail of a moving point.
- `kind=use ref=wheel` places a part of the `svg=`. Draw the part once inside
  `<defs>`, around its own 0 0, as `<g id="wheel">…</g>`; each `use` line then
  places, turns, and scales a copy. Parts keep the colours the SVG gave them.

In your reply, say what moves and what to watch; the text view you receive shows
one frame.

## A triangle the reader reshapes

```dil
@state ax = 0 min=-4 max=4 step=0.5
@state ay = 2 min=-1 max=3 step=0.5
@calc area = 3 * abs(ay + 2)
card "Area of a triangle"
  canvas view=[-5, 5, -3, 3.5]
    shape kind=line x=-5 y=0 x2=5 y2=0 tone=muted arrow=true
    shape kind=line x=0 y=-3 x2=0 y2=3.5 tone=muted arrow=true
    shape kind=polygon points=["ax", "ay", -3, -2, 3, -2] tone=primary fill=true
    shape "A" kind=point x=ax y=ay drag=true tone=primary
  metric "Area" value=area
  button "Explain this one" prompt="Why is the area {area} with A at ({ax}, {ay})?"
```

## A point held to a curve

```dil
@state t = 1 min=-2 max=2 step=0.1
@calc y = 3 - t^2
@calc slope = -2 * t
card "Slope along a parabola"
  canvas view=[-3, 3, -2, 4]
    shape kind=path d="M-2.2 -1.84 Q0 8.84 2.2 -1.84" tone=muted
    shape kind=line x="t - 1" y="y - slope" x2="t + 1" y2="y + slope" tone=warn dash=true
    shape "P" kind=point x=t y=y drag=true tone=primary
  keys items=["x: {t}", "y: {y}", "slope: {slope}"]
```

## An illustration with parts to click

```dil
@state part = "Click a part of the lamp."
card "A desk lamp"
  canvas svg="""
    <svg viewBox="0 0 320 200">
      <ellipse cx="160" cy="186" rx="52" ry="8" fill="#8a8f98"/>
      <path d="M160 180 L160 96" stroke="black" stroke-width="5"/>
      <path d="M116 96 L204 96 L184 40 L136 40 Z" fill="#e8a33d"/>
    </svg>
    """
    shape "Shade" kind=hotspot x=112 y=36 w=96 h=64 bind=part value="The shade directs the light down."
    shape "Stem" kind=hotspot x=148 y=100 w=24 h=78 bind=part value="The stem holds the shade up."
    shape "Base" kind=hotspot x=104 y=176 w=112 h=20 bind=part value="The base keeps it steady."
  text "{part}"
```

## A wheel that rolls and traces its path

```dil
@state a = 0 min=0 max=6.28 step=0.01
card "A rolling wheel traces a cycloid"
  canvas svg="""
    <svg viewBox="0 80 320 120">
      <defs>
        <g id="wheel">
          <circle r="30" fill="#e8a33d" stroke="black" stroke-width="2"/>
          <path d="M0 -30 V30 M-30 0 H30" stroke="black" stroke-width="2"/>
          <circle cy="30" r="4" fill="#d9534f"/>
        </g>
      </defs>
      <path d="M10 180 H310" stroke="black" stroke-width="2"/>
    </svg>
    """
    shape kind=curve fn=["40 + 30 * (s - sin(s))", "150 + 30 * cos(s)"] var=s from=0 to=a tone=error dash=true
    shape kind=use ref=wheel x="40 + 30 * a" y=150 rotate="deg(a)"
  player "Angle" bind=a duration=4 loop=true autoplay=true unit=rad
```

The wheel turns by `deg(a)` as its centre moves by `30 * a`, so it rolls without
slipping, and the red dot on its rim leaves the dashed trail.

## A travelling wave

```dil
@state t = 0 min=0 max=6.28 step=0.01
@state k = 1 min=0.5 max=3 step=0.5
card "A travelling wave"
  canvas view=[0, 9.42, -1.6, 1.6]
    shape kind=line x=0 y=0 x2=9.42 y2=0 tone=muted
    shape kind=curve fn="sin(k * x - t)" tone=primary
    shape kind=point x=3.14 y="sin(k * 3.14 - t)" tone=warn
  slider "Wave number k" bind=k
  player "Time" bind=t duration=3 loop=true autoplay=true
```

The crests move right while the marked point only rises and falls; the slider
changes the wavelength as it plays.
