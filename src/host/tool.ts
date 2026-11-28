/**
 * The `ui_render` tool: the one place a model-authored widget enters DSH.
 *
 * The model writes a widget as HTML, SVG, CSS, and JavaScript. The tool never
 * runs it: it cleans the source, compiles each script for its syntax only, and
 * returns either what the reader will see or the problems the model must fix.
 * The source travels separately, as presentation metadata, because that is the
 * channel the session log persists and the browser replays after a reload; the
 * browser runs it in a sandboxed frame.
 *
 * Parameters are authored in the harness's own dialect and compiled by
 * `defineTool`. That is not a formality: `ToolDefinition.parameters` must already
 * be JSON Schema because the provider request carries it verbatim, and a dialect
 * spec reaching the wire is rejected by the provider as an invalid function
 * schema. `defineTool` also validates the model's arguments before `execute`.
 * @module dsh-intelligent-ui/host/tool
 */

import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { API_VERSION, CARD_ID_PATTERN, UI_TOOL_NAME } from '../widget/identity.ts'
import { LIMITS } from '../widget/policy.ts'
import { controlIds, promptTexts, scriptBlocks, visibleText } from '../widget/scan.ts'
import { checkWidget, type Problem } from './check.ts'
import { REPAIR_HINT, UI_TOOL_DESCRIPTION } from './model-brief.ts'

/** A value the session log can hold. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** One problem as the result carries it. */
export interface ReportedProblem {
  line?: number
  message: string
  repair: string
}

/** What the model receives when the widget is shown. */
export interface UIRenderSuccess {
  ok: true
  /** Lines of the cleaned source. */
  lines: number
  /** Script elements in it. */
  scripts: number
  /** Shipped libraries it loads, which work offline. */
  shipped: string[]
  /** Addresses it loads from code hosts. */
  fetched: string[]
  /** Controls with an id, which the frame keeps across reloads. */
  controls: string[]
  /** Messages its buttons send, where the source writes them in place. */
  prompts: string[]
  /** The text shown before any script runs, cut short. */
  text: string
  /** Problems that do not keep it from being shown, written as instructions. */
  notes: string[]
  /** This card's id, the call id, which a later call passes as `revises` to change it. */
  card?: string
  /** Id of the earlier card this one replaces, when the model named a valid one. */
  revises?: string
  /**
   * The cleaned source. Present in the result value so `output.presentationMeta`
   * can persist it; it never reaches the model, because `output.render` projects
   * only the summary.
   */
  source: string
}

/** What the model receives when the widget is not shown. */
export interface UIRenderFailure {
  ok: false
  problems: ReportedProblem[]
  hint: string
}

/** The result value. */
export type UIRenderValue = UIRenderSuccess | UIRenderFailure

/** Characters of visible text the model reads back. */
const MAX_TEXT = 600

/** Problems persisted for a widget that was not shown, so the reader sees why. */
const MAX_META_PROBLEMS = 6

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
        description: 'The widget: an HTML fragment (styles first, then content, then scripts) or one <svg> element.',
      },
      title: {
        type: 'string',
        description: 'Short label for the widget, shown in its status line.',
      },
      revises: {
        type: 'string',
        description: 'Card id of an earlier ui_render result that this widget replaces: the earlier one folds away, and the reader\'s saved values carry over.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          lines: { type: 'number' },
          scripts: { type: 'number' },
          shipped: { type: 'array', items: { type: 'string' } },
          fetched: { type: 'array', items: { type: 'string' } },
          controls: { type: 'array', items: { type: 'string' } },
          prompts: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
          notes: { type: 'array', items: { type: 'string' } },
          card: { type: 'string' },
          revises: { type: 'string' },
          problems: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                line: { type: 'number' },
                message: { type: 'string', required: true },
                repair: { type: 'string', required: true },
              },
            },
          },
          hint: { type: 'string' },
          /**
           * The cleaned source. Declared because the registry validates this
           * value and rejects undeclared keys; it is still never spoken to the
           * model, because `render` projects only the summary.
           */
          source: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderForModel(value) }],
      presentationMeta: (args, value) => buildPresentationMeta(args, value),
    },
    async execute(args, exec) {
      const checked = checkWidget(args.source)
      const errors = checked.problems.filter(problem => problem.severity === 'error')
      if (errors.length > 0) {
        return { ok: false, problems: errors.slice(0, LIMITS.maxDiagnostics).map(reported), hint: REPAIR_HINT }
      }
      const notes = checked.problems.filter(problem => problem.severity === 'warning').slice(0, LIMITS.maxDiagnostics).map(formatProblem)
      const card = readCallId(exec)
      const revises = args.revises === undefined || args.revises.trim() === '' ? undefined : args.revises.trim()
      const revisable = revises !== undefined && CARD_ID_PATTERN.test(revises) && revises !== card
      if (revises !== undefined && !revisable) {
        notes.push('- revises was ignored: it is not the id of another card. Pass the "Card id" an earlier ui_render result reported.')
      }
      const source = checked.source
      return {
        ok: true,
        lines: source.split('\n').length,
        scripts: scriptBlocks(source).length,
        shipped: checked.shipped,
        fetched: checked.fetched,
        controls: controlIds(source).slice(0, 24),
        prompts: promptTexts(source).slice(0, 12),
        text: visibleText(source, MAX_TEXT),
        notes,
        ...(card === undefined ? {} : { card }),
        ...(revisable ? { revises } : {}),
        source,
      }
    },
  })
}

