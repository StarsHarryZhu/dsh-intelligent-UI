/**
 * What the model is told about `ui_render`: the tool description.
 *
 * It is the reference the model writes widgets from, so it names everything the
 * frame provides — the theme variables, the styled elements and classes, the
 * helpers, and the libraries this plugin ships — and the few rules a sandboxed
 * frame imposes. Judgement about when and how to draw lives in the bundled
 * skill, which the model reads on demand; this text stays short because it is
 * sent with every request.
 * @module dsh-intelligent-ui/host/model-brief
 */

import { LIBRARIES } from '../widget/libs.ts'
import { CODE_HOSTS } from '../widget/policy.ts'

/** The shipped libraries, as one sentence; empty when the build ships none. */
function shippedLibraries(): string {
  if (LIBRARIES.length === 0) return ''
  return ` Shipped with the plugin, loaded offline from their usual address: ${LIBRARIES.map(library => library.title).join(', ')}; for example ${LIBRARIES[0]?.example ?? ''}.`
}

/** A small widget, shown whole. */
export const EXAMPLE = `<style>.out{font-size:28px;font-weight:500}</style>
<div class="card">
  <label>Seats <input id="seats" type="range" min="1" max="50" value="8"> <span id="n"></span></label>
  <div class="metric"><span class="label">Per month</span><span class="value out" id="total"></span></div>
  <button data-prompt="Compare this with the annual plan">Compare with annual ↗</button>
</div>
<script>
const seats = document.getElementById('seats')
const show = () => { n.textContent = seats.value; total.textContent = '$' + (seats.value * 29).toLocaleString() }
seats.addEventListener('input', show); show()
</script>`

/** The tool description. */
export const UI_TOOL_DESCRIPTION = [
  'Show an interactive widget in your reply: HTML, SVG, CSS, and JavaScript you write, run in a sandboxed frame. Controls, charts, simulations, and games run in the reader\'s browser without calling you; a button can send the reader\'s next message. Use it when the reader will vary, compare, explore, or answer by clicking; keep explanations in your reply, outside the widget.',
  'Placement: the widget stands where you call this tool. To put it inside your answer instead, call the tool first, then write the answer with a block alone on its lines where the widget belongs: ```widget, the card id from the result, ```. It moves there; the block is not shown.',
  'Write a fragment, not a document: no <html>, <head>, or <body>. Order it as a short <style>, then the content, then <script> last. The content appears while you write it; scripts run once the whole widget has arrived. Or send one <svg> element for a drawing.',
  'Look: the frame follows the chat\'s light or dark theme, with a transparent background and its height fitted to the content. Use these CSS variables, not fixed colours: --text-primary, --text-secondary, --text-muted, --surface-1 (subtle fill), --surface-2 (raised), --border, --accent, --success, --warning, --danger, tints --bg-accent, --bg-success, --bg-warning, --bg-danger, --series-1 to --series-6 for data, --radius, --font-mono. Bare buttons, inputs, selects, tables, and code are already styled. Classes: card (raised box), metric with label and value inside, badge, note (add accent, success, warning, or danger), row, stack, and grid for layout, muted. In SVG, put c-blue, c-teal, c-green, c-amber, c-orange, c-red, c-purple, c-pink, or c-gray on a shape or group for fill, stroke, and text that suit both themes, and t, ts, or th on text (body, small, heading).',
  'Helpers: sendPrompt(text) sends text as the reader\'s next message, from a click only; <button data-prompt="…"> does that without a script; <form data-send> sends its named fields as one message on submit. openLink(url) opens a page for the reader, as does <a href>. dsh.state.get() and dsh.state.set(json) keep a value across reloads; form controls with an id keep their values by themselves. dsh.math has integrate(f, a, b), derivative(f, x), limit(f, x), and root(f, lo, hi), which return NaN rather than a wrong value.',
  `Libraries: load them with <script src> or import from ${CODE_HOSTS.join(', ')}; those hosts and Google Fonts are the only addresses the frame reaches, so put data in the widget itself.${shippedLibraries()}`,
  'Rules: no localStorage, cookies, alert, confirm, window.open, nested frames, or position: fixed. Round every number you display. Write labels in the reader\'s language. A quiz never shows its answer; the reader answers with a button and you reply.',
  'The result lists what the reader sees and any problems. A syntax error keeps the widget hidden: fix every listed line and call again. To change or redraw a widget, call again with revises=<its card id>; the old one folds away and the reader\'s values carry over.',
  `Example:\n${EXAMPLE}`,
].join('\n\n')

/** Appended to every failed result. */
export const REPAIR_HINT = 'Fix every problem above and call ui_render again with the whole widget.'
