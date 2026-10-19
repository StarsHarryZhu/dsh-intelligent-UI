/**
 * Read a compiled program the way the browser must: defensively.
 *
 * The program in `tool/result.meta` was persisted by a possibly different build,
 * so nothing here trusts the compiler's types. Every field is guarded, every
 * guard has a fallback, and nothing throws. A program and envelope whose
 * `version` is an API version this build knows render; any other one, newer or
 * from before version fields existed, is shown as its text stand-in.
 * @module dsh-intelligent-ui/client/program
 */

import { compileSource, dockPlayers } from '../lang/compile.ts'
import { evalExpr } from '../lang/expr.ts'
import { API_VERSION } from '../lang/identity.ts'
import type { JsonValue } from '../lang/types.ts'

/** One declared state value, as read. */
export interface StateRow {
  key: string
  kind: 'number' | 'string' | 'boolean' | 'select'
  init: JsonValue
  min?: number
  max?: number
  step?: number
  options?: string[]
}

/** One component, as read. */
export interface NodeRow {
  id: string
  type: string
  parent: string | null
  props: Readonly<Record<string, unknown>>
  /** Bound state key of a control. */
  bind?: string
}

/** A program prepared for rendering. */
export interface Program {
  /** Whether this build understands the program's format. */
  supported: boolean
  state: readonly StateRow[]
  calc: ReadonlyArray<{ key: string; expr: unknown }>
  nodes: readonly NodeRow[]
  byId: ReadonlyMap<string, NodeRow>
  /** Child ids by parent id; `null` holds the roots. */
  children: ReadonlyMap<string | null, readonly string[]>
  constants: Readonly<Record<string, unknown>>
  fallback: string
}

/** A settled call's metadata, as read. */
export type CardMeta =
  | { ok: true; program: Program; title?: string }
  | { ok: false; diagnostics: ReadonlyArray<{ message: string; repair: string; line?: number }>; title?: string }

/**
 * Read `tool/result.meta`.
 * @param meta - the persisted metadata.
 * @returns the card's program or failure, or undefined when the metadata is not this plugin's.
 */
export function readMeta(meta: unknown): CardMeta | undefined {
  const record = asRecord(meta)
  const title = typeof record.title === 'string' && record.title.trim() !== '' ? { title: record.title.trim() } : {}
  if (!knownVersion(record.version)) {
    // An envelope this build cannot read still shows the text its program carries.
    const fallback = asRecord(record.program).fallback
    return record.ok === true && typeof fallback === 'string' && fallback !== ''
      ? { ok: true, program: textOnly(fallback), ...title }
      : undefined
  }
  if (record.ok === true) {
    const program = readProgram(record.program)
    return program === undefined ? undefined : { ok: true, program, ...title }
  }
  if (record.ok === false) {
    const diagnostics = asArray(record.diagnostics).map(asRecord)
      .filter(entry => typeof entry.message === 'string')
      .map(entry => ({
        message: entry.message as string,
        repair: typeof entry.repair === 'string' ? entry.repair : '',
        ...(typeof entry.line === 'number' ? { line: entry.line } : {}),
      }))
    return { ok: false, diagnostics, ...title }
  }
  return undefined
}

/**
 * Read one persisted program.
 * @param value - candidate program.
 * @returns the prepared program, or undefined when nothing renderable is there.
 */
