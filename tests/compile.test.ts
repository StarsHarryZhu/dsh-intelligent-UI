import { describe, expect, it } from 'vitest'
import { CATALOG_VERSION, catalogHash } from '../src/lang/catalog.ts'
import { compileSource, initialValues, isDataImage } from '../src/lang/compile.ts'
import { renderText } from '../src/lang/text.ts'
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

  it('stamps the format version and the catalog generation', () => {
    expect(program.v).toBe(2)
    expect(program.catalogVersion).toBe(CATALOG_VERSION)
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

  it('compiles the explicit legacy form a model may still write', () => {
    const legacy = ok([
      '@state seats = 8 number min=1 max=50 step=1',
      '@calc price = seats * 29',
      '#root card padding=3 gap=2',
      '#heading title text="Team plan estimate" size=lg in=#root',
      '#seats slider label=Seats bind=seats min=1 max=50 step=1 in=#root',
      '#price metric label=Monthly value=price unit=USD in=#root',
    ].join('\n'))
    expect(legacy.nodes.map(node => node.id)).toEqual(['root', 'heading', 'seats', 'price'])
    expect(initialValues(legacy).get('price')).toBe(232)
  })

  it('accepts the older JSON array expressions and $text templates', () => {
    const legacy = ok(JSON.stringify({
      states: [{ key: 'n', kind: 'number', init: 2 }],
      calcs: [{ key: 'double', expr: ['mul', ['ref', 'n'], 2] }],
      nodes: [
        { id: 'root', type: 'card', parent: null, props: {} },
        { id: 't', type: 'text', parent: 'root', props: { text: { $text: [{ text: 'Twice: ' }, { $expr: ['ref', 'double'] }] } } },
      ],
    }))
    expect(textOf(legacy, first(legacy, 'text'), 'text')).toBe('Twice: 4')
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
    const program = ok('#c card\ntext "x" in=#ghost')
    expect(first(program, 'text').parent).toBe('c')
  })

  it('cuts a parent loop instead of hanging', () => {
    const program = ok(JSON.stringify({ nodes: [{ id: 'a', type: 'col', parent: 'b' }, { id: 'b', type: 'col', parent: 'a' }, { id: 't', type: 'text', parent: 'a', text: 'x' }] }))
    expect(program.nodes.some(node => node.parent === null)).toBe(true)
    expect(program.diagnostics.some(entry => entry.message.includes('loops'))).toBe(true)
  })

  it('renames a duplicate id', () => {
    const program = ok('#a card\n#a text "x"')
    expect(program.nodes.map(node => node.id)).toEqual(['a', 'text2'])
    expect(program.diagnostics[0]?.code).toBe('duplicate_id')
  })

  it('ignores an unknown component and an unknown prop', () => {
    const program = ok('card\n  hologram "x"\n  text "y" glow=true')
    expect(program.nodes.map(node => node.type)).toEqual(['card', 'text'])
    expect(program.diagnostics.map(entry => entry.code)).toEqual(['unknown_component', 'unknown_prop'])
  })

  it('reads numeric text where a number is expected', () => {
    const program = ok(JSON.stringify({ states: [{ key: 's', kind: 'number', init: '8' }], nodes: [{ type: 'grid', columns: '3' }] }))
    expect(program.state[0]?.init).toBe(8)
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
      '#root card padding=3 gap=2',
      '#t title text="第 1 题 · 模型识别（单选）" in=#root',
      '#q text text="A quality inspector selects 15 items at random, without replacement, from a lot of 500 items." in=#root',
      '#opts col gap=1 in=#root',
      '#oa button text="A. Binomial" prompt="选 A" in=#opts',
      '#ob button text="B. Hypergeometric" prompt="选 B" in=#opts',
      '#hint text text="也可以直接在对话里回复字母。" in=#root',
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
