import { describe, expect, it } from 'vitest'
import { parseDil, type RawNode, type RawState } from '../src/lang/dil.ts'
import type { Diagnostic } from '../src/lang/types.ts'

/** Parse expecting an envelope. */
function parse(source: string, partial = false): { states: RawState[]; calcs: unknown[]; nodes: RawNode[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = []
  const envelope = parseDil(source, diagnostics, partial)
  if (envelope === undefined) throw new Error(`no envelope: ${JSON.stringify(diagnostics)}`)
  return { ...(envelope as { states: RawState[]; calcs: unknown[]; nodes: RawNode[] }), diagnostics }
}

/** Parent of each node, by type, for compact assertions. */
function parents(nodes: RawNode[]): Array<[string, unknown]> {
  return nodes.map(node => [`${String(node.type)}#${String(node.id)}`, node.parent])
}

describe('nesting by indentation', () => {
  it('puts each indented component inside the container above it', () => {
    const { nodes } = parse([
      'card "Plan"',
      '  title "Team plan"',
      '  row gap=2',
      '    metric "Monthly" value=1',
      '    metric "Yearly" value=12',
      '  text "after the row"',
    ].join('\n'))
    expect(parents(nodes)).toEqual([
      ['card#card1', null],
      ['title#title2', 'card1'],
      ['row#row3', 'card1'],
      ['metric#metric4', 'row3'],
      ['metric#metric5', 'row3'],
      ['text#text6', 'card1'],
    ])
  })

  it('treats a tab as two spaces', () => {
    const { nodes } = parse('card\n\ttext "a"')
    expect(nodes[1]?.parent).toBe('card1')
  })

  it('skips a non-container when looking for the parent of a deeper line', () => {
    const { nodes } = parse('card\n  title "x"\n    text "y"')
    expect(nodes[2]?.parent).toBe('card1')
  })

  it('keeps flat lines inside the last card in reading order', () => {
    const { nodes } = parse('card "A"\ntext "a"\ncard "B"\ntext "b"\nrow\n')
    expect(parents(nodes)).toEqual([
      ['card#card1', null],
      ['text#text2', 'card1'],
      ['card#card3', null],
      ['text#text4', 'card3'],
      ['row#row5', 'card3'],
    ])
  })

  it('still reads the explicit form, ids and in= included', () => {
    const { nodes } = parse([
      '#root card padding=3',
      '#h title text="Team plan" in=#root',
      '#m metric label=Monthly value=price in=#root',
    ].join('\n'))
    expect(parents(nodes)).toEqual([['card#root', null], ['title#h', 'root'], ['metric#m', 'root']])
    expect(nodes[1]?.props).toEqual({ text: 'Team plan' })
  })

  it('lets in= override indentation', () => {
    const { nodes } = parse('#a card\n#b card\n  text "x" in=#a')
    expect(nodes[2]?.parent).toBe('a')
  })
})

describe('component lines', () => {
  it('fills the primary prop from a bare quoted string', () => {
    const { nodes } = parse('card "Plan"\n  slider "Seats" bind=seats\n  button "Pick A" prompt="A"')
    expect(nodes[0]?.props).toEqual({ title: 'Plan' })
    expect(nodes[1]?.props).toEqual({ label: 'Seats', bind: 'seats' })
    expect(nodes[2]?.props).toEqual({ text: 'Pick A', prompt: 'A' })
  })

  it('reports a stray value instead of attaching it to a prop', () => {
    const { nodes, diagnostics } = parse('card\n  metric label=Monthly cost value=1')
    expect(nodes[1]?.props).toEqual({ label: 'Monthly', value: 1 })
    expect(diagnostics[0]?.code).toBe('unknown_prop')
    expect(diagnostics[0]?.line).toBe(2)
  })

  it('reads numbers, booleans, JSON values, and quoted text with spaces and equals signs', () => {
    const { nodes } = parse('card\n  table columns=["A", "B"] rows=[["x", "1"]] caption="Total = 3"\n  text "a" size=sm\n  checkbox "On" bind=on\n  grid columns=3')
    expect(nodes[1]?.props).toEqual({ columns: ['A', 'B'], rows: [['x', '1']], caption: 'Total = 3' })
    expect(nodes[4]?.props).toEqual({ columns: 3 })
  })

  it('takes the rest of the line when a quote is never closed', () => {
    const { nodes } = parse('card\n  text "He said hello')
    expect(nodes[1]?.props).toEqual({ text: 'He said hello' })
  })

  it('reads escaped quotes inside quoted text', () => {
    const { nodes } = parse('card\n  text "say \\"hi\\""')
    expect(nodes[1]?.props).toEqual({ text: 'say "hi"' })
  })

  it('turns a bare declared key in a text prop into its value', () => {
    const { nodes } = parse('@state seats = 8\ncard\n  text text=seats\n  metric "Seats" value=seats unit=USD')
    expect(nodes[1]?.props).toEqual({ text: '{seats}' })
    expect(nodes[2]?.props).toEqual({ label: 'Seats', value: 'seats', unit: 'USD' })
  })

  it('keeps a prop named like an object property as an ordinary unknown prop', () => {
    const { nodes } = parse('card __proto__=1')
    expect(Object.getPrototypeOf(nodes[0]?.props)).toBeNull()
    expect((nodes[0]?.props as Record<string, unknown>).__proto__).toBe(1)
  })

  it('accepts the angle-bracket form some models write', () => {
    const { nodes } = parse('<card>\n  <text text="x"/>')
    expect(nodes.map(node => node.type)).toEqual(['card', 'text'])
  })
})

describe('declarations', () => {
  it('infers the state kind from the initial value', () => {
    const { states } = parse('@state seats = 8 min=1 max=50 step=1\n@state name = "Ada"\n@state on = true\n@state plan = Pro options=Basic|Pro|Team')
    expect(states).toEqual([
      { key: 'seats', init: 8, min: 1, max: 50, step: 1 },
      { key: 'name', init: 'Ada' },
      { key: 'on', init: true },
      { key: 'plan', init: 'Pro', options: ['Basic', 'Pro', 'Team'] },
    ])
  })

  it('still accepts the explicit kind word and comma or JSON option lists', () => {
    const { states } = parse('@state seats = 8 number\n@state tier = "pro" select options=free,pro\n@state size = "M" options=["S","M"]')
    expect(states[0]).toEqual({ key: 'seats', init: 8, kind: 'number' })
    expect(states[1]).toEqual({ key: 'tier', init: 'pro', kind: 'select', options: ['free', 'pro'] })
    expect(states[2]?.options).toEqual(['S', 'M'])
  })

  it('keeps a calc as readable text for the compiler', () => {
    expect(parse('@calc price = seats * 29').calcs).toEqual([{ key: 'price', expr: 'seats * 29' }])
  })

  it('reports an unreadable declaration with its line', () => {
    const { diagnostics } = parse('@state = 3\n@calc 9x = 1\ncard')
    expect(diagnostics.filter(entry => entry.line !== undefined).map(entry => entry.line)).toEqual([1, 2])
    expect(diagnostics.at(-1)?.message).toBe('2 line(s) could not be read')
  })
})

describe('what is not a statement', () => {
  it('skips comments, blank lines, and code fences', () => {
    const { nodes, diagnostics } = parse('```dil\n// a comment\n# a heading-style comment\n\ncard\n```')
    expect(nodes).toHaveLength(1)
    expect(diagnostics).toEqual([])
  })

  it('returns nothing for a source with no statements', () => {
    expect(parseDil('// only a comment', [])).toBeUndefined()
  })
})

describe('streaming', () => {
  it('skips the trailing line while it may still be incomplete', () => {
    const { nodes } = parse('card "Plan"\n  text "complete"\n  text "half writ', true)
    expect(nodes).toHaveLength(2)
  })

  it('keeps the last line once the newline arrives', () => {
    expect(parse('card\n  text "done"\n', true).nodes).toHaveLength(2)
  })

  it('reports nothing while streaming', () => {
    expect(parse('card\n@state = \n  text "x"\n', true).diagnostics.filter(entry => entry.line === undefined)).toEqual([])
  })
})
