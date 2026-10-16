/**
 * Expression validation, static typing, and evaluation.
 *
 * Two separate passes on purpose. Validation runs on the host against the
 * declared state and derived keys, so a bad reference is a compile diagnostic
 * the model can repair rather than a blank element the reader discovers.
 * Evaluation then runs in the browser on every control change and must be total:
 * it never throws, so one malformed program can never blank the surrounding card.
 * @module dsh-intelligent-ui/lang/expr
 */

import { EXPR_OPERATORS, NUMERIC_OPERATORS, type ExprNode, type JsonValue } from './types.ts'

/** The static type an expression can produce. */
export type ExprType = 'number' | 'string' | 'boolean'

/** Returned instead of a value when an expression cannot be evaluated. */
export const EXPR_FAILURE = Symbol('dsh-intelligent-ui.expr-failure')

/** Maximum expression nesting accepted by validation and evaluation. */
export const MAX_EXPR_DEPTH = 16

/** Most parts one `concat` accepts. */
export const MAX_CONCAT_PARTS = 8

/** Longest string `concat` may build, so a program cannot manufacture unbounded text. */
export const MAX_CONCAT_LENGTH = 2000

/** Validation finding for one expression. */
export interface ExprProblem {
  code: 'invalid_expression' | 'unknown_ref'
  message: string
  /** Path of the offending node, for the diagnostic. */
  path: string
}

/** Whole-subtree validation result. */
export interface ExprCheck {
  type: ExprType | undefined
  problems: ExprProblem[]
}

/** Accepted argument counts per operator, or `undefined` for the variadic `concat`. */
const ARITIES: Readonly<Record<string, readonly [number, number] | undefined>> = {
  lit: [1, 1], ref: [1, 1], num: [1, 1], neg: [1, 1], not: [1, 1],
  abs: [1, 1], floor: [1, 1], ceil: [1, 1],
  add: [2, 2], sub: [2, 2], mul: [2, 2], div: [2, 2], mod: [2, 2], min: [2, 2], max: [2, 2],
  lt: [2, 2], gt: [2, 2], le: [2, 2], ge: [2, 2], eq: [2, 2], ne: [2, 2],
  and: [2, 4], or: [2, 4], if: [3, 3], round: [2, 2], fmtNum: [1, 2], concat: undefined,
}

/**
 * Validate one expression against the keys it may read.
 * @param node - candidate expression tree, normally straight from parsed JSON.
 * @param scope - readable keys and the type each one already has.
 * @param path - diagnostic path of this subtree.
 * @returns the produced type (absent when the node is unusable) and every problem found.
 */
