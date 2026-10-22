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
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PLUGIN_ID } from "../lang/identity.js";
/** The skill's name: the plugin id, so it cannot collide with a user's own skill by accident. */
export const SKILL_NAME = PLUGIN_ID;
/** The bundled skill directory, from this module's own location (`src/host` or `lib/host`). */
export const SKILL_DIRECTORY = fileURLToPath(new URL(`../../skills/${SKILL_NAME}/`, import.meta.url));
/** The skill's instruction file. */
export const SKILL_FILE = fileURLToPath(new URL(`../../skills/${SKILL_NAME}/SKILL.md`, import.meta.url));
/** The provider's name in the host registry. */
export const SKILL_PROVIDER = PLUGIN_ID;
/**
 * The host's rank for skills a package bundles (`BUNDLED_SKILL_RANK` in
 * `@deepseek-ai/dsh-skill`). Written out because this half imports no harness
 * package beyond the tool helper; a higher rank loses to a same-name skill the
 * user keeps in a project or home directory.
 */
export const BUNDLED_SKILL_RANK = 600;
/** Both the model and the reader may invoke the skill, as with the host's own bundled skills. */
const INVOCATION = { modelInvocable: true, userInvocable: true };
/**
 * Split a skill file into its frontmatter fields and body.
 *
 * Only single-line `name:` and `description:` fields are read. A byte-order mark
 * and Windows line endings are accepted, because a checkout on Windows may carry
 * both and a skill that silently lost its description would never be chosen.
 * @param raw - the file's text.
 * @returns the parts, or undefined when the frontmatter is missing or incomplete.
 */
export function parseSkill(raw) {
    const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(raw);
    if (match === null)
        return undefined;
    const fields = new Map();
    for (const line of match[1].split(/\r?\n/u)) {
        const field = /^([A-Za-z-]+):[ \t]*(.*?)[ \t]*$/u.exec(line);
        if (field !== null)
            fields.set(field[1], unquote(field[2]));
    }
    const name = fields.get('name');
    const description = fields.get('description');
    if (name === undefined || name === '' || description === undefined || description === '')
        return undefined;
    return { name, description, content: raw.slice(match[0].length).replace(/\r\n/gu, '\n').trim() };
}
/** Strip one pair of matching YAML quotes. */
function unquote(value) {
    return /^(["']).*\1$/u.test(value) ? value.slice(1, -1) : value;
}
/**
 * Read the bundled skill's catalog entry.
 * @param file - the instruction file; the bundled one by default.
 * @returns the entry, or why there is none.
 */
export function readSkillCandidate(file = SKILL_FILE) {
    let raw;
    try {
        raw = readFileSync(file, 'utf8');
    }
    catch {
        return { problem: `${file} cannot be read` };
    }
    const parsed = parseSkill(raw);
    if (parsed === undefined)
        return { problem: `${file} has no name and description frontmatter` };
    if (parsed.name !== SKILL_NAME)
        return { problem: `${file} names the skill "${parsed.name}", not "${SKILL_NAME}"` };
    return {
        candidate: {
            name: parsed.name,
            description: parsed.description,
            invocation: { ...INVOCATION },
            provider: SKILL_PROVIDER,
            source: 'bundled',
            path: file,
            resourceBase: { kind: 'directory', path: directoryOf(file) },
            rank: BUNDLED_SKILL_RANK,
            locator: file,
        },
    };
}
/**
 * Build the provider for one catalog entry.
 * @param candidate - the entry read at load.
 * @returns the provider; `get` reads the body fresh and answers undefined when it is gone.
 */
export function createSkillProvider(candidate) {
    return {
        name: SKILL_PROVIDER,
        list: () => Promise.resolve([{ ...candidate, invocation: { ...candidate.invocation }, resourceBase: { ...candidate.resourceBase } }]),
        async get(listed, options) {
            let raw;
            try {
                raw = await readFile(listed.locator, { encoding: 'utf8', ...(options?.signal === undefined ? {} : { signal: options.signal }) });
            }
            catch {
                return undefined;
            }
            const parsed = parseSkill(raw);
            if (parsed === undefined || parsed.name !== listed.name)
                return undefined;
            const { rank: _rank, locator: _locator, ...summary } = listed;
            return { ...summary, description: parsed.description, content: parsed.content };
        },
    };
}
/** The directory of a file path, keeping its trailing separator as the host's resource base expects. */
function directoryOf(file) {
    return file === SKILL_FILE ? SKILL_DIRECTORY : file.slice(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1);
}
