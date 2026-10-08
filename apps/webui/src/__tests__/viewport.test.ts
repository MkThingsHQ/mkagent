import { afterEach, describe, expect, it } from 'bun:test'
import { installViewportRoot } from '../viewport'
import { measureInputAvailableHeight } from '../../../electron/src/renderer/lib/input-viewport'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
afterEach(() => {
  for (const [name, descriptor] of [['window', originalWindow], ['document', originalDocument]] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

function fixture() {
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  const visualViewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 })
  const host = Object.assign(new EventTarget(), {
    innerWidth: 390, innerHeight: 844, visualViewport,
    getComputedStyle: () => ({ zoom: '1.2', paddingTop: '0', paddingBottom: '0' }),
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id },
    cancelAnimationFrame: (key: number) => { frames.delete(key) },
  })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: host })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: {} } })
  const properties = new Map<string, string>()
  const root = { style: {
    getPropertyValue: (key: string) => properties.get(key) ?? '',
    setProperty: (key: string, value: string) => { properties.set(key, value) },
    removeProperty: (key: string) => { properties.delete(key) },
  } } as unknown as HTMLElement
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }
  return { host, root, properties, frames, flush }
}

describe('WebUI visible root', () => {
  it('tracks keyboard open/pan/close and orientation, coalescing events and cleaning up', () => {
    const { host, root, properties, frames, flush } = fixture()
    const stop = installViewportRoot(root)
    expect(properties.get('--webui-viewport-width')).toBe('325px')
    Object.assign(host.visualViewport, { height: 300, offsetTop: 180 })
    host.visualViewport.dispatchEvent(new Event('resize'))
    host.visualViewport.dispatchEvent(new Event('scroll'))
    expect(frames.size).toBe(1)
    flush()
    expect(properties.get('--webui-viewport-height')).toBe('250px')
    expect(properties.get('--webui-viewport-top')).toBe('150px')
    Object.assign(host.visualViewport, { height: 390, width: 844, offsetTop: 0 })
    host.dispatchEvent(new Event('orientationchange'))
    flush()
    expect(properties.get('--webui-viewport-top')).toBe('0px')
    expect(properties.get('--webui-viewport-height')).toBe('325px')
    host.dispatchEvent(new Event('resize'))
    expect(frames.size).toBe(1)
    stop()
    expect(frames.size).toBe(0)
    expect(properties.size).toBe(0)
    host.visualViewport.dispatchEvent(new Event('resize'))
    expect(frames.size).toBe(0)
  })

  it('does not double count pinch scale, and restores pre-existing styles on cleanup', () => {
    const { host, root, properties } = fixture()
    Object.assign(host.visualViewport, { height: 240, width: 195, scale: 2, offsetLeft: 30 })
    properties.set('--webui-viewport-height', '500px')
    const stop = installViewportRoot(root)
    expect(properties.get('--webui-viewport-height')).toBe('200px')
    expect(properties.get('--webui-viewport-width')).toBe('162.5px')
    expect(properties.get('--webui-viewport-left')).toBe('25px')
    stop()
    expect(properties.get('--webui-viewport-height')).toBe('500px')
  })

  it('uses layout-window resize when VisualViewport is unavailable', () => {
    const { host, root, properties, flush } = fixture()
    Reflect.deleteProperty(host, 'visualViewport')
    const stop = installViewportRoot(root)
    host.innerHeight = 360
    host.dispatchEvent(new Event('resize'))
    flush()
    expect(properties.get('--webui-viewport-height')).toBe('300px')
    expect(properties.get('--webui-viewport-top')).toBe('0px')
    stop()
  })
})

describe('stable input parent measurement', () => {
  it('subtracts safe-area padding and outer badges once without a composer growth feedback loop', () => {
    const { host } = fixture()
    Object.assign(host.visualViewport, { height: 480 })
    Object.assign(host, { getComputedStyle: () => ({ zoom: '1.2', paddingTop: '20', paddingBottom: '10' }) })
    const panel = { getBoundingClientRect: () => ({ top: 0, bottom: 480 }) }
    let inputHeight = 120
    let badgesHeight = 24
    const element = {
      closest: () => panel,
      getBoundingClientRect: () => ({ height: inputHeight }),
      parentElement: { getBoundingClientRect: () => ({ height: inputHeight + badgesHeight }) },
    } as unknown as HTMLElement
    // 400 local px - 30 safe-area px - 20 outer px - 16 gap.
    expect(measureInputAvailableHeight(element)).toBe(334)
    inputHeight = 240
    expect(measureInputAvailableHeight(element)).toBe(334)
    badgesHeight = 48
    expect(measureInputAvailableHeight(element)).toBe(314)
  })
})
