/**
 * Build the published halves.
 *
 * 1. Type-check the host half (`tsconfig.json`: no DOM types).
 * 2. Emit the host half to `lib/` with `tsc` as plain ESM, which Node loads like
 *    any other package.
 * 3. Compile the frame runtime (`tsconfig.frame.json`) and bundle it into one
 *    self-contained script, which the browser half writes into every widget
 *    frame's document. It may require nothing outside itself.
 * 4. Compile the browser half with `tsc` (`tsconfig.client.json`: no Node types)
 *    to CommonJS modules in `.client-build/`, with the stylesheets and the frame
 *    runtime inlined as string modules.
 * 5. Wrap every browser module in its own function inside one module-loader
 *    factory, `window.__ModuleLoader__.load({ id, factory })`, which is the only
 *    form the page's module system registers. `react` and `react/jsx-runtime`
 *    are the only requests that leave the bundle; any other is a build error.
 *    The wrapper's `require.async` reaches the host's lazy loader for this
 *    package's `client.lib-*.js` files and nothing else.
 * 6. Write each shipped library, read from `vendor/cache/` and checked against
 *    `vendor/manifest.json`, as one lazily loaded file `lib/client.lib-<id>.js`,
 *    with its stylesheets' fonts written in, and its license files into
 *    `lib/licenses/`. Run `node scripts/vendor.mjs` once first to download them.
 * 7. Self-check: execute the bundle, load every library file through the lazy
 *    loader, call `apply(ctx)` exactly the way cordis
 *    does (`apply(ctx, config)` with no config), and require every registration
 *    to happen and every effect to clean up.
 *
 * The build has no dependency beyond the TypeScript compiler. `lib/` is generated:
 * edit `src/`, never `lib/`.
 * @module dsh-intelligent-ui/build
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const LIB = join(ROOT, 'lib')
const CLIENT_OUT = join(ROOT, '.client-build')
const FRAME_OUT = join(ROOT, '.frame-build')
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PACKAGE_NAME = PACKAGE.name

/** The browser module the factory returns: the plugin object. */
const ENTRY = 'client/index.js'

/** Requests the page's module table answers. Everything else must be bundled. */
const EXTERNALS = ['react', 'react/jsx-runtime']

/** Files inlined as string modules: module id → source file. */
const TEXT_FILES = {
  'client/styles.css': join(ROOT, 'src', 'client', 'styles.css'),
  'frame/base.css': join(ROOT, 'src', 'frame', 'base.css'),
}

/** The frame runtime's entry, and the module id the browser half imports its text by. */
const FRAME_ENTRY = 'frame/main.js'
const FRAME_TEXT_ID = 'frame/main.runtime'

/** The only lazily loaded files the wrapper's `require.async` may request. */
const CHUNK_REQUEST = /^\.\/client\.lib-[a-z0-9-]+\.js$/u

if (!existsSync(TSC)) fail(`TypeScript is not linked; run "node scripts/link-dev.mjs" first (looked for ${TSC})`)
tsc(['--noEmit', '-p', join(ROOT, 'tsconfig.json')], 'host typecheck')
rmSync(LIB, { recursive: true, force: true })
tsc(['-p', join(ROOT, 'tsconfig.build.json')], 'host emit')
assertNoTsSpecifiers(LIB)
rmSync(FRAME_OUT, { recursive: true, force: true })
tsc(['-p', join(ROOT, 'tsconfig.frame.json')], 'frame compile')
const frameRuntime = bundleFrame()
rmSync(CLIENT_OUT, { recursive: true, force: true })
tsc(['-p', join(ROOT, 'tsconfig.client.json')], 'client compile')
const modules = collectModules(frameRuntime)
const bundle = bundleClient(modules)
mkdirSync(LIB, { recursive: true })
writeFileSync(join(LIB, 'client.js'), bundle)
writeFileSync(join(LIB, 'client.modules.txt'), `/** Bundled client modules (${modules.length}):\n${modules.map(module => ` *   ${module.id}`).join('\n')}\n */\n`)
const chunks = await writeLibraries()
await selfCheck(bundle, chunks)
console.log(`build: lib/index.js, lib/host, lib/widget, lib/client.js (${modules.length} modules, ${Buffer.byteLength(bundle)} bytes; frame runtime ${Buffer.byteLength(frameRuntime)} bytes), ${chunks.length} shipped librar${chunks.length === 1 ? 'y' : 'ies'}; self-check passed`)

