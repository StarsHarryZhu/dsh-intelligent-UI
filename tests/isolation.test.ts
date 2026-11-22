/**
 * The plugin stays a plugin, and a widget stays in its frame: every invariant in
 * the root AGENTS.md "Constraints" that can be checked without a running harness
 * or a real browser is checked here.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply as applyHost, inject as hostInject, name as hostName } from '../src/index.ts'
import type { SkillCandidateLike, SkillProviderLike } from '../src/host/skill.ts'
import { apply as applySkill, inject as skillInject, name as skillName } from '../src/skill.ts'
import { LOCALE_NS, PLUGIN_ID, TURN_DATA_KEY, UI_TOOL_NAME } from '../src/widget/identity.ts'
import { FRAME_SANDBOX } from '../src/widget/policy.ts'
import { bundledText, clientBundle, ROOT } from './helpers.ts'

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

/** Source files below some directories, as text. */
function sources(directories: string[]): Array<{ path: string; text: string }> {
  return directories.flatMap(directory => files(directory))
    .filter(path => /\.(?:ts|tsx)$/u.test(path) && !path.endsWith('.d.ts'))
    .map(path => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }))
}

/** A source without its comments, so a rule is not tripped by prose about it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
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

/** Paths of the files whose code matches a pattern. */
function users(list: Array<{ path: string; text: string }>, pattern: RegExp): string[] {
  return list.filter(file => pattern.test(code(file.text))).map(file => relative(ROOT, join(ROOT, file.path)))
}

