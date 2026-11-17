import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { libraryChunk, LIBRARIES, readPackageUrl, shippedFileFor, type Library } from '../src/widget/libs.ts'
import { CODE_HOSTS, FONT_HOSTS, FRAME_SANDBOX, framePolicy, isAllowedUrl, LIMITS } from '../src/widget/policy.ts'
import { ROOT } from './helpers.ts'

/** A library table for the tests: one classic library with a stylesheet, one module library. */
const TABLE: readonly Library[] = [
  {
    id: 'demo',
    title: 'Demo 4',
    example: 'https://cdn.jsdelivr.net/npm/demo@4/dist/demo.umd.min.js',
    npm: ['demo', '@scope/demo'],
    cdnjs: ['demo.js'],
    majors: [4],
    pick: path => (path.endsWith('.css') ? { file: 'demo.css', kind: 'style' } : path === '' || path.endsWith('.js') ? { file: 'demo.js', kind: 'script' } : undefined),
  },
  {
    id: 'cube',
    title: 'Cube 160',
    example: 'https://esm.sh/cube@0.160.0',
    npm: ['cube'],
    cdnjs: ['cube.js'],
    majors: [160],
    pick: (path, host) => (host === 'cdnjs' ? undefined : path === '' || path === 'build/cube.module.js' ? { file: 'cube.module.js', kind: 'module', aliases: ['cube'] } : undefined),
  },
]

describe('reading a code-host address', () => {
  it('reads the package, its major version, and the path on each host', () => {
    expect(readPackageUrl('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js')).toEqual({ host: 'cdnjs', name: 'chart.js', major: 4, path: 'chart.umd.min.js' })
    expect(readPackageUrl('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js')).toEqual({ host: 'jsdelivr', name: 'chart.js', major: 4, path: 'dist/chart.umd.min.js' })
    expect(readPackageUrl('https://cdn.jsdelivr.net/npm/chart.js')).toEqual({ host: 'jsdelivr', name: 'chart.js', major: undefined, path: '' })
    expect(readPackageUrl('https://unpkg.com/@scope/demo@^4/dist/Demo.JS')).toEqual({ host: 'unpkg', name: '@scope/demo', major: 4, path: 'dist/demo.js' })
    expect(readPackageUrl('https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js')).toEqual({ host: 'esm', name: 'three', major: 160, path: 'examples/jsm/controls/orbitcontrols.js' })
    expect(readPackageUrl('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')).toEqual({ host: 'cdnjs', name: 'three.js', major: 128, path: 'three.min.js' })
    expect(readPackageUrl('https://cdn.jsdelivr.net/npm/d3@latest')).toEqual({ host: 'jsdelivr', name: 'd3', major: undefined, path: '' })
  })

  it('reads nothing from an address that is not a package on a code host', () => {
    for (const url of [
      'http://cdn.jsdelivr.net/npm/chart.js@4',
      'https://example.com/npm/chart.js@4',
      'https://cdn.jsdelivr.net/gh/user/repo@1/file.js',
      'https://cdnjs.cloudflare.com/ajax/libs/Chart.js',
      'https://esm.sh/',
      'not an address',
    ]) expect(readPackageUrl(url), url).toBeUndefined()
  })
})

describe('matching an address to a shipped file', () => {
  it('matches by package name and major version, on any host that names it', () => {
    expect(shippedFileFor('https://cdn.jsdelivr.net/npm/demo@4.1.0/dist/demo.umd.min.js', TABLE)).toMatchObject({ file: 'demo.js', kind: 'script' })
    expect(shippedFileFor('https://cdnjs.cloudflare.com/ajax/libs/demo.js/4.0.0/demo.min.css', TABLE)).toMatchObject({ file: 'demo.css', kind: 'style' })
    expect(shippedFileFor('https://unpkg.com/@scope/demo', TABLE)?.library.id).toBe('demo')
    expect(shippedFileFor('https://esm.sh/cube@0.160.0', TABLE)).toMatchObject({ file: 'cube.module.js', kind: 'module', aliases: ['cube'] })
  })

  it('leaves another major version, another package, and another file to the code host', () => {
    expect(shippedFileFor('https://cdn.jsdelivr.net/npm/demo@3.9.0/dist/demo.umd.min.js', TABLE)).toBeUndefined()
    expect(shippedFileFor('https://cdn.jsdelivr.net/npm/demo-extra@4/index.js', TABLE)).toBeUndefined()
    expect(shippedFileFor('https://cdn.jsdelivr.net/npm/demo@4/data/world.json', TABLE)).toBeUndefined()
    expect(shippedFileFor('https://cdnjs.cloudflare.com/ajax/libs/cube.js/r160/cube.min.js', TABLE)).toBeUndefined()
    expect(shippedFileFor('https://example.com/demo@4/demo.js', TABLE)).toBeUndefined()
  })

  it('names each library\'s lazy file after its id', () => {
    expect(libraryChunk('demo')).toBe('client.lib-demo.js')
  })

  it('ships a table whose every entry matches its own example address', () => {
    const ids = new Set<string>()
    for (const library of LIBRARIES) {
      expect(library.id, library.id).toMatch(/^[a-z0-9-]+$/u)
      expect(ids.has(library.id), library.id).toBe(false)
      ids.add(library.id)
      expect(isAllowedUrl(library.example), library.example).toBe(true)
      expect(shippedFileFor(library.example)?.library.id, library.example).toBe(library.id)
    }
  })
})

