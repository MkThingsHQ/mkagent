import { describe, expect, it } from 'bun:test'
import { loadAiSettings } from '../ai-settings-loader'

type Api = Parameters<typeof loadAiSettings>[0]
const api = (): Api => ({
  getWorkspaces: async () => [],
  getDefaultThinkingLevel: async () => 'medium',
  getExtendedPromptCache: async () => false,
  getEnable1MContext: async () => true,
  getRtkEnabled: async () => false,
  getRtkStatus: async () => ({ installed: false, version: null, path: null, outdated: false, minSafeVersion: '1.0.0', foundPath: null, updateCommand: '' }),
  getCredentialHealth: async () => ({ healthy: true, issues: [] }),
})

describe('initial AI settings snapshot', () => {
  it('waits for both connection hydration and the credential banner', async () => {
    let releaseConnections!: () => void
    let releaseHealth!: (value: Awaited<ReturnType<Api['getCredentialHealth']>>) => void
    let resolved = false
    const loading = loadAiSettings({ ...api(), getCredentialHealth: () => new Promise(resolve => { releaseHealth = resolve }) },
      () => new Promise<void>(resolve => { releaseConnections = resolve })).then(value => { resolved = true; return value })
    await Promise.resolve()
    expect(resolved).toBe(false)
    releaseConnections()
    await Promise.resolve()
    expect(resolved).toBe(false)
    releaseHealth({ healthy: true, issues: [] })
    expect((await loading).enable1M).toBe(true)
  })

  it('does not serialize independent settings behind a slow workspace lookup', async () => {
    let release!: (value: []) => void
    let healthStarted = false
    const loading = loadAiSettings({ ...api(), getWorkspaces: () => new Promise(resolve => { release = resolve }),
      getCredentialHealth: async () => { healthStarted = true; return { healthy: true, issues: [] } } }, async () => {})
    expect(healthStarted).toBe(true)
    release([])
    await loading
  })

  it('propagates RPC failure instead of presenting invented healthy credentials', async () => {
    await expect(loadAiSettings({ ...api(), getCredentialHealth: async () => { throw new Error('offline') } }, async () => {})).rejects.toThrow('offline')
  })
})