export function checkExpr(
  node: unknown,
  scope: ReadonlyMap<string, ExprType>,
  path = '$',
): ExprCheck {
  const problems: ExprProblem[] = []
  const type = check(node, path, 0)
  return { type, problems }

  function check(value: unknown, here: string, level: number): ExprType | undefined {
    // A number or boolean operand in place is a literal: `["mul",["ref","seats"],29]`
    // reads better than wrapping 29 in `["num",29]`, and both are the same program.
    // A bare string is NOT a literal, because a bare name in that position would be
    // a reference the validator could not check.
    if (typeof value === 'number') return Number.isFinite(value) ? 'number' : reject(here, 'numbers must be finite')
    if (typeof value === 'boolean') return 'boolean'
    if (level > MAX_EXPR_DEPTH) return reject(here, `expression nests deeper than ${MAX_EXPR_DEPTH}`)
    if (!Array.isArray(value) || value.length === 0 || typeof value[0] !== 'string') {
      return reject(here, 'an expression is ["operator", …arguments]')
    }
    const operator = value[0]
    const args: readonly unknown[] = value.slice(1)
    if (!EXPR_OPERATORS.has(operator)) {
      return reject(here, `unknown expression operator "${operator}"`)
    }
    const arity = ARITIES[operator]
    if (arity !== undefined && (args.length < arity[0] || args.length > arity[1])) {
      const expected = arity[0] === arity[1] ? String(arity[0]) : `${arity[0]}..${arity[1]}`
      return reject(here, `${operator} takes ${expected} argument(s), got ${args.length}`)
    }
    switch (operator) {
      case 'lit': {
        const literal = args[0]
        if (typeof literal === 'number' && Number.isFinite(literal)) return 'number'
        if (typeof literal === 'string') return 'string'
        if (typeof literal === 'boolean') return 'boolean'
        return reject(here, 'lit accepts a string, a finite number, or a boolean')
      }
      case 'num':
        return typeof args[0] === 'number' && Number.isFinite(args[0]) ? 'number' : reject(here, 'num takes a finite number')
      case 'ref': {
        const key = args[0]
        if (typeof key !== 'string') return reject(here, 'ref takes a state or derived key name')
        const known = scope.get(key)
        if (known === undefined) {
          problems.push({ code: 'unknown_ref', message: `"${key}" is not a declared @state or @calc key`, path: here })
          return undefined
        }
        return known
      }
      case 'not':
        return check(args[0], `${here}[1]`, level + 1) === undefined ? undefined : 'boolean'
      case 'neg': case 'abs': case 'floor': case 'ceil':
        return numeric(args[0], `${here}[1]`, level) ? 'number' : undefined
      case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'min': case 'max':
        return bothNumeric(args, here, level) ? 'number' : undefined
      case 'round': {
        if (!numeric(args[0], `${here}[1]`, level)) return undefined
        const digits = args[1]
        if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 0 || digits > 6) {
          return reject(here, 'round takes a digit count from 0 to 6')
        }
        return 'number'
      }
      case 'lt': case 'gt': case 'le': case 'ge':
        return bothNumeric(args, here, level) ? 'boolean' : undefined
      case 'eq': case 'ne': {
        // Equality compares two values of one type: numbers, text, or true/false.
        // That is what lets a select-driven price read `plan == "Pro"`.
        const left = check(args[0], `${here}[1]`, level + 1)
        const right = check(args[1], `${here}[2]`, level + 1)
        if (left === undefined || right === undefined) return undefined
        if (left !== right) return reject(here, `${operator} compares two values of the same type, got ${left} and ${right}`)
        return 'boolean'
      }
      case 'and': case 'or':
        for (const [index, argument] of args.entries()) {
          if (check(argument, `${here}[${index + 1}]`, level + 1) === undefined) return undefined
        }
        return 'boolean'
      case 'if': {
        if (check(args[0], `${here}[1]`, level + 1) === undefined) return undefined
        const whenTrue = check(args[1], `${here}[2]`, level + 1)
        const whenFalse = check(args[2], `${here}[3]`, level + 1)
        if (whenTrue === undefined || whenFalse === undefined) return undefined
        if (whenTrue !== whenFalse) return reject(here, 'if branches must produce the same type')
        return whenTrue
      }
      case 'fmtNum':
        if (!numeric(args[0], `${here}[1]`, level)) return undefined
        if (args[1] !== undefined && (typeof args[1] !== 'number' || !Number.isInteger(args[1]) || args[1] < 0 || args[1] > 6)) {
          return reject(here, 'fmtNum takes an optional digit count from 0 to 6')
        }
        return 'string'
      case 'concat':
        return concat(args, here, level)
      /* v8 ignore next 2 -- EXPR_OPERATORS and this switch list the same names. */
      default:
        return reject(here, 'unsupported operator')
    }
  }

  /**
   * `concat` is the oldest text-building form, kept for persisted programs. Its
   * operands are literals, `fmtNum`, and numeric operators, and it never nests.
   * New programs interpolate with text templates instead.
   */
  function concat(args: readonly unknown[], here: string, level: number): ExprType | undefined {
    if (args.length < 1 || args.length > MAX_CONCAT_PARTS) {
      return reject(here, `concat takes between 1 and ${MAX_CONCAT_PARTS} parts`)
    }
    for (const [index, argument] of args.entries()) {
      const where = `${here}[${index + 1}]`
      if (typeof argument === 'number' || typeof argument === 'string') continue
      if (!Array.isArray(argument) || typeof argument[0] !== 'string') {
        return reject(where, 'concat parts are literals, ["fmtNum",…], or numeric expressions')
      }
      const operator = argument[0]
      if (operator === 'concat') return reject(where, 'concat does not nest; write one flat parts list')
      if (operator !== 'lit' && operator !== 'fmtNum' && !NUMERIC_OPERATORS.has(operator)) {
        return reject(where, `concat cannot use "${operator}"`)
      }
      if (check(argument, where, level + 1) === undefined) return undefined
    }
    return 'string'
  }

  function numeric(value: unknown, where: string, level: number): boolean {
    if (typeof value === 'number') return Number.isFinite(value) || reject(where, 'numbers must be finite') !== undefined
    const produced = check(value, where, level + 1)
    if (produced === undefined) return false
    if (produced !== 'number') return reject(where, `expected a number, got ${produced}`) !== undefined
    return true
  }

  function bothNumeric(args: readonly unknown[], here: string, level: number): boolean {
    const left = numeric(args[0], `${here}[1]`, level)
    const right = numeric(args[1], `${here}[2]`, level)
    return left && right
  }

  function reject(here: string, why: string): undefined {
    problems.push({ code: 'invalid_expression', message: why, path: here })
    return undefined
  }
}

