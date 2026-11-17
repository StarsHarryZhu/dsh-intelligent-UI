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
/** A small widget, shown whole. */
export declare const EXAMPLE = "<style>.out{font-size:28px;font-weight:500}</style>\n<div class=\"card\">\n  <label>Seats <input id=\"seats\" type=\"range\" min=\"1\" max=\"50\" value=\"8\"> <span id=\"n\"></span></label>\n  <div class=\"metric\"><span class=\"label\">Per month</span><span class=\"value out\" id=\"total\"></span></div>\n  <button data-prompt=\"Compare this with the annual plan\">Compare with annual \u2197</button>\n</div>\n<script>\nconst seats = document.getElementById('seats')\nconst show = () => { n.textContent = seats.value; total.textContent = '$' + (seats.value * 29).toLocaleString() }\nseats.addEventListener('input', show); show()\n</script>";
/** The tool description. */
export declare const UI_TOOL_DESCRIPTION: string;
/** Appended to every failed result. */
export declare const REPAIR_HINT = "Fix every problem above and call ui_render again with the whole widget.";