describe('only the published plugin contract is used', () => {
  it('keeps every name the plugin registers under its own id', () => {
    expect(PLUGIN_ID).toBe(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name)
    expect([LOCALE_NS, TURN_DATA_KEY]).toEqual([PLUGIN_ID, PLUGIN_ID])
    expect(hostName).toBe(PLUGIN_ID)
  })

  it('imports nothing at runtime beyond what each layer is allowed', () => {
    // The host half uses the tool helper; it reads its own skill file and compiles
    // (never runs) a widget's scripts with Node built-ins, each in one file.
    const builtins: Record<string, string[]> = {
      [join('src', 'host', 'skill.ts')]: ['node:fs', 'node:fs/promises', 'node:url'],
      [join('src', 'host', 'check.ts')]: ['node:vm'],
    }
    for (const file of sources(['src'])) {
      for (const { specifier, typeOnly } of imports(file.text)) {
        if (typeOnly) continue
        const layer = file.path.split(sep)[1]
        if (specifier.startsWith('.')) {
          const target = join(file.path, '..', specifier).split(sep)[1]
          // The shared layer imports only itself; the frame only itself and the shared layer;
          // the browser half never the host half or the frame's code, and the reverse.
          if (layer === 'widget') expect(target, `${file.path} imports ${specifier}`).toBe('widget')
          if (layer === 'frame') expect(['frame', 'widget'], `${file.path} imports ${specifier}`).toContain(target)
          if (layer === 'host') expect(['host', 'widget'], `${file.path} imports ${specifier}`).toContain(target)
          if (layer === 'client' && target !== 'client' && target !== 'widget') {
            // The two texts the build inlines for a frame's document.
            expect(['../frame/base.css', '../frame/main.runtime'], `${file.path} imports ${specifier}`).toContain(specifier)
          }
          continue
        }
        if (layer === 'client' && specifier === 'react-dom') expect(file.path, 'react-dom is for the reply card\'s portal only').toBe(join('src', 'client', 'node-view.tsx'))
        else if (layer === 'client') expect(['react', 'react/jsx-runtime'], `${file.path} imports ${specifier}`).toContain(specifier)
        else if (layer === 'widget' || layer === 'frame') throw new Error(`${file.path} imports ${specifier}; this layer imports nothing from outside the plugin`)
        else if (specifier.startsWith('node:')) expect(builtins[file.path] ?? [], `${file.path} imports ${specifier}`).toContain(specifier)
        else expect(['@deepseek-ai/dsh-tools'], `${file.path} imports ${specifier}`).toContain(specifier)
      }
    }
  })

  it('takes nothing from react-dom but createPortal', () => {
    const view = code(readFileSync(join(ROOT, 'src', 'client', 'node-view.tsx'), 'utf8'))
    expect([...view.matchAll(/import\s*\{([^}]*)\}\s*from\s*'react-dom'/gu)].map(match => (match[1] as string).trim())).toEqual(['createPortal'])
  })

  it('ships a browser bundle that requests nothing beyond React and its own lazy library files', () => {
    const bundle = clientBundle()
    const requests = new Set([...bundle.matchAll(/\brequire\("([^"]+)"\)/gu)].map(match => match[1] as string))
    expect([...requests].filter(request => !request.startsWith('.')).sort()).toEqual(['react', 'react-dom', 'react/jsx-runtime'])
    expect(bundle.startsWith(`/* ${PLUGIN_ID} `)).toBe(true)
    expect(bundle).toContain(`id: "${PLUGIN_ID}"`)
    // The one lazy request the wrapper passes on names a library file of this plugin.
    expect(bundle).toContain('const chunk = /^\\.\\/client\\.lib-[a-z0-9-]+\\.js$/u;')
    expect(bundle.match(/require\.async\(/gu)).toHaveLength(1)
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

describe('the host half never runs a widget', () => {
  const host = sources(['src/host', 'src/widget']).concat(sources(['src']).filter(file => !file.path.includes(sep, 4)))

  it('compiles scripts for their syntax and executes nothing', () => {
    const check = readFileSync(join(ROOT, 'src', 'host', 'check.ts'), 'utf8')
    expect(imports(check).filter(entry => entry.specifier === 'node:vm')).toHaveLength(1)
    expect(check).toMatch(/import \{ Script \} from 'node:vm'/u)
    for (const file of host) {
      const text = code(file.text)
      for (const pattern of [/\.runIn(?:This|New)?Context\s*\(/u, /\brunInContext\b/u, /\bcreateContext\b/u, /\bcompileFunction\b/u, /\beval\s*\(/u, /new\s+Function\b/u, /\bimport\s*\(/u, /child_process|worker_threads/u]) {
        expect(pattern.test(text), `${file.path} matches ${String(pattern)}`).toBe(false)
      }
    }
  })

  it('reaches no network and writes no file', () => {
    for (const file of host) {
      const text = code(file.text)
      for (const pattern of [/\bfetch\s*\(/u, /node:https?|node:net|node:dgram/u, /writeFile|appendFile|createWriteStream|\bmkdir|\brm(?:Sync)?\s*\(/u]) {
        expect(pattern.test(text), `${file.path} matches ${String(pattern)}`).toBe(false)
      }
    }
  })
})

describe('the page never holds a widget\'s markup or code', () => {
  const page = sources(['src/client', 'src/widget'])

  it('uses no network, no timers, no code evaluation, and no way to write markup', () => {
    const banned = [
      /\bfetch\s*\(/u, /XMLHttpRequest/u, /WebSocket/u, /EventSource/u, /sendBeacon/u,
      /\beval\s*\(/u, /new\s+Function\b/u,
      /dangerouslySetInnerHTML/u, /\.innerHTML\b/u, /\.outerHTML\b/u, /insertAdjacentHTML/u, /document\.write/u, /createContextualFragment/u, /DOMParser/u,
      /\bsetTimeout\s*\(/u, /\bsetInterval\s*\(/u,
      /\bsessionStorage\b/u, /\bindexedDB\b/u, /document\.cookie/u,
    ]
    for (const file of page) {
      const text = code(file.text)
      for (const pattern of banned) expect(pattern.test(text), `${file.path} matches ${String(pattern)}`).toBe(false)
    }
  })

  it('keeps what widgets store in local storage from one file only', () => {
    expect(users(page, /\blocalStorage\b/u)).toEqual([join('src', 'client', 'edits.ts')])
  })

  it('creates elements only from fixed tag names, and writes to the document only to mount its stylesheet', () => {
    for (const file of page) expect(/createElement\(\s*[^'"\s]/u.test(code(file.text)), file.path).toBe(false)
    expect(users(page, /document\.(?:head|createElement)\b|\.append(?:Child)?\s*\(/u)).toEqual([join('src', 'client', 'index.ts')])
  })

  it('reads the host\'s own markup, and adds to it, from one file only', () => {
    const placement = join('src', 'client', 'placement.ts')
    // The host's hooks: a code block, its body, a row's turn, and the chat's root.
    expect(users(page, /md-code-block|data-code-block-content|data-chat-turn|conversation\.chat\.flow/u)).toEqual([placement])
    expect(users(page, /\.(?:after|before|insertBefore|replaceWith|replaceChildren|prepend)\s*\(|\.(?:removeChild|removeAttribute)\s*\(|ownerDocument\.createElement/u)).toEqual([placement])
    const text = code(readFileSync(join(ROOT, placement), 'utf8'))
    // It adds one container after a block and marks the block, and removes only what it added.
    expect([...text.matchAll(/\.(after|before|insertBefore|replaceWith|replaceChildren|prepend|removeChild|setAttribute|removeAttribute|remove)\s*\(/gu)].map(match => match[1]).sort())
      .toEqual(['after', 'remove', 'removeAttribute', 'setAttribute', 'setAttribute'])
    expect(text).toMatch(/claim\.slot\?\.remove\(\)/u)
    expect(text).toMatch(/claim\.block\.removeAttribute\(PLACED_MARK\)/u)
  })

  it('draws exactly one kind of frame, sandboxed, with no address and no extra powers', () => {
    expect(FRAME_SANDBOX).toBe('allow-scripts allow-forms')
    expect(users(page, /<iframe\b/u)).toEqual([join('src', 'client', 'widget.tsx')])
    const widget = code(readFileSync(join(ROOT, 'src', 'client', 'widget.tsx'), 'utf8'))
    const frames = [...widget.matchAll(/<iframe\b[\s\S]*?\/>/gu)].map(match => match[0])
    expect(frames).toHaveLength(1)
    const frame = frames[0] as string
    expect(frame).toContain('sandbox={FRAME_SANDBOX}')
    expect(frame).toContain('allow=""')
    expect(frame).toContain('referrerPolicy="no-referrer"')
    expect(frame).toContain('srcDoc={srcdoc}')
    expect(frame).not.toMatch(/\bsrc=/u)
    // No other spelling of a sandbox token, anywhere in the page's code.
    for (const file of page) {
      const text = code(file.text).replace("export const FRAME_SANDBOX = 'allow-scripts allow-forms'", '')
      expect(/allow-(?:same-origin|top-navigation|popups|modals|downloads|pointer-lock|presentation|scripts|forms)/u.test(text), file.path).toBe(false)
    }
  })

  it('talks to a frame only through the checked bridge', () => {
    expect(users(page, /\.postMessage\s*\(/u)).toEqual([join('src', 'client', 'widget.tsx')])
    expect(users(page, /addEventListener\(\s*'message'/u)).toEqual([join('src', 'client', 'widget.tsx')])
    const widget = code(readFileSync(join(ROOT, 'src', 'client', 'widget.tsx'), 'utf8'))
    // Every message is dropped unless it comes from this widget's own frame, then read by the bridge.
    expect(widget).toMatch(/event\.source !== frame\.current\.contentWindow\) return\s+const action = readFrameMessage\(event\.data\)/u)
    expect(widget.match(/event\.data/gu)).toHaveLength(1)
    // Speaking for the reader and opening pages both wait for a click inside the frame.
    expect(widget).toMatch(/case 'send':\s+case 'open': \{\s+if \(!clickedInside\(frame\.current\)\)/u)
    expect(widget.match(/window\.open\(/gu)).toHaveLength(1)
    expect(widget).toContain("window.open(action.url, '_blank', 'noopener,noreferrer')")
    expect(users(page, /window\.open\(/u)).toEqual([join('src', 'client', 'widget.tsx')])
  })
})

describe('the frame runtime stays inside its frame', () => {
  const frame = sources(['src/frame'])
  const runtime = bundledText('frame/main.runtime')

  it('is one self-contained script', () => {
    expect(runtime.startsWith('(() => {')).toBe(true)
    expect([...runtime.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/gu)].every(match => (match[1] as string).startsWith('.'))).toBe(true)
    expect(runtime).not.toMatch(/\bimport\s*\(|\bimportScripts\b/u)
  })

  it('reaches the page only by posting messages, and nothing above its own window', () => {
    for (const file of frame) {
      const text = code(file.text)
      expect(text.match(/\bparent\.(?!postMessage\b)\w+/gu) ?? [], file.path).toEqual([])
      for (const pattern of [/\b(?:window|win|self|globalThis)\.top\b/u, /\bwindow\.opener\b/u, /\.frameElement\b/u, /\bfetch\s*\(/u, /XMLHttpRequest/u, /WebSocket/u, /sendBeacon/u, /\blocalStorage\b/u, /document\.cookie/u, /\beval\s*\(/u, /new\s+Function\b/u]) {
        expect(pattern.test(text), `${file.path} matches ${String(pattern)}`).toBe(false)
      }
    }
  })

  it('takes messages only from the page that holds it', () => {
    const text = code(readFileSync(join(ROOT, 'src', 'frame', 'runtime.ts'), 'utf8'))
    expect(text).toMatch(/win\.addEventListener\('message', \(event\) => \{\s+if \(event\.source !== parent\) return/u)
    expect(text.match(/addEventListener\('message'/gu)).toHaveLength(1)
  })
})

describe('the stylesheet stays inside the plugin\'s own elements', () => {
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
    expect(list.length).toBeGreaterThan(15)
    // The one rule outside the prefix hides a host code block this plugin marked with its own attribute.
    for (const selector of list) expect(selector, selector).toMatch(/\.dsh-iui-|^\.md-code-block\[data-dsh-iui-placed\]$/u)
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

  it('loads nothing from anywhere, in the page\'s stylesheet and in the frame\'s', () => {
    const frameCss = bundledText('frame/base.css')
    for (const text of [css, frameCss]) {
      expect(text).not.toMatch(/@import|url\(\s*['"]?(?:https?:)?\/\//iu)
    }
    expect(frameCss).toBe(readFileSync(join(ROOT, 'src', 'frame', 'base.css'), 'utf8'))
  })
})
