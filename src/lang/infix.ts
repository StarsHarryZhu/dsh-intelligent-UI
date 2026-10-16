/**
 * The readable expression syntax: `seats * 29`, `plan == "Pro" ? 29 : 12`.
 *
 * Models write arithmetic far more reliably than nested JSON arrays, so every
 * place that takes an expression accepts this form and lowers it to the closed
 * {@link ExprNode} union. The parser only produces operators that
 * {@link checkExpr} already understands, so the readable surface can never widen
 * what an expression may do.
 * @module dsh-intelligent-ui/lang/infix
 */

import type { ExprNode, ExprOperand } from './types.ts'

/** One lexical token. */
type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }

/** Longest expression text accepted, so a pathological line cannot stall the parser. */
const MAX_EXPRESSION_LENGTH = 2000

/** Word operators, read as their symbolic forms. */
const WORD_OPERATORS: Readonly<Record<string, string>> = { and: '&&', or: '||', not: '!' }

/**
 * Parse one readable expression.
 * @param text - expression text, without surrounding braces.
 * @returns the expression tree, or undefined when the text is outside the vocabulary.
 */
export function parseInfix(text: string): ExprNode | undefined {
  if (text.length > MAX_EXPRESSION_LENGTH) return undefined
  const tokens = tokenize(text)
  if (tokens === undefined || tokens.length === 0) return undefined
  let index = 0
  const parsed = parseTernary()
  if (parsed === undefined || index !== tokens.length) return undefined
  return asNode(parsed)

  function peek(offset = 0): Tok | undefined {
    return tokens?.[index + offset]
  }

  function isOp(value: string): boolean {
    const token = peek()
    return token?.t === 'op' && token.v === value
  }

  function parseTernary(): ExprOperand | undefined {
    const test = parseOr()
    if (test === undefined || !isOp('?')) return test
    index += 1
    const whenTrue = parseTernary()
    if (whenTrue === undefined || !isOp(':')) return undefined
    index += 1
    const whenFalse = parseTernary()
    if (whenFalse === undefined) return undefined
    return ['if', test, whenTrue, whenFalse]
  }

  function parseOr(): ExprOperand | undefined {
    let left = parseAnd()
    while (left !== undefined && isOp('||')) {
      index += 1
      const right = parseAnd()
      if (right === undefined) return undefined
      left = ['or', left, right]
    }
    return left
  }

  function parseAnd(): ExprOperand | undefined {
    let left = parseEquality()
    while (left !== undefined && isOp('&&')) {
      index += 1
      const right = parseEquality()
      if (right === undefined) return undefined
      left = ['and', left, right]
    }
    return left
  }

  function parseEquality(): ExprOperand | undefined {
    let left = parseComparison()
    for (;;) {
      if (left === undefined) return undefined
      const token = peek()
      if (token?.t !== 'op' || (token.v !== '==' && token.v !== '!=' && token.v !== '=')) return left
      index += 1
      const right = parseComparison()
      if (right === undefined) return undefined
      left = [token.v === '!=' ? 'ne' : 'eq', left, right]
    }
  }

  function parseComparison(): ExprOperand | undefined {
    let left = parseSum()
    for (;;) {
      if (left === undefined) return undefined
      const token = peek()
      const operator = token?.t === 'op' ? COMPARISONS[token.v] : undefined
      if (operator === undefined) return left
      index += 1
      const right = parseSum()
      if (right === undefined) return undefined
      left = [operator, left, right]
    }
  }

  function parseSum(): ExprOperand | undefined {
    let left = parseProduct()
    for (;;) {
      if (left === undefined) return undefined
      const token = peek()
      if (token?.t !== 'op' || (token.v !== '+' && token.v !== '-')) return left
      index += 1
      const right = parseProduct()
      if (right === undefined) return undefined
      left = [token.v === '+' ? 'add' : 'sub', left, right]
    }
  }

  function parseProduct(): ExprOperand | undefined {
    let left = parseUnary()
    for (;;) {
      if (left === undefined) return undefined
      const token = peek()
      if (token?.t !== 'op' || (token.v !== '*' && token.v !== '/' && token.v !== '%')) return left
      index += 1
      const right = parseUnary()
      if (right === undefined) return undefined
      left = [token.v === '*' ? 'mul' : token.v === '/' ? 'div' : 'mod', left, right]
    }
  }

  function parseUnary(): ExprOperand | undefined {
    if (isOp('-')) {
      index += 1
      const inner = parseUnary()
      if (inner === undefined) return undefined
      return typeof inner === 'number' ? -inner : ['neg', inner]
    }
    if (isOp('+')) {
      index += 1
      return parseUnary()
    }
    if (isOp('!')) {
      index += 1
      const inner = parseUnary()
      return inner === undefined ? undefined : ['not', inner]
    }
    return parseAtom()
  }

  function parseAtom(): ExprOperand | undefined {
    const token = peek()
    if (token === undefined) return undefined
    index += 1
    if (token.t === 'num') return token.v
    if (token.t === 'str') return ['lit', token.v]
    if (token.t === 'op') {
      if (token.v !== '(') return undefined
      const inner = parseTernary()
      if (inner === undefined || !isOp(')')) return undefined
      index += 1
      return inner
    }
    if (token.v === 'true') return true
    if (token.v === 'false') return false
    if (!isOp('(')) return ['ref', token.v]
    index += 1
    const parts: ExprOperand[] = []
    if (!isOp(')')) {
      for (;;) {
        const part = parseTernary()
        if (part === undefined) return undefined
        parts.push(part)
        if (!isOp(',')) break
        index += 1
      }
    }
    if (!isOp(')')) return undefined
    index += 1
    return call(token.v, parts)
  }
}

