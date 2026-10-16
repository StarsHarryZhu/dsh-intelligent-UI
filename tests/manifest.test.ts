/**
 * The package installs the same way on every platform the harness runs on.
 *
 * Web, macOS desktop, and Windows desktop all load one browser bundle through
 * `dsh.client` with `platform: "web"`, and all install the package from a git
 * checkout without building it. These specs pin what that requires.
 */

import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, any>

/** A parsed version: the numeric tuple and its prerelease identifiers. */
interface Version { tuple: [number, number, number]; pre: string[] }

function parse(text: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$/u.exec(text)
  if (match === null) throw new Error(`not a version: ${text}`)
  return { tuple: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] === undefined ? [] : match[4].split('.') }
}

/** Semver precedence. */
function compare(a: Version, b: Version): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.tuple[index] as number) - (b.tuple[index] as number)
    if (difference !== 0) return Math.sign(difference)
  }
  if (a.pre.length === 0 || b.pre.length === 0) return (b.pre.length === 0 ? 0 : 1) - (a.pre.length === 0 ? 0 : 1) || 0
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const left = a.pre[index]
    const right = b.pre[index]
    if (left === undefined) return -1
    if (right === undefined) return 1
    const numeric = /^\d+$/u.test(left) && /^\d+$/u.test(right)
    const order = numeric ? Number(left) - Number(right) : left < right ? -1 : left > right ? 1 : 0
    if (order !== 0) return Math.sign(order)
  }
  return 0
}

/**
 * Whether a version satisfies a `>=a <b || …` range. With `includePrerelease`
 * this is the harness's own compatibility check; without it, node-semver's
 * default, under which a prerelease matches only a comparator on its own tuple.
 */
function satisfies(version: string, range: string, includePrerelease: boolean): boolean {
  const candidate = parse(version)
  return range.split('||').some((branch) => {
    const comparators = branch.trim().split(/\s+/u).map((part) => {
      const match = /^(>=|<=|>|<|=)?(.+)$/u.exec(part) as RegExpExecArray
      return { operator: match[1] ?? '=', version: parse(match[2] as string) }
    })
    const holds = comparators.every(({ operator, version: bound }) => {
      const order = compare(candidate, bound)
      return operator === '>=' ? order >= 0 : operator === '>' ? order > 0 : operator === '<=' ? order <= 0 : operator === '<' ? order < 0 : order === 0
    })
    if (!holds || includePrerelease || candidate.pre.length === 0) return holds
    return comparators.some(({ version: bound }) => bound.pre.length > 0 && bound.tuple.join('.') === candidate.tuple.join('.'))
  })
}

describe('one browser declaration for web and both desktops', () => {
  it('declares the only platform the module registry serves', () => {
    expect(manifest.dsh.client.platform).toBe('web')
  })

  it('does not claim the boot-time prefetch reserved for host infrastructure', () => {
    expect(manifest.dsh.client).not.toHaveProperty('immediately')
  })

  it('exports the bundle the registry looks for, and ships it', () => {
    expect(manifest.exports['./client'].default).toBe('./lib/client.js')
    expect(existsSync(join(ROOT, 'lib', 'client.js'))).toBe(true)
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('id: dsh-intelligent-ui')
    expect(patch).toContain('name: dsh-intelligent-ui')
  })
})

describe('installing from a git checkout', () => {
  it('runs no install-time script, so nothing waits for build approval', () => {
    for (const script of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'prepublish']) {
      expect(manifest.scripts, script).not.toHaveProperty(script)
    }
    expect(manifest.dependencies).toEqual({})
  })

  it('publishes every file the host half, the browser half, and the skill read at runtime', () => {
    for (const entry of ['lib', 'skills', 'cordis.patch.yml', 'locale/*.json', 'icon.svg']) expect(manifest.files).toContain(entry)
    for (const file of ['lib/index.js', 'lib/host/skill.js', 'skills/SKILL.md', 'icon.svg']) expect(existsSync(join(ROOT, file)), file).toBe(true)
  })

  it('carries display metadata in both languages', () => {
    for (const language of ['en', 'zh']) {
      const meta = JSON.parse(readFileSync(join(ROOT, 'locale', `${language}.json`), 'utf8')).meta
      expect(typeof meta.title, language).toBe('string')
      expect(typeof meta.description, language).toBe('string')
    }
  })

  it('holds no symbolic link, which a Windows checkout cannot reproduce', () => {
    const skipped = new Set(['node_modules', '.git', '.client-build', '.claude'])
    const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (skipped.has(entry.name)) return []
      const path = join(directory, entry.name)
      if (lstatSync(path).isSymbolicLink()) return [path]
      return entry.isDirectory() ? walk(path) : []
    })
    expect(walk(ROOT)).toEqual([])
  })

  it('pins line endings so a Windows checkout reads the same text', () => {
    expect(readFileSync(join(ROOT, '.gitattributes'), 'utf8')).toMatch(/^\* text=auto eol=lf$/mu)
  })
})

describe('the storefront screenshots', () => {
  it('lists one to eight images inside the repository, each of which exists', () => {
    const list = JSON.parse(readFileSync(join(ROOT, 'screenshots.json'), 'utf8')) as unknown
    expect(Array.isArray(list)).toBe(true)
    const paths = list as string[]
    expect(paths.length).toBeGreaterThanOrEqual(1)
    expect(paths.length).toBeLessThanOrEqual(8)
    for (const path of paths) {
      expect(path, path).toMatch(/^assets\/[\w-]+\.png$/u)
      expect(path.includes('..') || path.startsWith('/'), path).toBe(false)
      expect(readFileSync(join(ROOT, path)).subarray(1, 4).toString('latin1'), path).toBe('PNG')
    }
  })
})

describe('the versions it claims', () => {
  const engine = manifest.engines.dsh as string
  const peer = manifest.peerDependencies['@deepseek-ai/dsh-tools'] as string

  it('passes the harness compatibility check on the verified hosts and no later minor', () => {
    for (const version of ['0.2.0-rc.2', '0.2.1-alpha.4', '0.2.1', '0.2.9']) expect(satisfies(version, engine, true), version).toBe(true)
    for (const version of ['0.1.9', '0.3.0-alpha.1', '0.3.0']) expect(satisfies(version, engine, true), version).toBe(false)
  })

  it('declares a peer range that admits the harness prereleases under default semver', () => {
    for (const version of ['0.2.0-rc.2', '0.2.1-alpha.4', '0.2.3']) expect(satisfies(version, peer, false), version).toBe(true)
    expect(satisfies('0.3.0', peer, false)).toBe(false)
    expect(manifest.devDependencies['@deepseek-ai/dsh-tools']).toBe(peer)
  })
})
