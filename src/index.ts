/**
 * Intelligent UI host half.
 *
 * Registers exactly one tool. The half is inert otherwise: it reads no sessions,
 * writes no log events, and holds no state between calls. Where no browser half
 * is loaded the tool still compiles and reports, so a headless run exercises the
 * same path the browser uses.
 * @module dsh-intelligent-ui
 */

import type { Context } from '@deepseek-ai/cordis'
import { createUIRenderTool } from './host/tool.ts'
import { PLUGIN_ID } from './lang/identity.ts'

export const name = PLUGIN_ID
export const inject = ['tools']

/**
 * Register the interface tool. `tools.register` is an effect of this context, so
 * unloading the plugin removes the tool from every agent's roster.
 * @param ctx - the plugin's context; `tools` is guaranteed by {@link inject}.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(createUIRenderTool())
}

export { createUIRenderTool } from './host/tool.ts'
export { compileSource } from './lang/compile.ts'
export { UI_TOOL_NAME } from './lang/identity.ts'
export type { UIRenderFailure, UIRenderSuccess, UIRenderValue } from './host/tool.ts'
