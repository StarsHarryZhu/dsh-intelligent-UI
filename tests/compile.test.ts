import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalogHash } from '../src/lang/catalog.ts'
import { compileSource, initialValues, isDataImage } from '../src/lang/compile.ts'
import { renderText } from '../src/lang/text.ts'
import { API_VERSION } from '../src/lang/identity.ts'
import type { Diagnostic, UINode, UIProgram } from '../src/lang/types.ts'

/** The estimate every grammar should agree on. */
const TEAM_PLAN_DIL = [
  '@state seats = 8 min=1 max=50 step=1',
  '@calc price = seats * 29',
  'card "Team plan estimate" padding=3 gap=2',
  '  text "Drag the slider to see the monthly price."',
  '  slider "Seats" bind=seats',
  '  metric "Monthly" value=price unit=USD',
].join('\n')

/** Compile expecting success. */
function ok(source: string): UIProgram {
  const result = compileSource(source)
  if (!result.ok) throw new Error(`expected a program, got ${JSON.stringify(result.diagnostics)}`)
  return result.program
}

/** Compile expecting failure. */
function failed(source: string): Diagnostic[] {
  const result = compileSource(source)
  if (result.ok) throw new Error('expected a failure')
  return result.diagnostics
}

/** One node by type. */
function first(program: UIProgram, type: string): UINode {
  const node = program.nodes.find(entry => entry.type === type)
  if (node === undefined) throw new Error(`no ${type}`)
  return node
}

/** Resolve one node's text prop at the initial values. */
function textOf(program: UIProgram, node: UINode, prop: string): string {
  return renderText(node.props[prop], initialValues(program), program.constants)
}

describe('the canonical estimate', () => {
  const program = ok(TEAM_PLAN_DIL)

  it('keeps the declared state and derived keys', () => {
    expect(program.state).toEqual([{ key: 'seats', kind: 'number', init: 8, min: 1, max: 50, step: 1 }])
    expect(program.calc).toEqual([{ key: 'price', expr: ['mul', ['ref', 'seats'], 29] }])
  })

  it('links the flat component list by indentation', () => {
    expect(program.nodes.map(node => [node.type, node.parent])).toEqual([
      ['card', null], ['text', 'card1'], ['slider', 'card1'], ['metric', 'card1'],
    ])
  })

  it('records the control binding outside props', () => {
    const slider = first(program, 'slider')
    expect(slider.bind).toEqual({ key: 'seats', kind: 'number' })
    expect(slider.props).not.toHaveProperty('bind')
  })

  it('stamps the API version and the catalog hash', () => {
    expect(API_VERSION).toBe(1)
    expect(program.version).toBe(API_VERSION)
    expect(program).not.toHaveProperty('v')
    expect(program).not.toHaveProperty('catalogVersion')
    expect(program.catalogHash).toBe(catalogHash())
  })

  it('evaluates the derived value at the declared initial state', () => {
    expect(initialValues(program).get('price')).toBe(232)
  })

  it('produces a readable stand-in for a text-only reader', () => {
    expect(program.fallback.split('\n')).toEqual([
      '## Team plan estimate',
      '  Drag the slider to see the monthly price.',
      '  Seats: 8 (1–50)',
      '  Monthly: 232 USD',
    ])
  })

  it('compiles the same program from the JSON form with nested children', () => {
    const json = ok(JSON.stringify({
      states: [{ key: 'seats', init: 8, min: 1, max: 50, step: 1 }],
      calcs: [{ key: 'price', expr: 'seats * 29' }],
      nodes: [{
        type: 'card',
        title: 'Team plan estimate',
        padding: 3,
        gap: 2,
        children: [
          { type: 'text', text: 'Drag the slider to see the monthly price.' },
          { type: 'slider', label: 'Seats', bind: 'seats' },
          { type: 'metric', props: { label: 'Monthly', value: 'price', unit: 'USD' } },
        ],
      }],
    }))
    expect(json.state).toEqual(program.state)
    expect(json.calc).toEqual(program.calc)
    expect(json.nodes.map(node => node.type)).toEqual(program.nodes.map(node => node.type))
    expect(json.fallback).toBe(program.fallback)
  })

  it('refuses the explicit id form and the $text template objects, saying what to write', () => {
    const lines = ok([
      '@calc price = 29',
      'card',
      '#price metric label=Monthly value=price in=#root',
      '  text "kept"',
    ].join('\n'))
    expect(lines.nodes.map(node => node.type)).toEqual(['card', 'text'])
    expect(lines.diagnostics[0]?.repair).toMatch(/without an id/u)
    const json = ok(JSON.stringify({
      nodes: [{ type: 'card', children: [{ type: 'text', text: { $text: [{ text: 'Twice' }] } }, { type: 'text', text: 'kept' }] }],
    }))
    expect(json.nodes.map(node => node.type)).toEqual(['card', 'text'])
    expect(json.diagnostics[0]?.message).toMatch(/<text> text: must be text/u)
  })
})

