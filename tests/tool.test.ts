import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { EXAMPLE, REPAIR_HINT, UI_TOOL_DESCRIPTION } from '../src/host/model-brief.ts'
import { buildPresentationMeta, createUIRenderTool, PLACEMENT_NOTE, renderForModel, UI_TOOL_NAME } from '../src/host/tool.ts'
import { checkWidget } from '../src/host/check.ts'
import { API_VERSION } from '../src/widget/identity.ts'
import { LIBRARIES } from '../src/widget/libs.ts'
import { CODE_HOSTS, LIMITS } from '../src/widget/policy.ts'

/** The tool definition under test. */
const tool = createUIRenderTool()

/** Drive the definition's execute the way the registry does. */
async function run(args: Record<string, unknown>, exec: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return await tool.execute(args, exec as never) as Record<string, unknown>
}

/** The styles a frame starts with. */
const BASE_CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'frame', 'base.css'), 'utf8')

describe('the harness and the provider accept this definition', () => {
  it('sends the provider JSON Schema with one required argument', () => {
    // `parameters` travels to the model verbatim; the authoring dialect reaching
    // the wire once made a provider refuse the whole tool.
    const schema = tool.parameters as Record<string, unknown>
    expect(schema.type).toBe('object')
    expect(schema.required).toEqual(['source'])
    const properties = schema.properties as Record<string, JsonSchemaNode>
    expect(Object.keys(properties).sort()).toEqual(['revises', 'source', 'title'])
    for (const [name, node] of Object.entries(properties)) {
      expect(node.type, name).toBe('string')
      expect(node).not.toHaveProperty('required')
    }
  })

  it('passes the registry\'s own output-schema validation', () => {
    expect(() => assertSupportedJsonSchema(tool.output.schema)).not.toThrow()
  })

  it('accepts both result shapes and rejects a malformed one', async () => {
    const success = await run({ source: EXAMPLE }, { callId: 'call-1' })
    const failure = await run({ source: '' })
    expect(success.ok).toBe(true)
    expect(failure.ok).toBe(false)
    expect(validateJsonSchemaValue(tool.output.schema, success, 'value')).toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, failure, 'value')).toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, { ok: 'yes' }, 'value')).not.toEqual([])
    expect(validateJsonSchemaValue(tool.output.schema, { ok: true, extra: 1 }, 'value')).not.toEqual([])
  })

  it('rejects arguments without a source before checking anything', async () => {
    // The shape a course-review session once sent: another name as the key.
    await expect(tool.execute({ html: '<p>hi</p>' }, {} as never)).rejects.toThrow(/source/u)
  })

  it('is named as the slot key the browser registers', () => {
    expect(tool.name).toBe(UI_TOOL_NAME)
    expect(UI_TOOL_NAME).toBe('ui_render')
  })
})

