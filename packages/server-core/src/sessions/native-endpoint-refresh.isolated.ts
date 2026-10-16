import { afterAll, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const configRoot = mkdtempSync(join(tmpdir(), 'native-endpoint-refresh-'))
const previousConfig = process.env.CONFIG_DIR
process.env.CONFIG_DIR = configRoot
const { saveConfig } = await import('@mkagent/shared/config')
const { resolveBackendContext } = await import('@mkagent/shared/agent/backend')
const { SessionManager, createManagedSession } = await import('./SessionManager')
const { buildBackendRuntimeSignature, buildRestartRequiredSignature } = await import('./runtime-config')
afterAll(() => {
  if (previousConfig === undefined) delete process.env.CONFIG_DIR
  else process.env.CONFIG_DIR = previousConfig
  rmSync(configRoot, { recursive: true, force: true })
})

describe('native endpoint edits reach a live session', () => {
  for (const piAuthProvider of ['azure-openai-responses', 'cloudflare-ai-gateway']) {
    it(`updates ${piAuthProvider} after an endpoint-only edit`, async () => {
      const connection = { slug: 'native', name: 'Native', providerType: 'pi' as const,
        authType: 'api_key' as const, piAuthProvider, createdAt: 1,
        defaultModel: 'gpt-4.1', baseUrl: 'https://old.example/v1' }
      const store = (baseUrl: string) => saveConfig({ llmConnections: [{ ...connection, baseUrl }],
        defaultLlmConnection: connection.slug, workspaces: [], activeWorkspaceId: null, activeSessionId: null })
      store(connection.baseUrl)
      const context = resolveBackendContext({ sessionConnectionSlug: connection.slug })
      const input = { connection: context.connection, provider: context.provider,
        authType: context.authType, resolvedModel: context.resolvedModel }
      const managed = createManagedSession({ id: 'session', llmConnection: connection.slug },
        { id: 'ws', slug: 'test', name: 'Test', rootPath: configRoot, createdAt: 1 }, { messagesLoaded: true })
      const updateRuntimeConfig = mock(async (_config: unknown) => true)
      managed.agent = { isProcessing: () => false, updateRuntimeConfig } as any
      managed.backendRuntimeSignature = buildBackendRuntimeSignature(input)
      managed.backendRestartSignature = buildRestartRequiredSignature(input)
      const manager = new SessionManager()
      ;(manager as any).sessions.set('session', managed)
      store('https://new.example/v1')
      await manager.refreshConnectionRuntime(connection.slug)
      expect(updateRuntimeConfig).toHaveBeenCalledTimes(1)
      expect(updateRuntimeConfig.mock.calls[0]?.[0]).toMatchObject({ runtime: { baseUrl: 'https://new.example/v1' } })
      await manager.refreshConnectionRuntime(connection.slug)
      expect(updateRuntimeConfig).toHaveBeenCalledTimes(1)
    })
  }
})
