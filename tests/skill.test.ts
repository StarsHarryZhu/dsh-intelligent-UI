import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSkill, parseSkill, SKILL_DIRECTORY, SKILL_FILE, SKILL_NAME } from '../src/host/skill.ts'
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

  it('loads into a registration whose base directory holds the references', () => {
    const skill = loadSkill()
    expect(skill).toMatchObject({ name: SKILL_NAME, source: 'runtime', path: SKILL_FILE, resourceBase: { kind: 'directory', path: SKILL_DIRECTORY } })
    for (const name of ['math.md', 'recipes.md']) expect(() => readFileSync(join(SKILL_DIRECTORY, name))).not.toThrow()
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

  it('gives up on an unreadable or foreign file instead of throwing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-iui-skill-'))
    try {
      expect(loadSkill(join(directory, 'missing.md'))).toBeUndefined()
      const foreign = join(directory, 'SKILL.md')
      writeFileSync(foreign, '---\nname: someone-else\ndescription: Use when.\n---\nbody')
      expect(loadSkill(foreign)).toBeUndefined()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