describe('what the model is told', () => {
  it('stays short, because it is sent with every request', () => {
    expect(UI_TOOL_DESCRIPTION.length).toBeLessThan(4000)
    expect(UI_TOOL_DESCRIPTION).not.toMatch(/\bmode\b/u)
  })

  it('names only theme variables and classes the frame really has', () => {
    const variables = new Set([...UI_TOOL_DESCRIPTION.matchAll(/--[a-z][a-z0-9-]*/gu)].map(match => match[0]))
    expect(variables.size).toBeGreaterThan(12)
    for (const name of variables) expect(BASE_CSS, name).toContain(`${name}:`)
    for (const name of ['card', 'metric', 'label', 'value', 'badge', 'note', 'row', 'stack', 'grid', 'muted', 'accent', 'success', 'warning', 'danger']) {
      expect(UI_TOOL_DESCRIPTION, name).toMatch(new RegExp(`\\b${name}\\b`, 'u'))
      expect(BASE_CSS, name).toMatch(new RegExp(`\\.${name}\\b`, 'u'))
    }
    const ramps = [...UI_TOOL_DESCRIPTION.matchAll(/\bc-[a-z]+\b/gu)].map(match => match[0])
    expect(ramps).toHaveLength(9)
    for (const ramp of ramps) expect(BASE_CSS, ramp).toContain(`.${ramp} {`)
    for (const name of ['t', 'ts', 'th']) expect(BASE_CSS, name).toMatch(new RegExp(`svg[^{]*\\.${name}\\b`, 'u'))
  })

  it('names every helper, the code hosts, and every shipped library', () => {
    for (const helper of ['sendPrompt(', 'data-prompt', 'data-send', 'openLink(', 'dsh.state.get()', 'dsh.state.set(', 'dsh.math']) {
      expect(UI_TOOL_DESCRIPTION, helper).toContain(helper)
    }
    for (const routine of ['integrate', 'derivative', 'limit', 'root']) expect(UI_TOOL_DESCRIPTION, routine).toContain(routine)
    for (const host of CODE_HOSTS) expect(UI_TOOL_DESCRIPTION, host).toContain(host)
    for (const library of LIBRARIES) expect(UI_TOOL_DESCRIPTION, library.id).toContain(library.title)
    expect(UI_TOOL_DESCRIPTION).toContain(LIBRARIES[0]?.example)
    expect(UI_TOOL_DESCRIPTION).toContain('revises')
  })

  it('ships an example that passes its own check without a single problem', () => {
    expect(UI_TOOL_DESCRIPTION).toContain(EXAMPLE)
    expect(checkWidget(EXAMPLE).problems).toEqual([])
  })
})

describe('a call that is shown', () => {
  it('reports what the widget holds and never repeats its source to the model', async () => {
    const value = await run({ source: EXAMPLE, title: 'Seats' }, { callId: 'call-7' })
    expect(value).toMatchObject({
      ok: true,
      lines: EXAMPLE.split('\n').length,
      scripts: 1,
      shipped: [],
      fetched: [],
      controls: ['seats (range)'],
      prompts: ['Compare this with the annual plan'],
      notes: [],
      card: 'call-7',
      source: EXAMPLE,
    })
    expect(value.text).toContain('Per month')
    const told = renderForModel(value)
    expect(told.split('\n')[0]).toBe(`The widget is shown: ${EXAMPLE.split('\n').length} line(s), 1 script(s).`)
    expect(told.split('\n')[1]).toBe(PLACEMENT_NOTE)
    expect(told).toContain('Card id: call-7')
    expect(told).toContain('revises=call-7')
    expect(told).toContain('Controls kept across reloads: seats (range).')
    expect(told).toContain('Buttons send: "Compare this with the annual plan".')
    expect(told).not.toContain('getElementById')
    expect(told).not.toContain('<style>')
    expect(told.length).toBeLessThan(1200)
  })

  it('cleans the wrapper a model adds around a fragment', async () => {
    const value = await run({ source: '```html\n<!doctype html>\n<html><head><title>x</title></head><body>\r\n<p>Hello</p>\r\n</body></html>\n```' })
    expect(value.ok).toBe(true)
    expect(value.source).toBe('<p>Hello</p>')
    expect(value.text).toBe('Hello')
  })

  it('tells the model what may not work, without refusing the widget', async () => {
    const value = await run({
      source: '<img src="https://example.com/cat.png">\n<script>localStorage.setItem("a", "1")</script>',
    })
    expect(value.ok).toBe(true)
    const notes = value.notes as string[]
    expect(notes).toHaveLength(2)
    expect(notes[0]).toMatch(/^- line 1: https:\/\/example\.com\/cat\.png will be blocked/u)
    expect(notes[1]).toMatch(/^- line 2: Browser storage is blocked in the frame\. Keep values with dsh\.state/u)
    expect(renderForModel(value)).toContain('Check these; they may not work in the frame:\n- line 1:')
  })

  it('reads back only the text shown before scripts run, cut short', async () => {
    const value = await run({ source: `<p>${'word '.repeat(400)}</p><script>document.body.append("later")</script>` })
    expect((value.text as string).length).toBeLessThanOrEqual(601)
    expect(value.text).not.toContain('later')
  })

  it('names the card it replaces, and ignores a revises that is not another card', async () => {
    const revised = await run({ source: '<p>two</p>', revises: ' call-1 ' }, { callId: 'call-2' })
    expect(revised.revises).toBe('call-1')
    expect(renderForModel(revised)).toContain('It replaces card call-1, which now folds away')
    for (const revises of ['call-2', 'not an id!', '']) {
      const value = await run({ source: '<p>two</p>', revises }, { callId: 'call-2' })
      expect(value.ok, revises).toBe(true)
      expect(value, revises).not.toHaveProperty('revises')
      expect((value.notes as string[]).some(note => note.includes('revises was ignored')), revises).toBe(revises !== '')
    }
  })

  it('reports no card id when the host gives the call none', async () => {
    const value = await run({ source: '<p>one</p>' })
    expect(value).not.toHaveProperty('card')
    expect(renderForModel(value)).not.toContain('Card id')
  })
})