describe('text', () => {
  it('interpolates {expressions} and hoists the literal parts', () => {
    const program = ok('@state seats = 3\n@calc price = seats * 10\ncard\n  text "{seats} seats cost {price} USD"')
    const node = first(program, 'text')
    expect(textOf(program, node, 'text')).toBe('3 seats cost 30 USD')
    expect(Object.values(program.constants)).toEqual([' seats cost ', ' USD'])
  })

  it('stores a repeated literal once', () => {
    const program = ok('card\n  badge "same"\n  badge "same"')
    expect(Object.values(program.constants)).toEqual(['same'])
  })

  it('interpolates inside list items and table cells', () => {
    const program = ok('@state n = 2\ncard\n  keys items=["Seats: {n}","Total: {n * 29}"]\n  table columns=["Plan","Price"] rows=[["Pro","{n * 29}"]]')
    const values = initialValues(program)
    const keys = first(program, 'keys').props.items as unknown[]
    expect(keys.map(item => renderText(item, values, program.constants))).toEqual(['Seats: 2', 'Total: 58'])
    const rows = first(program, 'table').props.rows as unknown[][]
    expect(renderText(rows[0]?.[1], values, program.constants)).toBe('58')
  })

  it('keeps a brace that is not an expression and says so', () => {
    const program = ok('card\n  text "Use {a: 1} here"')
    expect(textOf(program, first(program, 'text'), 'text')).toBe('Use {a: 1} here')
    expect(program.diagnostics[0]?.message).toContain('{a: 1} is not an expression over declared names')
  })

  it('turns key/value pairs into "Label: value" items', () => {
    const program = ok(JSON.stringify({ nodes: [{ type: 'card', children: [{ type: 'keys', items: [['Seats', 8]] }] }] }))
    const items = first(program, 'keys').props.items as unknown[]
    expect(renderText(items[0], new Map(), program.constants)).toBe('Seats: 8')
  })
})

describe('choices and comparisons', () => {
  it('prices a plan from a choice', () => {
    const program = ok([
      '@state plan = "Pro" options=Basic|Pro|Team',
      '@calc rate = plan == "Team" ? 22 : plan == "Pro" ? 29 : 12',
      'card',
      '  select "Plan" bind=plan',
      '  metric "Rate" value=rate',
    ].join('\n'))
    expect(program.state[0]).toEqual({ key: 'plan', kind: 'select', init: 'Pro', options: ['Basic', 'Pro', 'Team'] })
    expect(initialValues(program).get('rate')).toBe(29)
  })

  it('starts a choice at its first option when the initial value is not one of them', () => {
    const program = ok('@state plan = "Gold" options=Basic|Pro\ncard\n  select "Plan" bind=plan')
    expect(program.state[0]?.init).toBe('Basic')
    expect(program.diagnostics[0]?.message).toContain('"Gold" is not one of the options')
  })

  it('lets a select bind text state when it lists its own options', () => {
    const program = ok(JSON.stringify({ states: [{ key: 'tier', init: 'a' }], nodes: [{ type: 'card', children: [{ type: 'select', label: 'Tier', bind: 'tier', options: ['a', 'b'] }] }] }))
    expect(first(program, 'select').bind).toEqual({ key: 'tier', kind: 'string' })
  })
})

