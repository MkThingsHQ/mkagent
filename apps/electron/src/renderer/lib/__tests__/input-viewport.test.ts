import { describe, expect, it } from 'bun:test'
import { getInputAvailableHeight, getViewportRect, subscribeViewportChanges } from '../input-viewport'
import { getComposerMaxHeight } from '../../components/app-shell/input/composer-height'

describe('input viewport geometry', () => {
  it('is browser-safe without a window', () => {
    expect(getViewportRect()).toEqual({ top: 0, left: 0, width: 0, height: 0, cssZoom: 1 })
  })

  it('uses the visible keyboard viewport and offset, not layout window height', () => {
    const viewport = getViewportRect({ innerWidth: 390, innerHeight: 844, visualViewport: { width: 390, height: 320, offsetTop: 200, offsetLeft: 0, scale: 1 } }, 1.2)
    expect(viewport).toEqual({ top: 200, left: 0, width: 390, height: 320, cssZoom: 1.2 })
    expect(getInputAvailableHeight(viewport, { top: 100, bottom: 800 }, 20)).toBe(246)
  })

  it('converts CSS zoom exactly once, without dividing by pinch scale again', () => {
    const viewport = getViewportRect({ innerWidth: 390, innerHeight: 844, visualViewport: { width: 195, height: 200, offsetTop: 100, offsetLeft: 20, scale: 2 } }, 1.2)
    expect(getInputAvailableHeight(viewport)).toBe(166)
    expect(viewport.width / viewport.cssZoom).toBe(162.5)
  })

  it('intersects parent bounds and visible viewport before reserving outer space', () => {
    const viewport = { top: 80, left: 0, width: 390, height: 320, cssZoom: 1.2 }
    expect(getInputAvailableHeight(viewport, { top: 120, bottom: 360 }, 30)).toBe(170)
    expect(getInputAvailableHeight(viewport, { top: 500, bottom: 600 })).toBe(0)
  })

  it('falls back to window resize geometry and rejects invalid zoom', () => {
    expect(getViewportRect({ innerWidth: 800, innerHeight: 600 }, 0)).toEqual({ top: 0, left: 0, width: 800, height: 600, cssZoom: 1 })
    expect(getInputAvailableHeight(getViewportRect({ innerWidth: 800, innerHeight: 600 }))).toBe(600)
  })

  it('recovers keyboard offsets and landscape dimensions on subsequent reads', () => {
    const host = { innerWidth: 390, innerHeight: 844, visualViewport: { width: 390, height: 300, offsetTop: 220, offsetLeft: 0, scale: 1 } }
    expect(getViewportRect(host).top).toBe(220)
    Object.assign(host.visualViewport, { width: 844, height: 390, offsetTop: 0 })
    expect(getViewportRect(host)).toMatchObject({ top: 0, width: 844, height: 390 })
  })
})

describe('composer budget', () => {
  it('bounds freeform including the toolbar on narrow and landscape screens', () => {
    expect(getComposerMaxHeight(250, 'freeform')).toBe(165)
    expect(getComposerMaxHeight(1000, 'freeform')).toBe(584)
    expect(getComposerMaxHeight(250, 'structured')).toBe(175)
  })
  it('does not let structured minimum height exceed actual available space', () => {
    expect(getComposerMaxHeight(100, 'structured')).toBe(100)
    expect(getComposerMaxHeight(0, 'freeform')).toBe(0)
  })
})

describe('viewport subscriptions', () => {
  it('handles keyboard resize, panning, orientation and window fallback; fully cleans up', () => {
    const host = new EventTarget() as EventTarget & { visualViewport: EventTarget }
    host.visualViewport = new EventTarget()
    let updates = 0
    const stop = subscribeViewportChanges(host, () => { updates++ })
    for (const [target, type] of [[host, 'resize'], [host, 'orientationchange'], [host.visualViewport, 'resize'], [host.visualViewport, 'scroll']] as const) {
      target.dispatchEvent(new Event(type))
    }
    expect(updates).toBe(4)
    stop()
    host.dispatchEvent(new Event('resize'))
    host.visualViewport.dispatchEvent(new Event('scroll'))
    expect(updates).toBe(4)
    const fallback = new EventTarget()
    const stopFallback = subscribeViewportChanges(fallback, () => { updates++ })
    fallback.dispatchEvent(new Event('resize'))
    expect(updates).toBe(5)
    stopFallback()
  })
})