export function readProgram(value: unknown): Program | undefined {
  const record = asRecord(value)
  const nodes: NodeRow[] = []
  const byId = new Map<string, NodeRow>()
  for (const raw of asArray(record.nodes).map(asRecord)) {
    if (typeof raw.id !== 'string' || raw.id === '' || typeof raw.type !== 'string' || byId.has(raw.id)) continue
    const bind = typeof asRecord(raw.bind).key === 'string' ? asRecord(raw.bind).key as string : undefined
    const node: NodeRow = {
      id: raw.id,
      type: raw.type,
      parent: typeof raw.parent === 'string' ? raw.parent : null,
      props: asRecord(raw.props),
      ...(bind === undefined ? {} : { bind }),
    }
    nodes.push(node)
    byId.set(node.id, node)
  }
  if (nodes.length === 0) return undefined
  dockPlayers(nodes)
  const children = new Map<string | null, string[]>()
  for (const node of nodes) {
    // A parent the program never declared is unreachable, so the node is dropped
    // here exactly as the compiler would have moved or rejected it.
    if (node.parent !== null && !byId.has(node.parent)) continue
    const list = children.get(node.parent) ?? []
    list.push(node.id)
    children.set(node.parent, list)
  }
  const state: StateRow[] = []
  for (const raw of asArray(record.state).map(asRecord)) {
    if (typeof raw.key !== 'string') continue
    const kind = raw.kind === 'number' || raw.kind === 'string' || raw.kind === 'boolean' || raw.kind === 'select' ? raw.kind : undefined
    if (kind === undefined) continue
    const row: StateRow = { key: raw.key, kind, init: isScalar(raw.init) ? raw.init : null }
    for (const field of ['min', 'max', 'step'] as const) {
      const bound = raw[field]
      if (typeof bound === 'number' && Number.isFinite(bound)) row[field] = bound
    }
    const options = asArray(raw.options).filter((option): option is string => typeof option === 'string')
    if (options.length > 0) row.options = options
    state.push(row)
  }
  const calc = asArray(record.calc).map(asRecord)
    .filter(raw => typeof raw.key === 'string')
    .map(raw => ({ key: raw.key as string, expr: raw.expr }))
  return {
    supported: knownVersion(record.version),
    state,
    calc,
    nodes,
    byId,
    children,
    constants: asRecord(record.constants),
    fallback: typeof record.fallback === 'string' && record.fallback !== '' ? record.fallback : '',
  }
}

/**
 * Compile source in the browser for a live preview.
 * @param source - the source text read from the call's arguments.
 * @param partial - whether the source is still streaming.
 * @returns the prepared program, or undefined while nothing renders yet.
 */
export function previewProgram(source: string, partial: boolean): Program | undefined {
  const result = compileSource(source, { partial })
  return result.ok ? readProgram(result.program) : undefined
}

/**
 * Current values: initial state, the reader's valid edits, then every derived
 * value in declaration order, so one change reaches every figure in one pass.
 * @param program - the prepared program.
 * @param edits - the reader's edits by state key.
 * @returns the value of every state and calc key that has one.
 */
export function computeValues(program: Program, edits: Readonly<Record<string, JsonValue>>): Map<string, JsonValue> {
  const values = new Map<string, JsonValue>()
  for (const row of program.state) {
    const edited = Object.hasOwn(edits, row.key) ? acceptEdit(row, edits[row.key]) : undefined
    values.set(row.key, edited ?? row.init)
  }
  for (const row of program.calc) {
    const produced = evalExpr(row.expr, key => values.get(key))
    if (typeof produced === 'symbol') values.delete(row.key)
    else values.set(row.key, produced)
  }
  return values
}

/**
 * Validate one edit against its declaration: a slider cannot leave its range,
 * and a choice must be one of its options.
 * @param row - the state declaration.
 * @param value - the candidate value.
 * @returns the accepted value, or undefined when it does not fit.
 */
export function acceptEdit(row: StateRow, value: unknown): JsonValue | undefined {
  switch (row.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
      let next = value
      if (row.min !== undefined) next = Math.max(row.min, next)
      if (row.max !== undefined) next = Math.min(row.max, next)
      return next
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined
    case 'select':
      return typeof value === 'string' && (row.options ?? []).includes(value) ? value : undefined
    case 'string':
      return typeof value === 'string' ? value.slice(0, 2000) : undefined
  }
}

/** Whether a version field names an API version this build reads: a whole number from 1 to {@link API_VERSION}. */
function knownVersion(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= API_VERSION
}

/** A program that only shows its text stand-in. */
function textOnly(fallback: string): Program {
  return { supported: false, state: [], calc: [], nodes: [], byId: new Map(), children: new Map(), constants: {}, fallback }
}

/** Whether a value is a JSON scalar. */
function isScalar(value: unknown): value is JsonValue {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
}

/** Read an object without asserting its members. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Read an array without asserting its members. */
export function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : []
}