describe('forgiving form, reporting every repair', () => {
  it('drops a bad optional prop and keeps the component', () => {
    const program = ok('card padding=99\n  text "kept" tone=purple')
    expect(first(program, 'card').props).not.toHaveProperty('padding')
    expect(first(program, 'text').props).not.toHaveProperty('tone')
    expect(program.diagnostics.map(entry => entry.message)).toEqual([
      '<card> padding: is a spacing step: a whole number from 0 to 8 (units of 4px); the prop was ignored',
      '<text> tone: must be one of primary, secondary, muted, success, warn, error; the prop was ignored',
    ])
  })

  it('maps tone and size words models reach for', () => {
    const program = ok('card\n  text "x" tone=danger size=large')
    expect(first(program, 'text').props).toEqual(expect.objectContaining({ tone: 'error', size: 'lg' }))
  })

  it('drops a component whose required prop is invalid, and says so', () => {
    const program = ok('card\n  metric "Total" value=ghost\n  text "still here"')
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'text'])
    expect(program.diagnostics[0]?.message).toBe('<metric> value: "ghost" is not a declared @state or @calc key; the component was left out')
  })

  it('drops a component that misses a required prop', () => {
    const program = ok('card\n  slider bind=nothing\n  text "x"')
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'text'])
  })

  it('places a top-level component in the nearest card', () => {
    const program = ok(JSON.stringify({ nodes: [{ id: 'a', type: 'card' }, { id: 't', type: 'text', text: 'loose' }] }))
    expect(first(program, 'text').parent).toBe('a')
  })

  it('creates a card when the program has no container at all', () => {
    const program = ok('metric "Answer" value=42')
    expect(program.nodes.map(node => [node.type, node.parent])).toEqual([['card', null], ['metric', 'card2']])
  })

  it('moves a child out of a component that cannot hold children', () => {
    const program = ok(JSON.stringify({ nodes: [{ id: 'c', type: 'card' }, { id: 'x', type: 'text', parent: 'c', text: 'a' }, { id: 'y', type: 'text', parent: 'x', text: 'b' }] }))
    expect(program.nodes.find(node => node.id === 'y')?.parent).toBe('c')
    expect(program.diagnostics[0]?.code).toBe('orphan_node')
  })

  it('places a component whose parent does not exist', () => {
    const program = ok(JSON.stringify({ nodes: [{ id: 'c', type: 'card' }, { type: 'text', parent: 'ghost', text: 'x' }] }))
    expect(first(program, 'text').parent).toBe('c')
    expect(program.diagnostics[0]?.message).toMatch(/parent "ghost" names no component/u)
  })

  it('cuts a parent loop instead of hanging', () => {
    const program = ok(JSON.stringify({ nodes: [{ id: 'a', type: 'col', parent: 'b' }, { id: 'b', type: 'col', parent: 'a' }, { id: 't', type: 'text', parent: 'a', text: 'x' }] }))
    expect(program.nodes.some(node => node.parent === null)).toBe(true)
    expect(program.diagnostics.some(entry => entry.message.includes('loops'))).toBe(true)
  })

  it('renames a duplicate id', () => {
    const program = ok(JSON.stringify({ nodes: [{ id: 'a', type: 'card' }, { id: 'a', type: 'text', parent: 'a', text: 'x' }] }))
    expect(program.nodes.map(node => node.id)).toEqual(['a', 'text2'])
    expect(program.diagnostics[0]?.code).toBe('duplicate_id')
  })

  it('ignores an unknown component and an unknown prop', () => {
    const program = ok('card\n  hologram "x"\n  text "y" glow=true')
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'text'])
    expect(program.diagnostics.map(entry => entry.code)).toEqual(['unknown_component', 'unknown_prop'])
  })

  it('reads numeric text where a number is expected', () => {
    const program = ok(JSON.stringify({ nodes: [{ type: 'grid', columns: '3' }] }))
    expect(first(program, 'grid').props.columns).toBe(3)
  })
})

describe('what still fails', () => {
  it('fails an empty or unreadable source', () => {
    expect(failed('')[0]?.code).toBe('unparseable')
    expect(failed('// nothing here')[0]?.code).toBe('unparseable')
    expect(failed('{"nodes": [')[0]?.code).toBe('unparseable')
  })

  it('fails a program whose every component was rejected', () => {
    const diagnostics = failed('hologram\nlaser')
    expect(diagnostics.map(entry => entry.code)).toEqual(['unknown_component', 'unknown_component', 'missing_root'])
  })

  it('fails a source over the size limit before parsing it', () => {
    expect(failed('x'.repeat(64 * 1024 + 1))[0]?.code).toBe('limit_exceeded')
  })
})

describe('sources as models actually send them', () => {
  it('reads a program wrapped in a code fence', () => {
    expect(ok('```dil\ncard\n  text "x"\n```').nodes).toHaveLength(2)
    expect(ok('```json\n{"nodes":[{"type":"card"}]}\n```').nodes).toHaveLength(1)
  })

  it('trims text around a JSON object, within a bounded number of attempts', () => {
    const program = ok('{"nodes":[{"type":"card","title":"x"}]} — here is the card')
    expect(program.nodes).toHaveLength(1)
    expect(program.diagnostics[0]?.code).toBe('unterminated_line')
  })

  it('accepts a bare component tree as the whole program', () => {
    const program = ok(JSON.stringify({ type: 'card', title: 'x', states: [{ key: 'n', init: 1 }], children: [{ type: 'metric', label: 'n', value: 'n' }] }))
    expect(program.state).toHaveLength(1)
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'metric'])
  })

  it('compiles the quiz card a course-review session tried to send', () => {
    const program = ok([
      'card padding=3 gap=2',
      '  title "第 1 题 · 模型识别（单选）"',
      '  text "A quality inspector selects 15 items at random, without replacement, from a lot of 500 items."',
      '  col gap=1',
      '    button "A. Binomial" prompt="选 A"',
      '    button "B. Hypergeometric" prompt="选 B"',
      '  text "也可以直接在对话里回复字母。"',
    ].join('\n'))
    expect(program.diagnostics).toEqual([])
    expect(program.nodes.filter(node => node.type === 'button').map(node => textOf(program, node, 'prompt'))).toEqual(['选 A', '选 B'])
  })
})

