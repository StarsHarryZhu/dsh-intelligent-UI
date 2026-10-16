/**
 * The bundled skill: how to use `ui_render` well.
 *
 * The tool description carries the language; the skill carries the judgement —
 * when a card beats prose, how to shape one, how to write math cards, and how to
 * repair a failed call. It lives in `skills/` as Markdown with frontmatter, is
 * read once when the plugin loads, and is registered with the host's skill
 * registry under this plugin's own name. Its reference files stay in that
 * directory, which the host names to the model as the skill's base.
 *
 * Reading the file is the only I/O this half does, and it happens at load, never
 * inside a tool call. A missing or malformed file costs the skill, not the tool.
 * @module dsh-intelligent-ui/host/skill
 */
/** The skill's name: the plugin id, so it cannot collide with a user's own skill by accident. */
export declare const SKILL_NAME = "dsh-intelligent-ui";
/** The bundled skill directory, from this module's own location (`src/host` or `lib/host`). */
export declare const SKILL_DIRECTORY: string;
/** The skill's instruction file. */
export declare const SKILL_FILE: string;
/** What the host's `skills.register()` receives. */
export interface SkillRegistrationLike {
    name: string;
    description: string;
    content: string;
    source: string;
    path: string;
    resourceBase: {
        kind: 'directory';
        path: string;
    };
}
/** The part of the host's skill registry this half uses. */
export interface SkillsLike {
    register(skill: SkillRegistrationLike): () => void;
}
/** The parsed parts of a skill file. */
export interface ParsedSkill {
    name: string;
    description: string;
    content: string;
}
/**
 * Split a skill file into its frontmatter fields and body.
 *
 * Only single-line `name:` and `description:` fields are read. A byte-order mark
 * and Windows line endings are accepted, because a checkout on Windows may carry
 * both and a skill that silently lost its description would never be chosen.
 * @param raw - the file's text.
 * @returns the parts, or undefined when the frontmatter is missing or incomplete.
 */
export declare function parseSkill(raw: string): ParsedSkill | undefined;
/**
 * Read and parse the bundled skill.
 * @param file - the instruction file; the bundled one by default.
 * @returns the registration, or undefined when the file cannot be used.
 */
export declare function loadSkill(file?: string): SkillRegistrationLike | undefined;
