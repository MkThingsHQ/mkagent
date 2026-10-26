import { expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

it('persists settings, ingests real HEIF, and applies caps/windows in the actual Pi subprocess', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mkagent-0153-runtime-'))
  const previous = process.env.CONFIG_DIR
  process.env.CONFIG_DIR = root
  const wsRoot = join(root, 'workspace')
  mkdirSync(wsRoot)
  const workspace = { id: 'ws-sync', name: 'Sync', slug: 'sync', rootPath: wsRoot, createdAt: 1 }
  const requests: any[] = []
  let normalCalls = 0
  const endpoint = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const body = await request.json() as any
    requests.push(body)
    const summary = String(body.messages[0]?.content).startsWith('You are a context summarization assistant.')
    const normal = Array.isArray(body.tools) && body.tools.length > 0
    if (normal) normalCalls++
    const content = summary ? '## Goal\nVerify synchronization.\n## Progress\nChecked configuration.\n## Next Steps\nContinue testing.' : 'Verified fixture.'
    const promptTokens = summary ? 100 : normal && normalCalls === 2 ? 110000 : 500
    const parts = [
      { id: `call-${requests.length}`, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] },
      { id: `call-${requests.length}`, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      { id: `call-${requests.length}`, choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: 10, total_tokens: promptTokens + 10 } },
    ]
    return new Response(parts.map(value => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  } })
  const connection = { slug: 'fixture', name: 'Fixture', providerType: 'pi_compat', authType: 'none', baseUrl: `http://127.0.0.1:${endpoint.port}/v1`, customEndpoint: { api: 'openai-completions', maxTokens: 32768, supportsImages: true }, models: [{ id: 'large', contextWindow: 262144 }, { id: 'small', contextWindow: 131072 }], defaultModel: 'large', createdAt: 1 }
  writeFileSync(join(wsRoot, 'config.json'), JSON.stringify({ ...workspace, updatedAt: 1, defaults: { model: 'large', defaultLlmConnection: 'fixture', permissionMode: 'allow-all', thinkingLevel: 'off' } }))
  writeFileSync(join(root, 'config.json'), JSON.stringify({ workspaces: [workspace], activeWorkspaceId: workspace.id, activeSessionId: null, defaultLlmConnection: 'fixture', autoCompactWindow: 100000, llmConnections: [connection] }))
  const config = await import('@mkagent/shared/config')
  config.ensureConfigDir()
  const { SessionManager, setSessionPlatform } = await import('./SessionManager')
  const { createHeadlessPlatform } = await import('../runtime/platform-headless')
  const { registerFilesHandlers } = await import('../handlers/rpc/files')
  const { registerSettingsHandlers } = await import('../handlers/rpc/settings')
  const { registerLlmConnectionsHandlers } = await import('../handlers/rpc/llm-connections')
  const { RPC_CHANNELS } = await import('@mkagent/shared/protocol')
  const platform = createHeadlessPlatform()
  platform.appRootPath = resolve(import.meta.dir, '../../../..')
  setSessionPlatform(platform)
  let manager = new SessionManager()
  const events: any[] = []
  try {
    await manager.initialize()
    manager.setEventSink((_channel, _target, event) => event && events.push(event))
    const handlers = new Map<string, any>()
    const server = { handle: (channel: string, handler: any) => handlers.set(channel, handler) }
    const deps = { sessionManager: manager, platform }
    registerSettingsHandlers(server as any, deps as any)
    registerFilesHandlers(server as any, deps as any)
    registerLlmConnectionsHandlers(server as any, deps as any)
    const setWindow = handlers.get(RPC_CHANNELS.settings.SET_AUTO_COMPACT_WINDOW)
    const getWindow = handlers.get(RPC_CHANNELS.settings.GET_AUTO_COMPACT_WINDOW)
    expect(await getWindow({})).toBe(100000)
    await expect(setWindow({}, 99999)).rejects.toThrow('Compaction window')
    expect(await getWindow({})).toBe(100000)
    const session = await manager.createSession(workspace.id)
    // Same real encoded 320x240 HEIC fixture as the upstream decoder regression.
    const fixtureSource = readFileSync(join(import.meta.dir, '../services/heic.test.ts'), 'utf8')
    const base64 = fixtureSource.match(/const HEIC_FIXTURE_BASE64 =\s*'([^']+)'/)![1]!
    const bytes = Buffer.from(base64, 'base64')
    const store = handlers.get(RPC_CHANNELS.file.STORE_ATTACHMENT)
    const stored = await store({ workspaceId: workspace.id }, session.id, { type: 'image', name: 'photo.heif', mimeType: 'image/heif', size: bytes.length, base64 })
    expect(stored).toMatchObject({ name: 'photo.heif', mimeType: 'image/jpeg', originalMimeType: 'image/heif', originalSize: bytes.length })
    expect(stored.storedPath).toEndWith('.jpg')
    expect(readFileSync(stored.storedPath)[0]).toBe(255)
    expect(stored.thumbnailBase64).toBeTruthy()
    await expect(store({ workspaceId: workspace.id }, session.id, { type: 'image', name: 'broken.heic', mimeType: 'image/heic', size: 12, base64: Buffer.alloc(12).toString('base64') })).rejects.toThrow('Could not decode HEIC/HEIF')
    await manager.sendMessage(session.id, 'Inspect image. ' + 'A fixture sentence. '.repeat(6000), [{ type: 'image', name: stored.name, path: stored.storedPath, mimeType: stored.mimeType, size: stored.size, base64: stored.resizedBase64 }], [stored])
    expect(JSON.stringify(requests[0].messages)).toContain('data:image/jpeg;base64,')
    expect(requests[0].max_tokens ?? requests[0].max_completion_tokens).toBe(32768)
    const current = await manager.getSession(session.id)
    expect(current?.tokenUsage?.contextUsage).toMatchObject({ limitTokens: 100000 })
    await manager.sendMessage(session.id, 'Continue second turn. ' + 'Another fixture sentence. '.repeat(6000))
    // Actual SDK automatic compaction must issue a summary request with the configured cap.
    expect(requests.length).toBeGreaterThan(2)
    for (let attempt = 0; attempt < 200 && !events.some(event => event.statusType === 'compaction_complete'); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
    expect(events.some(event => event.statusType === 'compaction_complete')).toBe(true)
    expect(requests.some(body => (body.max_tokens ?? body.max_completion_tokens) === 32768 && String(body.messages[0]?.content).startsWith('You are a context summarization assistant.'))).toBe(true)
    expect((await manager.getSession(session.id))?.currentStatus).toBeUndefined()
    // In-place endpoint edits must update model registration, without losing the journal.
    const saveConnection = handlers.get(RPC_CHANNELS.llmConnections.SAVE)
    expect(await saveConnection({}, { ...connection, customEndpoint: { ...connection.customEndpoint, maxTokens: 0 } })).toMatchObject({ success: false })
    expect(config.getLlmConnection('fixture')?.customEndpoint?.maxTokens).toBe(32768)
    expect(await saveConnection({}, { ...connection, customEndpoint: { ...connection.customEndpoint, maxTokens: 16384 } })).toMatchObject({ success: true })
    await manager.refreshConnectionRuntime('fixture')
    const setupConnection = handlers.get(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION)
    expect(await setupConnection({}, { slug: 'fixture', credential: '', baseUrl: connection.baseUrl, defaultModel: 'large', models: ['large', 'small'], customEndpoint: { ...connection.customEndpoint, maxTokens: 16384 }, updateOnly: true })).toMatchObject({ success: true })
    expect(config.getLlmConnection('fixture')?.models?.[0]).toMatchObject({ id: 'large', contextWindow: 262144 })
    await manager.updateSessionModel(session.id, workspace.id, 'small')
    await manager.sendMessage(session.id, 'Continue after switching model.')
    expect(requests.at(-1).model).toBe('small')
    expect(requests.at(-1).max_tokens ?? requests.at(-1).max_completion_tokens).toBe(16384)
    expect((await manager.getSession(session.id))?.tokenUsage?.contextUsage).toMatchObject({ limitTokens: 100000 })
    await setWindow({}, 200000)
    await manager.sendMessage(session.id, 'Apply updated global window.')
    // The small model clamps to its SDK default trigger, never above its hard window.
    const limit = (await manager.getSession(session.id))?.tokenUsage?.contextUsage?.limitTokens
    expect(limit).toBeGreaterThan(100000)
    expect(limit).toBeLessThan(131072)
    manager.cleanup()
    manager = new SessionManager()
    await manager.initialize()
    manager.setEventSink((_channel, _target, event) => event && events.push(event))
    await manager.sendMessage(session.id, 'Resume after restart.')
    expect(JSON.stringify(requests.at(-1).messages)).toContain('Apply updated global window.')
    expect((await manager.getSession(session.id))?.tokenUsage?.contextUsage?.limitTokens).toBe(limit)
    await manager.sendMessage(session.id, 'Prepare manual compact. ' + 'First retained fixture sentence. '.repeat(6000))
    await manager.sendMessage(session.id, 'Prepare second compact turn. ' + 'Second retained fixture sentence. '.repeat(6000))
    const billedBefore = (await manager.getSession(session.id))?.tokenUsage?.outputTokens
    await manager.sendMessage(session.id, '/compact')
    expect((await manager.getSession(session.id))?.tokenUsage?.contextUsage?.limitTokens).toBe(limit)
    expect((await manager.getSession(session.id))?.tokenUsage?.outputTokens).toBe(billedBefore)
    expect(requests.at(-1).max_tokens ?? requests.at(-1).max_completion_tokens).toBe(13107)
    config.addLlmConnection({ ...config.getLlmConnection('fixture')!, slug: 'other', name: 'Other fixture', baseUrl: `http://127.0.0.1:${endpoint.port}/v2`, customEndpoint: { api: 'openai-completions', maxTokens: 24576 }, models: [{ id: 'small', name: 'Small', shortName: 'Small', description: 'Fixture', provider: 'pi', contextWindow: 524288 }], defaultModel: 'small' })
    await manager.updateSessionModel(session.id, workspace.id, 'small', 'other')
    await manager.sendMessage(session.id, 'Continue on a different connection.')
    expect((await manager.getSession(session.id))?.tokenUsage?.contextUsage?.limitTokens).toBe(200000)
    expect(requests.at(-1).max_tokens ?? requests.at(-1).max_completion_tokens).toBe(24576)
    expect(JSON.stringify(requests.at(-1).messages).includes('Second retained fixture sentence.')).toBe(true)
    await setWindow({}, null)
    expect(await getWindow({})).toBeUndefined()
    expect(JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')).autoCompactWindow).toBeUndefined()
  } finally {
    manager.cleanup()
    endpoint.stop()
    if (previous === undefined) delete process.env.CONFIG_DIR
    else process.env.CONFIG_DIR = previous
    rmSync(root, { recursive: true, force: true })
  }
}, 60000)
