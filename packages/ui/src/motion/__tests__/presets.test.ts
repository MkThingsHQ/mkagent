/**
 * The motion presets are the TypeScript mirror of the motion tokens in tokens.css.
 * These tests keep the two in sync and pin the spring physics from the design spec (§6.2).
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DURATION, EASE, SPRING, springParams, springToCss } from '../presets'

const css = readFileSync(join(import.meta.dir, '../../styles/tokens.css'), 'utf-8')
const token = (name: string) => {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`${name} not found in tokens.css`)
  return match[1]!.trim()
}

describe('motion presets ↔ tokens.css', () => {
  it('durations match --dur-*', () => {
    for (const [name, seconds] of Object.entries(DURATION)) {
      expect(`${name}: ${token(`--dur-${name}`)}`).toBe(`${name}: ${Math.round(seconds * 1000)}ms`)
    }
  })

  it('easings match --ease-*', () => {
    const cssName = { out: '--ease-out', outSubtle: '--ease-out-subtle', standard: '--ease-standard', exit: '--ease-exit' } as const
    for (const [name, bezier] of Object.entries(EASE)) {
      expect(token(cssName[name as keyof typeof cssName])).toBe(`cubic-bezier(${bezier.join(', ')})`)
    }
  })

  for (const name of ['snap', 'base', 'panel'] as const) {
    it(`--spring-${name} is the ${name} spring as CSS linear()`, () => {
      const { easing, durationMs } = springToCss(SPRING[name])
      expect(token(`--spring-${name}`)).toBe(easing)
      expect(token(`--spring-${name}-dur`)).toBe(`${durationMs}ms`)
    })
  }
})

describe('spring presets', () => {
  it('always pair visualDuration with bounce', () => {
    for (const spring of Object.values(SPRING)) {
      if ('visualDuration' in spring) expect(typeof spring.bounce).toBe('number')
    }
  })

  it('resolve to the stiffness/damping in the design spec', () => {
    const rounded = (name: keyof typeof SPRING) => {
      const { stiffness, damping } = springParams(SPRING[name])
      return [Math.round(stiffness), Math.round(damping)]
    }
    expect(rounded('snap')).toEqual([1218, 70])
    expect(rounded('base')).toEqual([566, 48])
    expect(rounded('panel')).toEqual([350, 37])
    expect(rounded('gentle')).toEqual([268, 30])
    expect(rounded('gesture')).toEqual([380, 31])
  })
})
