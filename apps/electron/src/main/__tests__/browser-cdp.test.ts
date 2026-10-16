/**
 * Tests for BrowserCDP (Chrome DevTools Protocol helpers).
 *
 * Mocks webContents.debugger to test accessibility snapshots,
 * element interaction, and CDP lifecycle management.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'

// Mock logger before import
mock.module('../logger', () => {
  const stubLog = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }
  return {
    mainLog: stubLog,
    sessionLog: stubLog,
    handlerLog: stubLog,
    windowLog: stubLog,
    agentLog: stubLog,
    searchLog: stubLog,
    isDebugMode: false,
    getLogFilePath: () => '/tmp/main.log',
  }
})

const { BrowserCDP, resolveCdpKey } = await import('../browser-cdp')

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockWebContents(sendCommandImpl?: (method: string, params?: any) => Promise<any>) {
  const listeners: Record<string, Function[]> = {}
  return {
    debugger: {
      attach: mock((_version: string) => {}),
      detach: mock(() => {}),
      sendCommand: mock(sendCommandImpl ?? (async () => ({ nodes: [] }))),
      on: mock((event: string, cb: Function) => {
        if (!listeners[event]) listeners[event] = []
        listeners[event].push(cb)
      }),
    },
    getURL: mock(() => 'https://example.com'),
    getTitle: mock(() => 'Example Page'),
    _debuggerListeners: listeners,
    _triggerDetach: () => {
      for (const cb of listeners['detach'] || []) cb()
    },
  }
}

/** Name of the page function in a Runtime.callFunctionOn call (its `craft:` marker comment). */
function pageFunction(params: any): string | undefined {
  return /craft:([a-z-]+)/.exec(String(params?.functionDeclaration ?? ''))?.[1]
}

type PageAnswers = Record<string, (params: any, call: number) => unknown>

/**
 * A page with one clickable button (@e1, backend node 42) answering the CDP calls the input layer
 * makes. `answers` overrides page functions by marker name (returned value, or `{ objectId }` for
 * element results); `quads` overrides the element's content quads.
 */
function createPage(options: { answers?: PageAnswers; quads?: number[][]; viewport?: { clientWidth: number; clientHeight: number }; role?: string } = {}) {
  const sent: Array<{ method: string; params: any }> = []
  const calls = new Map<string, number>()
  const defaults: PageAnswers = {
    'hit-test': () => ({ ok: true }),
    'read-click-probe': () => ({ down: true, click: true }),
  }
  const wc = createMockWebContents(async (method, params) => {
    sent.push({ method, params })
    if (method === 'Accessibility.getFullAXTree') {
      return { nodes: [{ role: { value: options.role ?? 'button' }, name: { value: 'Go' }, backendDOMNodeId: 42 }] }
    }
    if (method === 'DOM.resolveNode') return { object: { objectId: `node-${params.backendNodeId}` } }
    if (method === 'DOM.getBoxModel') return { model: { content: [10, 10, 50, 10, 50, 50, 10, 50] } }
    if (method === 'DOM.getContentQuads') return { quads: options.quads ?? [[10, 10, 50, 10, 50, 50, 10, 50]] }
    if (method === 'Page.getLayoutMetrics') return { cssLayoutViewport: options.viewport ?? { clientWidth: 800, clientHeight: 600 } }
    if (method === 'Runtime.callFunctionOn') {
      const name = pageFunction(params) ?? ''
      const call = (calls.get(name) ?? 0) + 1
      calls.set(name, call)
      const answer = options.answers?.[name] ?? defaults[name]
      const value = answer ? answer(params, call) : true
      if (value && typeof value === 'object' && 'objectId' in (value as object)) return { result: value }
      if (value instanceof Error) throw value
      return { result: { type: typeof value, value } }
    }
    return {}
  })
  const mouse = () => sent.filter((c) => c.method === 'Input.dispatchMouseEvent').map((c) => c.params)
  const keys = () => sent.filter((c) => c.method === 'Input.dispatchKeyEvent').map((c) => c.params)
  const ran = (name: string) => calls.get(name) ?? 0
  return { wc, sent, mouse, keys, ran }
}

async function cdpOnPage(page: ReturnType<typeof createPage>) {
  const cdp = new BrowserCDP(page.wc as any)
  await cdp.getAccessibilitySnapshot()
  return cdp
}

