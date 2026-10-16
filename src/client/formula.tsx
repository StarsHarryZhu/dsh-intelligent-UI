/**
 * Typeset formulas: an expression tree drawn as mathematics, followed by its
 * live value.
 *
 * React 18 creates `<math>` children in the HTML namespace, so MathML cannot be
 * used; the layout is this plugin's own spans and CSS instead — stacked
 * fractions, radicals with a vinculum, scripts, big operators with limits, and
 * stretched brackets around tall content. Everything is drawn from the closed
 * expression union, so a formula can show nothing an expression cannot say, and
 * the accessible name is the plain-text formula.
 * @module dsh-intelligent-ui/client/formula
 */

import { Fragment, type ReactNode } from 'react'
import { SIZES } from '../lang/catalog.ts'
import { evalExpr } from '../lang/expr.ts'
import { formatSignificant } from '../lang/math.ts'
import { printExpr } from '../lang/print.ts'
import type { RenderScope } from './components.tsx'
import type { NodeRow } from './program.ts'

/** Binding strength of each drawn form, as in `lang/print.ts`. */
const LEVEL = { ternary: 1, or: 2, and: 3, equality: 4, comparison: 5, sum: 6, product: 7, unary: 8, power: 9, postfix: 10, atom: 11 } as const

/** Greek letter names an identifier may use. */
const GREEK: Readonly<Record<string, string>> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', rho: 'ρ', sigma: 'σ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}

/** Constant glyphs. */
const CONSTANTS: Readonly<Record<string, string>> = { pi: 'π', e: 'e', tau: 'τ', inf: '∞' }

/** Comparison and logic glyphs. */
const SYMBOLS: Readonly<Record<string, readonly [string, number]>> = {
  lt: ['<', LEVEL.comparison], gt: ['>', LEVEL.comparison], le: ['≤', LEVEL.comparison], ge: ['≥', LEVEL.comparison],
  eq: ['=', LEVEL.equality], ne: ['≠', LEVEL.equality],
}

/** Deepest tree drawn; a deeper subtree is drawn as its plain text. */
const MAX_DRAW_DEPTH = 24

/**
 * Draw one formula node.
 * @param node - the formula node.
 * @param scope - values and helpers.
 * @returns the formula row.
 */
export function renderFormula(node: NodeRow, scope: RenderScope): ReactNode {
  const expr = node.props.expr
  const digits = typeof node.props.digits === 'number' && Number.isFinite(node.props.digits) ? node.props.digits : 6
  const produced = evalExpr(expr, key => scope.values.get(key))
  // An equation or a comparison is a statement, not a quantity: it gets no value.
  const result = typeof produced === 'number' ? formatSignificant(produced, digits) : typeof produced === 'symbol' ? '—' : undefined
  const label = node.props.label === undefined ? undefined : scope.text(node.props.label)
  const size = typeof node.props.size === 'string' && (SIZES as readonly string[]).includes(node.props.size) ? node.props.size : 'md'
  const spoken = `${printExpr(expr)}${result === undefined ? '' : ` = ${result}`}`
  return (
    <div className="dsh-iui-formula" data-size={size}>
      {label === undefined || label === '' ? null : <span className="dsh-iui-formula-label">{label}</span>}
      <span className="dsh-iui-math" role="math" aria-label={spoken}>
        {draw(expr, 0, false).element}
        {result === undefined ? null : (
          <>
            <Operator symbol="=" />
            <span className="dsh-iui-math-result">{result}</span>
          </>
        )}
      </span>
    </div>
  )
}

/** One drawn subtree: its element, how tightly it binds, and whether it is taller than a line. */
interface Drawn {
  element: ReactNode
  level: number
  tall: boolean
}

/**
 * Draw one subtree.
 * @param node - expression tree.
 * @param depth - nesting, bounding a malformed persisted tree.
 * @param script - inside an exponent or a limit, where fractions stay inline.
 */
