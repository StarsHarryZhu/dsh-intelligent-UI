/**
 * Intelligent UI host half.
 *
 * Registers exactly one tool. The half is inert otherwise: it reads no sessions,
 * writes no log events, and holds no state between calls. Where no browser half
 * is loaded the tool still compiles and reports, so a headless run exercises the
 * same path the browser uses.
 * @module dsh-intelligent-ui
 */
import { createUIRenderTool } from "./host/tool.js";
import { PLUGIN_ID } from "./lang/identity.js";
export const name = PLUGIN_ID;
export const inject = ['tools'];
/**
 * Register the interface tool. `tools.register` is an effect of this context, so
 * unloading the plugin removes the tool from every agent's roster.
 * @param ctx - the plugin's context; `tools` is guaranteed by {@link inject}.
 */
export function apply(ctx) {
    ctx.tools.register(createUIRenderTool());
}
export { createUIRenderTool } from "./host/tool.js";
export { compileSource } from "./lang/compile.js";
export { UI_TOOL_NAME } from "./lang/identity.js";