/** Run the TypeScript compiler, failing the build with its output. */
function tsc(args, label) {
  try {
    execFileSync(process.execPath, [TSC, ...args], { cwd: ROOT, stdio: 'pipe' })
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    fail(`${label} failed:\n${output}`)
  }
}

/** A host module that still imports `./x.ts` would not load in Node. */
function assertNoTsSpecifiers(directory) {
  for (const file of walk(directory)) {
    if (!file.endsWith('.js')) continue
    const text = readFileSync(file, 'utf8')
    if (/from\s+['"]\.{1,2}\/[^'"]+\.tsx?['"]/u.test(text)) fail(`${relative(ROOT, file)} still imports a .ts specifier`)
  }
}

/**
 * Bundle the compiled frame runtime into one script that runs on its own in a
 * widget frame: the same module table as the browser bundle, with no request
 * allowed outside it.
 */
function bundleFrame() {
  const found = []
  for (const file of walk(FRAME_OUT)) {
    if (!file.endsWith('.js')) continue
    const id = relative(FRAME_OUT, file).split(sep).join('/')
    // The frame imports only the frame and the shared widget layer.
    if (!id.startsWith('frame/') && !id.startsWith('widget/')) continue
    found.push({ id, body: readFileSync(file, 'utf8') })
  }
  const byId = new Map(found.map(module => [module.id, module]))
  if (!byId.has(FRAME_ENTRY)) fail(`the frame entry ${FRAME_ENTRY} was not compiled`)
  // Only what the entry reaches goes into every frame.
  const reached = new Set()
  const visit = (id) => {
    if (reached.has(id)) return
    reached.add(id)
    for (const match of byId.get(id).body.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/gu)) {
      const request = match[1]
      if (!request.startsWith('.')) fail(`${id} requires "${request}"; the frame runtime may require nothing outside itself`)
      const target = resolveRequest(id, request)
      if (!byId.has(target)) fail(`${id} requires ${request}, which resolves to ${target} and was not built`)
      visit(target)
    }
  }
  visit(FRAME_ENTRY)
  const included = found.filter(module => reached.has(module.id)).sort((a, b) => a.id.localeCompare(b.id))
  const definitions = included.map(module => `${JSON.stringify(module.id)}: function (module, exports, require) {\n${module.body.trimEnd()}\n}`).join(',\n')
  return `(() => {
"use strict";
const definitions = {
${definitions}
};
const cache = Object.create(null);
const resolve = (from, request) => {
  const parts = from.split("/");
  parts.pop();
  for (const part of request.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
};
const load = (id) => {
  const cached = cache[id];
  if (cached !== undefined) return cached.exports;
  const module = { exports: {} };
  cache[id] = module;
  definitions[id].call(module.exports, module, module.exports, (request) => load(resolve(id, request)));
  return module.exports;
};
load(${JSON.stringify(FRAME_ENTRY)});
})();
`
}

