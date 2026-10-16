import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { COMPARISON_EXAMPLE, ESTIMATE_EXAMPLE, QUIZ_EXAMPLE, UI_TOOL_DESCRIPTION } from '../src/host/model-brief.ts'
import { buildPresentationMeta, createUIRenderTool, renderForModel, UI_TOOL_NAME } from '../src/host/tool.ts'
import { CATALOG } from '../src/lang/catalog.ts'
import { compileSource } from '../src/lang/compile.ts'
import { LIMITS } from '../src/lang/limits.ts'

/** The tool definition under test. */
const tool = createUIRenderTool()

/** Drive the definition's execute the way the registry does. */
async function run(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return await tool.execute(args, {} as never) as Record<string, unknown>
}

describe('the harness and the provider accept this definition', () => {
  it('sends the provider JSON Schema with one required argument', () => {
    // `parameters` travels to the model verbatim; the authoring dialect reaching
    // the wire once made a provider refuse the whole tool.
    const schema = tool.parameters as Record<string, unknown>
    expect(schema.type).toBe('object')
    expect(schema.required).toEqual(['source'])
    const properties = schema.properties as Record<string, JsonSchemaNode>
    expect(Object.keys(properties).sort()).toEqual(['source', 'title'])
    for (const [name, node] of Object.entries(properties)) {
      expect(node.type, name).toBe('string')
      expect(node).not.toHaveProperty('required')
    }
  })

  it('passes the registry\'s own output-schema validation', () => {
    expect(() => assertSupportedJsonSchema(tool.output.schema)).not.toThrow()
  })

  it('accepts both result shapes and rejects a malformed one', async () => {
    const success = await run({ source: ESTIMATE_EXAMPLE })
    const failure = await run({ source: '' })
    expect(validateJsonSchemaValue(tool.output.schema, success, 'value')).toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, failure, 'value')).toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, { ok: 'yes' }, 'value')).not.toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, { ok: true, extra: 1 }, 'value')).not.toEqual([])
  })

  it('rejects arguments without a source before compiling anything', async () => {
    // The shape a course-review session once sent: the grammar name as the key.
    await expect(tool.execute({ dil: 'card' }, {} as never)).rejects.toThrow(/source/u)
  })

  it('is named as the slot key the browser registers', () => {
    expect(tool.name).toBe(UI_TOOL_NAME)
    expect(UI_TOOL_NAME).toBe('ui_render')
  })
})

describe('what the model is told', () => {
  it('names every component and the limits', () => {
    for (const descriptor of CATALOG) expect(UI_TOOL_DESCRIPTION).toContain(`  ${descriptor.type}`)
    expect(UI_TOOL_DESCRIPTION).toContain(`${LIMITS.maxNodes} components`)
  })

  it('teaches the grammar it actually accepts', () => {
    expect(UI_TOOL_DESCRIPTION).toContain('Indent a component two spaces')
    expect(UI_TOOL_DESCRIPTION).toContain('Comments start with //')
    expect(UI_TOOL_DESCRIPTION).toContain('{expression}')
    expect(UI_TOOL_DESCRIPTION).toContain('A button sends its `prompt` as the reader\'s next message')
    expect(UI_TOOL_DESCRIPTION).not.toMatch(/\bmode\b/u)
  })

  it('ships examples that compile without a single diagnostic', () => {
    for (const example of [ESTIMATE_EXAMPLE, COMPARISON_EXAMPLE, QUIZ_EXAMPLE]) {
      const result = compileSource(example)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.program.diagnostics).toEqual([])
      expect(UI_TOOL_DESCRIPTION).toContain(example.split('\n')[0] as string)
    }
  })

  it('stays well under the old four-thousand-token description', () => {
    expect(UI_TOOL_DESCRIPTION.length).toBeLessThan(9000)
  })
})

describe('compiling a call', () => {
  it('reports counts and the text-only view on success', async () => {
    const value = await run({ source: ESTIMATE_EXAMPLE, title: 'Team plan' })
    expect(value).toEqual(expect.objectContaining({ ok: true, components: 5, controls: 2, truncated: false, notes: [] }))
    const text = renderForModel(value)
    expect(text).toContain('The card is shown: 5 component(s), 2 control(s).')
    expect(text).toContain('Monthly cost: 232 USD')
    expect(text).not.toContain('"program"')
  })

  it('tells the model what it repaired, so the next call is cleaner', async () => {
    const value = await run({ source: 'card padding=99\n  text "x"' })
    const text = renderForModel(value)
    expect(text).toContain('Repaired or ignored (fix these next time):')
    expect(text).toContain('line 1: <card> padding')
  })

  it('returns the diagnostics and the repair hint on failure', async () => {
    const value = await run({ source: 'hologram' })
    expect(value.ok).toBe(false)
    const text = renderForModel(value)
    expect(text).toContain('The card was not shown: the program did not compile.')
    expect(text).toContain('"hologram" is not a component')
    expect(text).toContain('call ui_render again')
  })

  it('caps the diagnostics returned', async () => {
    const source = Array.from({ length: 40 }, (_, index) => `ghost${index}`).join('\n')
    const value = await run({ source })
    expect((value.diagnostics as unknown[]).length).toBe(LIMITS.maxDiagnosticsReported)
  })
})

describe('what is persisted for the card', () => {
  it('carries the program, the format version, and a trimmed title', async () => {
    const value = await run({ source: ESTIMATE_EXAMPLE })
    const meta = buildPresentationMeta({ title: `  ${'t'.repeat(200)}  ` }, value) as Record<string, unknown>
    expect(meta.v).toBe(2)
    expect(meta.ok).toBe(true)
    expect((meta.title as string).length).toBe(120)
    expect((meta.program as Record<string, unknown>).v).toBe(2)
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta)
  })

  it('carries a short failure the card can show', async () => {
    const value = await run({ source: Array.from({ length: 9 }, () => 'ghost').join('\n') })
    const meta = buildPresentationMeta({}, value) as { ok: boolean; diagnostics: unknown[] }
    expect(meta.ok).toBe(false)
    expect(meta.diagnostics).toHaveLength(5)
    expect(meta.diagnostics[0]).toEqual(expect.objectContaining({ message: expect.any(String), repair: expect.any(String), line: 1 }))
  })

  it('goes through the definition\'s own presentationMeta', async () => {
    const value = await run({ source: COMPARISON_EXAMPLE })
    expect(tool.output.presentationMeta?.({ source: COMPARISON_EXAMPLE }, value as never)).toEqual(buildPresentationMeta({}, value))
  })
})
