/**
 * The plugin stays a plugin: every invariant in the root AGENTS.md "Constraints"
 * that can be checked without a running harness is checked here.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply as applyHost, inject as hostInject, name as hostName } from '../src/index.ts'
import type { SkillCandidateLike, SkillProviderLike } from '../src/host/skill.ts'
import { apply as applySkill, inject as skillInject, name as skillName } from '../src/skill.ts'
import { LOCALE_NS, PLUGIN_ID, TURN_DATA_KEY, UI_TOOL_NAME } from '../src/lang/identity.ts'

const ROOT = join(import.meta.dirname, '..')

/** Every file below a directory. */
function files(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...files(path))
    else found.push(path)
  }
  return found
}

/** Source files of one half, as text. */
function sources(directories: string[]): Array<{ path: string; text: string }> {
  return directories.flatMap(directory => files(directory))
    .filter(path => /\.(?:ts|tsx)$/u.test(path) && !path.endsWith('.d.ts'))
    .map(path => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }))
}

/** Import specifiers of one file, with whether the import is type-only. */
function imports(text: string): Array<{ specifier: string; typeOnly: boolean }> {
  const found: Array<{ specifier: string; typeOnly: boolean }> = []
  for (const match of text.matchAll(/^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gmu)) {
    found.push({ specifier: match[3] as string, typeOnly: match[2] !== undefined })
  }
  for (const match of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gmu)) found.push({ specifier: match[1] as string, typeOnly: false })
  return found
}

