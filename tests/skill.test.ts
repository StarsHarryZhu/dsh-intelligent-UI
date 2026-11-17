import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILL_RANK, createSkillProvider, parseSkill, readSkillCandidate, SKILL_DIRECTORY, SKILL_FILE, SKILL_NAME } from '../src/host/skill.ts'
import { Script } from 'node:vm'
import { checkWidget } from '../src/host/check.ts'

/** The bundled skill's files: the instructions and the references they name. */
const FILES = ['SKILL.md', 'interactive.md', 'charts.md', 'diagrams.md', 'math.md', 'forms.md', 'recipes.md']

/** The host's own skill-name rule and its convention for one rendered skill file. */
const SKILL_NAME_RULE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const MAX_CODE_POINTS = 8192

/** Read one bundled file. */
function read(name: string): string {
  return readFileSync(join(SKILL_DIRECTORY, name), 'utf8')
}

describe('the bundled skill', () => {
  it('has the frontmatter the host registry accepts', () => {
    const parsed = parseSkill(read('SKILL.md'))
    expect(parsed?.name).toBe(SKILL_NAME)
    expect(parsed?.name).toMatch(SKILL_NAME_RULE)
    expect(parsed?.description.startsWith('Use when')).toBe(true)
    expect(parsed?.description.length).toBeLessThanOrEqual(500)
    expect(parsed?.content.startsWith('# ')).toBe(true)
  })

  it('keeps every file under the size one tool result may carry', () => {
    for (const name of FILES) expect([...read(name)].length, name).toBeLessThan(MAX_CODE_POINTS)
  })

  it('names only reference files that exist', () => {
    const named = [...new Set([...read('SKILL.md').matchAll(/`([\w-]+\.md)`/gu)].map(match => match[1] as string))]
    expect(named.sort()).toEqual(['charts.md', 'diagrams.md', 'forms.md', 'interactive.md', 'math.md', 'recipes.md'])
    for (const name of named) expect(() => read(name)).not.toThrow()
  })

  it('teaches only widgets that pass the host\'s check without a single problem', () => {
    let count = 0
    for (const name of FILES) {
      for (const match of read(name).matchAll(/```html\n([\s\S]*?)```/gu)) {
        const checked = checkWidget(match[1] as string)
        expect(checked.problems, `${name}: ${(match[1] as string).slice(0, 80)}`).toEqual([])
        expect(checked.fetched, `${name}: every library a recipe loads is shipped`).toEqual([])
        count += 1
      }
    }
    expect(count).toBeGreaterThanOrEqual(10)
  })

  it('teaches only snippets that parse', () => {
    let count = 0
    for (const name of FILES) {
      for (const match of read(name).matchAll(/```js\n([\s\S]*?)```/gu)) {
        expect(() => new Script(match[1] as string, { filename: name }), `${name}: ${(match[1] as string).slice(0, 80)}`).not.toThrow()
        count += 1
      }
    }
    expect(count).toBeGreaterThanOrEqual(8)
  })

  it('names only theme variables and classes the frame has', () => {
    const css = readFileSync(join(SKILL_DIRECTORY, '..', '..', 'src', 'frame', 'base.css'), 'utf8')
    for (const name of FILES) {
      for (const match of read(name).matchAll(/var\((--[a-z0-9-]+)\)/gu)) expect(css, `${name}: ${match[1] as string}`).toContain(`${match[1] as string}:`)
      for (const match of read(name).matchAll(/\bc-(?:gray|blue|teal|green|amber|orange|red|purple|pink|coral)\b/gu)) expect(css, `${name}: ${match[0]}`).toContain(`.${match[0]} {`)
    }
  })

  it('sits in the skills/<name>/SKILL.md layout the host\'s own skill packages use', () => {
    expect(SKILL_FILE).toBe(join(SKILL_DIRECTORY, 'SKILL.md'))
    expect(SKILL_DIRECTORY.endsWith(`${join('skills', SKILL_NAME)}${SKILL_DIRECTORY.at(-1) as string}`)).toBe(true)
  })

  it('lists as a bundled catalog entry whose base directory holds the references', () => {
    const entry = readSkillCandidate()
    expect('candidate' in entry).toBe(true)
    if (!('candidate' in entry)) return
    expect(entry.candidate).toMatchObject({
      name: SKILL_NAME,
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      path: SKILL_FILE,
      locator: SKILL_FILE,
      resourceBase: { kind: 'directory', path: SKILL_DIRECTORY },
    })
    expect(entry.candidate.description).toBe(parseSkill(read('SKILL.md'))?.description)
    for (const name of FILES) expect(() => readFileSync(join(SKILL_DIRECTORY, name))).not.toThrow()
  })

  it('loads the body fresh on every get, without the provider\'s private fields', async () => {
    const entry = readSkillCandidate()
    if (!('candidate' in entry)) throw new Error(entry.problem)
    const provider = createSkillProvider(entry.candidate)
    const [listed] = await provider.list()
    const loaded = await provider.get(listed as typeof entry.candidate)
    expect(loaded?.content).toBe(parseSkill(read('SKILL.md'))?.content)
    expect(loaded).toMatchObject({ name: SKILL_NAME, source: 'bundled', provider: SKILL_NAME })
    expect(loaded).not.toHaveProperty('rank')
    expect(loaded).not.toHaveProperty('locator')
  })
})

describe('reading a skill file', () => {
  it('accepts a byte-order mark and Windows line endings', () => {
    const windows = `﻿${read('SKILL.md').replace(/\n/gu, '\r\n')}`
    const parsed = parseSkill(windows)
    expect(parsed?.name).toBe(SKILL_NAME)
    expect(parsed?.description).toBe(parseSkill(read('SKILL.md'))?.description)
    expect(parsed?.content).not.toContain('\r')
  })

  it('reads quoted fields and rejects a file without a description', () => {
    expect(parseSkill('---\nname: "a-b"\ndescription: \'Use when x.\'\n---\nbody')).toEqual({ name: 'a-b', description: 'Use when x.', content: 'body' })
    expect(parseSkill('---\nname: a-b\n---\nbody')).toBeUndefined()
    expect(parseSkill('# no frontmatter')).toBeUndefined()
  })

  it('gives up on an unreadable or foreign file with a reason instead of throwing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-iui-skill-'))
    try {
      const missing = readSkillCandidate(join(directory, 'missing.md'))
      expect('problem' in missing && missing.problem).toContain('cannot be read')
      const foreign = join(directory, 'SKILL.md')
      writeFileSync(foreign, '---\nname: someone-else\ndescription: Use when.\n---\nbody')
      const other = readSkillCandidate(foreign)
      expect('problem' in other && other.problem).toContain('"someone-else"')
      // A body that disappears after listing loads as nothing, not as an error.
      const own = join(directory, 'own.md')
      writeFileSync(own, `---\nname: ${SKILL_NAME}\ndescription: Use when.\n---\nbody`)
      const entry = readSkillCandidate(own)
      if (!('candidate' in entry)) throw new Error(entry.problem)
      expect(entry.candidate.resourceBase.path).toBe(`${directory}${sep}`)
      rmSync(own)
      expect(await createSkillProvider(entry.candidate).get(entry.candidate)).toBeUndefined()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
