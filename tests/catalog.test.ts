import { describe, expect, it } from 'vitest'
import { CATALOG, CATALOG_BY_TYPE, catalogHash, SIZES, TONES } from '../src/lang/catalog.ts'
import { PROGRAM_VERSION } from '../src/lang/identity.ts'
import { EXPR_OPERATORS, OPERATOR_SINCE, STATE_KIND_SINCE } from '../src/lang/types.ts'
import { REGISTRY } from '../src/client/components.tsx'

describe('the catalog and the render registry agree in both directions', () => {
  it('has a renderer for every component and no renderer without one', () => {
    expect(Object.keys(REGISTRY).sort()).toEqual(CATALOG.map(descriptor => descriptor.type).sort())
  })

  it('names every component once', () => {
    expect(CATALOG_BY_TYPE.size).toBe(CATALOG.length)
  })
})

describe('every descriptor is internally consistent', () => {
  it('fills a declared text prop, or a formula, from a bare quoted string', () => {
    for (const descriptor of CATALOG) {
      if (descriptor.primary === undefined) continue
      const kind = descriptor.props[descriptor.primary]?.kind
      // A formula's quoted string is its expression; every other primary is display text.
      expect(kind, descriptor.type).toBe(descriptor.type === 'formula' ? 'math' : 'text')
    }
  })

  it('binds each control to one state kind', () => {
    const controls = CATALOG.filter(descriptor => descriptor.props.bind !== undefined)
    expect(controls.map(descriptor => descriptor.type)).toEqual(['slider', 'numberInput', 'textInput', 'select', 'checkbox', 'player'])
    for (const descriptor of controls) expect(descriptor.props.bind?.required, descriptor.type).toBe(true)
  })

  it('gives every container a gap on the 4px grid', () => {
    for (const descriptor of CATALOG.filter(entry => entry.container)) {
      expect(descriptor.props.gap?.kind, descriptor.type).toBe('space')
    }
  })

  it('keeps each description to one short line', () => {
    for (const descriptor of CATALOG) {
      expect(descriptor.description.length, descriptor.type).toBeLessThan(120)
      expect(descriptor.description).not.toContain('\n')
    }
  })

  it('uses only the shared tone and size vocabularies', () => {
    expect(TONES).toEqual(['primary', 'secondary', 'muted', 'success', 'warn', 'error'])
    expect(SIZES).toEqual(['xs', 'sm', 'md', 'lg', 'xl'])
  })

  it('restricts link and image sources by format', () => {
    expect(CATALOG_BY_TYPE.get('link')?.props.url).toEqual(expect.objectContaining({ format: 'url', required: true }))
    expect(CATALOG_BY_TYPE.get('image')?.props.src).toEqual(expect.objectContaining({ format: 'image', required: true }))
  })
})

describe('every field records the version that introduced it', () => {
  /** A version a field may name: a whole number from 1 to the current program version. */
  const valid = (since: unknown): boolean => typeof since === 'number' && Number.isInteger(since) && since >= 1 && since <= PROGRAM_VERSION

  it('dates every component and every prop, never a prop before its component', () => {
    for (const descriptor of CATALOG) {
      expect(valid(descriptor.since), descriptor.type).toBe(true)
      for (const [name, spec] of Object.entries(descriptor.props)) {
        expect(valid(spec.since), `${descriptor.type}.${name}`).toBe(true)
        expect(spec.since, `${descriptor.type}.${name}`).toBeGreaterThanOrEqual(descriptor.since)
      }
    }
  })

  it('dates every operator the evaluator accepts, and only those', () => {
    expect([...EXPR_OPERATORS].sort()).toEqual(Object.keys(OPERATOR_SINCE).sort())
    for (const [operator, since] of Object.entries(OPERATOR_SINCE)) expect(valid(since), operator).toBe(true)
  })

  it('dates every state kind', () => {
    expect(Object.keys(STATE_KIND_SINCE).sort()).toEqual(['boolean', 'number', 'select', 'string'])
    for (const [kind, since] of Object.entries(STATE_KIND_SINCE)) expect(valid(since), kind).toBe(true)
  })

  it('has something new at the current version, so the version is never raised without a field', () => {
    const versions = [
      ...CATALOG.flatMap(descriptor => [descriptor.since, ...Object.values(descriptor.props).map(spec => spec.since)]),
      ...Object.values(OPERATOR_SINCE),
      ...Object.values(STATE_KIND_SINCE),
    ]
    expect(Math.max(...versions)).toBe(PROGRAM_VERSION)
  })
})

describe('the catalog hash', () => {
  it('is a stable eight-digit digest', () => {
    expect(catalogHash()).toMatch(/^[0-9a-f]{8}$/u)
    expect(catalogHash()).toBe(catalogHash())
  })
})
