/**
 * Shared by the tests that drive the built bundle: the texts `build.js` inlines
 * into `lib/client.js`, read back out of it, so a test runs the very runtime and
 * stylesheet a frame gets.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The repository root. */
export const ROOT = join(import.meta.dirname, '..')

/** The built browser bundle. */
export function clientBundle(): string {
  return readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
}

/**
 * One text module of the built bundle, such as the frame runtime.
 * @param id - the module id, such as `frame/main.runtime`.
 * @returns the text the module exports.
 */
export function bundledText(id: string): string {
  const bundle = clientBundle()
  const head = `${JSON.stringify(id)}: function (module, exports, require) {`
  const start = bundle.indexOf(head)
  if (start < 0) throw new Error(`the bundle has no module ${id}`)
  const match = /^\s*"use strict";\s*module\.exports = (".*");$/mu.exec(bundle.slice(start + head.length, bundle.indexOf('\n    },', start)))
  if (match === null) throw new Error(`module ${id} is not a text module`)
  return JSON.parse(match[1] as string) as string
}
