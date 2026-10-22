import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILL_RANK, createSkillProvider, parseSkill, readSkillCandidate, SKILL_DIRECTORY, SKILL_FILE, SKILL_NAME } from '../src/host/skill.ts'
import { compileSource } from '../src/lang/compile.ts'

/** The bundled skill's files: the instructions and the references they name. */
const FILES = ['SKILL.md', 'math.md', 'recipes.md']

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
    expect(named.sort()).toEqual(['math.md', 'recipes.md'])
    for (const name of named) expect(() => read(name)).not.toThrow()
  })

  it('teaches only programs that compile without a single repair', () => {
    let count = 0
    for (const name of FILES) {
      for (const match of read(name).matchAll(/```dil\n([\s\S]*?)```/gu)) {
        const result = compileSource(match[1] as string)
        expect(result.ok, `${name}: ${match[1]}`).toBe(true)
        if (result.ok) expect(result.program.diagnostics, `${name}: ${match[1]}`).toEqual([])
        count += 1
      }
    }
    expect(count).toBeGreaterThanOrEqual(12)
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
    for (const name of ['math.md', 'recipes.md']) expect(() => readFileSync(join(SKILL_DIRECTORY, name))).not.toThrow()
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
