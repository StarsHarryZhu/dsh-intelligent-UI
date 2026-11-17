/**
 * Download the libraries `vendor/manifest.json` pins into `vendor/cache/`, and
 * check every file against its SHA-256.
 *
 *   node scripts/vendor.mjs          download what is missing, then check everything
 *   node scripts/vendor.mjs --pin    also record the digest of a file that has none yet
 *
 * A file that does not match its digest stops the script; nothing is ever
 * replaced silently. Only `--pin` writes the manifest, and only digests that are
 * missing. The downloads are data: this script never runs them.
 * @module dsh-intelligent-ui/scripts/vendor
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, 'vendor', 'manifest.json')
const CACHE = join(ROOT, 'vendor', 'cache')
const pin = process.argv.includes('--pin')

/** Where one file of one library is downloaded from. */
export function sourceUrl(library, file) {
  return `https://cdn.jsdelivr.net/npm/${library.package}@${library.version}/${file.path}`
}

/** Where one file of one library is kept. */
export function cachePath(library, file) {
  return join(CACHE, library.id, file.path)
}

/** The SHA-256 of some bytes, in hex. */
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
let downloaded = 0
let pinned = 0
const problems = []
for (const library of manifest.libraries) {
  for (const file of library.files) {
    const path = cachePath(library, file)
    if (!existsSync(path)) {
      const url = sourceUrl(library, file)
      const response = await fetch(url)
      if (!response.ok) {
        problems.push(`${url}: HTTP ${response.status}`)
        continue
      }
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, Buffer.from(await response.arrayBuffer()))
      downloaded += 1
    }
    const actual = digest(readFileSync(path))
    if (file.sha256 === undefined) {
      if (pin) {
        file.sha256 = actual
        pinned += 1
      } else {
        problems.push(`${library.id}/${file.path} has no pinned digest; run with --pin to record ${actual}`)
      }
    } else if (file.sha256 !== actual) {
      problems.push(`${library.id}/${file.path} does not match its pinned digest (got ${actual}); delete it from vendor/cache to download it again`)
    }
  }
}
if (pinned > 0) writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`vendor: ${downloaded} downloaded, ${pinned} pinned, ${manifest.libraries.length} libraries checked`)
if (problems.length > 0) {
  for (const problem of problems) console.error(`vendor: ${problem}`)
  process.exit(1)
}
