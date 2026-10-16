import { describe, expect, it } from 'vitest'
import { CATALOG, CATALOG_BY_TYPE, catalogHash, SIZES, TONES } from '../src/lang/catalog.ts'
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
    expect(controls.map(descriptor => descriptor.type)).toEqual(['slider', 'numberInput', 'textInput', 'select', 'checkbox'])
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

describe('the catalog hash', () => {
  it('is a stable eight-digit digest', () => {
    expect(catalogHash()).toMatch(/^[0-9a-f]{8}$/u)
    expect(catalogHash()).toBe(catalogHash())
  })
})
