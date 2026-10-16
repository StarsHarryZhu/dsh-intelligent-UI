/**
 * The plugin stays a plugin: every invariant in the root AGENTS.md "Constraints"
 * that can be checked without a running harness is checked here.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply as applyHost, inject as hostInject, name as hostName } from '../src/index.ts'
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
    const hostAllowed = ['@deepseek-ai/dsh-tools', 'node:fs', 'node:url']
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

  /** A host context with the tool registry and, optionally, the skill registry. */
  function hostContext(withSkills: boolean) {
    const tools: string[] = []
    const skills: Array<{ name: string; resourceBase: { kind: string; path: string } }> = []
    const services: Record<string, unknown> = {
      tools: { register: (tool: { name: string }) => { tools.push(tool.name); return () => undefined } },
      ...(withSkills ? { skills: { register: (skill: (typeof skills)[number]) => { skills.push(skill); return () => undefined } } } : {}),
    }
    const ctx: Record<string, unknown> = {
      ...services,
      inject: (deps: string[], callback: (scope: unknown) => void) => { if (deps.every(dep => services[dep] !== undefined)) callback(ctx) },
    }
    return { ctx, tools, skills }
  }

  it('registers exactly one host tool and one skill, under the plugin\'s own names', () => {
    expect(hostInject).toEqual(['tools'])
    const host = hostContext(true)
    applyHost(host.ctx as never)
    expect(host.tools).toEqual([UI_TOOL_NAME])
    expect(host.skills.map(skill => skill.name)).toEqual([PLUGIN_ID])
    expect(host.skills[0]?.resourceBase).toEqual({ kind: 'directory', path: `${join(ROOT, 'skills')}${sep}` })
  })

  it('still registers the tool where the host composes no skill registry', () => {
    const host = hostContext(false)
    applyHost(host.ctx as never)
    expect(host.tools).toEqual([UI_TOOL_NAME])
    expect(host.skills).toEqual([])
  })
})

describe('the browser half cannot reach outside its card', () => {
  const browser = sources(['src/client', 'src/lang'])

  it('uses no network, no timers, and no code evaluation', () => {
    const banned = [/\bfetch\s*\(/u, /XMLHttpRequest/u, /WebSocket/u, /EventSource/u, /\beval\s*\(/u, /new\s+Function/u, /dangerouslySetInnerHTML/u, /\bsetTimeout\s*\(/u, /\bsetInterval\s*\(/u, /\blocalStorage\b/u, /\bsessionStorage\b/u, /\bindexedDB\b/u]
    for (const file of browser) {
      for (const pattern of banned) expect(pattern.test(file.text), `${file.path} matches ${String(pattern)}`).toBe(false)
    }
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
      expect(['transparent', 'inherit', 'none'].includes(value) || value.startsWith('var(--dsw-'), `${match[1]}: ${value}`).toBe(true)
    }
  })

  it('takes every radius from a token', () => {
    for (const match of css.matchAll(/border-radius\s*:\s*([^;}]+)/gu)) {
      expect(['inherit'].includes((match[1] as string).trim()) || (match[1] as string).trim().startsWith('var(--dsw-radius-'), match[1]).toBe(true)
    }
  })
})
