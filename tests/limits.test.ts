import { describe, expect, it } from 'vitest'
import { compileSource } from '../src/lang/compile.ts'
import { LIMITS, MAX_SPACE } from '../src/lang/limits.ts'
import type { UIProgram } from '../src/lang/types.ts'

/** Compile expecting a program. */
function ok(source: string): UIProgram {
  const result = compileSource(source)
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  return result.program
}

/** A JSON program with one card holding the given children. */
function card(children: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...extra, nodes: [{ type: 'card', children }] })
}

describe('each bound at its limit and one past it', () => {
  it('source length', () => {
    const filler = `card\n  text "${'x'.repeat(LIMITS.maxSourceBytes - 20)}"`
    expect(filler.length).toBeLessThanOrEqual(LIMITS.maxSourceBytes)
    expect(compileSource(filler).ok).toBe(true)
    const over = compileSource('x'.repeat(LIMITS.maxSourceBytes + 1))
    expect(over.ok).toBe(false)
  })

  it('component count', () => {
    const atLimit = ok(card(Array.from({ length: LIMITS.maxNodes - 1 }, () => ({ type: 'divider' }))))
    expect(atLimit.nodes).toHaveLength(LIMITS.maxNodes)
    expect(atLimit.truncated).toBeUndefined()
    const over = ok(card(Array.from({ length: LIMITS.maxNodes }, () => ({ type: 'divider' }))))
    expect(over.nodes).toHaveLength(LIMITS.maxNodes)
    expect(over.truncated).toEqual({ droppedNodes: 1, droppedLines: 0 })
    expect(over.diagnostics.some(entry => entry.code === 'limit_exceeded')).toBe(true)
  })

  it('state and calc declarations', () => {
    const states = Array.from({ length: LIMITS.maxState }, (_, index) => ({ key: `s${index}`, init: index }))
    expect(ok(card([{ type: 'text', text: 'x' }], { states })).state).toHaveLength(LIMITS.maxState)
    const over = ok(card([{ type: 'text', text: 'x' }], { states: [...states, { key: 'extra', init: 1 }] }))
    expect(over.state).toHaveLength(LIMITS.maxState)
    expect(over.diagnostics.some(entry => entry.code === 'limit_exceeded')).toBe(true)
  })

  it('table rows', () => {
    const rows = (count: number): unknown[] => Array.from({ length: count }, (_, index) => [String(index)])
    expect(ok(card([{ type: 'table', columns: ['n'], rows: rows(LIMITS.maxTableRows) }])).nodes).toHaveLength(2)
    const over = ok(card([{ type: 'table', columns: ['n'], rows: rows(LIMITS.maxTableRows + 1) }, { type: 'text', text: 'x' }]))
    expect(over.nodes.map(node => node.type)).toEqual(['card', 'text'])
  })

  it('table columns', () => {
    const row = (count: number): unknown[] => [Array.from({ length: count }, () => 'c')]
    expect(ok(card([{ type: 'table', columns: ['a'], rows: row(LIMITS.maxTableColumns) }])).nodes).toHaveLength(2)
    expect(ok(card([{ type: 'table', columns: ['a'], rows: row(LIMITS.maxTableColumns + 1) }])).nodes).toHaveLength(1)
  })

  it('list entries', () => {
    const items = (count: number): string[] => Array.from({ length: count }, () => 'i')
    expect(ok(card([{ type: 'list', items: items(LIMITS.maxItems) }])).nodes).toHaveLength(2)
    expect(ok(card([{ type: 'list', items: items(LIMITS.maxItems + 1) }])).nodes).toHaveLength(1)
  })

  it('spacing steps', () => {
    expect(ok(card([], {}).replace('"card"', `"card","padding":${MAX_SPACE}`)).nodes[0]?.props.padding).toBe(MAX_SPACE)
    expect(ok(card([], {}).replace('"card"', `"card","padding":${MAX_SPACE + 1}`)).nodes[0]?.props).not.toHaveProperty('padding')
  })

  it('nesting depth is reported, not fatal', () => {
    let tree: Record<string, unknown> = { type: 'text', text: 'deep' }
    for (let index = 0; index < LIMITS.maxDepth + 1; index += 1) tree = { type: 'col', children: [tree] }
    const program = ok(JSON.stringify({ nodes: [tree] }))
    expect(program.diagnostics.some(entry => entry.code === 'limit_exceeded' && entry.message.includes('nesting depth'))).toBe(true)
  })

  it('JSON recovery stays bounded on a large malformed source', () => {
    const broken = `{"nodes": [${'{"type":"divider"},'.repeat(3000)}`
    const started = performance.now()
    expect(compileSource(broken).ok).toBe(false)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
