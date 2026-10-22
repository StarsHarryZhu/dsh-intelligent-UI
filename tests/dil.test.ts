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

  it('refuses a line that starts with an id, and says how to write it', () => {
    const { nodes, diagnostics } = parse('card\n#m metric label=Monthly value=1')
    expect(nodes.map(node => node.type)).toEqual(['card'])
    expect(diagnostics[0]).toEqual(expect.objectContaining({ code: 'unterminated_line', line: 2 }))
    expect(diagnostics[0]?.repair).toMatch(/without an id/u)
  })

  it('ignores in= and places the line by its indentation', () => {
    const { nodes, diagnostics } = parse('card "A"\ncard "B"\n  text "x" in=#card1')
    expect(nodes[2]?.parent).toBe('card2')
    expect(nodes[2]?.props).toEqual({ text: 'x' })
    expect(diagnostics[0]).toEqual(expect.objectContaining({ code: 'unknown_prop', line: 3 }))
    expect(diagnostics[0]?.repair).toMatch(/indenting/u)
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

  it('keeps a bare expression whole through its brackets and spaced operators', () => {
    const { nodes } = parse('card\n  metric "Area" value=integral(x^2, x, 0, a) unit=m2\n  metric "Hours" value=mins / 60 unit=h')
    expect(nodes[1]?.props).toEqual({ label: 'Area', value: 'integral(x^2, x, 0, a)', unit: 'm2' })
    expect(nodes[2]?.props).toEqual({ label: 'Hours', value: 'mins / 60', unit: 'h' })
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

  it('refuses the angle-bracket form, and says how to write it', () => {
    const diagnostics: Diagnostic[] = []
    expect(parseDil('<card>\n  <text text="x"/>', diagnostics)).toBeUndefined()
    expect(diagnostics[0]?.repair).toMatch(/angle brackets/u)
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

  it('reads comma and JSON option lists', () => {
    const { states } = parse('@state tier = "pro" options=free,pro\n@state size = "M" options=["S","M"]')
    expect(states[0]).toEqual({ key: 'tier', init: 'pro', options: ['free', 'pro'] })
    expect(states[1]?.options).toEqual(['S', 'M'])
  })

  it('reports a kind word after the value instead of reading it', () => {
    const { states, diagnostics } = parse('@state seats = 8 number')
    expect(states[0]).toEqual({ key: 'seats', init: 8 })
    expect(diagnostics[0]).toEqual(expect.objectContaining({ code: 'unknown_prop', line: 1 }))
    expect(diagnostics[0]?.repair).toMatch(/kind follows from the value/u)
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

describe('text blocks', () => {
  const Q = '"""'

  it('takes the lines up to a closing """ as the primary text, without their shared indentation', () => {
    const { nodes, diagnostics } = parse([
      'card "Demo"',
      `  code lang=python ${Q}`,
      '    def f(x):',
      '        if x {}}:',
      '            return 1',
      '',
      '    # done',
      `  ${Q}`,
      '  text "after"',
    ].join('\n'))
    expect(diagnostics).toEqual([])
    expect(nodes.map(node => node.type)).toEqual(['card', 'code', 'text'])
    expect(nodes[1]?.props).toEqual({ lang: 'python', text: 'def f(x):\n    if x {}}:\n        return 1\n\n# done' })
    // The block's lines are never statements, and the line after it nests as usual.
    expect(nodes[2]?.parent).toBe('card1')
    expect(nodes[2]?.line).toBe(9)
  })

  it('fills the prop the opener names, and reads a block written on one line', () => {
    const { nodes } = parse([
      'card',
      `  code caption="a.txt" text=${Q}`,
      '    first',
      `  ${Q}`,
      `  code ${Q}x = 1${Q}`,
    ].join('\n'))
    expect(nodes[1]?.props).toEqual({ caption: 'a.txt', text: 'first' })
    expect(nodes[2]?.props).toEqual({ text: 'x = 1' })
  })

  it('keeps lines that look like statements, comments, or fences as text', () => {
    const { nodes } = parse(['card', `  code ${Q}`, '  // not a comment', '  @state x = 1', '  ```', `  ${Q}`].join('\n'))
    expect(nodes).toHaveLength(2)
    expect(nodes[1]?.props).toEqual({ text: '// not a comment\n@state x = 1\n```' })
  })

  it('runs an unclosed block to the end and reports it once the source is complete', () => {
    const complete = parse(['card', `  code ${Q}`, '    a', '    b'].join('\n'))
    expect(complete.nodes[1]?.props).toEqual({ text: 'a\nb' })
    expect(complete.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.line])).toEqual([['unterminated_line', 2]])
    expect(complete.diagnostics[0]?.repair).toContain(Q)
  })

  it('shows the lines that have arrived while streaming, and reports nothing', () => {
    const streaming = parse(['card', `  code ${Q}`, '    a', '    b'].join('\n'), true)
    expect(streaming.nodes[1]?.props).toEqual({ text: 'a' })
    expect(streaming.diagnostics).toEqual([])
  })

  it('reports a block on a declaration, or a second value for the same prop', () => {
    const declared = parse([`@state note = ${Q}`, '  hi', Q, 'card', '  text "x"'].join('\n'))
    expect(declared.diagnostics.some(diagnostic => /declaration/u.test(diagnostic.message))).toBe(true)
    expect(declared.nodes.map(node => node.type)).toEqual(['card', 'text'])
    const twice = parse(['card', `  code "inline" ${Q}`, '    block', `  ${Q}`].join('\n'))
    expect(twice.nodes[1]?.props).toEqual({ text: 'block' })
    expect(twice.diagnostics.some(diagnostic => /given twice/u.test(diagnostic.message))).toBe(true)
  })

  it('gives a block opened on a line of its own to the component above it, and says so', () => {
    const { nodes, diagnostics } = parse([
      'card',
      '  code lang=python numbers=true caption="fib.py"',
      `    ${Q}`,
      '    a, b = 0, 1',
      '    for _ in range(5):',
      '        a, b = b, a + b',
      `    ${Q}`,
      '  text "after"',
    ].join('\n'))
    expect(nodes.map(node => node.type)).toEqual(['card', 'code', 'text'])
    expect(nodes[1]?.props).toEqual({ lang: 'python', numbers: true, caption: 'fib.py', text: 'a, b = 0, 1\nfor _ in range(5):\n    a, b = b, a + b' })
    expect(nodes[2]?.parent).toBe('card1')
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.message).toContain('given to <code> on line 2')
    const orphan = parse([Q, 'x', Q, 'card'].join('\n'))
    expect(orphan.diagnostics[0]?.message).toContain('no component above it')
  })

  it('does not read quoted text that merely ends in quotes as an opener', () => {
    const { nodes, diagnostics } = parse(['card', '  text "say ""', '  text "next"'].join('\n'))
    expect(nodes.map(node => node.type)).toEqual(['card', 'text', 'text'])
    expect(diagnostics.filter(diagnostic => diagnostic.code === 'unterminated_line')).toEqual([])
  })
})
