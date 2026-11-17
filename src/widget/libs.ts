/**
 * The libraries this plugin ships, and which code-host addresses they answer.
 *
 * A widget names a library the way it would anywhere: by its address on a code
 * host, such as cdnjs or jsDelivr. When that address names a library and major
 * version this plugin ships, the frame loads the shipped copy instead, so the
 * widget works offline and without reaching the host at all; any other address
 * is loaded from the code host, as the frame's policy allows. Each library is
 * one lazily loaded file of the browser half, `client.lib-<id>.js`, fetched only
 * when a widget asks for it. The files and their provenance are pinned in
 * `vendor/manifest.json`.
 * @module dsh-intelligent-ui/widget/libs
 */

/** How the frame loads one shipped file. */
export type LibraryKind = 'script' | 'style' | 'module'

/** One library this plugin ships. */
export interface Library {
  /** Short id, which names its lazily loaded file. */
  id: string
  /** Name and version line, as the tool description and the tool result name it. */
  title: string
  /** One address the tool description shows for it. */
  example: string
  /** Package names on jsDelivr, unpkg, and esm.sh. */
  npm: readonly string[]
  /** Library names on cdnjs. */
  cdnjs: readonly string[]
  /** Major versions the shipped copy stands in for; an address without a version also matches. */
  majors: readonly number[]
  /**
   * The shipped file an address's path asks for.
   * @param path - the path inside the package, lowercased, without a leading slash; '' for the package's main file.
   * @param host - which code host the address names.
   * @returns the file name inside this library's lazy file, how it loads, and the bare names a
   *   module of it is imported by; undefined when it ships no such file.
   */
  pick(path: string, host: CodeHost): Picked | undefined
}

/** One shipped file an address asks for. */
export interface Picked {
  file: string
  kind: LibraryKind
  /** Bare names a module of this file is imported by, such as `three`. */
  aliases?: readonly string[]
}

/** The code hosts whose addresses name packages. */
export type CodeHost = 'cdnjs' | 'jsdelivr' | 'unpkg' | 'esm'

/** An address read as a package request. */
export interface PackageRequest {
  host: CodeHost
  name: string
  /** The major version asked for, or undefined for the latest or an unversioned address. */
  major: number | undefined
  /** The path inside the package, lowercased, without a leading slash. */
  path: string
}

/**
 * Read an address as a package request on a code host.
 * @param url - an absolute address.
 * @returns the request, or undefined when the address is not one of a package on a known code host.
 */
export function readPackageUrl(url: string): PackageRequest | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'https:') return undefined
  const host = parsed.hostname.toLowerCase()
  const segments = parsed.pathname.split('/').filter(segment => segment !== '').map(segment => decodeURIComponent(segment))
  if (host === 'cdnjs.cloudflare.com') {
    if (segments[0] !== 'ajax' || segments[1] !== 'libs' || segments.length < 4) return undefined
    return { host: 'cdnjs', name: (segments[2] as string).toLowerCase(), major: majorOf(segments[3] as string), path: segments.slice(4).join('/').toLowerCase() }
  }
  const npmHost: CodeHost | undefined = host === 'cdn.jsdelivr.net' ? 'jsdelivr' : host === 'unpkg.com' ? 'unpkg' : host === 'esm.sh' ? 'esm' : undefined
  if (npmHost === undefined) return undefined
  const rest = npmHost === 'jsdelivr' ? (segments[0] === 'npm' ? segments.slice(1) : undefined) : segments
  if (rest === undefined || rest.length === 0) return undefined
  const scoped = (rest[0] as string).startsWith('@')
  const head = scoped ? `${rest[0] as string}/${rest[1] ?? ''}` : rest[0] as string
  const at = head.lastIndexOf('@')
  const versioned = at > 0
  const name = (versioned ? head.slice(0, at) : head).toLowerCase()
  const version = versioned ? head.slice(at + 1) : undefined
  return { host: npmHost, name, major: version === undefined ? undefined : majorOf(version), path: rest.slice(scoped ? 2 : 1).join('/').toLowerCase() }
}

/**
 * The major version a version or range text asks for; undefined for `latest`
 * or text without one. A package still on 0.x, such as three, versions its
 * releases in the minor number, so that number stands for the major; cdnjs
 * writes three's releases as `r128`.
 */
function majorOf(version: string): number | undefined {
  const match = /^[\^~v=r]*(\d+)(?:\.(\d+))?/u.exec(version)
  if (match === null) return undefined
  const major = Number(match[1])
  return major === 0 && match[2] !== undefined ? Number(match[2]) : major
}

