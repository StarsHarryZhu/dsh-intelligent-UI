/**
 * The `table` component: rows the reader can sort, filter, page through, and copy.
 *
 * The tools appear only where they help, with no prop for the model to learn: a
 * filter box once a table is longer than a glance, pages once the matching rows
 * outgrow one page, and a copy of what the filter and sort leave, as CSV for a
 * spreadsheet or Markdown for a note. A long table therefore costs the model its
 * rows and nothing more. Sort, filter, and page are reader settings, remembered
 * per table like an open tab.
 * @module dsh-intelligent-ui/client/table
 */

import { useEffect, useState, type ReactNode } from 'react'
import type { JsonValue } from '../lang/types.ts'
import { copyText } from './clipboard.ts'
import type { RenderScope } from './components.tsx'
import { currentIndex, currentMark, flag, Glyph, list, mono } from './parts.tsx'
import type { NodeRow } from './program.ts'

/** Rows above which the filter box appears. */
export const FILTER_FROM = 8
/** Rows on one page. */
export const PAGE_ROWS = 20
/** Longest filter text kept. */
const MAX_QUERY = 200

/** Which copy the reader asked for, and how the clipboard answered. */
type Copied = { format: 'csv' | 'markdown'; ok: boolean } | undefined

/**
 * Draw one table.
 * @param props - the node and the card's scope.
 * @returns the table figure.
 */
