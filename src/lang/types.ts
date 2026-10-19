/**
 * Language vocabulary and JSON shapes.
 *
 * Every value that reaches the client is lossless JSON: expressions are JSON
 * data (`["add",["ref","a"],1]`), never functions or source text. That is the
 * whole reason the compiled program can be persisted in the session log and
 * replayed without executing anything the client cannot verify.
 * @module dsh-intelligent-ui/lang/types
 */

/** A lossless JSON value. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/**
 * An operand slot: a nested expression, or a number or boolean written in place.
 *
 * Strings are deliberately NOT operands: a bare name in that position would be a
 * reference the validator could not check. String literals are written
 * `["lit","text"]`, which keeps every string in an expression explicit.
 */
export type ExprOperand = ExprNode | number | boolean

/**
 * Closed expression union. There is no member access, no function value, and
 * no dynamic evaluation: the operator set IS the sandbox. A function call names
 * an entry of the fixed table in `math.ts`; a calculus operator binds one
 * variable name, visible only inside its body (the second element).
 */
export type ExprNode =
  | ['lit', string | number | boolean]
  | ['ref', string]
  | ['num', number]
  | ['const', string]
  | ['neg', ExprOperand]
  | ['add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow', ExprOperand, ExprOperand]
  | ['min' | 'max', ...ExprOperand[]]
  | ['lt' | 'gt' | 'le' | 'ge' | 'eq' | 'ne', ExprOperand, ExprOperand]
  | ['and' | 'or', ...ExprOperand[]]
  | ['not', ExprOperand]
  | ['if', ExprOperand, ExprOperand, ExprOperand]
  | ['pick', ExprOperand, ...ExprOperand[]]
  | ['abs' | 'floor' | 'ceil', ExprOperand]
  | ['round', ExprOperand, number]
  | ['fn', string, ...ExprOperand[]]
  | ['integral' | 'sum' | 'prod' | 'solve', string, ExprOperand, ExprOperand, ExprOperand]
  | ['deriv', string, ExprOperand, ExprOperand, ExprOperand?]
  | ['limit', string, ExprOperand, ExprOperand, number?]
  | ['taylor', string, ExprOperand, ExprOperand, ExprOperand, ExprOperand]
  | ['concat', ...(ExprOperand | string)[]]
  | ['fmtNum', ExprOperand, number?]

/** Calculus operators: `[operator, variable, body, …bounds]`. */
export const BINDING_OPERATORS: ReadonlySet<string> = new Set(['integral', 'deriv', 'limit', 'sum', 'prod', 'solve', 'taylor'])

/** Every operator the evaluator accepts, as a lookup for structural validation. */
export const EXPR_OPERATORS: ReadonlySet<string> = new Set([
  'lit', 'ref', 'num', 'const', 'neg',
  'add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max',
  'lt', 'gt', 'le', 'ge', 'eq', 'ne',
  'and', 'or', 'not', 'if', 'pick',
  'abs', 'floor', 'ceil', 'round', 'fn',
  'integral', 'deriv', 'limit', 'sum', 'prod', 'solve', 'taylor',
  'concat', 'fmtNum',
])

/** Operators whose result is always a number, so `concat` may receive them. */
export const NUMERIC_OPERATORS: ReadonlySet<string> = new Set([
  'num', 'const', 'neg', 'add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max',
  'abs', 'floor', 'ceil', 'round', 'fn', ...BINDING_OPERATORS,
])

/** How a declared piece of state is seeded, and which control should edit it. */
export type StateKind = 'number' | 'string' | 'boolean' | 'select'

/** One declared interactive value. `key` is stable across recompiles. */
export interface StateDeclaration {
  key: string
  kind: StateKind
  init: JsonValue
  /** Present only for `number`. */
  min?: number
  max?: number
  step?: number
  /** Present only for `select`. */
  options?: string[]
}

/** One derived value, recomputed from state whenever an input changes. */
export interface CalcDeclaration {
  key: string
  expr: ExprNode
}

/** How a component edits a state key. Controls never carry callbacks. */
export interface UIBinding {
  /** State key this control reads and writes. */
  key: string
  kind: StateKind
}

/** One node of the flat component list. */
export interface UINode {
  id: string
  type: string
  /** `null` for a root. Containers render their children in array order. */
  parent: string | null
  /**
   * Validated props, keyed by prop name. A value is a literal, a hoisted text
   * template, or an {@link ExprNode} at the prop positions the catalog marks as
   * expressions.
   */
  props: Record<string, JsonValue>
  bind?: UIBinding
}

/** Interpolated text: literal segments and expression segments, evaluated in order. */
export type TextTemplate = Array<{ text: string } | { expr: ExprNode }>

/**
 * One compile-time finding. `repair` is written for the model: it states the
 * action that removes the diagnostic, because the whole point of returning
 * diagnostics in the tool result is that the next step can fix the program.
 */
export interface Diagnostic {
  code: DiagnosticCode
  /** 1-based line of the model's source when the source is line-addressable. */
  line?: number
  path?: string
  message: string
  repair: string
}

/** Diagnostic vocabulary. */
export type DiagnosticCode =
  | 'unknown_component'
  | 'unknown_prop'
  | 'invalid_literal'
  | 'invalid_expression'
  | 'duplicate_id'
  | 'missing_root'
  | 'orphan_node'
  | 'limit_exceeded'
  | 'unterminated_line'
  | 'unparseable'

/** The compiled program: persisted as `tool/result` presentation metadata. */
export interface UIProgram {
  /** The API version the program was compiled for; see `API_VERSION` in identity.ts. */
  version: number
  /** Digest of the catalog's semantics, for telling builds apart in diagnostics. */
  catalogHash: string
  state: StateDeclaration[]
  calc: CalcDeclaration[]
  nodes: UINode[]
  /** Static text hoisted out of the node list, indexed by string key. */
  constants: Record<string, JsonValue>
  /** Plain-text stand-in for any consumer that cannot render `nodes`. Never empty. */
  fallback: string
  diagnostics: Diagnostic[]
  /** Present only when the source exceeded a bound and content was dropped. */
  truncated?: { droppedNodes: number; droppedLines: number }
}

/** Model-facing tool arguments. */
export interface UIArgs {
  source: string
  title?: string
}
