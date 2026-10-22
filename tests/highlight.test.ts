import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CODE_LANGUAGE_ALIASES, CODE_LANGUAGES, highlight, type Token, type TokenKind } from '../src/lang/highlight.ts'

/** The runs of one kind across every line, for compact assertions. */
function runs(code: string, lang: string, kind: TokenKind): string[] {
  return highlight(code, lang).flat().filter(token => token.kind === kind).map(token => token.text)
}

/** Each line's tokens joined back into text. */
function joined(lines: Token[][]): string {
  return lines.map(line => line.map(token => token.text).join('')).join('\n')
}

describe('each language', () => {
  it('tells Python keywords, strings, comments, numbers, constants, calls, and decorators apart', () => {
    const code = '@cache\ndef f(x):\n    """doc\n    more"""\n    return round(x * 2.5e1, 2)  # twice\nprint(f"{x}", r"\\d", None)'
    expect(runs(code, 'python', 'keyword')).toEqual(['def', 'return'])
    expect(runs(code, 'python', 'string')).toEqual(['"""doc', '    more"""', 'f"{x}"', 'r"\\d"'])
    expect(runs(code, 'python', 'comment')).toEqual(['# twice'])
    expect(runs(code, 'python', 'number')).toEqual(['2.5e1', '2'])
    expect(runs(code, 'python', 'constant')).toEqual(['None'])
    expect(runs(code, 'python', 'function')).toEqual(['@cache', 'f', 'round', 'print'])
  })

  it('colours a template literal and a block comment on every line they span', () => {
    const lines = highlight('const a = `x\n${y}` // c\n/* b\nlock */ g()', 'js')
    expect(lines[1]?.[0]).toEqual({ kind: 'string', text: '${y}`' })
    expect(lines[3]?.[0]).toEqual({ kind: 'comment', text: 'lock */' })
    expect(runs('let t: string = null', 'ts', 'keyword')).toEqual(['let', 'string'])
  })

  it('reads the C family, Rust lifetimes and macros, and Go raw strings', () => {
    expect(runs('#include <stdio.h>\nint main(void) { return 0; }', 'c', 'keyword')).toEqual(['#include', 'int', 'void', 'return'])
    expect(runs('std::vector<int> v; v.push_back(nullptr);', 'cpp', 'constant')).toEqual(['nullptr'])
    expect(runs('public static void main(String[] a) {}', 'java', 'keyword')).toEqual(['public', 'static', 'void', 'String'])
    const rust = "fn f<'a>(s: &'a str) -> char { println!(\"{}\", s); 'x' }"
    expect(runs(rust, 'rust', 'string')).toEqual(['"{}"', "'x'"])
    expect(runs(rust, 'rust', 'function')).toEqual(['println'])
    expect(runs('s := `a\nb`', 'go', 'string')).toEqual(['`a', 'b`'])
  })

  it('reads SQL without case, JSON keys apart from values, and shell variables', () => {
    expect(runs("SELECT name FROM t -- c\nwhere id = 'x'", 'sql', 'keyword')).toEqual(['SELECT', 'FROM', 'where'])
    expect(runs('{"a": "b", "n": [1, true]}', 'json', 'keyword')).toEqual(['"a"', '"n"'])
    expect(runs('{"a": "b", "n": [1, true]}', 'json', 'string')).toEqual(['"b"'])
    expect(runs('echo "$HOME" ${x} $1 $(ls) a#b # c', 'bash', 'constant')).toEqual(['${x}', '$1'])
    expect(runs('echo "$HOME" ${x} $1 $(ls) a#b # c', 'bash', 'comment')).toEqual(['# c'])
  })

  it('reads markup, stylesheets, and YAML', () => {
    const html = '<!-- c --><div class="a" id=b>&amp; x</div>'
    expect(runs(html, 'html', 'keyword')).toEqual(['div', 'div'])
    expect(runs(html, 'html', 'function')).toEqual(['class', 'id'])
    expect(runs(html, 'html', 'string')).toEqual(['"a"', 'b'])
    const css = '@media (min-width: 600px) { .a { color: #fff; margin: 0 4px !important; transform: rotate(3deg) } }'
    expect(runs(css, 'css', 'keyword')).toEqual(['@media', 'color', 'margin', '!important', 'transform'])
    expect(runs(css, 'css', 'number')).toEqual(['600px', '0', '4px', '3deg'])
    const yaml = 'key: value # c\nlist:\n  - "q"\n  - 3.5\nflag: true'
    expect(runs(yaml, 'yaml', 'keyword')).toEqual(['key', 'list', 'flag'])
    expect(runs(yaml, 'yaml', 'number')).toEqual(['3.5'])
    expect(runs(yaml, 'yaml', 'constant')).toEqual(['true'])
  })

  it('leaves text, and any language it does not know, plain', () => {
    expect(highlight('if {}} "x"', 'text')).toEqual([[{ kind: 'plain', text: 'if {}} "x"' }]])
    expect(highlight('if x', 'klingon')).toEqual([[{ kind: 'plain', text: 'if x' }]])
  })

  it('maps every alias onto a language it colours', () => {
    for (const target of Object.values(CODE_LANGUAGE_ALIASES)) expect(CODE_LANGUAGES).toContain(target)
  })
})

describe('colouring never changes the text', () => {
  /** Every program in the samples, the skill, and a set of awkward strings. */
  const corpus = [
    readFileSync(join(import.meta.dirname, '..', 'docs', 'SAMPLES.md'), 'utf8'),
    readFileSync(join(import.meta.dirname, '..', 'skills', 'dsh-intelligent-ui', 'recipes.md'), 'utf8'),
    '"unterminated\n\'also\n`and\n/* never closed',
    '\u{1F600} emoji, été, 中文, tabs\tand\r\nwindows lines',
    '', '\n', '\n\n', '$', '#', '@', '<', '&', '0x', '1e', '.5', 'a.b.c', 'r"""raw"""',
  ]

  it('returns lines that join back into the input, in every language', () => {
    for (const lang of [...CODE_LANGUAGES, 'unknown']) {
      for (const text of corpus) {
        const lines = highlight(text, lang)
        expect(joined(lines), `${lang}: ${text.slice(0, 40)}`).toBe(text)
        expect(lines).toHaveLength(text.split('\n').length)
        for (const token of lines.flat()) expect(token.text).not.toBe('')
      }
    }
  })

  it('survives random text without throwing', () => {
    let seed = 7
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const alphabet = 'ab01_ $#@/*-\'"`\\{}()[]<>!=:;.,\n\t&%'
    for (let round = 0; round < 200; round += 1) {
      const text = Array.from({ length: 1 + Math.floor(random() * 80) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
      for (const lang of CODE_LANGUAGES) expect(joined(highlight(text, lang)), `${lang}: ${JSON.stringify(text)}`).toBe(text)
    }
  })
})
