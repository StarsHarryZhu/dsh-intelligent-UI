/**
 * Exact derivatives by Taylor-mode automatic differentiation.
 *
 * An expression is evaluated over truncated power series instead of numbers:
 * each value is the list of Taylor coefficients c_k = f⁽ᵏ⁾(a)/k! at the point
 * of interest, and every operator has an exact recurrence on those lists. The
 * k-th derivative is then k!·c_k, correct to rounding for any order, with none of
 * the step-size trade-offs of finite differences.
 *
 * The walk covers the arithmetic operators and the smooth functions of the
 * table. Anything it cannot follow — an integral or a limit whose bounds move
 * with the variable, a gamma function, a jump of `floor` — reports
 * {@link UNSUPPORTED}, and the caller decides whether a numerical fallback is
 * acceptable. A non-differentiable point (|x| at 0) reports `undefined`.
 * @module dsh-intelligent-ui/lang/series
 */
import { erf } from "./math.js";
/** Returned when the walk meets an operator it cannot differentiate exactly. */
export const UNSUPPORTED = Symbol('dsh-intelligent-ui.series-unsupported');
/** Highest order a series may carry. */
export const MAX_SERIES_ORDER = 30;
/** Operators that bind a variable: `[op, name, body, …bounds]`. */
const BINDERS = new Set(['integral', 'deriv', 'limit', 'sum', 'prod', 'solve', 'taylor']);
/**
 * Taylor coefficients of `body` in `variable` around `at`.
 * @param body - the expression.
 * @param variable - the name being varied.
 * @param at - the expansion point.
 * @param order - highest coefficient wanted, at most {@link MAX_SERIES_ORDER}.
 * @param bindings - values of enclosing bound variables.
 * @param host - plain evaluation and the budget.
 * @returns the coefficients, undefined at a non-differentiable point, or {@link UNSUPPORTED}.
 */