// ============================================================================
// Tests
// ============================================================================

describe('BrowserCDP', () => {
  describe('ensureAttached', () => {
    it('attaches debugger on first call', async () => {
      const wc = createMockWebContents()
      const cdp = new BrowserCDP(wc as any)

      // Trigger attach via a CDP command
      await cdp.getAccessibilitySnapshot()

      expect(wc.debugger.attach).toHaveBeenCalledTimes(1)
      expect(wc.debugger.attach).toHaveBeenCalledWith('1.3')
    })

    it('skips attach on subsequent calls', async () => {
      const wc = createMockWebContents()
      const cdp = new BrowserCDP(wc as any)

      await cdp.getAccessibilitySnapshot()
      await cdp.getAccessibilitySnapshot()

      expect(wc.debugger.attach).toHaveBeenCalledTimes(1)
    })

    it('handles already-attached error gracefully', async () => {
      const wc = createMockWebContents()
      wc.debugger.attach = mock(() => { throw new Error('Already attached to this target') })
      const cdp = new BrowserCDP(wc as any)

      // Should not throw
      await cdp.getAccessibilitySnapshot()
      expect(wc.debugger.sendCommand).toHaveBeenCalled()
    })

    it('registers detach listener only once', async () => {
      const wc = createMockWebContents()
      const cdp = new BrowserCDP(wc as any)

      // Trigger ensureAttached multiple times by simulating detach + re-attach
      await cdp.getAccessibilitySnapshot()

      // Simulate detach
      wc._triggerDetach()

      // Re-attach
      await cdp.getAccessibilitySnapshot()

      // The 'on' for 'detach' should only be called once (guard prevents duplicates)
      const detachCalls = (wc.debugger.on as any).mock.calls.filter(
        (call: any[]) => call[0] === 'detach'
      )
      expect(detachCalls.length).toBe(1)
    })
  })

  describe('getAccessibilitySnapshot', () => {
    it('parses AX tree nodes and assigns refs', async () => {
      const wc = createMockWebContents(async (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return {
            nodes: [
              { role: { value: 'button' }, name: { value: 'Submit' }, backendDOMNodeId: 100 },
              { role: { value: 'textbox' }, name: { value: 'Email' }, value: { value: 'test@example.com' }, backendDOMNodeId: 101, properties: [
                { name: 'focused', value: { value: true } },
              ]},
              { role: { value: 'link' }, name: { value: 'Home' }, backendDOMNodeId: 102 },
            ],
          }
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      const snapshot = await cdp.getAccessibilitySnapshot()

      expect(snapshot.url).toBe('https://example.com')
      expect(snapshot.title).toBe('Example Page')
      expect(snapshot.nodes).toHaveLength(3)

      expect(snapshot.nodes[0].ref).toBe('@e1')
      expect(snapshot.nodes[0].role).toBe('button')
      expect(snapshot.nodes[0].name).toBe('Submit')

      expect(snapshot.nodes[1].ref).toBe('@e2')
      expect(snapshot.nodes[1].value).toBe('test@example.com')
      expect(snapshot.nodes[1].focused).toBe(true)

      expect(snapshot.nodes[2].ref).toBe('@e3')
      expect(snapshot.nodes[2].role).toBe('link')
    })

    it('keeps refs stable for same backend nodes across reordered snapshots', async () => {
      let snapshotCallCount = 0
      const wc = createMockWebContents(async (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          snapshotCallCount += 1

          if (snapshotCallCount === 1) {
            return {
              nodes: [
                { role: { value: 'combobox' }, name: { value: 'Sort' }, value: { value: 'created-oldest' }, backendDOMNodeId: 200 },
                { role: { value: 'button' }, name: { value: 'Apply' }, backendDOMNodeId: 201 },
              ],
            }
          }

          return {
            nodes: [
              { role: { value: 'button' }, name: { value: 'Apply' }, backendDOMNodeId: 201 },
              { role: { value: 'combobox' }, name: { value: 'Sort' }, value: { value: 'updated-newest' }, backendDOMNodeId: 200 },
            ],
          }
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      const first = await cdp.getAccessibilitySnapshot()
      const second = await cdp.getAccessibilitySnapshot()

      const firstSortRef = first.nodes.find((n) => n.name === 'Sort')?.ref
      const secondSortRef = second.nodes.find((n) => n.name === 'Sort')?.ref

      expect(firstSortRef).toBeDefined()
      expect(secondSortRef).toBeDefined()
      expect(firstSortRef).toBe(secondSortRef)
    })

    it('skips non-interactive, non-content nodes', async () => {
      const wc = createMockWebContents(async (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return {
            nodes: [
              { role: { value: 'generic' }, name: { value: '' } },       // Filtered: generic + no name
              { role: { value: 'none' }, name: { value: '' } },          // Filtered: none + no name
              { role: { value: 'button' }, name: { value: 'OK' } },      // Kept: interactive
              { role: { value: 'heading' }, name: { value: 'Title' } },  // Kept: content + name
              { role: { value: 'heading' }, name: { value: '' } },       // Filtered: content without name
            ],
          }
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      const snapshot = await cdp.getAccessibilitySnapshot()

      expect(snapshot.nodes).toHaveLength(2)
      expect(snapshot.nodes[0].role).toBe('button')
      expect(snapshot.nodes[1].role).toBe('heading')
    })

    it('caps at 500 nodes', async () => {
      const manyNodes = Array.from({ length: 600 }, (_, i) => ({
        role: { value: 'button' },
        name: { value: `Button ${i}` },
        backendDOMNodeId: i,
      }))

      const wc = createMockWebContents(async (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return { nodes: manyNodes }
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      const snapshot = await cdp.getAccessibilitySnapshot()

      expect(snapshot.nodes).toHaveLength(500)
      expect(snapshot.nodes[499].ref).toBe('@e500')
    })

    it('normalizes role casing for primary filtering', async () => {
      const wc = createMockWebContents(async (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return {
            nodes: [
              { role: { value: 'Button' }, name: { value: 'Submit' }, backendDOMNodeId: 1 },
            ],
          }
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      const snapshot = await cdp.getAccessibilitySnapshot()

      expect(snapshot.nodes).toHaveLength(1)
      expect(snapshot.nodes[0].role).toBe('button')
      expect(snapshot.nodes[0].name).toBe('Submit')
    })

    it('uses fallback selection when primary filtering keeps zero nodes', async () => {
      const wc = createMockWebContents(async (method) => {
        if (method === 'Accessibility.getFullAXTree') {
          return {
            nodes: [
              { role: { value: 'grouping' }, name: { value: 'Recents List' }, backendDOMNodeId: 21 },
              { role: { value: 'pane' }, name: { value: 'Shared Files' }, backendDOMNodeId: 22 },
            ],
          }
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      const snapshot = await cdp.getAccessibilitySnapshot()

      expect(snapshot.nodes).toHaveLength(2)
      expect(snapshot.nodes[0].name).toBe('Recents List')
      expect(snapshot.nodes[1].name).toBe('Shared Files')
    })

    it('keeps fallback nodes clickable through ref mapping', async () => {
      const page = createPage({ role: 'pane' })
      const cdp = new BrowserCDP(page.wc as any)
      const snapshot = await cdp.getAccessibilitySnapshot()

      expect(snapshot.nodes).toHaveLength(1)
      await cdp.clickElement('@e1')

      expect(page.sent.map((c) => c.method)).toContain('DOM.resolveNode')
      expect(page.mouse().some((e) => e.type === 'mousePressed')).toBe(true)
    })
  })

  describe('clickElement', () => {
    it('throws for unknown ref', async () => {
      const wc = createMockWebContents()
      const cdp = new BrowserCDP(wc as any)

      await expect(cdp.clickElement('@e99')).rejects.toThrow('not found')
    })

    it('clicks the centre of the visible element with trusted CDP input, no window focus needed', async () => {
      const page = createPage()
      const cdp = await cdpOnPage(page)

      const outcome = await cdp.clickElement('@e1')

      expect(outcome.via).toBe('mouse')
      const pressed = page.mouse().filter((e) => e.type === 'mousePressed')
      expect(pressed).toHaveLength(1)
      expect(pressed[0]).toMatchObject({ x: 30, y: 30, button: 'left', buttons: 1, clickCount: 1 })
      expect(page.mouse().at(-1)).toMatchObject({ type: 'mouseReleased', x: 30, y: 30, buttons: 0 })
      // Scrolled into view (instantly) before measuring, and the delivery probe was read.
      expect(page.ran('scroll-into-view')).toBe(1)
      expect(page.ran('read-click-probe')).toBe(1)
      expect(page.ran('script-click')).toBe(0)
    })

    it('aims at the largest part of the element inside the viewport', async () => {
      // A card taller than the viewport and a sliver: the box centre (y=550) is off screen.
      const page = createPage({ quads: [[100, 300, 300, 300, 300, 800, 100, 800], [0, 0, 1, 0, 1, 1, 0, 1]], viewport: { clientWidth: 800, clientHeight: 600 } })
      const cdp = await cdpOnPage(page)

      await cdp.clickElement('@e1')

      expect(page.mouse().find((e) => e.type === 'mousePressed')).toMatchObject({ x: 200, y: 450 })
    })

    it('clicks with DOM events when something covers the element, and says what', async () => {
      const page = createPage({ answers: { 'hit-test': () => ({ ok: false, covering: 'div.modal-backdrop' }) } })
      const cdp = await cdpOnPage(page)

      const outcome = await cdp.clickElement('@e1')

      expect(outcome).toMatchObject({ via: 'script', note: 'it was covered by div.modal-backdrop' })
      expect(page.mouse().some((e) => e.type === 'mousePressed')).toBe(false)
      expect(page.ran('script-click')).toBe(1)
    })

    it('clicks with DOM events when the mouse click never reached the element', async () => {
      const page = createPage({ answers: { 'read-click-probe': () => ({ down: false, click: false }) } })
      const cdp = await cdpOnPage(page)

      const outcome = await cdp.clickElement('@e1')

      expect(outcome).toMatchObject({ via: 'script', note: 'the mouse click did not reach it' })
      expect(page.ran('script-click')).toBe(1)
    })

    it('clicks with DOM events when no part of the element is on screen', async () => {
      const page = createPage({ quads: [] })
      const cdp = await cdpOnPage(page)

      const outcome = await cdp.clickElement('@e1')

      expect(outcome.via).toBe('script')
      expect(page.mouse()).toHaveLength(0)
    })

    it('does not click twice when the click navigated the page', async () => {
      const page = createPage({ answers: { 'read-click-probe': () => new Error('Execution context was destroyed.') } })
      const cdp = await cdpOnPage(page)

      const outcome = await cdp.clickElement('@e1')

      expect(outcome.via).toBe('mouse')
      expect(page.ran('script-click')).toBe(0)
    })
  })

  describe('pressKey', () => {
    it('sends named keys through CDP with their key codes', async () => {
      const page = createPage()
      const cdp = new BrowserCDP(page.wc as any)

      expect(await cdp.pressKey('Escape')).toBe(true)
      expect(await cdp.pressKey('Enter')).toBe(true)

      expect(page.keys().every(event => event.nativeVirtualKeyCode === undefined)).toBe(true)
      expect(page.keys()).toEqual([
        expect.objectContaining({ type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }),
        expect.objectContaining({ type: 'keyUp', key: 'Escape' }),
        expect.objectContaining({ type: 'keyDown', key: 'Enter', text: '\r', windowsVirtualKeyCode: 13 }),
        expect.objectContaining({ type: 'keyUp', key: 'Enter' }),
      ])
    })

    it('leaves Ctrl/Cmd shortcuts and unknown keys to the native path', async () => {
      const page = createPage()
      const cdp = new BrowserCDP(page.wc as any)

      expect(await cdp.pressKey('a', ['meta'])).toBe(false)
      expect(await cdp.pressKey('a', ['control'])).toBe(false)
      expect(await cdp.pressKey('MediaPlayPause')).toBe(false)
      expect(page.keys()).toHaveLength(0)
    })

    it('maps accelerator names, letters with shift, and function keys', () => {
      expect(resolveCdpKey('Up')).toMatchObject({ key: 'ArrowUp', keyCode: 38 })
      expect(resolveCdpKey('page_down')).toMatchObject({ key: 'PageDown', keyCode: 34 })
      expect(resolveCdpKey('a', true)).toMatchObject({ key: 'A', code: 'KeyA', keyCode: 65, text: 'A' })
      expect(resolveCdpKey('7')).toMatchObject({ code: 'Digit7', text: '7' })
      expect(resolveCdpKey('F5')).toMatchObject({ key: 'F5', keyCode: 116 })
      expect(resolveCdpKey('?')).toBeNull()
    })
  })

  describe('fillElement', () => {
    it('focuses, clears, and types characters', async () => {
      const sentCommands: string[] = []
      const wc = createMockWebContents(async (method) => {
        sentCommands.push(method)
        if (method === 'Accessibility.getFullAXTree') {
          return {
            nodes: [
              { role: { value: 'textbox' }, name: { value: 'Input' }, backendDOMNodeId: 10 },
            ],
          }
        }
        if (method === 'DOM.resolveNode') {
          return { object: { objectId: 'obj-10' } }
        }
        if (method === 'DOM.getBoxModel') {
          return { model: { content: [10, 10, 50, 10, 50, 50, 10, 50] } }
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      await cdp.getAccessibilitySnapshot()

      await cdp.fillElement('@e1', 'ab')

      expect(sentCommands).toContain('DOM.focus')
      expect(sentCommands).toContain('Runtime.callFunctionOn')
      // Two characters typed: 2 keyDown + 2 keyUp = 4 key events
      const keyEvents = sentCommands.filter(c => c === 'Input.dispatchKeyEvent')
      expect(keyEvents.length).toBe(4)
    })
  })

  describe('fillElement value settling', () => {
    // React-controlled inputs ignore value writes React's tracker did not see; the native setter
    // plus an input event is what React listens to.
    it('clears and settles through the page, and reports a password field', async () => {
      const page = createPage({ role: 'textbox', answers: { 'settle-value': () => ({ isPassword: true }) } })
      const cdp = await cdpOnPage(page)

      const result = await cdp.fillElement('@e1', 'pw')

      expect(result.isPassword).toBe(true)
      expect(page.ran('clear-value')).toBe(1)
      expect(page.sent.find((c) => pageFunction(c.params) === 'settle-value')?.params.arguments).toEqual([{ value: 'pw' }])
    })
  })

  describe('selectOption', () => {
    it('chooses a native <select> option in the page', async () => {
      const page = createPage({ role: 'combobox', answers: { 'select-native': () => ({ ok: true }) } })
      const cdp = await cdpOnPage(page)

      await cdp.selectOption('@e1', 'United States')

      const call = page.sent.find((c) => pageFunction(c.params) === 'select-native')
      expect(call?.params.arguments).toEqual([{ value: 'United States' }])
      expect(page.mouse()).toHaveLength(0)
    })

    it('reports the options when a native select has no match', async () => {
      const page = createPage({ role: 'combobox', answers: { 'select-native': () => ({ ok: false, options: ['Canada', 'Mexico'] }) } })
      const cdp = await cdpOnPage(page)

      await expect(cdp.selectOption('@e1', 'Peru')).rejects.toThrow('no option matches "Peru" (options: Canada, Mexico)')
    })

    // Found 2026-10-11: Radix Select renders its listbox in a portal after the click, so the old
    // single-pass search ran before it existed ("option not found in active listbox").
    it('opens a custom select, waits for its listbox, and clicks the option', async () => {
      const page = createPage({
        role: 'combobox',
        answers: {
          'select-native': () => null,
          'popup-baseline': () => false,
          'find-popup': (_params, call) => (call < 3 ? null : { objectId: 'listbox-1' }),
          'find-option': () => ({ objectId: 'option-us' }),
          'option-text': () => 'United States',
          'verify-selection': () => ({ ok: true }),
        },
      })
      const cdp = await cdpOnPage(page)

      await cdp.selectOption('@e1', 'united')

      expect(page.ran('find-popup')).toBe(3)
      // Two trusted clicks: the trigger, then the option.
      expect(page.mouse().filter((e) => e.type === 'mousePressed')).toHaveLength(2)
      const verify = page.sent.find((c) => pageFunction(c.params) === 'verify-selection')
      expect(verify?.params.arguments).toEqual([{ objectId: 'listbox-1' }, { objectId: 'option-us' }, { value: 'United States' }])
    })

    it('types into the search box when the option is not rendered yet', async () => {
      const page = createPage({
        role: 'combobox',
        answers: {
          'select-native': () => null,
          'popup-baseline': () => true,
          'find-popup': () => ({ objectId: 'list-1' }),
          'find-option': (params) => (page.ran('type-search') > 0 ? { objectId: 'option-1' } : null),
          'find-search-input': () => ({ objectId: 'search-1' }),
          'option-text': () => 'Zimbabwe',
          'verify-selection': () => ({ ok: true }),
        },
      })
      const cdp = await cdpOnPage(page)

      await cdp.selectOption('@e1', 'Zimb')

      expect(page.ran('type-search')).toBe(1)
      // Already open: only the option was clicked.
      expect(page.mouse().filter((e) => e.type === 'mousePressed')).toHaveLength(1)
    })

    it('falls back to Enter on the option when the click did not change the control', async () => {
      const page = createPage({
        role: 'combobox',
        answers: {
          'select-native': () => null,
          'popup-baseline': () => true,
          'find-popup': () => ({ objectId: 'list-1' }),
          'find-option': () => ({ objectId: 'option-1' }),
          'option-text': () => 'Medium',
          'verify-selection': (_params, call) => ({ ok: call > 1 }),
        },
      })
      const cdp = await cdpOnPage(page)

      await cdp.selectOption('@e1', 'Medium')

      expect(page.ran('focus')).toBe(1)
      expect(page.keys().some((k) => k.key === 'Enter')).toBe(true)
    })
  })

  describe('drag', () => {
    it('dispatches pressed -> moved -> released with expected button state', async () => {
      const mouseEvents: any[] = []
      const wc = createMockWebContents(async (method, params) => {
        if (method === 'Input.dispatchMouseEvent') {
          mouseEvents.push(params)
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      await cdp.drag(10, 20, 110, 20)

      expect(mouseEvents.length).toBeGreaterThan(2)
      expect(mouseEvents[0]).toMatchObject({
        type: 'mousePressed',
        x: 10,
        y: 20,
        button: 'left',
        buttons: 1,
      })

      const movedEvents = mouseEvents.filter((event) => event.type === 'mouseMoved')
      expect(movedEvents.length).toBeGreaterThan(0)
      for (const event of movedEvents) {
        expect(event.buttons).toBe(1)
      }

      const lastEvent = mouseEvents[mouseEvents.length - 1]
      expect(lastEvent).toMatchObject({
        type: 'mouseReleased',
        button: 'left',
        buttons: 0,
      })
    })

    it('attempts release even when a move event fails and rethrows original error', async () => {
      const mouseEvents: any[] = []
      let failedOnce = false
      const wc = createMockWebContents(async (method, params) => {
        if (method === 'Input.dispatchMouseEvent') {
          mouseEvents.push(params)
          if (params?.type === 'mouseMoved' && !failedOnce) {
            failedOnce = true
            throw new Error('move failed')
          }
        }
        return {}
      })

      const cdp = new BrowserCDP(wc as any)
      await expect(cdp.drag(0, 0, 100, 0)).rejects.toThrow('move failed')
      expect(mouseEvents.some((event) => event.type === 'mouseReleased')).toBe(true)
    })
  })

  describe('detach', () => {
    it('detaches debugger', async () => {
      const wc = createMockWebContents()
      const cdp = new BrowserCDP(wc as any)

      // Attach first
      await cdp.getAccessibilitySnapshot()

      cdp.detach()
      expect(wc.debugger.detach).toHaveBeenCalled()
    })

    it('is safe to call when not attached', () => {
      const wc = createMockWebContents()
      const cdp = new BrowserCDP(wc as any)

      // Should not throw
      expect(() => cdp.detach()).not.toThrow()
    })
  })
})


it('does not idle-detach while a CDP command is still in flight', async () => {
  let finish!: (value: unknown) => void
  const wc = createMockWebContents(async method => {
    if (method === 'Runtime.evaluate') return new Promise(resolve => { finish = resolve })
    return { nodes: [] }
  })
  const cdp = new BrowserCDP(wc as never)
  await cdp.getAccessibilitySnapshot()
  const pending = cdp.getViewportMetrics()
  try {
    await new Promise(resolve => setTimeout(resolve, 5_100))
    expect(wc.debugger.detach).not.toHaveBeenCalled()
  } finally {
    finish({ result: { value: { width: 800, height: 600 } } })
    await pending
    cdp.detach()
  }
}, 10_000)
