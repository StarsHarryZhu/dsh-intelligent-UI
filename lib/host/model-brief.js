/**
 * The model-facing contract: everything the tool description must state.
 *
 * Derived from the catalog so the description cannot describe a component the
 * compiler would reject. The text is deliberately concrete — the model was never
 * trained on this language, so the grammar, the examples, and the exact repair
 * text carry the success rate.
 * @module dsh-intelligent-ui/host/model-brief
 */
import { CATALOG, SIZES, TONES } from "../lang/catalog.js";
import { MAX_DERIVATIVE_ORDER, MAX_SERIES_TERMS } from "../lang/expr.js";
import { MAX_SPACE, LIMITS } from "../lang/limits.js";
import { MATH_CONSTANTS, MATH_FUNCTIONS } from "../lang/math.js";
import { MAX_SERIES_ORDER } from "../lang/series.js";
/** Worked example: an estimate the reader adjusts. Also pinned by the tests, so it must compile. */
export const ESTIMATE_EXAMPLE = [
    '@state seats = 8 min=1 max=50',
    '@state plan = "Pro" options=Basic|Pro|Team',
    '@calc rate = plan == "Team" ? 22 : plan == "Pro" ? 29 : 12',
    '@calc monthly = seats * rate',
    'card "Team plan"',
    '  slider "Seats" bind=seats',
    '  select "Plan" bind=plan',
    '  metric "Monthly cost" value=monthly unit=USD',
    '  text "{seats} seats on {plan} cost {monthly} USD a month."',
].join('\n');
/** Worked example: a comparison. */
export const COMPARISON_EXAMPLE = [
    'card "Fares to Boston"',
    '  table columns=["Operator","Price","Time"] rows=[["Amtrak","$89","3h 40m"],["Bus","$29","4h 30m"]]',
    '  callout "Prices checked today; they change daily."',
].join('\n');
/** Worked example: a question answered with one click. */
export const QUIZ_EXAMPLE = [
    'card "Question 1"',
    '  text "15 of 500 items are sampled without replacement. Which distribution models the number of defects?"',
    '  col gap=1',
    '    button "A. Binomial" prompt="A"',
    '    button "B. Hypergeometric" prompt="B"',
    '    button "C. Poisson" prompt="C"',
].join('\n');
/** Worked example: a calculus card the reader explores. */
export const CALCULUS_EXAMPLE = [
    '@state a = 1 min=0 max=3 step=0.1',
    'card "Area under y = x²"',
    '  slider "Upper limit a" bind=a',
    '  formula "integral(x^2, x, 0, a)" label="Area"',
    '  plot fn="x^2" from=-0.5 to=3 shadeFrom=0 shadeTo=a mark=a tangent=true',
    '  metric "Exact value a³/3" value=a^3/3 digits=6',
].join('\n');
/** Worked example: a process the reader plays, steps through, or scrubs. */
export const ANIMATION_EXAMPLE = [
    '@state frame = 1 min=1 max=8 step=1',
    '@calc line = pick(frame, 1, 2, 3, 2, 3, 2, 3, 4)',
    '@calc i = pick(frame, 0, 1, 1, 2, 2, 3, 3, 3)',
    '@calc total = pick(frame, 0, 0, 1, 1, 3, 3, 6, 6)',
    'card "Summing 1 to 3, line by line"',
    '  code lang=python current=line numbers=true """',
    '    total = 0',
    '    for i in range(1, 4):',
    '        total += i',
    '    print(total)',
    '  """',
    '  keys items=["i: {i}", "total: {total}"]',
    '  player "Step" bind=frame unit="/ 8"',
].join('\n');
/** The math vocabulary, derived from the function table. */
const MATH_LINES = [
    `Math works in every expression: ^ (power), n! (factorial), implicit products such as 2x or 3(x + 1), the constants ${Object.keys(MATH_CONSTANTS).join(' ')}, and the functions ${Object.keys(MATH_FUNCTIONS).join(' ')}; trigonometry is in radians.`,
    `Calculus names its variable in the second argument, and that variable exists only inside the first: integral(f, x, a, b) (a or b may be inf or -inf), deriv(f, x, at[, n]) (n up to ${MAX_DERIVATIVE_ORDER}), limit(f, x, at[, 1|-1]) (at may be inf; 1 or -1 picks a side), sum(f, k, from, to) and prod(f, k, from, to) (whole numbers, at most ${MAX_SERIES_TERMS} terms), solve(f = g, x, lo, hi) (a root inside [lo, hi]), taylor(f, x, center, n, at) (degree n up to ${MAX_SERIES_ORDER}, evaluated at at).`,
    'Results are computed in the browser to about ten significant digits; a value that cannot be computed reliably (a divergent limit, an equation without a root in its interval) shows "—", never a guess. The result you receive lists the computed values, so quote those numbers in your reply.',
];
/** What the model must know before writing a program. */
export const UI_TOOL_DESCRIPTION = [
    'Show an interactive card in the chat instead of describing data in prose: an estimate the reader adjusts with sliders or inputs, a comparison table, a small chart, a proportion, a short form, a question with answer buttons, or a process the reader plays step by step. Use plain text for a short factual answer or a single number.',
    '',
    'Put the program in `source` (DIL, below); `title` optionally labels the card. Controls recompute the card in the browser and send you nothing. A button sends its `prompt` as the reader\'s next message. Reply in prose as usual; the card is shown with your reply. If the result lists problems, fix them and call ui_render again in the same turn.',
    '',
    'DIL: one statement per line. Indent a component two spaces to put it inside the container above it. Comments start with //.',
    '  @state <name> = <initial> [min=] [max=] [step=] [options=a|b|c]    a number, "text", true/false, or a choice when options= is given',
    '  @calc <name> = <expression>    + - * / ^ % ( ), < <= > >= == !=, && || !, c ? a : b, min max abs floor ceil round(x, digits), pick(i, a, b, …) (the i-th option, counting from 1), and the math below; text compares as plan == "Pro"',
    '  <component> ["text"] [prop=value …]    the quoted text fills the component\'s main text (marked "…" below)',
    '  <component> … """    the lines below, up to a line of only """, are its main text, kept as written',
    'Values: numbers, true/false, "quoted text", JSON lists such as ["a","b"] or [["row","cell"]], and a name or expression wherever a prop takes expr. Quote an expression that contains spaces: value="mins / 60". Any quoted text, list item, or table cell may embed {expression}, for example "Total: {monthly} USD".',
    `padding and gap are whole steps of 4px from 0 to ${MAX_SPACE}. tone: ${TONES.join(', ')}. size: ${SIZES.join(', ')}. Use tones and sizes, never colours or pixels.`,
    `Limits: ${LIMITS.maxNodes} components, depth ${LIMITS.maxDepth}, ${LIMITS.maxState} state and calc names, ${LIMITS.maxTableRows} table rows, ${LIMITS.maxSourceBytes} characters.`,
    '',
    ...MATH_LINES,
    '',
    'Components:',
    ...CATALOG.map(describeComponent),
    '',
    'Animation (code running, an algorithm, a motion): one frame state driven by player (drawn at the bottom of its card); derive each frame\'s figures from it, with pick(frame, …) for per-frame values. current= on code, steps, list, table, or diagram highlights that 1-based line or item. Playing sends you nothing.',
    '',
    'Example — an adjustable estimate:',
    indent(ESTIMATE_EXAMPLE),
    '',
    'Example — a comparison:',
    indent(COMPARISON_EXAMPLE),
    '',
    'Example — a question answered by clicking (never show the answer in the card):',
    indent(QUIZ_EXAMPLE),
    '',
    'Example — calculus the reader explores:',
    indent(CALCULUS_EXAMPLE),
    '',
    'Example — code the reader plays line by line:',
    indent(ANIMATION_EXAMPLE),
    '',
    'A JSON object {"states":[…],"calcs":[…],"nodes":[{"type":"card","children":[…]}]} is also accepted in `source`.',
].join('\n');
/** One catalog line: the component, its main text, its props, and its purpose. */
function describeComponent(descriptor) {
    const primary = descriptor.primary === undefined ? '' : ` "${descriptor.primary}…"`;
    const props = Object.entries(descriptor.props)
        .filter(([name]) => name !== descriptor.primary)
        .map(([name, spec]) => `${name}${spec.required === true ? '' : '?'}=${hint(spec)}`);
    const children = descriptor.container ? ' Holds indented components.' : '';
    return `  ${descriptor.type}${primary}${props.length === 0 ? '' : ` ${props.join(' ')}`} — ${descriptor.description}${children}`;
}
/** A compact value hint for one prop. */
function hint(spec) {
    switch (spec.kind) {
        case 'expr': return 'expr';
        case 'text': return '"…"';
        case 'string': return spec.enum !== undefined ? spec.enum.join('|') : spec.format === 'url' ? '"https://…"' : spec.format === 'image' ? '"data:image/…"' : '"…"';
        case 'number': return spec.min !== undefined && spec.max !== undefined ? `${spec.min}..${spec.max}` : 'n';
        case 'space': return `0..${MAX_SPACE}`;
        case 'tone': return 'tone';
        case 'size': return 'size';
        case 'rows': return '[["…"]]';
        case 'series': return '[n|"expr"]';
        case 'items': return '["…"]';
        case 'options': return '["…"]';
        case 'bind': return `<${spec.state === 'string' ? 'text' : spec.state === 'select' ? 'choice' : spec.state === 'boolean' ? 'true/false' : 'number'} state>`;
        case 'fns': return '"f(x)"|["f(x)",…]';
        case 'math': return '"expression"';
        case 'variable': return 'name';
        case 'edges': return '["a -> b: label"]';
        case 'code': return '"""…"""';
    }
}
/** Indent a block by two spaces. */
function indent(block) {
    return block.split('\n').map(line => `  ${line}`).join('\n');
}
/** Short reminder appended to a failed result so a repaired call keeps the contract in view. */
export const REPAIR_HINT = 'Fix these and call ui_render again with the corrected source.';