/** One library as `vendor/manifest.json` pins it. */
interface Pinned {
  id: string
  title: string
  package: string
  version: string
  license: string
  files: Array<{ path: string; sha256: string; font?: boolean; license?: boolean }>
}

const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'vendor', 'manifest.json'), 'utf8')) as { libraries: Pinned[] }

/** The files the build wrote into one library's lazy file. */
function shippedFiles(id: string): Record<string, string> {
  let registered: { id?: string; chunk?: string; factory?: () => { files: Record<string, string> } } = {}
  new Function('window', readFileSync(join(ROOT, 'lib', libraryChunk(id)), 'utf8'))({ __ModuleLoader__: { load: (value: typeof registered) => { registered = value } } })
  expect(registered.id).toBe('dsh-intelligent-ui')
  expect(registered.chunk).toBe(libraryChunk(id))
  return registered.factory?.().files ?? {}
}

describe('the shipped libraries', () => {
  /** Addresses models write for each library, and the file each must load. */
  const WRITTEN: Array<[string, string | undefined]> = [
    ['https://cdn.jsdelivr.net/npm/chart.js', 'dist/chart.umd.min.js'],
    ['https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js', 'dist/chart.umd.min.js'],
    ['https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js', 'dist/chart.umd.min.js'],
    ['https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js', undefined],
    ['https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js', 'dist/echarts.min.js'],
    ['https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js', 'dist/d3.min.js'],
    ['https://cdn.jsdelivr.net/npm/d3@7', 'dist/d3.min.js'],
    ['https://cdn.jsdelivr.net/npm/d3@7/+esm', undefined],
    ['https://esm.sh/d3@7', undefined],
    ['https://unpkg.com/topojson-client@3', 'dist/topojson-client.min.js'],
    ['https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css', 'dist/katex.min.css'],
    ['https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js', 'dist/contrib/auto-render.min.js'],
    ['https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/katex.min.js', undefined],
    ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'build/three.min.js'],
    ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', 'examples/js/controls/OrbitControls.js'],
    ['https://unpkg.com/three@0.160.0/build/three.module.js', 'build/three.module.min.js'],
    ['https://esm.sh/three@0.160.0', 'build/three.module.min.js'],
    ['https://esm.sh/three@0.160.0/addons/controls/OrbitControls.js', 'examples/jsm/controls/OrbitControls.js'],
    ['https://unpkg.com/three@0.158.0/build/three.module.js', undefined],
    ['https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css', 'styles/github-dark.min.css'],
    ['https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/monokai.min.css', undefined],
    ['https://cdn.jsdelivr.net/npm/marked/marked.min.js', 'marked.min.js'],
    ['https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js', 'dist/mermaid.min.js'],
    ['https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs', undefined],
    ['https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.0/math.min.js', 'lib/browser/math.js'],
    ['https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css', 'dist/tabler-icons.min.css'],
    ['https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js', 'build/matter.min.js'],
    ['https://unpkg.com/tone@14.7.77/build/Tone.js', 'build/Tone.js'],
    ['https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js', 'lib/anime.min.js'],
    ['https://cdn.jsdelivr.net/npm/animejs@4/lib/anime.esm.js', undefined],
  ]

  it('loads the shipped file for the addresses models write, and leaves the rest to the code host', () => {
    for (const [url, file] of WRITTEN) expect(shippedFileFor(url)?.file, url).toBe(file)
  })

  it('lists the same libraries as the manifest, in the same order', () => {
    expect(LIBRARIES.map(library => library.id)).toEqual(MANIFEST.libraries.map(library => library.id))
    for (const library of LIBRARIES) {
      const pinned = MANIFEST.libraries.find(entry => entry.id === library.id) as Pinned
      expect(library.title, library.id).toBe(pinned.title)
      expect([...library.npm, ...library.cdnjs].includes(pinned.package) || library.npm.includes(pinned.package), library.id).toBe(true)
    }
  })

  it('pins every file with a digest, a license file, and a version the table stands for', () => {
    for (const library of MANIFEST.libraries) {
      const table = LIBRARIES.find(entry => entry.id === library.id) as Library
      expect(library.files.every(file => /^[0-9a-f]{64}$/u.test(file.sha256)), library.id).toBe(true)
      expect(library.files.some(file => file.license === true), library.id).toBe(true)
      expect(['MIT', 'ISC', 'BSD-3-Clause', 'Apache-2.0'], library.id).toContain(library.license)
      const version = /^(\d+)\.(\d+)/u.exec(library.version)
      const major = Number(version?.[1]) === 0 ? Number(version?.[2]) : Number(version?.[1])
      expect(table.majors, library.id).toContain(major)
    }
  })

  it('points every rule at a file the build shipped, as the kind it loads as', () => {
    for (const library of LIBRARIES) {
      const files = shippedFiles(library.id)
      const pinned = (MANIFEST.libraries.find(entry => entry.id === library.id) as Pinned).files
      expect(Object.keys(files).sort(), library.id).toEqual(pinned.filter(file => file.font !== true && file.license !== true).map(file => file.path).sort())
      for (const [url, file] of WRITTEN) {
        const picked = shippedFileFor(url)
        if (picked === undefined || picked.library.id !== library.id) continue
        expect(Object.keys(files), `${url} → ${String(file)}`).toContain(picked.file)
        expect(picked.kind, url).toBe(picked.file.endsWith('.css') ? 'style' : /module|jsm\//u.test(picked.file) ? 'module' : 'script')
      }
      expect(Object.keys(files), library.example).toContain(shippedFileFor(library.example)?.file)
    }
  })

  it('writes stylesheet fonts in as data, so nothing loads from a relative address', () => {
    for (const library of LIBRARIES) {
      for (const [path, text] of Object.entries(shippedFiles(library.id))) {
        if (!path.endsWith('.css')) continue
        expect(text, path).not.toMatch(/url\(\s*['"]?(?!data:)[^)'"]+\.(?:woff2?|ttf|eot|otf)/iu)
        if (/@font-face/u.test(text)) expect(text, path).toContain('url(data:font/woff2;base64,')
      }
    }
    expect(shippedFiles('tabler-icons')['dist/tabler-icons.min.css']?.match(/@font-face/gu)).toHaveLength(1)
  })

  it('ships each library\'s license text with the package', () => {
    for (const library of MANIFEST.libraries) {
      for (const file of library.files.filter(entry => entry.license === true)) {
        const path = join(ROOT, 'lib', 'licenses', `${library.id}-${file.path.split('/').pop() as string}`)
        expect(existsSync(path), path).toBe(true)
      }
    }
  })
})

describe('the frame\'s policy', () => {
  const policy = framePolicy()
  const directives = new Map(policy.split('; ').map((part) => {
    const [name, ...values] = part.split(' ')
    return [name as string, values] as const
  }))

  it('grants the frame scripts and form events, and nothing else', () => {
    expect(FRAME_SANDBOX).toBe('allow-scripts allow-forms')
  })

  it('refuses everything it does not name', () => {
    expect(directives.get('default-src')).toEqual(["'none'"])
    for (const name of ['frame-src', 'object-src', 'form-action', 'base-uri']) expect(directives.get(name), name).toEqual(["'none'"])
    expect(directives.has('navigate-to')).toBe(false)
  })

  it('lets code, styles, images, fonts, and requests come only from the frame itself and the code hosts', () => {
    const allowedSources = new Set(["'unsafe-inline'", "'unsafe-eval'", 'blob:', 'data:', ...CODE_HOSTS.map(host => `https://${host}`), ...FONT_HOSTS.map(host => `https://${host}`)])
    for (const [name, values] of directives) {
      for (const value of values) {
        if (value === "'none'") continue
        expect(allowedSources.has(value), `${name} ${value}`).toBe(true)
      }
    }
    expect(policy).not.toMatch(/\*|http:|'self'|\bws/u)
    expect(directives.get('script-src')).toEqual(["'unsafe-inline'", "'unsafe-eval'", 'blob:', ...CODE_HOSTS.map(host => `https://${host}`)])
    expect(directives.get('connect-src')).toEqual(['data:', 'blob:', ...CODE_HOSTS.map(host => `https://${host}`)])
    expect(directives.get('script-src')).not.toContain('data:')
    expect(directives.get('worker-src')).toEqual(['blob:'])
  })

  it('agrees with the address check the host makes', () => {
    for (const host of [...CODE_HOSTS, ...FONT_HOSTS]) expect(isAllowedUrl(`https://${host}/x`), host).toBe(true)
    for (const url of [
      'http://cdn.jsdelivr.net/npm/x',
      'https://evil.example/cdn.jsdelivr.net/x',
      'https://cdn.jsdelivr.net.evil.example/x',
      'https://sub.unpkg.com/x',
      'https://user@evil.example/?https://unpkg.com/',
      'javascript:alert(1)',
      'data:text/html,x',
      '//unpkg.com/x',
      'nonsense',
    ]) expect(isAllowedUrl(url), url).toBe(false)
  })

  it('keeps every limit a positive whole number, with the kept state inside what storage takes', () => {
    for (const [name, value] of Object.entries(LIMITS)) expect(Number.isInteger(value) && value > 0, name).toBe(true)
    expect(LIMITS.minHeight).toBeLessThan(LIMITS.maxHeight)
    expect(LIMITS.maxStateChars + LIMITS.maxControlsChars).toBeLessThan(40_000)
  })
})
