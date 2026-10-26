/**
 * Small pieces several renderers share: prop readers and the inline glyph.
 *
 * They live apart from the registry so a component with a file of its own, such
 * as the table, can use them without importing the registry that imports it.
 * @module dsh-intelligent-ui/client/parts
 */

import type { ReactNode } from 'react'
import { evalExpr } from '../lang/expr.ts'
import type { RenderScope } from './components.tsx'
import type { NodeRow } from './program.ts'

/** One 12px glyph, such as a player button or a sort arrow, drawn in the text colour. */
export function Glyph(props: { path: string }): ReactNode {
  return (
    <svg className="dsh-iui-glyph" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d={props.path} fill="currentColor" />
    </svg>
  )
}

/** Whether a boolean expression prop is true right now. */
export function flag(node: NodeRow, name: string, scope: RenderScope): boolean {
  return node.props[name] !== undefined && evalExpr(node.props[name], key => scope.values.get(key)) === true
}

/** The 0-based item a `current=` prop highlights, or -1 when it names none. */
export function currentIndex(node: NodeRow, scope: RenderScope): number {
  if (node.props.current === undefined) return -1
  const value = scope.number(node.props.current)
  return value === undefined ? -1 : Math.floor(value) - 1
}

/** The marks of the highlighted item: a class for the look and `aria-current` for assistive tech. */
export function currentMark(current: boolean): { className?: string; 'aria-current'?: 'step' } {
  return current ? { className: 'dsh-iui-current', 'aria-current': 'step' } : {}
}

/** `data-mono` when the `mono=` prop is true. */
export function mono(node: NodeRow, scope: RenderScope): '' | undefined {
  return flag(node, 'mono', scope) ? '' : undefined
}

/** A list prop resolved to strings. */
export function list(value: unknown, scope: RenderScope): string[] {
  return Array.isArray(value) ? (value as unknown[]).map(entry => scope.text(entry)) : []
}
