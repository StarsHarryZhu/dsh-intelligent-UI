/**
 * Intelligent UI host half.
 *
 * Registers exactly one tool. The skill that teaches the model to use it is a
 * row of its own (`./skill.ts`), so the Plugin Manager shows it as a part of the
 * plugin. The half is inert otherwise: it reads no sessions, writes no log
 * events, holds no state between calls, and never runs the model's code. Where
 * no browser half is loaded the tool still checks and reports, so a headless run
 * exercises the same path the browser uses.
 * @module dsh-intelligent-ui
 */
import { createUIRenderTool } from "./host/tool.js";
import { PLUGIN_ID } from "./widget/identity.js";
export const name = PLUGIN_ID;
export const inject = ['tools'];
/**
 * Register the widget tool. It is an effect of this context, so unloading the
 * plugin removes it from every agent's roster.
 * @param ctx - the plugin's context; `tools` is guaranteed by {@link inject}.
 */
export function apply(ctx) {
    ctx.tools.register(createUIRenderTool());
}
export { checkWidget } from "./host/check.js";
export { createUIRenderTool } from "./host/tool.js";
export { UI_TOOL_NAME } from "./widget/identity.js";
