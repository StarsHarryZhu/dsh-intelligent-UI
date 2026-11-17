/**
 * Load the shipped libraries a widget names.
 *
 * Each library is one lazily loaded file beside the browser bundle, which the
 * host's module loader fetches on the first request and keeps. Its export holds
 * the library's files as text; the frame turns them into `blob:` addresses. A
 * host without lazy loading, or a file that fails to arrive, leaves the widget
 * to load the library from its code host.
 * @module dsh-intelligent-ui/client/libraries
 */

import { libraryChunk, shippedFileFor, type Library } from '../widget/libs.ts'
import type { ShippedText } from '../widget/messages.ts'

/** Load one lazily loaded file of this plugin by name. */
export type ChunkLoader = (file: string) => Promise<unknown>

/** Load the shipped copies of the addresses a widget names. */
export type LibraryLoader = (urls: readonly string[]) => Promise<ShippedText[]>

/**
 * Create the page's library loader.
 * @param load - the host's lazy loader, when the host has one.
 * @param libraries - the table to search; the shipped one by default.
 * @returns a loader that fetches each library's file once per page.
 */
export function createLibraryLoader(load: ChunkLoader | undefined, libraries?: readonly Library[]): LibraryLoader {
  const files = new Map<string, Promise<Record<string, string> | undefined>>()
  const filesOf = (library: Library): Promise<Record<string, string> | undefined> => {
    let pending = files.get(library.id)
    if (pending === undefined) {
      pending = load === undefined
        ? Promise.resolve(undefined)
        : load(libraryChunk(library.id)).then(readFiles, (error: unknown) => {
          console.warn(`dsh-intelligent-ui: the shipped ${library.title} did not load; widgets load it from its code host`, error)
          files.delete(library.id)
          return undefined
        })
      files.set(library.id, pending)
    }
    return pending
  }
  return async (urls) => {
    const found: ShippedText[] = []
    for (const url of new Set(urls)) {
      const shipped = shippedFileFor(url, libraries)
      if (shipped === undefined) continue
      const text = (await filesOf(shipped.library))?.[shipped.file]
      if (typeof text !== 'string') continue
      found.push({ url, kind: shipped.kind, text, ...(shipped.aliases === undefined ? {} : { aliases: [...shipped.aliases] }) })
    }
    return found
  }
}

/** The files a library's lazy file exports. */
function readFiles(exports: unknown): Record<string, string> | undefined {
  const value = typeof exports === 'object' && exports !== null ? (exports as { files?: unknown }).files : undefined
  if (typeof value !== 'object' || value === null) return undefined
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}
