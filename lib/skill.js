/**
 * Intelligent UI skill row.
 *
 * The bundle mounts this entry as its own row, beside the tool row, so the
 * Plugin Manager lists the skill as a part of the plugin with its own switch,
 * and the skill registry receives it the way it receives the host's bundled
 * skills: one provider, `bundled` source, bundled rank. Installing the plugin
 * therefore installs the skill, and removing or disabling the row removes it
 * from every catalog.
 * @module dsh-intelligent-ui/skill
 */
import { createSkillProvider, readSkillCandidate } from "./host/skill.js";
import { PLUGIN_ID } from "./lang/identity.js";
/** The row's plugin name: the tool row's name with a suffix, so both stay under the plugin's own id. */
export const name = `${PLUGIN_ID}-skill`;
export const inject = ['skills'];
/**
 * Register the bundled skill's provider.
 * @param ctx - the row's context; `skills` is guaranteed by {@link inject}.
 */
export function apply(ctx) {
    const read = readSkillCandidate();
    if ('problem' in read) {
        warn(ctx, `${PLUGIN_ID}: the skill was not registered: ${read.problem}`);
        return;
    }
    const skills = ctx.skills;
    skills.registerProvider(() => createSkillProvider(read.candidate));
}
/** Report through the host logger where there is one, so the reason reaches the host's log. */
function warn(ctx, message) {
    const logger = ctx.logger;
    if (typeof logger?.warn === 'function')
        logger.warn(message);
    else
        console.warn(message);
}