function draw(node: unknown, depth: number, script: boolean): Drawn {
  if (depth > MAX_DRAW_DEPTH) return atom(<span className="dsh-iui-math-word">{printExpr(node)}</span>)
  if (typeof node === 'number') return numberAtom(node)
  if (typeof node === 'boolean') return atom(<span className="dsh-iui-math-word">{String(node)}</span>)
  if (!Array.isArray(node) || typeof node[0] !== 'string') return atom(<span className="dsh-iui-math-word">?</span>)
  const [operator, ...args] = node as [string, ...unknown[]]
  const sub = (value: unknown, inScript = script): Drawn => draw(value, depth + 1, inScript)
  switch (operator) {
    case 'lit':
    case 'num':
      if (typeof args[0] === 'number') return numberAtom(args[0])
      return atom(<span className="dsh-iui-math-text">{typeof args[0] === 'string' ? `“${args[0]}”` : String(args[0])}</span>)
    case 'ref':
      return atom(identifier(String(args[0])))
    case 'const': {
      const name = String(args[0])
      const glyph = Object.hasOwn(CONSTANTS, name) ? CONSTANTS[name] as string : name
      return atom(name === 'e' ? <i className="dsh-iui-math-var">e</i> : <span className="dsh-iui-math-glyph">{glyph}</span>)
    }
    case 'neg': {
      const inner = sub(args[0])
      return { element: row([<Operator key="o" symbol="−" tight />, bracket(inner, LEVEL.unary)]), level: LEVEL.unary, tall: inner.tall }
    }
    case 'not': {
      const inner = sub(args[0])
      return { element: row([<Operator key="o" symbol="¬" tight />, bracket(inner, LEVEL.unary)]), level: LEVEL.unary, tall: inner.tall }
    }
    case 'add':
    case 'sub': {
      const left = sub(args[0])
      const right = sub(args[1])
      return {
        element: row([bracket(left, LEVEL.sum), <Operator key="o" symbol={operator === 'add' ? '+' : '−'} />, bracket(right, LEVEL.sum + 1)]),
        level: LEVEL.sum,
        tall: left.tall || right.tall,
      }
    }
    case 'mul': {
      const left = sub(args[0])
      const right = sub(args[1])
      const parts = [bracket(left, LEVEL.product)]
      if (!juxtaposes(args[0], args[1])) parts.push(<Operator key="o" symbol="·" />)
      parts.push(bracket(right, LEVEL.product + 1))
      return { element: row(parts), level: LEVEL.product, tall: left.tall || right.tall }
    }
    case 'div': {
      const top = sub(args[0])
      const bottom = sub(args[1])
      if (script) {
        return { element: row([bracket(top, LEVEL.product), <Operator key="o" symbol="/" tight />, bracket(bottom, LEVEL.product + 1)]), level: LEVEL.product, tall: false }
      }
      return { element: fraction(top.element, bottom.element), level: LEVEL.atom, tall: true }
    }
    case 'mod': {
      const left = sub(args[0])
      const right = sub(args[1])
      return { element: row([bracket(left, LEVEL.product), <Operator key="o" symbol="mod" word />, bracket(right, LEVEL.product + 1)]), level: LEVEL.product, tall: left.tall || right.tall }
    }
    case 'pow': {
      const base = sub(args[0])
      const exponent = sub(args[1], true)
      return { element: scripted(bracket(base, LEVEL.power + 1), exponent.element, undefined), level: LEVEL.power, tall: base.tall }
    }
    case 'and':
    case 'or': {
      const level = operator === 'and' ? LEVEL.and : LEVEL.or
      const parts = args.map(part => sub(part))
      const elements: ReactNode[] = []
      parts.forEach((part, index) => {
        if (index > 0) elements.push(<Operator key={`o${index}`} symbol={operator === 'and' ? '∧' : '∨'} />)
        elements.push(bracket(part, level + 1))
      })
      return { element: row(elements), level, tall: parts.some(part => part.tall) }
    }
    case 'abs': return delimited('|', '|', sub(args[0]))
    case 'floor': return delimited('⌊', '⌋', sub(args[0]))
    case 'ceil': return delimited('⌈', '⌉', sub(args[0]))
    case 'fn': return functionCall(String(args[0]), args.slice(1), sub)
    case 'integral': return integral(args, sub)
    case 'sum':
    case 'prod': return bigOperator(operator === 'sum' ? '∑' : '∏', args, sub)
    case 'limit': return limitOf(args, sub)
    case 'deriv': return derivative(args, sub)
    default: {
      const symbol = Object.hasOwn(SYMBOLS, operator) ? SYMBOLS[operator] : undefined
      if (symbol !== undefined && args.length === 2) {
        const left = sub(args[0])
        const right = sub(args[1])
        return { element: row([bracket(left, symbol[1]), <Operator key="o" symbol={symbol[0]} />, bracket(right, symbol[1] + 1)]), level: symbol[1], tall: left.tall || right.tall }
      }
      // round, min, max, if, solve, taylor, fmt, concat: drawn as named calls.
      const name = operator === 'fmtNum' ? 'fmt' : operator
      const shown = BINDS.has(operator) ? [args[1], args[0], ...args.slice(2)] : operator === 'round' && args[1] === 0 ? args.slice(0, 1) : args
      return named(name, shown, sub)
    }
  }
}

