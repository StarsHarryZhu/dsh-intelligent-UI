/**
 * Read what the host hands the browser, defensively.
 *
 * Persisted meta was written by a possibly different build, and slot props come
 * from a host this plugin does not control, so nothing here trusts a type.
 * Every field is guarded, every guard has a fallback, and nothing throws.
 * @module dsh-intelligent-ui/client/read
 */

import { API_VERSION, CARD_ID_PATTERN, LEGACY_API_VERSION } from '../widget/identity.ts'

/** A settled call's metadata, as read. */
export type CardMeta =
  | { kind: 'widget'; source: string; title?: string; revises?: string }
  | { kind: 'failed'; problems: ReadonlyArray<{ message: string; repair: string; line?: number }>; title?: string }
  | { kind: 'legacy'; text: string; title?: string }

/**
 * Read `tool/result.meta`.
 * @param meta - the persisted metadata.
 * @returns the widget, the problems that kept it from showing, the text of a
 *   card from the DIL era, or undefined when the metadata is not this plugin's.
 */
export function readMeta(meta: unknown): CardMeta | undefined {
  const record = asRecord(meta)
  const title = typeof record.title === 'string' && record.title.trim() !== '' ? { title: record.title.trim() } : {}
  if (record.version === API_VERSION) {
    if (record.ok === true && typeof record.source === 'string') {
      const revises = readCardId(record.revises)
      return { kind: 'widget', source: record.source, ...title, ...(revises === undefined ? {} : { revises }) }
    }
    if (record.ok === false) {
      const problems = asArray(record.problems).map(asRecord)
        .filter(entry => typeof entry.message === 'string')
        .map(entry => ({
          message: entry.message as string,
          repair: typeof entry.repair === 'string' ? entry.repair : '',
          ...(typeof entry.line === 'number' ? { line: entry.line } : {}),
        }))
      return { kind: 'failed', problems, ...title }
    }
    return undefined
  }
  // A card from the DIL era, or one with no version at all, carried its text version in its program.
  if (record.version === LEGACY_API_VERSION || record.version === undefined) {
    const fallback = asRecord(record.program).fallback
    if (record.ok === true && typeof fallback === 'string' && fallback !== '') return { kind: 'legacy', text: fallback, ...title }
    if (record.ok === false && Array.isArray(record.diagnostics)) return { kind: 'failed', problems: [], ...title }
  }
  return undefined
}

/** Whether persisted meta is this plugin's: a widget, an old card, or a failed check. */
export function isOwnMeta(meta: unknown): boolean {
  return readMeta(meta) !== undefined
}

/** Whether persisted meta is a card that shows: a widget, or an old card's text. */
export function isShownMeta(meta: unknown): boolean {
  const read = readMeta(meta)
  return read !== undefined && read.kind !== 'failed'
}

/**
 * Read a card id: the call id of a `ui_render` result, as `revises` names it.
 * @param value - the candidate.
 * @returns the id, or undefined when it does not have a card id's shape.
 */
export function readCardId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return CARD_ID_PATTERN.test(id) ? id : undefined
}

/** A plain record view of an unknown value; empty when it is not one. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** An array view of an unknown value; empty when it is not one. */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