export function TableFigure(props: { node: NodeRow; scope: RenderScope }): ReactNode {
  const { node, scope } = props
  const columns = list(node.props.columns, scope)
  const rows = (Array.isArray(node.props.rows) ? node.props.rows as unknown[] : [])
    .map(row => (Array.isArray(row) ? row as unknown[] : []).map(cell => scope.text(cell)))
  const current = currentIndex(node, scope)
  const sortable = flag(node, 'sortable', scope)
  const sort = sortable ? readSort(scope.ui(node.id), columns.length) : undefined
  const filterable = rows.length > FILTER_FROM
  const query = filterable ? readQuery(scope.ui(`${node.id}:q`)) : ''
  const order = visibleRows(rows, query, sort)
  const pages = Math.max(1, Math.ceil(order.length / PAGE_ROWS))
  const page = Math.min(readPage(scope.ui(`${node.id}:p`)), pages - 1)
  const shown = pages > 1 ? order.slice(page * PAGE_ROWS, (page + 1) * PAGE_ROWS) : order
  const [copied, setCopied] = useState<Copied>(undefined)

  // A player walking a long table turns to the page of its current row.
  useEffect(() => {
    const position = order.indexOf(current)
    if (position < 0) return
    const target = Math.floor(position / PAGE_ROWS)
    if (target !== page) scope.setUi(`${node.id}:p`, target)
    // Only a move of the current row turns the page; the reader's own paging stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // Ascending, then descending, then the order the program wrote.
  const cycle = (column: number): void => {
    const next = sort?.column !== column ? { column, descending: false } : sort.descending ? null : { column, descending: true }
    scope.setUi(node.id, next)
  }
  const filter = (text: string): void => {
    scope.setUi(`${node.id}:q`, text.slice(0, MAX_QUERY))
    scope.setUi(`${node.id}:p`, 0)
  }
  const turn = (to: number): void => { scope.setUi(`${node.id}:p`, Math.max(0, Math.min(to, pages - 1))) }
  const copy = (format: 'csv' | 'markdown'): void => {
    const body = order.map(index => rows[index] ?? [])
    const text = format === 'csv' ? toCsv(columns, body) : toMarkdown(columns, body)
    void copyText(text).then((ok) => { setCopied({ format, ok }) })
  }
  const copyLabel = (format: 'csv' | 'markdown'): string => copied?.format !== format
    ? scope.tr(format === 'csv' ? 'table.copyCsv' : 'table.copyMarkdown')
    : scope.tr(copied.ok ? 'table.copied' : 'table.copyFailed')
  const reset = (): void => { setCopied(undefined) }
  const caption = node.props.caption === undefined ? undefined : scope.text(node.props.caption)

  return (
    <figure className="dsh-iui-figure dsh-iui-table-figure" data-mono={mono(node, scope)}>
      <div className="dsh-iui-table-head">
        <span className="dsh-iui-caption">{caption ?? ''}</span>
        <span className="dsh-iui-table-tools">
          {(['csv', 'markdown'] as const).map(format => (
            <button
              key={format}
              type="button"
              className="dsh-iui-table-copy"
              data-format={format}
              data-state={copied?.format === format ? (copied.ok ? 'copied' : 'failed') : undefined}
              onClick={() => { copy(format) }}
              onBlur={reset}
              onPointerLeave={reset}
            >
              {copyLabel(format)}
            </button>
          ))}
        </span>
      </div>
      {filterable ? (
        <div className="dsh-iui-table-filter-row">
          <input
            className="dsh-iui-input dsh-iui-table-filter"
            type="search"
            value={query}
            placeholder={scope.tr('table.filter')}
            aria-label={scope.tr('table.filter')}
            onChange={(event) => { filter(event.currentTarget.value) }}
          />
          <span className="dsh-iui-table-count" role="status">{scope.tr('table.count', { shown: order.length, total: rows.length })}</span>
        </div>
      ) : null}
      <div className="dsh-iui-table-wrap">
        <table className="dsh-iui-table" aria-label={caption}>
          {columns.length === 0 ? null : (
            <thead>
              <tr>
                {columns.map((column, index) => {
                  if (!sortable) return <th key={index} scope="col">{column}</th>
                  const direction = sort?.column === index ? (sort.descending ? 'descending' : 'ascending') : undefined
                  return (
                    <th key={index} scope="col" aria-sort={direction ?? 'none'}>
                      <button type="button" className="dsh-iui-table-sort" title={scope.tr('table.sort')} onClick={() => { cycle(index) }}>
                        <span>{column}</span>
                        {direction === undefined ? null : <Glyph path={direction === 'ascending' ? 'M6 3.5l3.5 5h-7z' : 'M6 8.5l3.5-5h-7z'} />}
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
          )}
          <tbody>
            {shown.map(rowIndex => (
              <tr key={rowIndex} {...currentMark(rowIndex === current)}>
                {(rows[rowIndex] ?? []).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {order.length === 0 && rows.length > 0 ? <div className="dsh-iui-table-empty">{scope.tr('table.none')}</div> : null}
      {pages > 1 ? (
        <div className="dsh-iui-table-pager">
          <button type="button" className="dsh-iui-table-page" aria-label={scope.tr('table.prev')} disabled={page === 0} onClick={() => { turn(page - 1) }}>
            <Glyph path="M7.5 2.5L4 6l3.5 3.5" />
          </button>
          <span>{scope.tr('table.page', { page: page + 1, pages })}</span>
          <button type="button" className="dsh-iui-table-page" aria-label={scope.tr('table.next')} disabled={page === pages - 1} onClick={() => { turn(page + 1) }}>
            <Glyph path="M4.5 2.5L8 6l-3.5 3.5" />
          </button>
        </div>
      ) : null}
    </figure>
  )
}

/**
 * The rows the reader sees, as indices into the program's rows: those whose text
 * contains the filter, in the chosen sort, ties kept in the program's order.
 * @param rows - every row's cell text.
 * @param query - the filter, matched case-insensitively against any cell.
 * @param sort - the chosen sort, if any.
 * @returns the visible row indices in display order.
 */
export function visibleRows(rows: readonly (readonly string[])[], query: string, sort: { column: number; descending: boolean } | undefined): number[] {
  const needle = query.trim().toLocaleLowerCase()
  const order = rows.map((_row, index) => index)
    .filter(index => needle === '' || (rows[index] ?? []).some(cell => cell.toLocaleLowerCase().includes(needle)))
  if (sort !== undefined) {
    order.sort((a, b) => compareCells(rows[a]?.[sort.column] ?? '', rows[b]?.[sort.column] ?? '', sort.descending) || a - b)
  }
  return order
}

/**
 * Write rows as CSV (RFC 4180): a cell holding a comma, a quote, or a line break
 * is quoted, with its quotes doubled; lines end in CRLF.
 * @param columns - the header row; none when empty.
 * @param rows - the rows in order.
 * @returns the CSV text.
 */
export function toCsv(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => cells.map(cell => (/[",\r\n]/u.test(cell) ? `"${cell.replace(/"/gu, '""')}"` : cell)).join(',')
  return (columns.length === 0 ? rows : [columns, ...rows]).map(line).join('\r\n')
}

/**
 * Write rows as a Markdown table, padded to the widest row; a pipe is escaped
 * and a line break becomes `<br>`, so every row stays one table line.
 * @param columns - the header row; blank headers when empty.
 * @param rows - the rows in order.
 * @returns the Markdown text.
 */
export function toMarkdown(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  const width = Math.max(columns.length, ...rows.map(row => row.length), 1)
  const line = (cells: readonly string[]): string => {
    const padded = Array.from({ length: width }, (_, index) => (cells[index] ?? '').replace(/\|/gu, '\\|').replace(/\r\n?|\n/gu, '<br>'))
    return `| ${padded.join(' | ')} |`
  }
  return [line(columns), `|${' --- |'.repeat(width)}`, ...rows.map(line)].join('\n')
}

/** A table's sort, when the reader chose one for a column it has. */
function readSort(value: JsonValue | undefined, columns: number): { column: number; descending: boolean } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const { column, descending } = value
  if (typeof column !== 'number' || !Number.isInteger(column) || column < 0 || column >= columns) return undefined
  return { column, descending: descending === true }
}

/** The reader's filter text. */
function readQuery(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value.slice(0, MAX_QUERY) : ''
}

/** The reader's page, 0-based; the caller clamps it to the pages there are. */
function readPage(value: JsonValue | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

/**
 * Order two cells: as numbers when both read as one (a leading currency sign and
 * thousands separators allowed), numbers before words, words in the reader's
 * collation with digits compared by value. Empty cells always go last.
 */
export function compareCells(a: string, b: string, descending: boolean): number {
  const blankA = a.trim() === ''
  const blankB = b.trim() === ''
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1
  const numberA = cellNumber(a)
  const numberB = cellNumber(b)
  const order = numberA !== undefined && numberB !== undefined ? numberA - numberB
    : numberA !== undefined ? -1
      : numberB !== undefined ? 1
        : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return descending ? -order : order
}

/** The number a cell starts with, such as 89 in "$89" or 1200 in "1,200 kg". */
function cellNumber(text: string): number | undefined {
  const match = /^\s*[$€£¥￥]?\s*([-+−]?(?:\d[\d,]*(?:\.\d+)?|\.\d+))(?![\d.])/u.exec(text)
  if (match === null) return undefined
  const value = Number((match[1] as string).replace(/,/gu, '').replace('−', '-'))
  return Number.isFinite(value) ? value : undefined
}