/** Calculus operators drawn as calls keep the body first, as they are written. */
const BINDS: ReadonlySet<string> = new Set(['solve', 'taylor'])

/** A named function: special layouts for roots, exp, factorial, binomials, and based logs. */
function functionCall(name: string, args: readonly unknown[], sub: (value: unknown, inScript?: boolean) => Drawn): Drawn {
  switch (name) {
    case 'sqrt': return radical(sub(args[0]), undefined)
    case 'cbrt': return radical(sub(args[0]), '3')
    case 'root': return radical(sub(args[0]), typeof args[1] === 'number' ? String(args[1]) : printExpr(args[1]))
    case 'exp': return { element: scripted(<i className="dsh-iui-math-var">e</i>, sub(args[0], true).element, undefined), level: LEVEL.power, tall: false }
    case 'fact': {
      const inner = sub(args[0])
      return { element: row([bracket(inner, LEVEL.postfix), <span key="b" className="dsh-iui-math-glyph">!</span>]), level: LEVEL.postfix, tall: inner.tall }
    }
    case 'comb': {
      const stack = <span className="dsh-iui-math-binom">{sub(args[0]).element}{sub(args[1]).element}</span>
      return { element: row([<Paren key="l" glyph="(" tall />, <Fragment key="s">{stack}</Fragment>, <Paren key="r" glyph=")" tall />]), level: LEVEL.atom, tall: true }
    }
    case 'log':
      if (args.length === 2) return named('log', [args[0]], sub, sub(args[1], true).element)
      return named('ln', args, sub)
    case 'log10': return named('log', args, sub, <span>10</span>)
    case 'log2': return named('log', args, sub, <span>2</span>)
    default: return named(name, args, sub)
  }
}

/** `name(args)` with an optional subscript on the name. */
function named(name: string, args: readonly unknown[], sub: (value: unknown, inScript?: boolean) => Drawn, subscript?: ReactNode): Drawn {
  const parts = args.map(part => sub(part))
  const tall = parts.some(part => part.tall)
  const inner: ReactNode[] = []
  parts.forEach((part, index) => {
    if (index > 0) inner.push(<span key={`c${index}`} className="dsh-iui-math-comma">,</span>)
    inner.push(<Fragment key={`a${index}`}>{part.element}</Fragment>)
  })
  const head = <span className="dsh-iui-math-fn">{name}</span>
  return {
    element: row([
      subscript === undefined ? <Fragment key="n">{head}</Fragment> : <Fragment key="n">{scripted(head, undefined, subscript)}</Fragment>,
      <Paren key="l" glyph="(" tall={tall} />,
      <span key="a" className="dsh-iui-math-row">{inner}</span>,
      <Paren key="r" glyph=")" tall={tall} />,
    ]),
    level: LEVEL.atom,
    tall,
  }
}

/** ∫ₐᵇ f dx */
function integral(args: readonly unknown[], sub: (value: unknown, inScript?: boolean) => Drawn): Drawn {
  const body = sub(args[1])
  const element = row([
    <span key="s" className="dsh-iui-math-integral">
      <span className="dsh-iui-math-bigglyph">∫</span>
      <span className="dsh-iui-math-limits-side">
        <span className="dsh-iui-math-script">{sub(args[3], true).element}</span>
        <span className="dsh-iui-math-script">{sub(args[2], true).element}</span>
      </span>
    </span>,
    bracket(body, LEVEL.product),
    <span key="d" className="dsh-iui-math-differential"><span className="dsh-iui-math-fn">d</span>{identifier(String(args[0]))}</span>,
  ])
  return { element, level: LEVEL.sum, tall: true }
}

