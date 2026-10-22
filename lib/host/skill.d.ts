/**
 * The bundled skill: how to use `ui_render` well.
 *
 * The tool description carries the language; the skill carries the judgement —
 * when a card beats prose, how to shape one, how to write math cards, and how to
 * repair a failed call. It lives in `skills/dsh-intelligent-ui/` as Markdown with
 * frontmatter, the `skills/<name>/SKILL.md` layout the host's own skill packages
 * use, and reaches the host's skill registry as a skill provider: the same
 * `registerProvider` path, `bundled` source, and rank the first-party skill
 * packages take, so the host lists it wherever it lists theirs, and a user's own
 * skill of the same name still wins.
 *
 * Reading the file is the only I/O this half does. The frontmatter is read once
 * when the provider is built; the body is read again on every load, so an edited
 * skill takes effect without a restart. A missing or malformed file costs the
 * skill, never the tool.
 * @module dsh-intelligent-ui/host/skill
 */
/** The skill's name: the plugin id, so it cannot collide with a user's own skill by accident. */
export declare const SKILL_NAME = "dsh-intelligent-ui";
/** The bundled skill directory, from this module's own location (`src/host` or `lib/host`). */
export declare const SKILL_DIRECTORY: string;
/** The skill's instruction file. */
export declare const SKILL_FILE: string;
/** The provider's name in the host registry. */
export declare const SKILL_PROVIDER = "dsh-intelligent-ui";
/**
 * The host's rank for skills a package bundles (`BUNDLED_SKILL_RANK` in
 * `@deepseek-ai/dsh-skill`). Written out because this half imports no harness
 * package beyond the tool helper; a higher rank loses to a same-name skill the
 * user keeps in a project or home directory.
 */
export declare const BUNDLED_SKILL_RANK = 600;
/** One catalog entry, in the shape `SkillProvider.list` returns. */
export interface SkillCandidateLike {
    name: string;
    description: string;
    invocation: {
        modelInvocable: boolean;
        userInvocable: boolean;
    };
    provider: string;
    source: string;
    path: string;
    resourceBase: {
        kind: 'directory';
        path: string;
    };
    rank: number;
    locator: string;
}
/** A loaded skill, in the shape `SkillProvider.get` returns. */
export type SkillDefinitionLike = Omit<SkillCandidateLike, 'rank' | 'locator'> & {
    content: string;
};
/** The provider this half registers: the host's `SkillProvider` contract. */
export interface SkillProviderLike {
    name: string;
    list(options?: {
        signal?: AbortSignal | undefined;
    }): Promise<SkillCandidateLike[]>;
    get(candidate: SkillCandidateLike, options?: {
        signal?: AbortSignal | undefined;
    }): Promise<SkillDefinitionLike | undefined>;
}
/** The part of the host's skill registry this half uses. */
export interface SkillsLike {
    registerProvider(create: () => SkillProviderLike): () => void;
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
 * Read the bundled skill's catalog entry.
 * @param file - the instruction file; the bundled one by default.
 * @returns the entry, or why there is none.
 */
export declare function readSkillCandidate(file?: string): {
    candidate: SkillCandidateLike;
} | {
    problem: string;
};
/**
 * Build the provider for one catalog entry.
 * @param candidate - the entry read at load.
 * @returns the provider; `get` reads the body fresh and answers undefined when it is gone.
 */
export declare function createSkillProvider(candidate: SkillCandidateLike): SkillProviderLike;
