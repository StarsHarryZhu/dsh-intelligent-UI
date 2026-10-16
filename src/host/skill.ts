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

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PLUGIN_ID } from '../lang/identity.ts'

/** The skill's name: the plugin id, so it cannot collide with a user's own skill by accident. */
export const SKILL_NAME = PLUGIN_ID

/** The bundled skill directory, from this module's own location (`src/host` or `lib/host`). */
export const SKILL_DIRECTORY = fileURLToPath(new URL('../../skills/', import.meta.url))

/** The skill's instruction file. */
export const SKILL_FILE = fileURLToPath(new URL('../../skills/SKILL.md', import.meta.url))

/** What the host's `skills.register()` receives. */
export interface SkillRegistrationLike {
  name: string
  description: string
  content: string
  source: string
  path: string
  resourceBase: { kind: 'directory'; path: string }
}

/** The part of the host's skill registry this half uses. */
export interface SkillsLike {
  register(skill: SkillRegistrationLike): () => void
}

/** The parsed parts of a skill file. */
export interface ParsedSkill {
  name: string
  description: string
  content: string
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
export function parseSkill(raw: string): ParsedSkill | undefined {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(raw)
  if (match === null) return undefined
  const fields = new Map<string, string>()
  for (const line of (match[1] as string).split(/\r?\n/u)) {
    const field = /^([A-Za-z-]+):[ \t]*(.*?)[ \t]*$/u.exec(line)
    if (field !== null) fields.set(field[1] as string, unquote(field[2] as string))
  }
  const name = fields.get('name')
  const description = fields.get('description')
  if (name === undefined || name === '' || description === undefined || description === '') return undefined
  return { name, description, content: raw.slice(match[0].length).replace(/\r\n/gu, '\n').trim() }
}

/** Strip one pair of matching YAML quotes. */
function unquote(value: string): string {
  return /^(["']).*\1$/u.test(value) ? value.slice(1, -1) : value
}

/**
 * Read and parse the bundled skill.
 * @param file - the instruction file; the bundled one by default.
 * @returns the registration, or undefined when the file cannot be used.
 */
export function loadSkill(file: string = SKILL_FILE): SkillRegistrationLike | undefined {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const parsed = parseSkill(raw)
  if (parsed === undefined || parsed.name !== SKILL_NAME) return undefined
  return {
    ...parsed,
    source: 'runtime',
    path: file,
    resourceBase: { kind: 'directory', path: SKILL_DIRECTORY },
  }
}