/** ∑ or ∏ with k = from under it and to over it. */
function bigOperator(glyph: string, args: readonly unknown[], sub: (value: unknown, inScript?: boolean) => Drawn): Drawn {
  const body = sub(args[1])
  const element = row([
    <span key="s" className="dsh-iui-math-stack">
      <span className="dsh-iui-math-script">{sub(args[3], true).element}</span>
      <span className="dsh-iui-math-bigglyph">{glyph}</span>
      <span className="dsh-iui-math-script">{row([<Fragment key="v">{identifier(String(args[0]))}</Fragment>, <Operator key="o" symbol="=" tight />, <Fragment key="f">{sub(args[2], true).element}</Fragment>])}</span>
    </span>,
    bracket(body, LEVEL.product),
  ])
  return { element, level: LEVEL.sum, tall: true }
}

/** lim with x → a under it. */
function limitOf(args: readonly unknown[], sub: (value: unknown, inScript?: boolean) => Drawn): Drawn {
  const body = sub(args[1])
  const side = args[3] === 1 ? '+' : args[3] === -1 ? '−' : undefined
  const target = sub(args[2], true).element
  const approach = row([
    <Fragment key="v">{identifier(String(args[0]))}</Fragment>,
    <Operator key="o" symbol="→" tight />,
    <Fragment key="t">{side === undefined ? target : scripted(target, <span>{side}</span>, undefined)}</Fragment>,
  ])
  const element = row([
    <span key="s" className="dsh-iui-math-stack">
      <span className="dsh-iui-math-fn">lim</span>
      <span className="dsh-iui-math-script">{approach}</span>
    </span>,
    bracket(body, LEVEL.product),
  ])
  return { element, level: LEVEL.sum, tall: true }
}

/** dⁿ/dxⁿ (f) evaluated at a, drawn with the evaluation bar. */
function derivative(args: readonly unknown[], sub: (value: unknown, inScript?: boolean) => Drawn): Drawn {
  const variable = identifier(String(args[0]))
  const order = args[3] === undefined ? undefined : sub(args[3], true).element
  const top = order === undefined ? <span className="dsh-iui-math-fn">d</span> : scripted(<span className="dsh-iui-math-fn">d</span>, order, undefined)
  const bottom = <span className="dsh-iui-math-row"><span className="dsh-iui-math-fn">d</span>{order === undefined ? variable : scripted(variable, order, undefined)}</span>
  const body = sub(args[1])
  const element = row([
    <Fragment key="f">{fraction(top, bottom)}</Fragment>,
    <Paren key="l" glyph="(" tall={body.tall} />,
    <Fragment key="b">{body.element}</Fragment>,
    <Paren key="r" glyph=")" tall={body.tall} />,
    <span key="e" className="dsh-iui-math-evaluated">
      <span className="dsh-iui-math-script">{row([<Fragment key="v">{identifier(String(args[0]))}</Fragment>, <Operator key="o" symbol="=" tight />, <Fragment key="a">{sub(args[2], true).element}</Fragment>])}</span>
    </span>,
  ])
  return { element, level: LEVEL.atom, tall: true }
}

/** √ with a vinculum, and an optional index. */
function radical(inner: Drawn, index: string | undefined): Drawn {
  return {
    element: (
      <span className="dsh-iui-math-radical">
        {index === undefined ? null : <span className="dsh-iui-math-index">{index}</span>}
        <span className="dsh-iui-math-radix">√</span>
        <span className="dsh-iui-math-radicand">{inner.element}</span>
      </span>
    ),
    level: LEVEL.atom,
    tall: inner.tall,
  }
}

/** A stacked fraction. */
function fraction(top: ReactNode, bottom: ReactNode): ReactNode {
  return (
    <span className="dsh-iui-math-frac">
      <span className="dsh-iui-math-numerator">{top}</span>
      <span className="dsh-iui-math-denominator">{bottom}</span>
    </span>
  )
}