export function taylorCoefficients(body, variable, at, order, bindings, host) {
    if (!Number.isInteger(order) || order < 0 || order > MAX_SERIES_ORDER || !Number.isFinite(at))
        return undefined;
    const size = order + 1;
    const depends = new WeakMap();
    const failure = { unsupported: false };
    const result = walk(body, bindings);
    if (failure.unsupported)
        return UNSUPPORTED;
    return result;
    function walk(node, scope) {
        if (failure.unsupported || !host.charge(size))
            return undefined;
        if (!dependsOn(node, variable))
            return constantOf(node, scope);
        if (!Array.isArray(node) || typeof node[0] !== 'string')
            return undefined;
        const operator = node[0];
        const args = node.slice(1);
        switch (operator) {
            case 'ref':
                // Only the variable itself reaches here: every other name is constant.
                return variableSeries();
            case 'neg': return map(walk(args[0], scope), value => -value);
            case 'add': return combine(walk(args[0], scope), walk(args[1], scope), (a, b) => a + b);
            case 'sub': return combine(walk(args[0], scope), walk(args[1], scope), (a, b) => a - b);
            case 'mul': return both(walk(args[0], scope), walk(args[1], scope), multiply);
            case 'div': return both(walk(args[0], scope), walk(args[1], scope), divide);
            case 'pow': return power(args[0], args[1], scope);
            case 'abs': {
                const inner = walk(args[0], scope);
                if (inner === undefined)
                    return undefined;
                const lead = inner[0];
                if (lead > 0)
                    return inner;
                if (lead < 0)
                    return inner.map(value => -value);
                return isConstant(inner) ? inner : undefined;
            }
            case 'floor': return stepFunction(args[0], scope, Math.floor, value => Number.isInteger(value));
            case 'ceil': return stepFunction(args[0], scope, Math.ceil, value => Number.isInteger(value));
            case 'round': {
                const digits = typeof args[1] === 'number' && Number.isInteger(args[1]) ? Math.max(0, Math.min(6, args[1])) : 0;
                const factor = 10 ** digits;
                return stepFunction(args[0], scope, value => Math.round(value * factor) / factor, value => Number.isInteger(value * factor + 0.5));
            }
            case 'mod': {
                const left = walk(args[0], scope);
                const right = walk(args[1], scope);
                if (left === undefined || right === undefined)
                    return undefined;
                if (!isConstant(right))
                    return unsupported();
                const divisor = right[0];
                const lead = left[0];
                // a mod b moves with a, except where it wraps around.
                if (divisor === 0 || (Number.isInteger(lead / divisor) && !isConstant(left)))
                    return undefined;
                return [lead % divisor, ...left.slice(1)];
            }
            case 'min':
            case 'max': return pick(args.map(part => walk(part, scope)), operator === 'min' ? -1 : 1);
            case 'if': {
                const test = host.plain(args[0], withVariable(scope));
                if (test === undefined)
                    return undefined;
                return walk(truthy(test) ? args[1] : args[2], scope);
            }
            case 'fn': return callFunction(String(args[0]), args.slice(1), scope);
            case 'sum':
            case 'prod': return iterate(operator, args, scope);
            default:
                // Comparisons, logic, and text never produce a number to differentiate;
                // the remaining binders need moving bounds this walk cannot follow.
                return BINDERS.has(operator) ? unsupported() : undefined;
        }
    }
    /** The variable itself: a + 1·h. */
    function variableSeries() {
        const series = zero();
        series[0] = at;
        if (size > 1)
            series[1] = 1;
        return series;
    }
    function withVariable(scope) {
        const next = new Map(scope);
        next.set(variable, at);
        return next;
    }
    function constantOf(node, scope) {
        const value = host.plain(node, scope);
        return typeof value === 'number' && Number.isFinite(value) ? constant(value) : undefined;
    }
    function unsupported() {
        failure.unsupported = true;
        return undefined;
    }
    /**
     * Whether a subtree reads the variable. A binder that rebinds the same name
     * hides it inside its body; its bounds still count.
     */
    function dependsOn(node, name) {
        if (!Array.isArray(node))
            return false;
        const cached = depends.get(node);
        if (cached !== undefined)
            return cached;
        let found = false;
        const operator = node[0];
        if (operator === 'ref')
            found = node[1] === name;
        else if (typeof operator === 'string' && BINDERS.has(operator) && node[1] === name) {
            found = node.slice(3).some(part => dependsOn(part, name));
        }
        else {
            found = node.slice(1).some(part => dependsOn(part, name));
        }
        depends.set(node, found);
        return found;
    }
    function power(base, exponent, scope) {
        const left = walk(base, scope);
        const right = walk(exponent, scope);
        if (left === undefined || right === undefined)
            return undefined;
        if (isConstant(right))
            return powerConstant(left, right[0]);
        // a^b = exp(b · ln a), defined while a stays positive.
        const logarithm = logSeries(left);
        return logarithm === undefined ? undefined : expSeries(multiply(right, logarithm));
    }
    function stepFunction(inner, scope, apply, atJump) {
        const series = walk(inner, scope);
        if (series === undefined)
            return undefined;
        const lead = series[0];
        // Away from a jump the function is locally constant, so every derivative is 0.
        if (atJump(lead) && !isConstant(series))
            return undefined;
        return constant(apply(lead));
    }
    function pick(candidates, direction) {
        let chosen;
        for (const candidate of candidates) {
            if (candidate === undefined)
                return undefined;
            if (chosen === undefined || direction * (candidate[0] - chosen[0]) > 0)
                chosen = candidate;
            else if (candidate[0] === chosen[0] && !candidate.every((value, index) => value === chosen?.[index]))
                return undefined;
        }
        return chosen;
    }
    function iterate(operator, args, scope) {
        const name = args[0];
        if (typeof name !== 'string')
            return undefined;
        if (dependsOn(args[2], variable) || dependsOn(args[3], variable))
            return unsupported();
        const from = host.plain(args[2], scope);
        const to = host.plain(args[3], scope);
        if (typeof from !== 'number' || typeof to !== 'number' || !Number.isInteger(from) || !Number.isInteger(to) || to - from > 10_000) {
            return undefined;
        }
        let total = operator === 'sum' ? zero() : constant(1);
        for (let k = from; k <= to; k += 1) {
            const inner = new Map(scope);
            inner.set(name, k);
            const term = walk(args[1], inner);
            if (term === undefined)
                return undefined;
            total = operator === 'sum' ? total.map((value, index) => value + term[index]) : multiply(total, term);
        }
        return total;
    }
    function callFunction(name, args, scope) {
        const parts = args.map(part => walk(part, scope));
        if (parts.some(part => part === undefined))
            return undefined;
        const [a, b] = parts;
        const x = a;
        switch (name) {
            case 'sqrt': return powerConstant(x, 0.5);
            case 'cbrt': return oddRoot(x, 3);
            case 'root': {
                if (b === undefined || !isConstant(b))
                    return unsupported();
                return oddRoot(x, b[0]);
            }
            case 'exp': return expSeries(x);
            case 'ln': return logSeries(x);
            case 'log': {
                const numerator = logSeries(x);
                if (b === undefined)
                    return numerator;
                const denominator = logSeries(b);
                return numerator === undefined || denominator === undefined ? undefined : divide(numerator, denominator);
            }
            case 'log10': return map(logSeries(x), value => value / Math.LN10);
            case 'log2': return map(logSeries(x), value => value / Math.LN2);
            case 'sin': return sinCos(x, false)[0];
            case 'cos': return sinCos(x, false)[1];
            case 'tan': {
                const [s, c] = sinCos(x, false);
                return divide(s, c);
            }
            case 'sec': return divide(constant(1), sinCos(x, false)[1]);
            case 'csc': return divide(constant(1), sinCos(x, false)[0]);
            case 'cot': {
                const [s, c] = sinCos(x, false);
                return divide(c, s);
            }
            case 'sinh': return sinCos(x, true)[0];
            case 'cosh': return sinCos(x, true)[1];
            case 'tanh': {
                const [s, c] = sinCos(x, true);
                return divide(s, c);
            }
            case 'asin': return inverse(x, Math.asin, Math.abs(x[0]) < 1, () => powerConstant(subtract(constant(1), multiply(x, x)), -0.5));
            case 'acos': return map(inverse(x, Math.asin, Math.abs(x[0]) < 1, () => powerConstant(subtract(constant(1), multiply(x, x)), -0.5)), (value, index) => (index === 0 ? Math.PI / 2 - value : -value));
            case 'atan': return inverse(x, Math.atan, true, () => divide(constant(1), add(constant(1), multiply(x, x))));
            case 'asinh': return inverse(x, Math.asinh, true, () => powerConstant(add(multiply(x, x), constant(1)), -0.5));
            case 'acosh': return inverse(x, Math.acosh, x[0] > 1, () => powerConstant(subtract(multiply(x, x), constant(1)), -0.5));
            case 'atanh': return inverse(x, Math.atanh, Math.abs(x[0]) < 1, () => divide(constant(1), subtract(constant(1), multiply(x, x))));
            case 'erf': return inverse(x, erf, true, () => map(expSeries(multiply(x, x).map(value => -value)), value => value * 2 / Math.sqrt(Math.PI)));
            case 'atan2': {
                const y = x;
                const across = b;
                const radius = add(multiply(across, across), multiply(y, y));
                if (radius[0] === 0)
                    return undefined;
                const rate = divide(subtract(multiply(across, derivative(y)), multiply(y, derivative(across))), radius);
                return rate === undefined ? undefined : integral(rate, Math.atan2(y[0], across[0]));
            }
            case 'hypot': {
                let total = zero();
                for (const part of parts)
                    total = add(total, multiply(part, part));
                return powerConstant(total, 0.5);
            }
            case 'sign': return stepSeries(x, Math.sign, value => value === 0);
            case 'trunc': return stepSeries(x, Math.trunc, value => Number.isInteger(value));
            case 'deg': return map(x, value => value * 180 / Math.PI);
            case 'rad': return map(x, value => value * Math.PI / 180);
            case 'clamp': {
                const low = b;
                const high = parts[2];
                const raised = pick([x, low], 1);
                return raised === undefined ? undefined : pick([raised, high], -1);
            }
            default:
                // gamma, fact, comb, perm, gcd, lcm: no exact recurrence here.
                return unsupported();
        }
    }
    function stepSeries(series, apply, atJump) {
        const lead = series[0];
        if (atJump(lead) && !isConstant(series))
            return undefined;
        return constant(apply(lead));
    }
    /** f(x) where f(x0) is known and f′ = rate(x)·x′: integrate the product. */
    function inverse(x, apply, inDomain, rate) {
        if (!inDomain)
            return undefined;
        const lead = apply(x[0]);
        if (!Number.isFinite(lead))
            return undefined;
        if (isConstant(x))
            return constant(lead);
        const factor = rate();
        if (factor === undefined)
            return undefined;
        return integral(multiply(derivative(x), factor), lead);
    }
    function oddRoot(x, n) {
        if (!Number.isFinite(n) || n === 0)
            return undefined;
        const lead = x[0];
        if (lead < 0) {
            if (!Number.isInteger(n) || Math.abs(n) % 2 !== 1)
                return undefined;
            return map(powerConstant(x.map(value => -value), 1 / n), value => -value);
        }
        return powerConstant(x, 1 / n);
    }
    // ── series arithmetic ──────────────────────────────────────────────────────
    function zero() {
        return new Array(size).fill(0);
    }
    function constant(value) {
        const series = zero();
        series[0] = value;
        return series;
    }
    function isConstant(series) {
        for (let index = 1; index < size; index += 1)
            if (series[index] !== 0)
                return false;
        return true;
    }
    function add(a, b) {
        return a.map((value, index) => value + b[index]);
    }
    function subtract(a, b) {
        return a.map((value, index) => value - b[index]);
    }
    function multiply(a, b) {
        const out = zero();
        for (let k = 0; k < size; k += 1) {
            let sum = 0;
            for (let i = 0; i <= k; i += 1)
                sum += a[i] * b[k - i];
            out[k] = sum;
        }
        return out;
    }
    function divide(a, b) {
        if (b === undefined || b[0] === 0)
            return undefined;
        const out = zero();
        const lead = b[0];
        for (let k = 0; k < size; k += 1) {
            let sum = a[k];
            for (let i = 1; i <= k; i += 1)
                sum -= b[i] * out[k - i];
            out[k] = sum / lead;
        }
        return out;
    }
    /** Coefficients of the derivative series (the last entry is unknown, so 0). */
    function derivative(a) {
        const out = zero();
        for (let k = 0; k + 1 < size; k += 1)
            out[k] = (k + 1) * a[k + 1];
        return out;
    }
    /** Antiderivative with a given constant term. */
    function integral(rate, lead) {
        const out = zero();
        out[0] = lead;
        for (let k = 1; k < size; k += 1)
            out[k] = rate[k - 1] / k;
        return out;
    }
    function expSeries(a) {
        const out = zero();
        out[0] = Math.exp(a[0]);
        if (!Number.isFinite(out[0]))
            return undefined;
        for (let k = 1; k < size; k += 1) {
            let sum = 0;
            for (let j = 1; j <= k; j += 1)
                sum += j * a[j] * out[k - j];
            out[k] = sum / k;
        }
        return out;
    }
    function logSeries(a) {
        const lead = a[0];
        if (!(lead > 0))
            return undefined;
        const out = zero();
        out[0] = Math.log(lead);
        for (let k = 1; k < size; k += 1) {
            let sum = 0;
            for (let j = 1; j < k; j += 1)
                sum += j * out[j] * a[k - j];
            out[k] = (a[k] - sum / k) / lead;
        }
        return out;
    }
    /** a^p for a constant p. */
    function powerConstant(a, p) {
        const lead = a[0];
        if (Number.isInteger(p) && p >= 0 && p <= 64) {
            // Repeated squaring stays exact at a zero base, where the recurrence divides by it.
            let result = constant(1);
            let base = a;
            let remaining = p;
            while (remaining > 0) {
                if (remaining % 2 === 1)
                    result = multiply(result, base);
                base = multiply(base, base);
                remaining = Math.floor(remaining / 2);
            }
            return result;
        }
        if (lead === 0)
            return isConstant(a) ? constant(0 ** p) : undefined;
        if (lead < 0 && !Number.isInteger(p))
            return undefined;
        // a·c′ = p·a′·c  ⇒  c_k = Σ_{j=1..k} (p·j − (k − j)) a_j c_{k−j} / (k·a_0)
        const out = zero();
        out[0] = lead ** p;
        if (!Number.isFinite(out[0]))
            return undefined;
        for (let k = 1; k < size; k += 1) {
            let sum = 0;
            for (let j = 1; j <= k; j += 1)
                sum += (p * j - (k - j)) * a[j] * out[k - j];
            out[k] = sum / (k * lead);
        }
        return out;
    }
    /** sin and cos (or sinh and cosh) of a series, which share one recurrence. */
    function sinCos(a, hyperbolic) {
        const s = zero();
        const c = zero();
        const lead = a[0];
        s[0] = hyperbolic ? Math.sinh(lead) : Math.sin(lead);
        c[0] = hyperbolic ? Math.cosh(lead) : Math.cos(lead);
        for (let k = 1; k < size; k += 1) {
            let sinSum = 0;
            let cosSum = 0;
            for (let j = 1; j <= k; j += 1) {
                const weight = j * a[j];
                sinSum += weight * c[k - j];
                cosSum += weight * s[k - j];
            }
            s[k] = sinSum / k;
            c[k] = (hyperbolic ? cosSum : -cosSum) / k;
        }
        return [s, c];
    }
    function map(series, apply) {
        return series === undefined ? undefined : series.map(apply);
    }
    function combine(a, b, apply) {
        return a === undefined || b === undefined ? undefined : a.map((value, index) => apply(value, b[index]));
    }
    function both(a, b, apply) {
        return a === undefined || b === undefined ? undefined : apply(a, b);
    }
}
/** Truthiness shared with the plain evaluator. */
function truthy(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value !== 0 && !Number.isNaN(value);
    return value.length > 0;
}
