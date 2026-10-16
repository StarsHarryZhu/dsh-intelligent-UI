/**
 * The `ui_render` tool: the one place a model-authored interface enters DSH.
 *
 * The tool is a compiler, not a renderer. It validates the source against the
 * catalog and returns either a short summary to the model or the diagnostics it
 * must repair from. The compiled program travels separately, as presentation
 * metadata, because that is the channel the session log persists and the client
 * replays after a reload.
 *
 * Parameters are authored in the harness's own dialect and compiled by
 * `defineTool`. That is not a formality: `ToolDefinition.parameters` must already
 * be JSON Schema because the provider request carries it verbatim, and a dialect
 * spec reaching the wire is rejected by the provider as an invalid function
 * schema. `defineTool` also validates the model's arguments before `execute`.
 * @module dsh-intelligent-ui/host/tool
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { catalogHash, CATALOG_VERSION } from '../lang/catalog.ts'
import { compileSource } from '../lang/compile.ts'
import { UI_META_VERSION, UI_TOOL_NAME } from '../lang/identity.ts'
import { LIMITS } from '../lang/limits.ts'
import type { Diagnostic, JsonValue, UIProgram } from '../lang/types.ts'
import { REPAIR_HINT, UI_TOOL_DESCRIPTION } from './model-brief.ts'

/** What the model receives when the program is usable. */
export interface UIRenderSuccess {
  ok: true
  /** Components actually rendered. */
  components: number
  /** Interactive controls the reader can change. */
  controls: number
  /** Whether a bound was hit, so the model knows the answer was cut short. */
  truncated: boolean
  /** The readable stand-in, so the model can see what a text-only reader would see. */
  summary: string
  /** Problems that were repaired or ignored, written as instructions. */
  notes: string[]
  /**
   * The compiled program, as lossless JSON. Present in the result value so
   * `output.presentationMeta` can persist it; it never reaches the model, because
   * `output.render` projects only the summary.
   */
  program: Record<string, JsonValue>
}

/** What the model receives when the program cannot be rendered. */
export interface UIRenderFailure {
  ok: false
  diagnostics: Diagnostic[]
  hint: string
}

/** The result value. */
export type UIRenderValue = UIRenderSuccess | UIRenderFailure

/** Notes and failed diagnostics persisted for the card, so the reader sees why. */
const MAX_META_DIAGNOSTICS = 5

/**
 * Build the tool definition.
 * @returns the `ui_render` tool definition.
 */
export function createUIRenderTool(): ToolDefinition {
  return defineTool({
    name: UI_TOOL_NAME,
    description: UI_TOOL_DESCRIPTION,
    parameters: {
      source: {
        type: 'string',
        required: true,
        description: 'The interface program in DIL: one statement per line, components nested by two-space indentation.',
      },
      title: {
        type: 'string',
        description: 'Short label for the card, shown in its header.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          components: { type: 'number' },
          controls: { type: 'number' },
          truncated: { type: 'boolean' },
          summary: { type: 'string' },
          notes: { type: 'array', items: { type: 'string' } },
          diagnostics: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                code: { type: 'string', required: true },
                line: { type: 'number' },
                path: { type: 'string' },
                message: { type: 'string', required: true },
                repair: { type: 'string', required: true },
              },
            },
          },
          hint: { type: 'string' },
          /**
           * The compiled program. Declared because the registry validates this
           * value and rejects undeclared keys; it is still never spoken to the
           * model, because `render` projects only the summary.
           */
          program: { type: 'object', additionalProperties: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderForModel(value) }],
      presentationMeta: (args, value) => buildPresentationMeta(args, value),
    },
    async execute(args) {
      const result = compileSource(args.source)
      if (!result.ok) {
        return {
          ok: false,
          diagnostics: result.diagnostics.slice(0, LIMITS.maxDiagnosticsReported),
          hint: REPAIR_HINT,
        }
      }
      const { program } = result
      return {
        ok: true,
        components: program.nodes.length,
        controls: program.nodes.filter(node => node.bind !== undefined || node.type === 'button').length,
        truncated: program.truncated !== undefined,
        summary: program.fallback,
        notes: program.diagnostics.slice(0, LIMITS.maxDiagnosticsReported).map(formatDiagnostic),
        program: programAsJson(program),
      }
    },
  })
}

/**
 * View a compiled program as lossless JSON.
 *
 * `UIProgram` is JSON by construction — every member is a scalar, an array, or a
 * plain object — but TypeScript cannot see that without an index signature, and
 * adding one to the program type would weaken it everywhere else.
 */
function programAsJson(program: UIProgram): Record<string, JsonValue> {
  return program as unknown as Record<string, JsonValue>
}

/** Render the tool result for the model: the summary, or the repair list when it failed. */
export function renderForModel(value: unknown): string {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Partial<UIRenderSuccess> & Partial<UIRenderFailure>
  if (record.ok !== true) {
    const lines = (record.diagnostics ?? []).map(formatDiagnostic)
    return ['The card was not shown: the program did not compile.', ...lines, record.hint ?? REPAIR_HINT].join('\n')
  }
  const notes = record.notes ?? []
  return [
    `The card is shown: ${String(record.components ?? 0)} component(s), ${String(record.controls ?? 0)} control(s).`,
    record.truncated === true ? 'A size limit was reached, so part of the source was left out.' : '',
    notes.length > 0 ? `Repaired or ignored (fix these next time):\n${notes.join('\n')}` : '',
    `What a text-only reader sees:\n${record.summary ?? ''}`,
  ].filter(line => line !== '').join('\n')
}

/** One diagnostic line, written as an instruction the model can act on. */
function formatDiagnostic(diagnostic: Diagnostic): string {
  const where = diagnostic.line === undefined ? diagnostic.path ?? '' : `line ${diagnostic.line}`
  return `- ${where === '' ? '' : `${where}: `}${diagnostic.message}. ${diagnostic.repair}`
}

/**
 * Build the client-facing metadata.
 *
 * This is the only channel that survives a reload: the harness attaches the
 * returned JSON to `tool/result.meta`, which the session log persists and the
 * client replays into the card. The program — not the model's source — is what
 * the client renders.
 * @param args - the model's validated arguments.
 * @param value - the tool's result value.
 * @returns the persisted presentation metadata.
 */
export function buildPresentationMeta(args: { title?: string | undefined }, value: unknown): JsonValue {
  const candidate = (typeof value === 'object' && value !== null ? value : {}) as Partial<UIRenderSuccess> & Partial<UIRenderFailure>
  const meta: Record<string, JsonValue> = { version: UI_META_VERSION }
  if (typeof args.title === 'string' && args.title.trim() !== '') meta.title = args.title.trim().slice(0, 120)
  if (candidate.ok === true && candidate.program !== undefined) {
    meta.ok = true
    meta.program = candidate.program
    return meta
  }
  meta.ok = false
  meta.diagnostics = (candidate.diagnostics ?? []).slice(0, MAX_META_DIAGNOSTICS).map((diagnostic) => {
    const entry: Record<string, JsonValue> = { message: diagnostic.message, repair: diagnostic.repair }
    if (diagnostic.line !== undefined) entry.line = diagnostic.line
    return entry
  })
  return meta
}

/** Re-exported so the host entry and tests share one catalog generation. */
export { catalogHash, CATALOG_VERSION, UI_TOOL_NAME }
