/**
 * Intelligent UI host half.
 *
 * Registers exactly one tool and, where the host composes a skill registry, one
 * skill that teaches the model to use it. The half is inert otherwise: it reads
 * no sessions, writes no log events, and holds no state between calls. Where no
 * browser half is loaded the tool still compiles and reports, so a headless run
 * exercises the same path the browser uses.
 * @module dsh-intelligent-ui
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-intelligent-ui";
export declare const inject: string[];
/**
 * Register the interface tool, and the skill once the skill registry exists.
 * Both registrations are effects of this context, so unloading the plugin
 * removes the tool from every agent's roster and the skill from every catalog.
 * The skill registry is optional: a host without one still gets the tool.
 * @param ctx - the plugin's context; `tools` is guaranteed by {@link inject}.
 */
export declare function apply(ctx: Context): void;
export { createUIRenderTool } from './host/tool.ts';
export { compileSource } from './lang/compile.ts';
export { UI_TOOL_NAME } from './lang/identity.ts';
export type { UIRenderFailure, UIRenderSuccess, UIRenderValue } from './host/tool.ts';