/**
 * Evaluate one expression. Total by construction: an unexpected value yields
 * {@link EXPR_FAILURE} instead of throwing, so a single bad element can be dropped
 * without blanking the card. It is also safe on a program that was never
 * validated, which is what a persisted program read by another build is.
 * @param node - expression tree, normally accepted by {@link checkExpr}.
 * @param read - current value of a state or derived key.
 * @returns the produced number, string, boolean, or {@link EXPR_FAILURE}.
 */
export function evalExpr(
  node: unknown,
  read: (key: string) => JsonValue | undefined,
): number | string | boolean | typeof EXPR_FAILURE {
  return evaluate(node, 0)

  function evaluate(value: unknown, depth: number): number | string | boolean | typeof EXPR_FAILURE {
    if (typeof value === 'number') return Number.isFinite(value) ? value : EXPR_FAILURE
    if (typeof value === 'string' || typeof value === 'boolean') return value
    if (depth > MAX_EXPR_DEPTH || !Array.isArray(value) || typeof value[0] !== 'string') return EXPR_FAILURE
    const operator = value[0]
    const args: readonly unknown[] = value.slice(1)
    switch (operator) {
      case 'lit':
      case 'num': {
        const literal = args[0]
        if (typeof literal === 'number') return Number.isFinite(literal) ? literal : EXPR_FAILURE
        return typeof literal === 'string' || typeof literal === 'boolean' ? literal : EXPR_FAILURE
      }
      case 'ref': {
        // A declared key always holds a primitive; anything else means the
        // program and its declarations disagree, so the element is dropped.
        const stored = read(String(args[0]))
        if (typeof stored === 'number') return Number.isFinite(stored) ? stored : EXPR_FAILURE
        return typeof stored === 'string' || typeof stored === 'boolean' ? stored : EXPR_FAILURE
      }
      case 'neg': return unary(args[0], depth, candidate => -candidate)
      case 'abs': return unary(args[0], depth, Math.abs)
      case 'floor': return unary(args[0], depth, Math.floor)
      case 'ceil': return unary(args[0], depth, Math.ceil)
      case 'round': {
        const digits = typeof args[1] === 'number' && Number.isInteger(args[1]) ? Math.max(0, Math.min(6, args[1])) : 0
        return unary(args[0], depth, candidate => Math.round(candidate * 10 ** digits) / 10 ** digits)
      }
      case 'add': return binary(args[0], args[1], depth, (a, b) => a + b)
      case 'sub': return binary(args[0], args[1], depth, (a, b) => a - b)
      case 'mul': return binary(args[0], args[1], depth, (a, b) => a * b)
      case 'div': return binary(args[0], args[1], depth, (a, b) => (b === 0 ? Number.NaN : a / b))
      case 'mod': return binary(args[0], args[1], depth, (a, b) => (b === 0 ? Number.NaN : a % b))
      case 'min': return binary(args[0], args[1], depth, Math.min)
      case 'max': return binary(args[0], args[1], depth, Math.max)
      case 'lt': return compare(args[0], args[1], depth, (a, b) => a < b)
      case 'gt': return compare(args[0], args[1], depth, (a, b) => a > b)
      case 'le': return compare(args[0], args[1], depth, (a, b) => a <= b)
      case 'ge': return compare(args[0], args[1], depth, (a, b) => a >= b)
      case 'eq': return equal(args[0], args[1], depth, true)
      case 'ne': return equal(args[0], args[1], depth, false)
      case 'not': {
        const inner = evaluate(args[0], depth + 1)
        return inner === EXPR_FAILURE ? EXPR_FAILURE : !truthy(inner)
      }
      case 'and':
        return args.every((part) => {
          const piece = evaluate(part, depth + 1)
          return piece !== EXPR_FAILURE && truthy(piece)
        })
      case 'or':
        return args.some((part) => {
          const piece = evaluate(part, depth + 1)
          return piece !== EXPR_FAILURE && truthy(piece)
        })
      case 'if': {
        const test = evaluate(args[0], depth + 1)
        if (test === EXPR_FAILURE) return EXPR_FAILURE
        return evaluate(truthy(test) ? args[1] : args[2], depth + 1)
      }
      case 'fmtNum': {
        const inner = evaluate(args[0], depth + 1)
        if (inner === EXPR_FAILURE || typeof inner !== 'number') return EXPR_FAILURE
        const digits = typeof args[1] === 'number' && Number.isInteger(args[1]) ? Math.max(0, Math.min(6, args[1])) : 0
        return inner.toFixed(digits)
      }
      case 'concat': {
        let text = ''
        for (const part of args) {
          const piece = evaluate(part, depth + 1)
          if (piece === EXPR_FAILURE) return EXPR_FAILURE
          text += typeof piece === 'number' ? formatNumber(piece) : String(piece)
          if (text.length > MAX_CONCAT_LENGTH) return EXPR_FAILURE
        }
        return text
      }
      default:
        return EXPR_FAILURE
    }
  }

  function numericValue(value: unknown, depth: number): number | typeof EXPR_FAILURE {
    const inner = evaluate(value, depth + 1)
    return typeof inner === 'number' && Number.isFinite(inner) ? inner : EXPR_FAILURE
  }

  function unary(value: unknown, depth: number, apply: (candidate: number) => number): number | typeof EXPR_FAILURE {
    const candidate = numericValue(value, depth)
    if (candidate === EXPR_FAILURE) return EXPR_FAILURE
    const result = apply(candidate)
    return Number.isFinite(result) ? result : EXPR_FAILURE
  }

  function binary(
    left: unknown,
    right: unknown,
    depth: number,
    apply: (a: number, b: number) => number,
  ): number | typeof EXPR_FAILURE {
    const a = numericValue(left, depth)
    const b = numericValue(right, depth)
    if (a === EXPR_FAILURE || b === EXPR_FAILURE) return EXPR_FAILURE
    const result = apply(a, b)
    return Number.isFinite(result) ? result : EXPR_FAILURE
  }

  function compare(
    left: unknown,
    right: unknown,
    depth: number,
    apply: (a: number, b: number) => boolean,
  ): boolean | typeof EXPR_FAILURE {
    const a = numericValue(left, depth)
    const b = numericValue(right, depth)
    if (a === EXPR_FAILURE || b === EXPR_FAILURE) return EXPR_FAILURE
    return apply(a, b)
  }

  function equal(left: unknown, right: unknown, depth: number, same: boolean): boolean | typeof EXPR_FAILURE {
    const a = evaluate(left, depth + 1)
    const b = evaluate(right, depth + 1)
    if (a === EXPR_FAILURE || b === EXPR_FAILURE || typeof a !== typeof b) return EXPR_FAILURE
    return (a === b) === same
  }
}

/** Truthiness for `and` / `or` / `if`: numbers count when non-zero, strings when non-empty. */
export function truthy(value: number | string | boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value)
  return value.length > 0
}

/** Render a number for display: integers plainly, fractions to at most two places. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
}
