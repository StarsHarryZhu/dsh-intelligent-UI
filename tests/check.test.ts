import { describe, expect, it } from 'vitest'
import { checkWidget, type Problem } from '../src/host/check.ts'
import { LIMITS } from '../src/widget/policy.ts'

/** The errors of a source. */
function errors(source: string): Problem[] {
  return checkWidget(source).problems.filter(problem => problem.severity === 'error')
}

/** The warnings of a source. */
function warnings(source: string): Problem[] {
  return checkWidget(source).problems.filter(problem => problem.severity === 'warning')
}

describe('scripts are compiled, never run', () => {
  it('passes code that would do harm if it ran', () => {
    const marker = '__dsh_check_ran__'
    const source = `<script>globalThis.${marker} = true; process.exit(3); while (true) {}</script>
<script type="module">globalThis.${marker} = true; await new Promise(() => {})</script>
<button onclick="globalThis.${marker} = true">x</button>`
    expect(errors(source)).toEqual([])
    expect(marker in globalThis).toBe(false)
  })

  it('reports a syntax error on its line of the whole source', () => {
    const found = errors('<p>One</p>\n<p>Two</p>\n<script>\nconst a = 1\nconst b = = 2\n</script>')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ line: 5, severity: 'error' })
    expect(found[0]?.message).toMatch(/^SyntaxError: /u)
  })

  it('checks each script by itself, so one error does not hide another', () => {
    const found = errors('<script>let a = </script>\n<p>between</p>\n<script>\nconst x = = 1\n</script>')
    expect(found.map(problem => problem.line)).toEqual([1, 4])
  })

  it('accepts what a classic script may hold', () => {
    expect(errors(`<script>
const data = [1, 2, 3].map((value) => value ** 2)
async function load() { const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'); return response.json() }
class Point { #x = 0; static origin = new Point() }
label: for (const value of data) { if (value > 2) break label }
const text = \`total \${data.length}\`
</script>`)).toEqual([])
  })

  it('reports a script that is never closed', () => {
    const found = errors('<p>Text</p>\n<script>\nconst a = 1')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ line: 2, message: 'A <script> is not closed' })
  })

  it('leaves data scripts alone', () => {
    expect(errors('<script type="application/json" id="rows">{ not json, and not code }</script>')).toEqual([])
    expect(errors('<script type="text/template"><li>{{ name }}</li></script>')).toEqual([])
  })
})

describe('modules', () => {
  it('accepts imports, exports, top-level await, and import.meta', () => {
    expect(errors(`<script type="module">
import * as THREE from 'three'
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js'
import confetti, { create } from "https://esm.sh/canvas-confetti@1"
import 'https://esm.sh/side-effect'
export const scene = new THREE.Scene()
export default function start() { return import.meta.url }
export { scene as other }
const data = await (await fetch('https://cdn.jsdelivr.net/npm/x/data.json')).json()
</script>`)).toEqual([])
  })

  it('reports a syntax error in a module on its own line', () => {
    const found = errors(`<script type="module">
import { a } from 'https://esm.sh/a'
const b = a +
const c = 3
</script>`)
    expect(found).toHaveLength(1)
    expect(found[0]?.line).toBe(4)
  })

  it('requires an import map to be JSON', () => {
    expect(errors('<script type="importmap">{"imports": {"three": "https://esm.sh/three@0.160.0"}}</script>')).toEqual([])
    const found = errors('<p>x</p>\n<script type="importmap">{ imports: {} }</script>')
    expect(found).toHaveLength(1)
    expect(found[0]?.line).toBe(2)
    expect(found[0]?.message).toMatch(/^The import map is not JSON/u)
  })
})

describe('inline handlers', () => {
  it('accepts statements and the event argument', () => {
    expect(errors('<button onclick="count += 1; show(event.target)">+</button><input oninput="out.textContent = this.value">')).toEqual([])
  })

  it('reports a handler that does not parse, on its tag\'s line', () => {
    const found = errors('<p>x</p>\n<button onclick="count += ">+</button>')
    expect(found).toHaveLength(1)
    expect(found[0]?.line).toBe(2)
    expect(found[0]?.message).toMatch(/^The onclick handler does not parse/u)
  })
})

