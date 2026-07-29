import { describe, expect, it } from 'bun:test'
import { SessionManager, createManagedSession } from './SessionManager.ts'

describe('SessionManager browser session-tool binding', () => {
  it('forwards browser actions to the Craft BrowserPaneManager contract', async () => {
    const calls: string[] = []
    const browser = new Proxy({}, {
      get(_target, property) {
        const name = String(property)
        if (name === 'getOrCreateForSessionAsync') return async () => 'browser-1'
        if (name === 'navigate') return async (id: string, url: string) => { calls.push(`${id}:${url}`); return { url, title: 'Example' } }
        if (name === 'getInstanceAsync') return async () => ({ title: 'Example', currentUrl: 'https://example.com' })
        if (name === 'listInstancesAsync') return async () => []
        if (name === 'getAccessibilitySnapshot') return async () => ({ url: '', title: '', nodes: [] })
        if (name === 'screenshot' || name === 'screenshotRegion') return async () => ({ imageBuffer: Buffer.from('image'), imageFormat: 'png' })
        if (name === 'getConsoleLogs' || name === 'getNetworkLogs' || name === 'getDownloads') return async () => []
        if (name === 'getClipboard') return async () => ''
        if (name === 'windowResize') return async () => ({ width: 800, height: 600 })
        if (name === 'waitFor') return async () => ({ ok: true, kind: 'text', elapsedMs: 1, detail: 'ready' })
        if (name === 'detectSecurityChallenge') return async () => ({ detected: false, provider: '', signals: [] })
        if (name === 'clearAgentControlForInstance') return () => ({ released: true })
        return async () => {}
      },
    })
    const manager = new SessionManager()
    manager.setBrowserPaneManager(browser as never)
    const workspace = { id: 'ws', name: 'Workspace', slug: 'workspace', rootPath: '/tmp/workspace', createdAt: 1 }
    const managed = createManagedSession({ id: 'session', workspaceRootPath: workspace.rootPath }, workspace as never)
    const fns = (manager as unknown as { createBrowserPaneFns(value: unknown): any }).createBrowserPaneFns(managed)

    expect(await fns.navigate('https://example.com')).toEqual({ url: 'https://example.com', title: 'Example' })
    expect(calls).toEqual(['browser-1:https://example.com'])
    expect((await fns.screenshot()).imageFormat).toBe('png')
    expect((await fns.releaseControl()).action).toBe('released')
  })
})