describe('content safety', () => {
  it('accepts only http and https links', () => {
    expect(ok('card\n  link "docs" url="https://example.com/a"').nodes).toHaveLength(2)
    const program = ok('card\n  link "x" url="javascript:alert(1)"\n  text "y"')
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'text'])
  })

  it('accepts only inline raster images', () => {
    expect(isDataImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isDataImage('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isDataImage('https://example.com/a.png')).toBe(false)
    const program = ok('card\n  image src="https://example.com/a.png" alt="remote"\n  text "y"')
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'text'])
  })

  it('evaluates chart values that read state', () => {
    const program = ok('@state a = 3\ncard\n  chart labels=["A","B"] values=["a * 2", 5]')
    expect(first(program, 'chart').props.values).toEqual([['mul', ['ref', 'a'], 2], 5])
  })

  it('rejects a chart value that is not numeric', () => {
    const program = ok('@state t = "x"\ncard\n  chart labels=["A"] values=["t"]\n  text "y"')
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'text'])
  })
})

describe('math', () => {
  const calculus = [
    '@state a = 1 min=0 max=3 step=0.1',
    'card "Area"',
    '  slider "a" bind=a',
    '  formula "integral(x^2, x, 0, a)" label="Area"',
    '  plot fn="x^2" from=-1 to=3 shadeFrom=0 shadeTo=a mark=a tangent=true',
    '  metric "Exact" value=a^3/3 digits=6',
  ].join('\n')

  it('compiles a calculus card without a diagnostic', () => {
    const program = ok(calculus)
    expect(program.diagnostics).toEqual([])
    expect(program.version).toBe(1)
    expect(first(program, 'formula').props.expr).toEqual(['integral', 'x', ['pow', ['ref', 'x'], 2], 0, ['ref', 'a']])
    expect(first(program, 'plot').props.fn).toEqual([['pow', ['ref', 'x'], 2]])
  })

  it('writes the computed figures into the text the model reads', () => {
    const lines = ok(calculus).fallback.split('\n').map(line => line.trim())
    expect(lines).toContain('Area: integral(x^2, x, 0, a) = 0.333333')
    expect(lines).toContain('Plot: y = x^2 for x from -1 to 3; point at x = 1: y = 1; tangent slope 2; shaded area from 0 to 1 = 0.333333')
    expect(lines).toContain('Exact: 0.333333')
  })

  it('binds a plot variable of its own, shadowing nothing outside the curves', () => {
    const program = ok('@state t0 = 1\ncard\n  plot fn=["sin(t)", "t0 * t"] var=t from=0 to=tau')
    expect(first(program, 'plot').props.var).toBe('t')
    expect(program.diagnostics).toEqual([])
    const bad = ok('card\n  plot fn="y + 1"\n  text "kept"')
    expect(bad.nodes.map(node => node.type)).toEqual(['card', 'text'])
  })

  it('refuses a declaration named like a constant', () => {
    const program = ok('@state e = 2\n@calc pi = 3\ncard\n  text "x"')
    expect(program.state).toEqual([])
    expect(program.calc).toEqual([])
    expect(program.diagnostics.map(entry => entry.path)).toEqual(['state.e', 'calc.pi'])
  })

  it('compiles the math and animation cards a live model wrote, without a repair', () => {
    const samples = readFileSync(join(import.meta.dirname, '..', 'docs', 'SAMPLES.md'), 'utf8')
    const live = [...samples.matchAll(/^## 2[567]\. [\s\S]*?```dil\n([\s\S]*?)```/gmu)].map(match => match[1] as string)
    expect(live).toHaveLength(3)
    for (const source of live) {
      const program = ok(source)
      expect(program.diagnostics).toEqual([])
      expect(program.version).toBe(1)
    }
  })

  it('shows an equation without a value and a failure as a dash', () => {
    const program = ok('@state a = 3\n@state b = 4\ncard\n  formula "a^2 + b^2 = 25"\n  formula "limit(1/x, x, 0)" label="L"')
    const lines = program.fallback.split('\n').map(line => line.trim())
    expect(lines).toContain('a^2 + b^2 == 25')
    expect(lines).toContain('L: limit(1 / x, x, 0) = —')
  })
})

describe('streaming compile', () => {
  it('compiles the lines that have arrived and reports nothing', () => {
    const result = compileSource('card "Plan"\n  text "one"\n  text "tw', { partial: true })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.program.nodes).toHaveLength(2)
  })

  it('waits quietly for a JSON object to close', () => {
    expect(compileSource('{"nodes":[{"type":"card"', { partial: true })).toEqual({ ok: false, diagnostics: [] })
  })
})

describe('animation', () => {
  const source = [
    '@state t = 2 min=0 max=7 step=1',
    'card "Run"',
    '  player "Step {t}" bind=t duration=8 unit="of 7"',
    '  steps items=["x = 0", "  x += 1"] current=t mono=true',
    '  list items=["a"] current="t - 1"',
    '  table columns=["k"] rows=[["{pick(t, \\"a\\", \\"b\\")}"]] current=1 mono=t > 3',
  ].join('\n')

  it('compiles the player and the step-through props without a repair', () => {
    const program = ok(source)
    expect(program.diagnostics).toEqual([])
    expect(first(program, 'player').bind).toEqual({ key: 't', kind: 'number' })
    expect(first(program, 'player').props.duration).toBe(8)
    expect(first(program, 'steps').props.current).toEqual(['ref', 't'])
    expect(first(program, 'steps').props.mono).toEqual(['lit', true])
    expect(first(program, 'table').props.mono).toEqual(['gt', ['ref', 't'], 3])
  })

  it('keeps leading spaces in list items, so code keeps its indentation', () => {
    const program = ok(source)
    const items = first(program, 'steps').props.items as unknown[]
    expect(items.map(item => renderText(item, initialValues(program), program.constants))).toEqual(['x = 0', '  x += 1'])
  })

  it('describes the player in the text version', () => {
    expect(ok(source).fallback.split('\n').map(line => line.trim())).toContain('Step 2: 2 of 7 (0–7)')
  })

  it('bounds the duration and types current and mono', () => {
    const program = ok('@state t = 0\n@state s = "a"\ncard\n  player "p" bind=t duration=0.1\n  steps items=["a"] current=s mono=1')
    expect(first(program, 'player').props).not.toHaveProperty('duration')
    expect(first(program, 'steps').props).toEqual({ items: expect.any(Array) })
    expect(program.diagnostics.map(entry => entry.path)).toEqual(['nodes.player2.duration', 'nodes.steps3.current', 'nodes.steps3.mono'])
  })

  it('binds the player to a number state only', () => {
    const program = ok('@state s = "a"\ncard\n  player "p" bind=s\n  text "kept"')
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'text'])
  })
})