/** One address rule of a library: a path inside the package, and the file it loads. */
interface Rule {
  /** The path, lowercased; `''` is the package's main file. */
  path: RegExp
  /** The shipped file, a path in `vendor/manifest.json`; `$1` takes the path's first group. */
  file: string
  kind: LibraryKind
  aliases?: readonly string[]
  /** Hosts the rule holds on; every host when left out. */
  hosts?: readonly CodeHost[]
}

/** The hosts whose package main file is the browser build: esm.sh serves a module instead. */
const SCRIPT_MAIN: readonly CodeHost[] = ['jsdelivr', 'unpkg']

/** A library whose addresses are read by its rules, the first match winning. */
function library(fields: Omit<Library, 'pick'>, rules: readonly Rule[]): Library {
  return {
    ...fields,
    pick(path, host) {
      for (const rule of rules) {
        if (rule.hosts !== undefined && !rule.hosts.includes(host)) continue
        const match = rule.path.exec(path)
        if (match === null) continue
        const file = rule.file.replace('$1', match[1] ?? '')
        return { file, kind: rule.kind, ...(rule.aliases === undefined ? {} : { aliases: rule.aliases }) }
      }
      return undefined
    },
  }
}

/** A library shipped as one browser script, under its usual names and its main file. */
function script(fields: Omit<Library, 'pick'>, path: RegExp, file: string): Library {
  return library(fields, [
    { path, file, kind: 'script' },
    { path: /^$/u, file, kind: 'script', hosts: SCRIPT_MAIN },
  ])
}

/**
 * The libraries this build ships, matched by package name and major version on
 * every code host. Each file named here is one of the library's files in
 * `vendor/manifest.json`, which pins its version and digest; the build writes
 * them into `lib/client.lib-<id>.js`. A major version listed beyond the shipped
 * one is an older release whose interface the shipped one keeps.
 */