describe('a call that is not shown', () => {
  it('returns each error with its line and a repair, and the hint to call again', async () => {
    const value = await run({ source: '<p>Total</p>\n<script>\nconst total = 1 +\n</script>' })
    expect(value.ok).toBe(false)
    expect(value.hint).toBe(REPAIR_HINT)
    const problems = value.problems as Array<{ line?: number; message: string; repair: string }>
    expect(problems).toHaveLength(1)
    expect(problems[0]?.line).toBe(4)
    expect(problems[0]?.message).toMatch(/SyntaxError/u)
    expect(problems[0]?.repair).not.toBe('')
    const told = renderForModel(value)
    expect(told.split('\n')[0]).toBe('The widget was not shown: its code has errors.')
    expect(told).toContain('- line 4: ')
    expect(told.endsWith(REPAIR_HINT)).toBe(true)
  })

  it('refuses an empty source and one that is too long', async () => {
    expect((await run({ source: '  \n ' })).ok).toBe(false)
    const long = await run({ source: `<p>${'x'.repeat(LIMITS.maxSourceChars)}</p>` })
    expect(long.ok).toBe(false)
    expect(renderForModel(long)).toContain(`over the limit of ${LIMITS.maxSourceChars}`)
  })

  it('leaves warnings out of a failure, so the model fixes what stops the widget first', async () => {
    const value = await run({ source: '<script>alert(1); const = 2</script>' })
    expect(value.ok).toBe(false)
    expect((value.problems as unknown[]).length).toBe(1)
  })
})

describe('what is persisted for the browser', () => {
  it('keeps the cleaned source, the title, and the card it replaces', async () => {
    const args = { source: `﻿${EXAMPLE}\n\n`, title: '  Seats  ', revises: 'call-1' }
    const value = await run(args, { callId: 'call-2' })
    expect(buildPresentationMeta(args, value)).toEqual({ version: API_VERSION, title: 'Seats', ok: true, revises: 'call-1', source: EXAMPLE })
  })

  it('keeps a failure\'s problems, so the reader sees why nothing is shown', async () => {
    const args = { source: '<script>let = </script>' }
    const meta = buildPresentationMeta(args, await run(args)) as { version: number; ok: boolean; problems: Array<Record<string, unknown>> }
    expect(meta.version).toBe(API_VERSION)
    expect(meta.ok).toBe(false)
    expect(meta.problems).toHaveLength(1)
    expect(Object.keys(meta.problems[0] as object).sort()).toEqual(['line', 'message', 'repair'])
    expect(meta).not.toHaveProperty('source')
  })

  it('is plain JSON at version 2', async () => {
    const meta = buildPresentationMeta({}, await run({ source: EXAMPLE }))
    expect(API_VERSION).toBe(2)
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta)
  })

  it('goes through the definition\'s own render and meta hooks', async () => {
    const args = { source: EXAMPLE }
    const value = await run(args, { callId: 'call-3' })
    const rendered = tool.output.render?.(args as never, value as never, {} as never) as Array<{ type: string; text: string }>
    expect(rendered).toEqual([{ type: 'text', text: renderForModel(value) }])
    expect(tool.output.presentationMeta?.(args as never, value as never, {} as never)).toEqual(buildPresentationMeta(args, value))
  })
})