describe('the player docks at the bottom of its card', () => {
  it('moves a player written first, or inside a row, to the end of the outermost card', () => {
    const program = ok([
      '@state t = 0 min=0 max=3',
      'card "Run"',
      '  player "first" bind=t',
      '  row',
      '    text "left"',
      '    player "nested" bind=t',
      '  text "after"',
    ].join('\n'))
    const card = first(program, 'card')
    const children = program.nodes.filter(node => node.parent === card.id).map(node => node.type)
    expect(children).toEqual(['row', 'text', 'player', 'player'])
    expect(program.nodes.filter(node => node.type === 'player').map(node => textOf(program, node, 'label'))).toEqual(['first', 'nested'])
    expect(program.fallback.split('\n').map(line => line.trim()).slice(-2)).toEqual(['first: 0 (0–3)', 'nested: 0 (0–3)'])
  })
})

describe('pages, checklists, sortable tables, and diagrams', () => {
  const PAGES = [
    'card "Course"',
    '  tabs',
    '    tab "Idea"',
    '      text "A derivative is a rate."',
    '    tab "Example"',
    '      text "d/dx x^2 = 2x"',
  ].join('\n')

  it('belongs to the same API version as everything else', () => {
    expect(ok(PAGES).version).toBe(API_VERSION)
    expect(ok('card\n  table columns=["a"] rows=[["1"]] sortable=true').version).toBe(API_VERSION)
  })

  it('nests pages by indentation and lists every page in the text view', () => {
    const program = ok(PAGES)
    expect(program.diagnostics).toEqual([])
    const tabs = first(program, 'tabs')
    expect(program.nodes.filter(node => node.type === 'tab').every(node => node.parent === tabs.id)).toBe(true)
    expect(program.fallback).toBe('## Course\n  ### Idea\n    A derivative is a rate.\n  ### Example\n    d/dx x^2 = 2x')
  })

  it('adds the tabs line a source left out, and reports it', () => {
    const program = ok('card\n  tab "One"\n    text "a"\n  tab "Two"\n    text "b"\n  text "after"')
    const tabs = program.nodes.filter(node => node.type === 'tabs')
    expect(tabs).toHaveLength(1)
    expect(program.nodes.filter(node => node.type === 'tab').map(node => node.parent)).toEqual([tabs[0]?.id, tabs[0]?.id])
    expect(first(program, 'tabs').parent).toBe(first(program, 'card').id)
    const after = program.nodes.find(node => node.type === 'text' && textOf(program, node, 'text') === 'after')
    expect(after?.parent).toBe(first(program, 'card').id)
    expect(program.diagnostics.map(entry => entry.code)).toEqual(['orphan_node'])
    expect(program.diagnostics[0]?.repair).toContain('tabs line')
  })

  it('moves a component written straight inside tabs into the page beside it', () => {
    const program = ok('card\n  tabs\n    text "before"\n    tab "One"\n      text "a"\n    text "loose"\n    tab "Two"')
    const [one, two] = program.nodes.filter(node => node.type === 'tab')
    const parents = program.nodes.filter(node => node.type === 'text').map(node => node.parent)
    expect(parents).toEqual([one?.id, one?.id, one?.id])
    expect(two).toBeDefined()
    expect(program.diagnostics.filter(entry => entry.code === 'orphan_node')).toHaveLength(2)
  })

  it('reads a checklist with and without a bound count', () => {
    const program = ok('@state done = 0\ncard\n  checklist "Before you go" items=["Passport", "Tickets"] bind=done\n  checklist items=["One"]')
    expect(program.diagnostics).toEqual([])
    const [bound, free] = program.nodes.filter(node => node.type === 'checklist')
    expect(bound?.bind).toEqual({ key: 'done', kind: 'number' })
    expect(free?.bind).toBeUndefined()
    expect(program.fallback).toBe('Before you go (0/2 done)\n- [ ] Passport\n- [ ] Tickets\nChecklist (0/1 done)\n- [ ] One')
    // A count bound to text state is dropped on its own; the list still draws.
    const text = ok('@state done = "x"\ncard\n  checklist items=["a"] bind=done')
    expect(first(text, 'checklist').bind).toBeUndefined()
    expect(text.diagnostics[0]?.message).toContain('binds number state')
  })

  it('reads checklist values and a names state, and evens out a values list of the wrong length', () => {
    const program = ok('@state extra = 0\n@state picked = ""\ncard\n  checklist "Add-ons" items=["Case", "Charger"] values=[99, 149] bind=extra names=picked')
    expect(program.diagnostics).toEqual([])
    const node = first(program, 'checklist')
    expect(node.bind).toEqual({ key: 'extra', kind: 'number' })
    expect(node.props.names).toBe('picked')
    expect(node.props.values).toEqual([99, 149])
    expect(program.fallback).toBe('Add-ons (0/2 done)\n- [ ] Case (99)\n- [ ] Charger (149)')
    const short = ok('card\n  checklist items=["a", "b", "c"] values=[1, 2]')
    expect(first(short, 'checklist').props.values).toEqual([1, 2, 0])
    expect(short.diagnostics[0]?.message).toContain('3 items but 2 values; the missing ones count as 0')
    const long = ok('card\n  checklist items=["a"] values=[1, 2]')
    expect(first(long, 'checklist').props.values).toEqual([1])
    // Values are plain numbers, so the bound sum never goes stale; names= wants text state.
    const wrong = ok('@state n = 0\n@state k = 2\ncard\n  checklist items=["a"] values=["k"] names=n')
    expect(first(wrong, 'checklist').props).not.toHaveProperty('values')
    expect(first(wrong, 'checklist').props).not.toHaveProperty('names')
    expect(wrong.diagnostics.map(entry => entry.message).join('\n')).toMatch(/not a plain number[\s\S]*binds text state/u)
  })

  it('resolves arrows by text or number, keeps labels, and reports a dangling one', () => {
    const program = ok([
      '@state at = 2',
      'card',
      '  diagram "Login" nodes=["Start", "x > 0?", "Done"] edges=["Start -> x > 0?", "x > 0? -> Done: yes", "2 -> 1: no", "Start -> Nowhere"] current=at',
    ].join('\n'))
    const diagram = first(program, 'diagram')
    const edges = diagram.props.edges as unknown[]
    expect(edges.slice(0, 2)).toEqual([[1, 2], [2, 3, expect.any(Array)]])
    expect((edges[2] as unknown[]).slice(0, 2)).toEqual([2, 1])
    expect(edges).toHaveLength(3)
    expect(program.diagnostics).toHaveLength(1)
    expect(program.diagnostics[0]?.message).toContain('"Start -> Nowhere"')
    expect(program.diagnostics[0]?.repair).toContain('1 to 3')
    expect(program.fallback).toBe('Diagram "Login": Start → x > 0?; x > 0? → Done (yes); x > 0? → Start (no); current: x > 0?')
  })

  it('accepts arrows written as lists, and a diagram in a bare JSON tree', () => {
    const program = ok(JSON.stringify({ type: 'diagram', nodes: ['A', 'B'], edges: [['A', 'B', 'go'], [2, 1]] }))
    expect(first(program, 'diagram').props.edges).toEqual([[1, 2, expect.any(Array)], [2, 1]])
    expect(program.fallback).toContain('A → B (go); B → A')
  })

  it('bounds the boxes and arrows of one diagram', () => {
    const boxes = JSON.stringify(Array.from({ length: 41 }, (_, index) => `n${index}`))
    const program = ok(`card\n  text "x"\n  diagram nodes=${boxes}`)
    expect(program.nodes.some(node => node.type === 'diagram')).toBe(false)
    expect(program.diagnostics.some(entry => entry.code === 'limit_exceeded')).toBe(true)
  })
})