/** A problem without its severity, as the result carries it. */
function reported(problem: Problem): ReportedProblem {
  return { ...(problem.line === undefined ? {} : { line: problem.line }), message: problem.message, repair: problem.repair }
}

/** The call id the host runs this call under, when it is one a later call can name. */
function readCallId(exec: unknown): string | undefined {
  const callId = (typeof exec === 'object' && exec !== null ? exec as { callId?: unknown } : {}).callId
  return typeof callId === 'string' && CARD_ID_PATTERN.test(callId) ? callId : undefined
}

/** Where the widget stands, told with every widget so the model goes on writing after it. */
export const PLACEMENT_NOTE = 'It stands in your reply here, where you called ui_render. To put it inside your answer instead, write this block alone on its lines where it belongs; the widget moves there and the block is hidden. A block never draws a widget: copy this one exactly, and write one only for a widget a ui_render result gave you an id for:'

/**
 * The block that places a widget in the answer: a fence of the `widget`
 * language whose only line is the card id. The browser half finds it there.
 * @param card - the card id.
 * @returns the block's three lines.
 */
export function placementBlock(card: string): string {
  return ['```widget', card, '```'].join('\n')
}

/** One problem line, written as an instruction the model can act on. */
function formatProblem(problem: ReportedProblem): string {
  return `- ${problem.line === undefined ? '' : `line ${problem.line}: `}${problem.message}. ${problem.repair}`
}

/** Quote a list for one line of the result. */
function listed(values: readonly string[]): string {
  return values.map(value => JSON.stringify(value)).join(', ')
}

/** Render the tool result for the model: what the reader sees, or the problems to fix. */
export function renderForModel(value: unknown): string {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Partial<UIRenderSuccess> & Partial<UIRenderFailure>
  if (record.ok !== true) {
    const lines = (record.problems ?? []).map(formatProblem)
    return ['The widget was not shown: its code has errors.', ...lines, record.hint ?? REPAIR_HINT].join('\n')
  }
  const notes = record.notes ?? []
  return [
    `The widget is shown: ${String(record.lines ?? 0)} line(s), ${String(record.scripts ?? 0)} script(s).`,
    typeof record.card === 'string' ? `${PLACEMENT_NOTE}\n${placementBlock(record.card)}` : 'It stands in your reply here, where you called ui_render; continue your answer below it.',
    typeof record.card === 'string' ? `Card id: ${record.card} (to redraw or change this widget, call ui_render with revises=${record.card}; the reader then sees only the new one)` : '',
    typeof record.revises === 'string' ? `It replaces card ${record.revises}, which now folds away; the reader's saved values carry over.` : '',
    (record.shipped ?? []).length > 0 ? `Shipped libraries, loaded offline: ${(record.shipped ?? []).join(', ')}.` : '',
    (record.fetched ?? []).length > 0 ? `Loaded from code hosts: ${(record.fetched ?? []).join(', ')}.` : '',
    (record.controls ?? []).length > 0 ? `Controls kept across reloads: ${(record.controls ?? []).join(', ')}.` : '',
    (record.prompts ?? []).length > 0 ? `Buttons send: ${listed(record.prompts ?? [])}.` : '',
    notes.length > 0 ? `Check these; they may not work in the frame:\n${notes.join('\n')}` : '',
    `Text shown before scripts run: ${record.text === undefined || record.text === '' ? '(none)' : record.text}`,
    'You cannot see the widget; if the reader reports a problem, fix it with revises.',
  ].filter(line => line !== '').join('\n')
}

/**
 * Build the client-facing metadata.
 *
 * This is the only channel that survives a reload: the harness attaches the
 * returned JSON to `tool/result.meta`, which the session log persists and the
 * client replays into the widget.
 * @param args - the model's validated arguments.
 * @param value - the tool's result value.
 * @returns the persisted presentation metadata.
 */
export function buildPresentationMeta(args: { title?: string | undefined }, value: unknown): Json {
  const candidate = (typeof value === 'object' && value !== null ? value : {}) as Partial<UIRenderSuccess> & Partial<UIRenderFailure>
  const meta: { [key: string]: Json } = { version: API_VERSION }
  if (typeof args.title === 'string' && args.title.trim() !== '') meta.title = args.title.trim().slice(0, 120)
  if (candidate.ok === true && typeof candidate.source === 'string') {
    meta.ok = true
    if (typeof candidate.revises === 'string') meta.revises = candidate.revises
    meta.source = candidate.source
    return meta
  }
  meta.ok = false
  meta.problems = (candidate.problems ?? []).slice(0, MAX_META_PROBLEMS).map((problem) => {
    const entry: { [key: string]: Json } = { message: problem.message, repair: problem.repair }
    if (problem.line !== undefined) entry.line = problem.line
    return entry
  })
  return meta
}

export { UI_TOOL_NAME }
