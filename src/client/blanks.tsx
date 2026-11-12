/**
 * The `blanks` component: a sentence with entries in place of its `___` runs,
 * and one button that sends the filled sentence as the reader's next message.
 *
 * Answers are reader settings kept under the node id, as ticks are, so the model
 * declares no state for them. The card never checks an answer: the model grades
 * what arrives, and the sentence it receives marks each answer in brackets. Once
 * the card has sent, the entries lock with its buttons.
 * @module dsh-intelligent-ui/client/blanks
 */

import { Fragment, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { BLANK_RUN, MAX_BLANKS } from '../lang/catalog.ts'
import type { JsonValue } from '../lang/types.ts'
import type { RenderScope } from './components.tsx'
import type { NodeRow } from './program.ts'

/** Longest answer one blank keeps. */
const MAX_ANSWER = 200

/** Characters that take two columns: CJK, Hangul, full-width forms, and emoji. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f000}-\u{1faff}]/u

/**
 * Draw one fill-in sentence.
 * @param props - the node and the card's scope.
 * @returns the sentence with its entries, and the send button.
 */
export function Blanks(props: { node: NodeRow; scope: RenderScope }): ReactNode {
  const { node, scope } = props
  const entries = useRef<Array<HTMLInputElement | null>>([])
  const sentence = scope.text(node.props.text)
  const pieces = sentence.split(BLANK_RUN)
  const runs = sentence.match(BLANK_RUN) ?? []
  const count = Math.min(runs.length, MAX_BLANKS)
  const answers = readAnswers(scope.ui(node.id), count)
  const locked = scope.sent !== undefined
  const sent = scope.sent === node.id
  const ready = count > 0 && answers.every(answer => answer.trim() !== '')
  const message = pieces
    .map((piece, index) => (index < runs.length ? `${piece}${index < count ? `[${answers[index]?.trim() ?? ''}]` : runs[index] ?? ''}` : piece))
    .join('')
  const send = (): void => {
    if (ready && !locked) scope.press(node, message)
  }
  const write = (index: number, value: string): void => {
    const next: JsonValue[] = [...answers]
    next[index] = value.slice(0, MAX_ANSWER)
    scope.setUi(node.id, next)
  }
  // Enter moves to the next blank, and from the last one sends once every blank
  // is filled; an input method still composing a word keeps its Enter.
  const onKey = (index: number) => (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    if (index + 1 < count) {
      entries.current[index + 1]?.focus()
      return
    }
    const empty = answers.findIndex(answer => answer.trim() === '')
    if (empty === -1) send()
    else entries.current[empty]?.focus()
  }
  return (
    <div className="dsh-iui-blanks">
      <p className="dsh-iui-text dsh-iui-blanks-text">
        {pieces.map((piece, index) => (
          <Fragment key={index}>
            {piece}
            {index >= runs.length ? null : index >= count ? runs[index] : (
              <input
                ref={(element) => { entries.current[index] = element }}
                className="dsh-iui-blank"
                type="text"
                value={answers[index] ?? ''}
                readOnly={locked}
                aria-label={scope.tr('blanks.blank', { number: index + 1 })}
                maxLength={MAX_ANSWER}
                autoComplete="off"
                spellCheck={false}
                style={{ width: `${blankWidth(runs[index]?.length ?? 3, answers[index] ?? '')}ch` }}
                onChange={(event) => { write(index, event.currentTarget.value) }}
                onKeyDown={onKey(index)}
              />
            )}
          </Fragment>
        ))}
      </p>
      <button
        type="button"
        className="dsh-iui-button"
        data-sent={sent ? '' : undefined}
        disabled={locked || !ready}
        title={ready ? scope.tr('button.sends', { text: message }) : scope.tr('blanks.fill')}
        onClick={send}
      >
        <span>{scope.tr('blanks.send')}</span>
        {sent ? <span className="dsh-iui-button-mark">{scope.tr('button.sent')}</span> : null}
      </button>
    </div>
  )
}

/** The answers kept for this sentence, one string per blank. */
function readAnswers(stored: JsonValue | undefined, count: number): string[] {
  const list = Array.isArray(stored) ? stored : []
  return Array.from({ length: count }, (_, index) => {
    const answer = list[index]
    return typeof answer === 'string' ? answer.slice(0, MAX_ANSWER) : ''
  })
}

/**
 * A blank's width in `ch`: as long as its underscores promise, growing with the
 * answer (a wide character takes two), within a line's reach.
 */
function blankWidth(run: number, answer: string): number {
  let columns = 0
  for (const character of answer) columns += WIDE.test(character) ? 2 : 1
  return Math.min(Math.max(run, columns, 3) + 2, 32)
}