/** A base with a superscript and/or subscript. */
function scripted(base: ReactNode, sup: ReactNode | undefined, below: ReactNode | undefined): ReactNode {
  return (
    <span className="dsh-iui-math-scripted">
      {base}
      {sup === undefined ? null : <sup className="dsh-iui-math-sup">{sup}</sup>}
      {below === undefined ? null : <sub className="dsh-iui-math-sub">{below}</sub>}
    </span>
  )
}

/** Paired delimiters such as |x| and ⌊x⌋. */
function delimited(open: string, close: string, inner: Drawn): Drawn {
  return {
    element: row([<Paren key="l" glyph={open} tall={inner.tall} />, <Fragment key="i">{inner.element}</Fragment>, <Paren key="r" glyph={close} tall={inner.tall} />]),
    level: LEVEL.atom,
    tall: inner.tall,
  }
}

/** Bracket a subtree that binds looser than its position needs. */
function bracket(drawn: Drawn, needed: number): ReactNode {
  if (drawn.level >= needed) return drawn.element
  return (
    <span className="dsh-iui-math-row">
      <Paren glyph="(" tall={drawn.tall} />
      {drawn.element}
      <Paren glyph=")" tall={drawn.tall} />
    </span>
  )
}

/** Children laid out on one baseline, keyed by position. */
function row(parts: readonly ReactNode[]): ReactNode {
  return <span className="dsh-iui-math-row">{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</span>
}

/** An identifier: Greek names become letters, `x_1` gets its subscript, single letters are italic. */
function identifier(name: string): ReactNode {
  const split = name.indexOf('_')
  const base = split > 0 ? name.slice(0, split) : name
  const index = split > 0 ? name.slice(split + 1) : ''
  const letter = Object.hasOwn(GREEK, base) ? GREEK[base] as string : base
  const glyph = [...letter].length === 1
    ? <i className="dsh-iui-math-var">{letter}</i>
    : <span className="dsh-iui-math-word">{letter}</span>
  return index === '' ? glyph : scripted(glyph, undefined, <span>{Object.hasOwn(GREEK, index) ? GREEK[index] : index}</span>)
}

function atom(element: ReactNode): Drawn {
  return { element, level: LEVEL.atom, tall: false }
}

/** A number, with a true minus sign; negative numbers bind like a unary minus. */
function numberAtom(value: number): Drawn {
  const text = Number.isFinite(value) ? String(Math.abs(value)) : '?'
  const element = <span className="dsh-iui-math-num">{value < 0 ? `−${text}` : text}</span>
  return { element, level: value < 0 ? LEVEL.unary : LEVEL.atom, tall: false }
}

/**
 * Whether a product reads without a dot: a number before a name, a constant, a
 * call, or a power (2x, 3π, 2 sin x, 4x²).
 */
function juxtaposes(left: unknown, right: unknown): boolean {
  const leftIsNumber = typeof left === 'number' || (Array.isArray(left) && (left[0] === 'lit' || left[0] === 'num') && typeof left[1] === 'number')
  if (!leftIsNumber || (typeof left === 'number' && left < 0)) return false
  if (!Array.isArray(right)) return false
  const head = right[0]
  if (head === 'ref' || head === 'const' || head === 'fn' || head === 'integral' || head === 'sum' || head === 'prod') return true
  return head === 'pow' && Array.isArray(right[1]) && (right[1][0] === 'ref' || right[1][0] === 'const')
}

/** A spaced operator glyph. */
function Operator(props: { symbol: string; tight?: boolean; word?: boolean }): ReactNode {
  return (
    <span className="dsh-iui-math-op" data-tight={props.tight === true ? '' : undefined} data-word={props.word === true ? '' : undefined}>
      {props.symbol}
    </span>
  )
}

/** A bracket, stretched next to tall content. */
function Paren(props: { glyph: string; tall?: boolean }): ReactNode {
  return <span className="dsh-iui-math-paren" data-tall={props.tall === true ? '' : undefined}>{props.glyph}</span>
}