describe('only the published plugin contract is used', () => {
  it('keeps every name the plugin registers under its own id', () => {
    expect(PLUGIN_ID).toBe(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name)
    expect([LOCALE_NS, TURN_DATA_KEY]).toEqual([PLUGIN_ID, PLUGIN_ID])
    expect(hostName).toBe(PLUGIN_ID)
  })

  it('imports no harness package at runtime except the tool definition helper', () => {
    // The host half may also read its own bundled skill file with Node built-ins.
    const hostAllowed = ['@deepseek-ai/dsh-tools', 'node:fs', 'node:fs/promises', 'node:url']
    for (const file of sources(['src'])) {
      for (const { specifier, typeOnly } of imports(file.text)) {
        if (specifier.startsWith('.') || typeOnly) continue
        if (file.path.startsWith(join('src', 'client'))) {
          expect(['react', 'react/jsx-runtime'], `${file.path} imports ${specifier}`).toContain(specifier)
        } else if (file.path.startsWith(join('src', 'lang'))) {
          throw new Error(`${file.path} imports ${specifier}; the language layer imports nothing outside itself`)
        } else {
          expect(hostAllowed, `${file.path} imports ${specifier}`).toContain(specifier)
          if (specifier.startsWith('node:')) expect(file.path, specifier).toBe(join('src', 'host', 'skill.ts'))
        }
      }
    }
  })

  it('ships a browser bundle that requests nothing beyond React', () => {
    const bundle = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
    const requests = new Set([...bundle.matchAll(/\brequire\("([^"]+)"\)/gu)].map(match => match[1] as string))
    expect([...requests].filter(request => !request.startsWith('.')).sort()).toEqual(['react', 'react/jsx-runtime'])
    expect(bundle.startsWith(`/* ${PLUGIN_ID} `)).toBe(true)
    expect(bundle).toContain(`id: "${PLUGIN_ID}"`)
  })

  /** A host context with the tool registry and the skill registry. */
  function hostContext() {
    const tools: string[] = []
    const providers: Array<() => SkillProviderLike> = []
    const runtime: unknown[] = []
    const warnings: string[] = []
    const ctx = {
      tools: { register: (tool: { name: string }) => { tools.push(tool.name); return () => undefined } },
      skills: {
        registerProvider: (create: () => SkillProviderLike) => { providers.push(create); return () => undefined },
        register: (skill: unknown) => { runtime.push(skill); return () => undefined },
      },
      logger: { warn: (text: string) => { warnings.push(text) } },
    }
    return { ctx, tools, providers, runtime, warnings }
  }

  it('registers exactly one host tool, and nothing else, from the tool row', () => {
    expect(hostInject).toEqual(['tools'])
    const host = hostContext()
    applyHost(host.ctx as never)
    expect(host.tools).toEqual([UI_TOOL_NAME])
    expect(host.providers).toEqual([])
    expect(host.runtime).toEqual([])
  })

  it('registers the skill from its own row as one bundled provider', async () => {
    expect(skillName).toBe(`${PLUGIN_ID}-skill`)
    expect(skillInject).toEqual(['skills'])
    const host = hostContext()
    applySkill(host.ctx as never)
    expect(host.tools).toEqual([])
    expect(host.runtime).toEqual([])
    expect(host.warnings).toEqual([])
    expect(host.providers).toHaveLength(1)
    const provider = (host.providers[0] as () => SkillProviderLike)()
    expect(provider.name).toBe(PLUGIN_ID)
    const [candidate] = await provider.list()
    const directory = `${join(ROOT, 'skills', PLUGIN_ID)}${sep}`
    expect(candidate).toMatchObject({
      name: PLUGIN_ID,
      provider: PLUGIN_ID,
      source: 'bundled',
      rank: 600,
      invocation: { modelInvocable: true, userInvocable: true },
      resourceBase: { kind: 'directory', path: directory },
    })
    const loaded = await provider.get(candidate as SkillCandidateLike)
    expect(loaded?.content.startsWith('# ')).toBe(true)
    expect(loaded).not.toHaveProperty('rank')
    expect(loaded).not.toHaveProperty('locator')
  })
})

describe('the browser half cannot reach outside its card', () => {
  const browser = sources(['src/client', 'src/lang'])

  it('uses no network, no timers, and no code evaluation', () => {
    const banned = [/\bfetch\s*\(/u, /XMLHttpRequest/u, /WebSocket/u, /EventSource/u, /\beval\s*\(/u, /new\s+Function/u, /dangerouslySetInnerHTML/u, /\bsetTimeout\s*\(/u, /\bsetInterval\s*\(/u, /\bsessionStorage\b/u, /\bindexedDB\b/u]
    for (const file of browser) {
      for (const pattern of banned) expect(pattern.test(file.text), `${file.path} matches ${String(pattern)}`).toBe(false)
    }
  })

  it('keeps reader edits in local storage from one file only', () => {
    const users = browser.filter(file => /\blocalStorage\b/u.test(file.text)).map(file => relative(ROOT, join(ROOT, file.path)))
    expect(users).toEqual([join('src', 'client', 'edits.ts')])
  })

  it('creates elements only from fixed tag names', () => {
    for (const file of browser) expect(/createElement\(\s*[^'"\s]/u.test(file.text), file.path).toBe(false)
  })

  it('writes to the document only to mount its own stylesheet', () => {
    const writers = browser.filter(file => /document\.(?:head|body|createElement|write)/u.test(file.text)).map(file => relative(ROOT, join(ROOT, file.path)))
    expect(writers).toEqual([join('src', 'client', 'index.ts')])
  })
})

describe('the stylesheet stays inside the card', () => {
  const css = readFileSync(join(ROOT, 'src', 'client', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

  /** Every selector list of every plain rule, ignoring at-rule preludes and keyframe steps. */
  function selectors(): string[] {
    const found: string[] = []
    const keyframes = /@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gu
    const plain = css.replace(keyframes, '').replace(/@media[^{]*\{/gu, '')
    for (const match of plain.matchAll(/([^{}]+)\{[^{}]*\}/gu)) {
      for (const selector of (match[1] as string).split(',')) if (selector.trim() !== '') found.push(selector.trim())
    }
    return found
  }

  it('scopes every selector under a dsh-iui class', () => {
    const list = selectors()
    expect(list.length).toBeGreaterThan(50)
    for (const selector of list) expect(selector, selector).toMatch(/\.dsh-iui-/u)
  })

  it('names its keyframes under the same prefix', () => {
    for (const match of css.matchAll(/@keyframes\s+([\w-]+)/gu)) expect(match[1]).toMatch(/^dsh-iui-/u)
  })

  it('uses theme tokens for every colour, never a literal', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu)
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch|color-mix)\(/iu)
    for (const match of css.matchAll(/(?:^|[;{\s])(color|background|border-color|fill|stroke|accent-color)\s*:\s*([^;}]+)/gmu)) {
      const value = (match[2] as string).trim()
      // The host's syntax tokens colour code like its own code blocks; each falls back to a theme token.
      const syntax = /^var\(--shiki-[\w-]+, var\(--dsw-[\w-]+\)\)$/u.test(value)
      expect(['transparent', 'inherit', 'none'].includes(value) || value.startsWith('var(--dsw-') || syntax, `${match[1]}: ${value}`).toBe(true)
    }
  })

  it('takes every radius from a token', () => {
    for (const match of css.matchAll(/border-radius\s*:\s*([^;}]+)/gu)) {
      expect(['inherit'].includes((match[1] as string).trim()) || (match[1] as string).trim().startsWith('var(--dsw-radius-'), match[1]).toBe(true)
    }
  })
})