/** Every compiled browser module plus the inlined texts, with their requests checked. */
function collectModules(frameRuntime) {
  const found = []
  for (const file of walk(CLIENT_OUT)) {
    if (!file.endsWith('.js')) continue
    found.push({ id: relative(CLIENT_OUT, file).split(sep).join('/'), body: readFileSync(file, 'utf8') })
  }
  for (const [id, source] of Object.entries(TEXT_FILES)) {
    found.push({ id, body: `"use strict";\nmodule.exports = ${JSON.stringify(readFileSync(source, 'utf8'))};\n` })
  }
  found.push({ id: FRAME_TEXT_ID, body: `"use strict";\nmodule.exports = ${JSON.stringify(frameRuntime)};\n` })
  found.sort((a, b) => a.id.localeCompare(b.id))
  const ids = new Set(found.map(module => module.id))
  if (!ids.has(ENTRY)) fail(`the client entry ${ENTRY} was not compiled`)
  for (const module of found) {
    for (const match of module.body.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/gu)) {
      const request = match[1]
      if (request.startsWith('.')) {
        const target = resolveRequest(module.id, request)
        if (!ids.has(target)) fail(`${module.id} requires ${request}, which resolves to ${target} and was not built`)
      } else if (!EXTERNALS.includes(request)) {
        fail(`${module.id} requires "${request}"; the browser half may only use ${EXTERNALS.join(' and ')} from outside the bundle`)
      }
    }
    if (/\b(?:eval\s*\(|new\s+Function\s*\()/u.test(module.body)) fail(`${module.id} evaluates code at runtime`)
  }
  return found
}

/** Resolve a relative request against a module id. */
function resolveRequest(from, request) {
  const parts = from.split('/')
  parts.pop()
  for (const part of request.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

/** Emit the factory registration. */
function bundleClient(found) {
  const definitions = found.map(module => [
    `    ${JSON.stringify(module.id)}: function (module, exports, require) {`,
    indent(module.body.trimEnd(), 6),
    '    },',
  ].join('\n')).join('\n')
  return `/* ${PACKAGE_NAME} ${PACKAGE.version} — generated by build.js from src/; do not edit. */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_NAME)},
  factory: (require) => {
    "use strict";
    const definitions = {
${definitions}
    };
    const externals = new Set(${JSON.stringify(EXTERNALS)});
    const chunk = ${CHUNK_REQUEST.toString()};
    const cache = Object.create(null);
    const resolve = (from, request) => {
      const parts = from.split("/");
      parts.pop();
      for (const part of request.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
      }
      return parts.join("/");
    };
    const load = (id) => {
      const cached = cache[id];
      if (cached !== undefined) return cached.exports;
      if (!Object.hasOwn(definitions, id)) throw new Error(${JSON.stringify(`${PACKAGE_NAME}: missing bundled module `)} + id);
      const module = { exports: {} };
      cache[id] = module;
      const local = (request) => {
        if (externals.has(request)) return require(request);
        if (request.startsWith(".")) return load(resolve(id, request));
        throw new Error(${JSON.stringify(`${PACKAGE_NAME}: `)} + id + " requested " + request + ", which this bundle does not provide");
      };
      // The host's lazy loader, for this package's shipped libraries only.
      local.async = (request) => {
        if (!chunk.test(request)) return Promise.reject(new Error(${JSON.stringify(`${PACKAGE_NAME}: not a shipped library: `)} + request));
        if (typeof require.async !== "function") return Promise.reject(new Error(${JSON.stringify(`${PACKAGE_NAME}: this host loads no lazy files`)}));
        return require.async(request);
      };
      definitions[id].call(module.exports, module, module.exports, local);
      return module.exports;
    };
    return load(${JSON.stringify(ENTRY)});
  },
});
`
}

/**
 * Write each shipped library as one lazily loaded file, and its license files
 * beside it. The manifest pins every file's source address and SHA-256;
 * `scripts/vendor.mjs` downloads them into `vendor/cache/`, and a missing file
 * or one whose bytes differ from its digest stops the build. A stylesheet's
 * fonts are written into it as `data:` addresses, because a frame loads the
 * stylesheet from a `blob:` address, where a relative font address leads
 * nowhere.
 * @returns the written file names.
 */
async function writeLibraries() {
  const manifestPath = join(ROOT, 'vendor', 'manifest.json')
  if (!existsSync(manifestPath)) return []
  const { createHash } = await import('node:crypto')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const written = []
  mkdirSync(join(LIB, 'licenses'), { recursive: true })
  for (const library of manifest.libraries ?? []) {
    if (!/^[a-z0-9-]+$/u.test(library.id)) fail(`vendor/manifest.json: bad library id ${JSON.stringify(library.id)}`)
    const bytes = new Map()
    for (const file of library.files ?? []) {
      const path = join(ROOT, 'vendor', 'cache', library.id, file.path)
      if (!existsSync(path)) fail(`vendor/cache/${library.id}/${file.path} is missing; run node scripts/vendor.mjs`)
      const content = readFileSync(path)
      if (createHash('sha256').update(content).digest('hex') !== file.sha256) fail(`vendor/cache/${library.id}/${file.path} does not match its pinned digest`)
      bytes.set(file.path, content)
    }
    const files = {}
    for (const file of library.files) {
      const content = bytes.get(file.path)
      if (file.license === true) {
        writeFileSync(join(LIB, 'licenses', `${library.id}-${file.path.split('/').pop()}`), content)
        continue
      }
      if (file.font === true) continue
      const text = content.toString('utf8')
      files[file.path] = file.path.endsWith('.css') ? inlineFonts(library, file, text, bytes) : text
    }
    const name = `client.lib-${library.id}.js`
    const text = `/* ${PACKAGE_NAME}: ${library.title} — ${library.package}@${library.version}, ${library.license}; license text in licenses/${library.id}-*. Generated by build.js from vendor/manifest.json; do not edit. */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(PACKAGE_NAME)},
  chunk: ${JSON.stringify(name)},
  factory: () => ({ files: ${JSON.stringify(files).replace(/<\/script/giu, '<\\/script')} }),
});
`
    writeFileSync(join(LIB, name), text)
    written.push(name)
  }
  return written
}

/**
 * Write a stylesheet's fonts into it. Each `src` list keeps only its `woff2`
 * entries whose file the library lists as a font, as `data:` addresses; a list
 * with none of those is left alone. A stylesheet whose manifest entry names a
 * `fontFace` instead has every `@font-face` of that family replaced by one rule
 * with that single font, for a stylesheet that splits one font into many files.
 */
function inlineFonts(library, file, css, bytes) {
  const base = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : ''
  const fontPath = (address) => {
    const clean = address.replace(/^['"]|['"]$/gu, '').replace(/[?#].*$/u, '').replace(/^\.\//u, '')
    return `${base}${clean}`
  }
  const dataUrl = (path) => `url(data:font/woff2;base64,${bytes.get(path).toString('base64')})`
  const isFont = (path) => library.files.some(entry => entry.font === true && entry.path === path)
  if (file.fontFace !== undefined) {
    const { family, font } = file.fontFace
    if (!isFont(font)) fail(`vendor/manifest.json: ${library.id} fontFace names ${font}, which is not one of its fonts`)
    let first = true
    return css.replace(/@font-face\s*\{[^}]*\}/gu, (rule) => {
      if (!rule.includes(`"${family}"`) && !rule.includes(`'${family}'`) && !rule.includes(`:${family};`)) return rule
      if (!first) return ''
      first = false
      return `@font-face{font-family:"${family}";font-style:normal;font-weight:400;font-display:block;src:${dataUrl(font)} format("woff2")}`
    })
  }
  return css.replace(/src\s*:\s*([^;}]+)/gu, (whole, list) => {
    const entries = list.split(/,(?=\s*(?:url|local)\()/u)
    const kept = []
    for (const entry of entries) {
      const match = /url\(\s*([^)]+?)\s*\)\s*format\(\s*['"]woff2['"]\s*\)/u.exec(entry)
      if (match === null) continue
      const path = fontPath(match[1])
      if (isFont(path)) kept.push(`${dataUrl(path)} format("woff2")`)
    }
    return kept.length === 0 ? whole : `src:${kept.join(',')}`
  })
}

/**
 * Execute the bundle and drive it through the real activation contract.
 *
 * This is the check that would have caught the defect that kept every card off
 * the page: the old entry read React from `apply`'s second parameter, which
 * cordis fills with the entry's config — `undefined` for a page entry.
 */
async function selfCheck(source, chunks) {
  let registration
  const appended = []
  const fakeDocument = {
    head: { appendChild: (node) => { appended.push(node); node.parent = true } },
    createElement: () => ({
      attributes: {},
      textContent: '',
      setAttribute(name, value) { this.attributes[name] = value },
      remove() { this.parent = false },
    }),
  }
  new Function('window', 'document', source)({ __ModuleLoader__: { load: (value) => { registration = value } } }, fakeDocument)
  if (registration?.id !== PACKAGE_NAME) fail(`the bundle registered ${JSON.stringify(registration?.id)}, not ${PACKAGE_NAME}`)
  const react = loadReact()
  const requested = []
  const hostRequire = (request) => {
    requested.push(request)
    if (request === 'react') return react.react
    if (request === 'react/jsx-runtime') return react.jsx
    throw new Error(`unexpected require: ${request}`)
  }
  // The host's lazy loader: run the file, which registers a chunk factory, and materialize it.
  hostRequire.async = async (request) => {
    const name = request.slice(2)
    let chunk
    new Function('window', readFileSync(join(LIB, name), 'utf8'))({ __ModuleLoader__: { load: (value) => { chunk = value } } })
    if (chunk?.id !== PACKAGE_NAME || chunk.chunk !== name) fail(`${name} did not register itself as a chunk of ${PACKAGE_NAME}`)
    return chunk.factory(hostRequire)
  }
  const exports = registration.factory(hostRequire)
  for (const name of chunks) {
    const shipped = await hostRequire.async(`./${name}`)
    if (typeof shipped?.files !== 'object' || Object.keys(shipped.files).length === 0) fail(`${name} exports no files`)
    for (const [path, text] of Object.entries(shipped.files)) {
      if (typeof text !== 'string' || text === '') fail(`${name}: ${path} is empty`)
      if (path.endsWith('.css') && /url\(\s*['"]?(?!data:)[^)'"]+\.(?:woff2?|ttf|eot|otf)/iu.test(text)) fail(`${name}: ${path} still names a font file`)
    }
  }
  if (exports.name !== PACKAGE_NAME) fail('the client entry does not export its package name')
  if (!Array.isArray(exports.inject) || !exports.inject.includes('slots')) fail('the client entry must inject "slots"')
  if (typeof exports.apply !== 'function') fail('the client entry exports no apply function')
  for (const request of requested) if (!EXTERNALS.includes(request)) fail(`the bundle required ${request} at load`)

  const registered = []
  const disposers = []
  const slots = {
    inject: (name, callback) => { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose) },
    register: (options, component) => { registered.push({ ...options, component }); return () => { registered.splice(registered.findIndex(entry => entry.component === component), 1) } },
  }
  const dictionaries = []
  const definitions = []
  const services = {
    slots,
    locale: { register: (namespace) => { dictionaries.push(namespace); return () => dictionaries.splice(dictionaries.indexOf(namespace), 1) } },
    uiConversation: { events: { register: (definition) => { definitions.push(definition.kind); return () => definitions.splice(definitions.indexOf(definition.kind), 1) } } },
  }
  const ctx = {
    get: name => services[name],
    effect: (execute) => { const dispose = execute(); if (typeof dispose === 'function') disposers.push(dispose) },
    inject: (deps, callback) => { if (deps.every(dep => services[dep] !== undefined)) callback(ctx) },
  }
  // Exactly what cordis does for a page entry: the second argument is the entry config, undefined.
  exports.apply.call(undefined, ctx, undefined)
  const row = registered.find(entry => entry.name === 'tool.call.toolview')
  if (row?.key !== 'ui_render' || typeof row.component !== 'function') fail('apply(ctx) did not register the ui_render tool row')
  const node = registered.find(entry => entry.name === 'conversation.chat.node')
  if (node?.key !== `${PACKAGE_NAME}.card` || typeof node.component !== 'function') fail('apply(ctx) did not register the card node renderer')
  if (!definitions.includes(PACKAGE_NAME)) fail('apply(ctx) did not register the turn data definition')
  if (!definitions.includes(`${PACKAGE_NAME}.card`)) fail('apply(ctx) did not register the card node definition')
  if (!dictionaries.includes(PACKAGE_NAME)) fail('apply(ctx) did not register the card dictionaries')
  if (appended.length !== 1 || appended[0].attributes['data-plugin'] !== PACKAGE_NAME) fail('apply(ctx) did not mount exactly one tagged stylesheet')
  if (registered.length !== 2) fail(`apply(ctx) registered ${registered.length} slot entries; expected exactly 2`)
  for (const dispose of disposers.reverse()) dispose()
  if (registered.length !== 0 || definitions.length !== 0 || dictionaries.length !== 0 || appended[0].parent !== false) {
    fail('disposing the plugin left a registration or the stylesheet behind')
  }
}

/** The development React when it is linked, otherwise a stand-in good enough to load modules. */
function loadReact() {
  const require = createRequire(join(ROOT, 'package.json'))
  try {
    return { react: require('react'), jsx: require('react/jsx-runtime') }
  } catch {
    const unavailable = () => { throw new Error('React is not linked; run node scripts/link-dev.mjs') }
    return { react: { Component: class {}, Fragment: 'fragment', useState: unavailable }, jsx: { jsx: unavailable, jsxs: unavailable, Fragment: 'fragment' } }
  }
}

/** Indent every non-empty line of a block. */
function indent(text, spaces) {
  const pad = ' '.repeat(spaces)
  return text.split('\n').map(line => (line === '' ? '' : pad + line)).join('\n')
}

/** Every file below a directory, recursively. */
function walk(directory) {
  if (!existsSync(directory)) return []
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found
}

/** Stop the build with a message. */
function fail(message) {
  console.error(`build: ${message}`)
  process.exit(1)
}
