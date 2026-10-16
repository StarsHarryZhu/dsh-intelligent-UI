/**
 * The model-facing contract: everything the tool description must state.
 *
 * Derived from the catalog so the description cannot describe a component the
 * compiler would reject. The text is deliberately concrete — the model was never
 * trained on this language, so the grammar, the examples, and the exact repair
 * text carry the success rate.
 * @module dsh-intelligent-ui/host/model-brief
 */

import { CATALOG, SIZES, TONES, type ComponentDescriptor, type PropSpec } from '../lang/catalog.ts'
import { MAX_SPACE, LIMITS } from '../lang/limits.ts'

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
].join('\n')

/** Worked example: a comparison. */
export const COMPARISON_EXAMPLE = [
  'card "Fares to Boston"',
  '  table columns=["Operator","Price","Time"] rows=[["Amtrak","$89","3h 40m"],["Bus","$29","4h 30m"]]',
  '  callout "Prices checked today; they change daily."',
].join('\n')

/** Worked example: a question answered with one click. */
export const QUIZ_EXAMPLE = [
  'card "Question 1"',
  '  text "15 of 500 items are sampled without replacement. Which distribution models the number of defects?"',
  '  col gap=1',
  '    button "A. Binomial" prompt="A"',
  '    button "B. Hypergeometric" prompt="B"',
  '    button "C. Poisson" prompt="C"',
].join('\n')

/** What the model must know before writing a program. */
export const UI_TOOL_DESCRIPTION = [
  'Show an interactive card in the chat instead of describing data in prose: an estimate the reader adjusts with sliders or inputs, a comparison table, a small chart, a proportion, a short form, or a question with answer buttons. Use plain text for a short factual answer or a single number.',
  '',
  'Put the program in `source` (DIL, below); `title` optionally labels the card. Controls recompute the card in the browser and send you nothing. A button sends its `prompt` as the reader\'s next message, so buttons are for answers and follow-ups. Reply in prose as usual; the card is shown with your reply. If the result lists problems, fix them and call ui_render again in the same turn.',
  '',
  'DIL: one statement per line. Indent a component two spaces to put it inside the container above it. Comments start with //.',
  '  @state <name> = <initial> [min=] [max=] [step=] [options=a|b|c]    a number, "text", true/false, or a choice when options= is given',
  '  @calc <name> = <expression>    + - * / % ( ), < <= > >= == !=, && || !, c ? a : b, min max abs floor ceil round(x, digits); text compares as plan == "Pro"',
  '  <component> ["text"] [prop=value …]    the quoted text fills the component\'s main text (marked "…" below)',
  'Values: numbers, true/false, "quoted text", JSON lists such as ["a","b"] or [["row","cell"]], and a name or expression for value= and max=. Any quoted text, list item, or table cell may embed {expression}, for example "Total: {monthly} USD".',
  `padding and gap are whole steps of 4px from 0 to ${MAX_SPACE}. tone: ${TONES.join(', ')}. size: ${SIZES.join(', ')}. Use tones and sizes, never colours or pixels.`,
  `Limits: ${LIMITS.maxNodes} components, depth ${LIMITS.maxDepth}, ${LIMITS.maxState} state and calc names, ${LIMITS.maxTableRows} table rows, ${LIMITS.maxSourceBytes} characters.`,
  '',
  'Components:',
  ...CATALOG.map(describeComponent),
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
  'A JSON object is also accepted in `source`: {"states":[{"key":"seats","init":8}],"calcs":[{"key":"price","expr":"seats * 29"}],"nodes":[{"type":"card","title":"Plan","children":[{"type":"metric","label":"Price","value":"price"}]}]}.',
].join('\n')

/** One catalog line: the component, its main text, its props, and its purpose. */
function describeComponent(descriptor: ComponentDescriptor): string {
  const primary = descriptor.primary === undefined ? '' : ` "${descriptor.primary}…"`
  const props = Object.entries(descriptor.props)
    .filter(([name]) => name !== descriptor.primary)
    .map(([name, spec]) => `${name}${spec.required === true ? '' : '?'}=${hint(spec)}`)
  const children = descriptor.container ? ' Holds indented components.' : ''
  return `  ${descriptor.type}${primary}${props.length === 0 ? '' : ` ${props.join(' ')}`} — ${descriptor.description}${children}`
}

/** A compact value hint for one prop. */
function hint(spec: PropSpec): string {
  switch (spec.kind) {
    case 'expr': return 'expr'
    case 'text': return '"…"'
    case 'string': return spec.enum !== undefined ? spec.enum.join('|') : spec.format === 'url' ? '"https://…"' : spec.format === 'image' ? '"data:image/…"' : '"…"'
    case 'number': return spec.min !== undefined && spec.max !== undefined ? `${spec.min}..${spec.max}` : 'n'
    case 'space': return `0..${MAX_SPACE}`
    case 'tone': return 'tone'
    case 'size': return 'size'
    case 'rows': return '[["…"]]'
    case 'series': return '[n|"expr"]'
    case 'items': return '["…"]'
    case 'options': return '["…"]'
    case 'bind': return `<${spec.state === 'string' ? 'text' : spec.state === 'select' ? 'choice' : spec.state === 'boolean' ? 'true/false' : 'number'} state>`
  }
}

/** Indent a block by two spaces. */
function indent(block: string): string {
  return block.split('\n').map(line => `  ${line}`).join('\n')
}

/** Short reminder appended to a failed result so a repaired call keeps the contract in view. */
export const REPAIR_HINT = 'Fix these and call ui_render again with the corrected source.'
