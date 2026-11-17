/**
 * The host's lazy loader, as this bundle's module wrapper hands it over.
 *
 * Every module of the browser half runs inside the bundle's own wrapper, whose
 * `require` carries the host module loader's `async` operation for this
 * package's lazily loaded files, and only for its `client.lib-*.js` files. The
 * plugin uses it for nothing else. Outside the bundle, as in the tests, there is
 * no such loader, and widgets load libraries from their code hosts.
 * @module dsh-intelligent-ui/client/chunks
 */

import type { ChunkLoader } from './libraries.ts'

/** The wrapper's `require`, when this module runs inside the bundle. */
// @ts-ignore -- `require` is the bundle wrapper's parameter, not a global this half declares.
const wrapped: unknown = typeof require === 'function' ? require : undefined

/** Load one of this package's lazily loaded files, or undefined where the host has no lazy loader. */
export const loadChunk: ChunkLoader | undefined = typeof (wrapped as { async?: unknown } | undefined)?.async === 'function'
  ? file => (wrapped as { async: (spec: string) => Promise<unknown> }).async(`./${file}`)
  : undefined