/** Comparison symbols and the operators they lower to. */
const COMPARISONS: Readonly<Record<string, 'lt' | 'gt' | 'le' | 'ge' | undefined>> = {
  '<': 'lt', '>': 'gt', '<=': 'le', '>=': 'ge',
}

/** Lower one function call to its operator, or reject a name outside the vocabulary. */
function call(name: string, parts: ExprOperand[]): ExprOperand | undefined {
  const [first, second, third] = parts
  switch (name) {
    case 'if':
      return parts.length === 3 ? ['if', first as ExprOperand, second as ExprOperand, third as ExprOperand] : undefined
    case 'min':
    case 'max':
      return parts.length === 2 ? [name, first as ExprOperand, second as ExprOperand] : undefined
    case 'abs':
    case 'floor':
    case 'ceil':
      return parts.length === 1 ? [name, first as ExprOperand] : undefined
    case 'round':
      if (parts.length === 1) return ['round', first as ExprOperand, 0]
      return parts.length === 2 && typeof second === 'number' ? ['round', first as ExprOperand, second] : undefined
    case 'fmt':
    case 'fmtNum':
      if (parts.length === 1) return ['fmtNum', first as ExprOperand]
      return parts.length === 2 && typeof second === 'number' ? ['fmtNum', first as ExprOperand, second] : undefined
    default:
      return undefined
  }
}

/** Wrap a bare literal so every stored expression is an operator array. */
export function asNode(value: ExprOperand): ExprNode {
  return typeof value === 'number' || typeof value === 'boolean' ? ['lit', value] : value
}

/** Split an expression into tokens, or undefined on an unreadable character. */
function tokenize(text: string): Tok[] | undefined {
  const tokens: Tok[] = []
  let index = 0
  while (index < text.length) {
    const character = text[index] as string
    if (/\s/u.test(character)) {
      index += 1
      continue
    }
    if (character === '"' || character === '\'') {
      const read = readString(text, index)
      if (read === undefined) return undefined
      tokens.push({ t: 'str', v: read.value })
      index = read.end
      continue
    }
    const rest = text.slice(index)
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)/u.exec(rest)
    if (number !== null) {
      tokens.push({ t: 'num', v: Number(number[0]) })
      index += number[0].length
      continue
    }
    const word = /^[A-Za-z_$][\w$]*/u.exec(rest)
    if (word !== null) {
      const operator = WORD_OPERATORS[word[0]]
      tokens.push(operator === undefined ? { t: 'id', v: word[0] } : { t: 'op', v: operator })
      index += word[0].length
      continue
    }
    const operator = /^(?:<=|>=|==|!=|&&|\|\||[-+*/%()<>,!?:=])/u.exec(rest)
    if (operator !== null) {
      tokens.push({ t: 'op', v: operator[0] })
      index += operator[0].length
      continue
    }
    return undefined
  }
  return tokens
}

/**
 * Read one quoted string with backslash escapes.
 * @param text - the whole expression.
 * @param start - index of the opening quote.
 * @returns the decoded value and the index after the closing quote, or undefined when unterminated.
 */
export function readString(text: string, start: number): { value: string; end: number } | undefined {
  const quote = text[start]
  let value = ''
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index] as string
    if (character === '\\' && index + 1 < text.length) {
      const next = text[index + 1] as string
      value += next === 'n' ? '\n' : next === 't' ? '\t' : next
      index += 1
      continue
    }
    if (character === quote) return { value, end: index + 1 }
    value += character
  }
  return undefined
}
