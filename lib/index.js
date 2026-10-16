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
import { loadSkill } from "./host/skill.js";
import { createUIRenderTool } from "./host/tool.js";
import { PLUGIN_ID } from "./lang/identity.js";
export const name = PLUGIN_ID;
export const inject = ['tools'];
/**
 * Register the interface tool, and the skill once the skill registry exists.
 * Both registrations are effects of this context, so unloading the plugin
 * removes the tool from every agent's roster and the skill from every catalog.
 * The skill registry is optional: a host without one still gets the tool.
 * @param ctx - the plugin's context; `tools` is guaranteed by {@link inject}.
 */
export function apply(ctx) {
    ctx.tools.register(createUIRenderTool());
    ctx.inject(['skills'], (scope) => {
        const skills = scope.skills;
        const skill = loadSkill();
        if (skills === undefined)
            return;
        if (skill === undefined) {
            console.warn(`${PLUGIN_ID}: skills/SKILL.md is missing or has no name and description; the skill was not registered`);
            return;
        }
        skills.register(skill);
    });
}
export { createUIRenderTool } from "./host/tool.js";
export { compileSource } from "./lang/compile.js";
export { UI_TOOL_NAME } from "./lang/identity.js";