describe('code blocks', () => {
  const Q = '"""'
  const LISTING = [
    '@state line = 2 min=1 max=4 step=1',
    'card "Trace"',
    `  code lang=python caption="sum.py" current=line numbers=true ${Q}`,
    '    total = 0',
    '    for i in range(4):',
    '        total += {i}  # not an interpolation',
    '    print(total)}}',
    `  ${Q}`,
  ].join('\n')

  it('keeps the text exactly as written, braces and all, in the same API version', () => {
    const program = ok(LISTING)
    expect(program.diagnostics).toEqual([])
    expect(program.version).toBe(API_VERSION)
    const code = first(program, 'code')
    expect(code.props.text).toBe('total = 0\nfor i in range(4):\n    total += {i}  # not an interpolation\nprint(total)}}')
    expect(code.props.lang).toBe('python')
    expect(code.props.current).toEqual(['ref', 'line'])
  })

  it('writes a fenced block in the text view, with the highlighted line', () => {
    expect(ok(LISTING).fallback).toBe([
      '## Trace',
      '  sum.py:',
      '  ```python',
      '  total = 0',
      '  for i in range(4):',
      '      total += {i}  # not an interpolation',
      '  print(total)}}',
      '  ```',
      '  (line 2 highlighted)',
    ].join('\n'))
  })

  it('makes the fence longer than any backtick run, and keeps blank lines', () => {
    const program = ok(['card', `  code ${Q}`, '    a ```b``` c', '', '    d', `  ${Q}`].join('\n'))
    expect(program.fallback).toBe('````\na ```b``` c\n\nd\n````')
  })

  it('shows a text state or calc through value=, and its current value in the text view', () => {
    const program = ok('@state src = "SELECT 1"\ncard\n  textInput "Query" bind=src\n  code lang=sql value=src')
    expect(first(program, 'code').props.value).toEqual(['ref', 'src'])
    expect(program.fallback).toContain('```sql\nSELECT 1\n```')
  })

  it('reads the names models write for a language, and reports one it does not know', () => {
    expect(first(ok(`card\n  code lang=JavaScript ${Q}x${Q}`), 'code').props.lang).toBe('js')
    expect(first(ok(`card\n  code lang=py ${Q}x${Q}`), 'code').props.lang).toBe('python')
    const unknown = ok(`card\n  code lang=klingon ${Q}x${Q}`)
    expect(first(unknown, 'code').props).not.toHaveProperty('lang')
    expect(unknown.diagnostics[0]?.message).toContain('must be one of text, python')
  })

  it('leaves out a block with neither text nor value=, and says how to write one', () => {
    const program = ok('card\n  code lang=python\n  text "still here"')
    expect(program.nodes.some(node => node.type === 'code')).toBe(false)
    expect(program.diagnostics[0]?.repair).toContain(Q)
  })

  it('cuts a listing past the code limits and reports the cut', () => {
    const lines = Array.from({ length: 450 }, (_, index) => `x${index}`)
    const long = ok(`card\n  code ${Q}\n${lines.map(line => `    ${line}`).join('\n')}\n  ${Q}`)
    expect((first(long, 'code').props.text as string).split('\n')).toHaveLength(400)
    expect(long.diagnostics.some(entry => /450 lines/u.test(entry.message))).toBe(true)
    const wide = ok(`card\n  code ${Q}${'y'.repeat(9000)}${Q}`)
    expect((first(wide, 'code').props.text as string).length).toBe(8000)
    expect(wide.diagnostics.some(entry => /8000 characters/u.test(entry.message))).toBe(true)
  })

  it('accepts the JSON form with line breaks, and normalises Windows line ends', () => {
    const program = ok(JSON.stringify({ nodes: [{ type: 'card', children: [{ type: 'code', text: 'a\r\nb\n\n', lang: 'bash' }] }] }))
    expect(first(program, 'code').props.text).toBe('a\nb')
  })
})