describe('addresses', () => {
  it('sorts code-host addresses from blocked ones, and leaves links alone', () => {
    const checked = checkWidget(`<a href="https://example.org/paper">Read the paper</a>
<script src="https://cdn.jsdelivr.net/npm/some-lib@1.2.3/dist/lib.min.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<img src="https://images.example.com/photo.jpg">
<script>fetch('http://api.example.com/v1/data')</script>`)
    expect(checked.fetched).toEqual(['https://cdn.jsdelivr.net/npm/some-lib@1.2.3/dist/lib.min.js', 'https://fonts.googleapis.com/css2?family=Inter'])
    const blocked = checked.problems.filter(problem => problem.message.includes('will be blocked'))
    expect(blocked.map(problem => [problem.line, problem.message.split(' ')[0]])).toEqual([
      [4, 'https://images.example.com/photo.jpg'],
      [5, 'http://api.example.com/v1/data'],
    ])
    expect(blocked.every(problem => problem.severity === 'warning')).toBe(true)
  })

  it('names at most four blocked addresses', () => {
    const source = Array.from({ length: 9 }, (_, index) => `<img src="https://host${index}.example.com/a.png">`).join('\n')
    expect(warnings(source).filter(problem => problem.message.includes('will be blocked'))).toHaveLength(4)
  })

  it('warns when a script with src also holds code', () => {
    const found = warnings('<script src="https://cdn.jsdelivr.net/npm/x@1/x.js">start()</script>')
    expect(found.map(problem => problem.message)).toEqual(['A <script src> also holds code, which the browser ignores'])
  })
})

describe('habits that do not work in the frame', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['position: fixed', '<div style="position:fixed;top:0">x</div>', /position: fixed/u],
    ['localStorage', '<script>localStorage.setItem("k", "v")</script>', /Browser storage/u],
    ['sessionStorage', '<script>const kept = sessionStorage.getItem("k")</script>', /Browser storage/u],
    ['alert', '<script>function done() { alert("Saved") }</script>', /alert, confirm, and prompt/u],
    ['confirm', '<button onclick="if (confirm(\'Sure?\')) go()">Go</button>', /alert, confirm, and prompt/u],
    ['cookies', '<script>document.cookie = "a=1"</script>', /Cookies/u],
    ['window.open', '<script>function go() { window.open("https://example.org") }</script>', /window\.open/u],
    ['nested frame', '<iframe srcdoc="<p>x</p>"></iframe>', /frame inside the widget/u],
    ['document.write', '<script>document.write("<p>x</p>")</script>', /document\.write/u],
  ]
  for (const [name, source, message] of cases) {
    it(`warns about ${name}, with what to do instead`, () => {
      const found = warnings(source).filter(problem => message.test(problem.message))
      expect(found).toHaveLength(1)
      expect(found[0]?.line).toBe(1)
      expect(found[0]?.repair.length).toBeGreaterThan(10)
      expect(errors(source)).toEqual([])
    })
  }

  it('does not mistake a method or a longer name for a dialog', () => {
    expect(warnings('<script>ui.alert("x"); showPrompt(); const prompts = []; sendPrompt("Next")</script>')).toEqual([])
  })

  it('warns about a form that neither sends nor handles its submit', () => {
    expect(warnings('<form><input name="a"><button>Go</button></form>').map(problem => problem.message)).toEqual(['A form\'s own submission goes nowhere in the frame'])
    expect(warnings('<form data-send="Answer"><input name="a"><button>Go</button></form>')).toEqual([])
    expect(warnings('<form id="f"><input name="a"></form><script>f.addEventListener("submit", (event) => { event.preventDefault() })</script>')).toEqual([])
  })
})

describe('limits', () => {
  it('refuses an empty source and one over the length limit before anything else', () => {
    expect(errors(' \n\t')).toMatchObject([{ message: 'The source is empty' }])
    const found = errors(`<p>${'x'.repeat(LIMITS.maxSourceChars)}</p><script>let = </script>`)
    expect(found).toHaveLength(1)
    expect(found[0]?.message).toContain(`over the limit of ${LIMITS.maxSourceChars}`)
  })

  it('caps how many problems one check returns', () => {
    const source = Array.from({ length: 60 }, () => '<script>let = </script>').join('\n')
    expect(checkWidget(source).problems.length).toBeLessThanOrEqual(LIMITS.maxDiagnostics * 2)
  })

  it('returns the cleaned source the frame will show', () => {
    expect(checkWidget('﻿<!DOCTYPE html><html><body><p>Hi</p></body></html>').source).toBe('<p>Hi</p>')
  })
})
