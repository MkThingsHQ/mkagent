import { describe, expect, it } from 'bun:test'
import { flipTransform, springTiming } from '../flip'
import { SPRING, springToCss } from '../presets'

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height })

describe('flipTransform', () => {
  it('translates an element back to its old position (sidebar collapse: panel moved left 232px)', () => {
    expect(flipTransform(rect(238, 50, 900, 800), rect(6, 50, 1132, 800))).toBe('translate(232px, 0px)')
  })

  it('returns null when nothing moved', () => {
    expect(flipTransform(rect(10, 10, 100, 100), rect(10.2, 10, 100, 100))).toBeNull()
  })

  it('scale mode only scales (the parent carries the translation)', () => {
    // card material grew from 900 to 1132px wide: start at 900/1132 and scale up to 1
    expect(flipTransform(rect(238, 50, 900, 800), rect(6, 50, 1132, 800), 'scale', 'x')).toBe('scale(0.7951, 1)')
  })

  it('rect mode translates and scales', () => {
    expect(flipTransform(rect(100, 0, 50, 20), rect(0, 0, 100, 20), 'rect', 'x')).toBe('translate(100px, 0px) scale(0.5, 1)')
  })

  it('respects the axis', () => {
    expect(flipTransform(rect(0, 40, 10, 10), rect(30, 0, 10, 10), 'translate', 'y')).toBe('translate(0px, 40px)')
    expect(flipTransform(rect(0, 40, 10, 10), rect(30, 0, 10, 10), 'translate', 'x')).toBe('translate(-30px, 0px)')
  })

  it('keeps the right edge fixed when a card material scales while its parent translates', () => {
    const before = rect(238, 0, 900, 10)
    const after = rect(6, 0, 1132, 10)
    // parent translate dx, material scale s (origin left): right edge = after.left + dx + after.width * s
    const dx = before.left - after.left
    const s = before.width / after.width
    expect(after.left + dx + after.width * s).toBeCloseTo(before.left + before.width, 6)
  })
})

describe('springTiming', () => {
  it('plays the presets as their CSS linear() curve when supported', () => {
    const timing = springTiming(SPRING.panel)
    const css = springToCss(SPRING.panel)
    // bun has no CSS.supports → the standard-ease fallback; in a browser the linear() curve is used
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)')) {
      expect(timing).toEqual({ easing: css.easing, duration: css.durationMs })
    } else {
      expect(timing).toEqual({ easing: 'cubic-bezier(0.4, 0, 0.2, 1)', duration: 300 })
    }
  })
})
