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
import type { Context } from '@deepseek-ai/cordis';
/** The row's plugin name: the tool row's name with a suffix, so both stay under the plugin's own id. */
export declare const name = "dsh-intelligent-ui-skill";
export declare const inject: string[];
/**
 * Register the bundled skill's provider.
 * @param ctx - the row's context; `skills` is guaranteed by {@link inject}.
 */
export declare function apply(ctx: Context): void;
