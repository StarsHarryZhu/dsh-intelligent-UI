/**
 * The `code` component: code or other preformatted text, shown exactly as written.
 *
 * Colouring comes from {@link highlight} and is drawn with the host's own syntax
 * tokens (`--shiki-token-*`), so a card's listing reads like the host's code
 * blocks in light and dark themes alike. `current=` tints one line, and the block
 * keeps that line in view by scrolling itself, never the page, so a player can
 * walk a listing line by line without the chat jumping.
 * @module dsh-intelligent-ui/client/code
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { evalExpr, formatNumber } from '../lang/expr.ts'
import { highlight, type Token } from '../lang/highlight.ts'
import { LIMITS } from '../lang/limits.ts'
import { copyText } from './clipboard.ts'
import type { RenderScope } from './components.tsx'
import type { NodeRow } from './program.ts'

/** Where the copy button stands: untouched, just copied, or refused by the page. */
type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Draw one code block.
 * @param props - the node and the card's scope.
 * @returns the block.
 */
export function CodeFigure(props: { node: NodeRow; scope: RenderScope }): ReactNode {
  const { node, scope } = props
  const text = codeText(node, scope)
  const lang = typeof node.props.lang === 'string' ? node.props.lang : 'text'
  const lines = useMemo(() => highlight(text, lang), [text, lang])
  const current = currentLine(node, scope, lines.length)
  const numbers = node.props.numbers !== undefined && evalExpr(node.props.numbers, key => scope.values.get(key)) === true
  const caption = node.props.caption === undefined ? undefined : scope.text(node.props.caption)
  const scroller = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState<CopyState>('idle')

  // Keep the highlighted line inside the block's own viewport.
  useEffect(() => {
    const box = scroller.current
    if (box === null || current < 0) return
    const row = box.querySelector<HTMLElement>(`[data-line="${current}"]`)
    if (row === null) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < box.scrollTop) box.scrollTop = Math.max(0, top - row.offsetHeight)
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + row.offsetHeight
  }, [current, text])

  useEffect(() => { setCopied('idle') }, [text])

  const copy = (): void => {
    void copyText(text).then((ok) => { setCopied(ok ? 'copied' : 'failed') })
  }
  const label = caption ?? (lang === 'text' ? scope.tr('code.label') : lang)
  return (
    <figure className="dsh-iui-figure dsh-iui-code" data-lang={lang}>
      <div className="dsh-iui-code-head">
        <span className="dsh-iui-caption">{caption ?? (lang === 'text' ? '' : lang)}</span>
        <button
          type="button"
          className="dsh-iui-code-copy"
          data-state={copied === 'idle' ? undefined : copied}
          onClick={copy}
          onBlur={() => { setCopied('idle') }}
          onPointerLeave={() => { setCopied('idle') }}
        >
          {scope.tr(copied === 'copied' ? 'code.copied' : copied === 'failed' ? 'code.copyFailed' : 'code.copy')}
        </button>
      </div>
      <div className="dsh-iui-code-scroll" ref={scroller} tabIndex={0} role="region" aria-label={label}>
        <pre
          className="dsh-iui-code-pre"
          data-wrap={lang === 'text' ? '' : undefined}
          data-numbers={numbers ? String(Math.min(String(lines.length).length, 3)) : undefined}
        >
          <code>
            {lines.map((tokens, index) => (
              <span
                key={index}
                className={index === current ? 'dsh-iui-code-line dsh-iui-current' : 'dsh-iui-code-line'}
                data-line={index}
                aria-current={index === current ? 'step' : undefined}
              >
                {numbers ? <span className="dsh-iui-code-number" aria-hidden="true">{index + 1}</span> : null}
                <span className="dsh-iui-code-text">{tokens.map(renderToken)}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  )
}

/** One coloured run; plain text needs no element. */
function renderToken(token: Token, index: number): ReactNode {
  return token.kind === 'plain' ? token.text : <span key={index} className={`dsh-iui-tok-${token.kind}`}>{token.text}</span>
}

/**
 * The block's text: the literal, or the value of its expression, within the code limits.
 * @param node - the code node.
 * @param scope - current values.
 * @returns the text to show and copy.
 */
export function codeText(node: NodeRow, scope: Pick<RenderScope, 'values'>): string {
  let text = ''
  if (typeof node.props.text === 'string') text = node.props.text
  else if (node.props.value !== undefined) {
    const produced = evalExpr(node.props.value, key => scope.values.get(key))
    text = typeof produced === 'string' ? produced : typeof produced === 'number' ? formatNumber(produced) : typeof produced === 'boolean' ? String(produced) : ''
  }
  text = text.replace(/\r\n?/gu, '\n')
  const lines = text.split('\n')
  if (lines.length > LIMITS.maxCodeLines) text = lines.slice(0, LIMITS.maxCodeLines).join('\n')
  return text.length > LIMITS.maxCodeChars ? text.slice(0, LIMITS.maxCodeChars) : text
}

/** The 0-based line `current=` names, or -1 when it names none of the block's lines. */
function currentLine(node: NodeRow, scope: RenderScope, count: number): number {
  if (node.props.current === undefined) return -1
  const value = scope.number(node.props.current)
  if (value === undefined) return -1
  const index = Math.floor(value) - 1
  return index >= 0 && index < count ? index : -1
}