export const LIBRARIES: readonly Library[] = [
  script({ id: 'chartjs', title: 'Chart.js 4', example: 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js', npm: ['chart.js'], cdnjs: ['chart.js'], majors: [4] },
    /^(?:dist\/)?chart(?:\.umd)?(?:\.min)?\.js$/u, 'dist/chart.umd.min.js'),
  script({ id: 'echarts', title: 'ECharts 5', example: 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js', npm: ['echarts'], cdnjs: ['echarts'], majors: [5] },
    /^(?:dist\/)?echarts(?:\.min)?\.js$/u, 'dist/echarts.min.js'),
  script({ id: 'd3', title: 'D3 7', example: 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js', npm: ['d3'], cdnjs: ['d3'], majors: [7] },
    /^(?:dist\/)?d3(?:\.min)?\.js$/u, 'dist/d3.min.js'),
  script({ id: 'topojson', title: 'topojson-client 3', example: 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js', npm: ['topojson-client'], cdnjs: ['topojson-client'], majors: [3] },
    /^(?:dist\/)?topojson-client(?:\.min)?\.js$/u, 'dist/topojson-client.min.js'),
  library({ id: 'katex', title: 'KaTeX 0.16', example: 'https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js', npm: ['katex'], cdnjs: ['katex'], majors: [16] }, [
    { path: /^(?:dist\/)?katex(?:\.min)?\.js$/u, file: 'dist/katex.min.js', kind: 'script' },
    { path: /^(?:dist\/)?katex(?:\.min)?\.css$/u, file: 'dist/katex.min.css', kind: 'style' },
    { path: /^(?:dist\/)?contrib\/auto-render(?:\.min)?\.js$/u, file: 'dist/contrib/auto-render.min.js', kind: 'script' },
    { path: /^$/u, file: 'dist/katex.min.js', kind: 'script', hosts: SCRIPT_MAIN },
  ]),
  library({ id: 'three-r128', title: 'Three.js r128', example: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', npm: ['three'], cdnjs: ['three.js'], majors: [128] }, [
    { path: /^(?:build\/)?three(?:\.min)?\.js$/u, file: 'build/three.min.js', kind: 'script' },
    { path: /^examples\/js\/controls\/orbitcontrols\.js$/u, file: 'examples/js/controls/OrbitControls.js', kind: 'script' },
    { path: /^$/u, file: 'build/three.min.js', kind: 'script', hosts: SCRIPT_MAIN },
  ]),
  library({ id: 'three-160', title: 'Three.js 0.160', example: 'https://esm.sh/three@0.160.0', npm: ['three'], cdnjs: ['three.js'], majors: [160] }, [
    { path: /^(?:build\/)?three\.module(?:\.min)?\.js$/u, file: 'build/three.module.min.js', kind: 'module', aliases: ['three'] },
    { path: /^$/u, file: 'build/three.module.min.js', kind: 'module', aliases: ['three'], hosts: ['esm'] },
    {
      path: /^(?:examples\/jsm|addons)\/controls\/orbitcontrols\.js$/u,
      file: 'examples/jsm/controls/OrbitControls.js',
      kind: 'module',
      aliases: ['three/addons/controls/OrbitControls.js', 'three/examples/jsm/controls/OrbitControls.js'],
    },
  ]),
  library({ id: 'highlight', title: 'highlight.js 11', example: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', npm: ['@highlightjs/cdn-assets'], cdnjs: ['highlight.js'], majors: [11] }, [
    { path: /^highlight(?:\.min)?\.js$/u, file: 'highlight.min.js', kind: 'script' },
    { path: /^styles\/(github-dark|github|atom-one-dark|default)(?:\.min)?\.css$/u, file: 'styles/$1.min.css', kind: 'style' },
    { path: /^$/u, file: 'highlight.min.js', kind: 'script', hosts: SCRIPT_MAIN },
  ]),
  script({ id: 'marked', title: 'marked 12', example: 'https://cdn.jsdelivr.net/npm/marked@12/marked.min.js', npm: ['marked'], cdnjs: ['marked'], majors: [12] },
    /^(?:marked(?:\.min)?|lib\/marked\.umd(?:\.min)?)\.js$/u, 'marked.min.js'),
  library({ id: 'mermaid', title: 'Mermaid 11', example: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js', npm: ['mermaid'], cdnjs: ['mermaid'], majors: [10, 11] }, [
    { path: /^(?:dist\/)?mermaid(?:\.min)?\.js$/u, file: 'dist/mermaid.min.js', kind: 'script' },
  ]),
  script({ id: 'mathjs', title: 'math.js 14', example: 'https://cdn.jsdelivr.net/npm/mathjs@14/lib/browser/math.js', npm: ['mathjs'], cdnjs: ['mathjs'], majors: [12, 13, 14] },
    /^(?:lib\/browser\/)?math(?:\.min)?\.js$/u, 'lib/browser/math.js'),
  library({ id: 'tabler-icons', title: 'Tabler Icons 3', example: 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3/dist/tabler-icons.min.css', npm: ['@tabler/icons-webfont'], cdnjs: [], majors: [2, 3] }, [
    { path: /^(?:dist\/)?tabler-icons(?:\.min)?\.css$/u, file: 'dist/tabler-icons.min.css', kind: 'style' },
  ]),
  script({ id: 'matter', title: 'Matter.js 0.20', example: 'https://cdn.jsdelivr.net/npm/matter-js@0.20/build/matter.min.js', npm: ['matter-js'], cdnjs: ['matter-js'], majors: [19, 20] },
    /^(?:build\/)?matter(?:\.min)?\.js$/u, 'build/matter.min.js'),
  script({ id: 'tone', title: 'Tone.js 14', example: 'https://cdn.jsdelivr.net/npm/tone@14/build/Tone.js', npm: ['tone'], cdnjs: ['tone'], majors: [14] },
    /^(?:build\/)?tone(?:\.min)?\.js$/u, 'build/Tone.js'),
  script({ id: 'anime', title: 'anime.js 3', example: 'https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js', npm: ['animejs'], cdnjs: ['animejs'], majors: [3] },
    /^(?:lib\/)?anime(?:\.min)?\.js$/u, 'lib/anime.min.js'),
]

/** A shipped file that stands in for an address. */
export interface ShippedFile extends Picked {
  library: Library
}

/**
 * The shipped file an address stands for.
 * @param url - an absolute address from a widget's source.
 * @param libraries - the table to search; the shipped one by default.
 * @returns the file, or undefined when the address is to be loaded from its code host.
 */
export function shippedFileFor(url: string, libraries: readonly Library[] = LIBRARIES): ShippedFile | undefined {
  const request = readPackageUrl(url)
  if (request === undefined) return undefined
  for (const library of libraries) {
    const names = request.host === 'cdnjs' ? library.cdnjs : library.npm
    if (!names.includes(request.name)) continue
    if (request.major !== undefined && !library.majors.includes(request.major)) continue
    const picked = library.pick(request.path, request.host)
    if (picked !== undefined) return { library, ...picked }
  }
  return undefined
}

/**
 * The name of a library's lazily loaded file.
 * @param id - the library id.
 * @returns the file name the host's module loader serves beside `client.js`.
 */
export function libraryChunk(id: string): string {
  return `client.lib-${id}.js`
}