describe('charts of several series', () => {
  const QUARTERS = 'labels=["Q1","Q2","Q3"]'

  it('keeps indented series under their chart, in order', () => {
    const program = ok(`card\n  chart shape=area stacked=true ${QUARTERS}\n    series "Revenue" values=[3, 4, 5]\n    series "Cost" values=[1, 2, 2]`)
    const chart = first(program, 'chart')
    const series = program.nodes.filter(node => node.type === 'series')
    expect(series.map(node => node.parent)).toEqual([chart.id, chart.id])
    expect(chart.props.stacked).toEqual(['lit', true])
    expect(program.diagnostics).toEqual([])
  })

  it('places a series written beside its chart into that chart, and reports it', () => {
    const program = ok(`card\n  chart ${QUARTERS}\n  series "A" values=[1, 2, 3]\n  series "B" values=[3, 2, 1]`)
    const chart = first(program, 'chart')
    expect(program.nodes.filter(node => node.type === 'series').every(node => node.parent === chart.id)).toBe(true)
    expect(program.diagnostics.filter(entry => /beside its chart/u.test(entry.message))).toHaveLength(2)
  })

  it('leaves out a series with no chart before it', () => {
    const program = ok('card\n  text "No chart here."\n  series "A" values=[1, 2]')
    expect(program.nodes.some(node => node.type === 'series')).toBe(false)
    expect(program.diagnostics.some(entry => /belongs inside a chart/u.test(entry.message))).toBe(true)
  })

  it('moves anything but a series out of a chart', () => {
    const program = ok(`card\n  chart ${QUARTERS} values=[1, 2, 3]\n    text "Note"`)
    expect(first(program, 'text').parent).toBe(first(program, 'card').id)
    expect(program.diagnostics.some(entry => /<chart> holds only series lines; <text> was placed in <card>/u.test(entry.message))).toBe(true)
  })

  it('lets a top-level chart join the card before it, as a leaf would', () => {
    const program = ok(`card "Sales"\n  text "Quarterly"\nchart ${QUARTERS} values=[1, 2, 3]`)
    expect(first(program, 'chart').parent).toBe(first(program, 'card').id)
  })

  it('needs values= or a series, prefers the series, and keeps four of them', () => {
    const none = ok(`card\n  chart ${QUARTERS}\n  text "after"`)
    expect(none.nodes.some(node => node.type === 'chart')).toBe(false)
    expect(none.diagnostics.some(entry => /neither values= nor series/u.test(entry.message))).toBe(true)
    const both = ok(`card\n  chart ${QUARTERS} values=[1, 2, 3]\n    series "A" values=[3, 2, 1]`)
    expect(first(both, 'chart').props.values).toBeUndefined()
    expect(both.diagnostics.some(entry => /values= was ignored/u.test(entry.message))).toBe(true)
    const five = ok(`card\n  chart ${QUARTERS}\n${['A', 'B', 'C', 'D', 'E'].map(name => `    series "${name}" values=[1, 2, 3]`).join('\n')}`)
    expect(five.nodes.filter(node => node.type === 'series')).toHaveLength(4)
    expect(five.diagnostics.some(entry => entry.code === 'limit_exceeded')).toBe(true)
  })

  it('reports a series whose length differs from its labels', () => {
    const program = ok(`card\n  chart ${QUARTERS}\n    series "A" values=[1, 2]`)
    expect(program.diagnostics.some(entry => /3 labels but a series with a different number of values/u.test(entry.message))).toBe(true)
  })

  it('draws a crowded pie as bars and drops stacked= where nothing stacks', () => {
    const labels = Array.from({ length: 9 }, (_, index) => `"s${index}"`).join(', ')
    const crowded = ok(`card\n  chart shape=pie labels=[${labels}] values=[1, 1, 1, 1, 1, 1, 1, 1, 1]`)
    expect(first(crowded, 'chart').props.shape).toBe('bar')
    expect(crowded.diagnostics.some(entry => /pie of 9 slices/u.test(entry.message))).toBe(true)
    const line = ok(`card\n  chart shape=line stacked=true ${QUARTERS} values=[1, 2, 3]`)
    expect(first(line, 'chart').props.stacked).toBeUndefined()
    expect(line.diagnostics.some(entry => /stacked= applies to bar and area/u.test(entry.message))).toBe(true)
  })

  it('compiles sample 33 without a repair, to the text the samples file records', () => {
    const samples = readFileSync(join(import.meta.dirname, '..', 'docs', 'SAMPLES.md'), 'utf8')
    const match = /^## 33\. [\s\S]*?```dil\n([\s\S]*?)```\n\nResult:\n\n```\n[\s\S]*?What a text-only reader sees:\n([\s\S]*?)\n```/mu.exec(samples)
    expect(match).not.toBeNull()
    const program = ok((match?.[1] ?? '').replace(/\n$/u, ''))
    expect(program.diagnostics).toEqual([])
    expect(program.fallback).toBe(match?.[2])
  })

  it('writes several series as a small table and a pie with its shares', () => {
    const several = ok(`card\n  chart caption="Sales" unit="k" ${QUARTERS}\n    series "Revenue" values=[3, 4, 5]\n    series "Cost" values=[1, 2]`)
    expect(several.fallback).toContain('Sales\n| Revenue | Cost\nQ1 | 3 k | 1 k\nQ2 | 4 k | 2 k\nQ3 | 5 k | —')
    const pie = ok('card\n  chart shape=pie labels=["Rent","Food"] values=[3, 1]')
    expect(pie.fallback).toContain('Rent: 3 (75%) · Food: 1 (25%)')
    const single = ok(`card\n  chart ${QUARTERS} values=[1, 2, 3]`)
    expect(single.fallback).toContain('Q1: 1 · Q2: 2 · Q3: 3')
  })
})
