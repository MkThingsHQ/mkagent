import { expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

it('counts real Pi API calls across turns, disk reload, fork and independent child sessions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mkagent-pi-usage-'))
  const oldConfig = process.env.CONFIG_DIR
  process.env.CONFIG_DIR = root
  const workspaceRoot = join(root, 'workspaces', 'usage')
  mkdirSync(workspaceRoot, { recursive: true })
  const workspace = { id: 'ws-usage', name: 'Usage', slug: 'usage', rootPath: workspaceRoot, createdAt: 1 }
  let calls = 0
  const requests: any[] = []
  let signalStreaming: () => void = () => {}
  const streaming = new Promise<void>(resolve => { signalStreaming = resolve })
  const endpoint = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const body = await request.json() as any
    requests.push(body)
    calls++
    if (calls === 9) {
      signalStreaming()
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ id: 'stopped', choices: [{ index: 0, delta: { role: 'assistant', content: 'Streaming' } }] }) + '\n\n'))
      } }), { headers: { 'content-type': 'text/event-stream' } })
    }
    const toolCall = calls <= 2 || calls === 8
    const chunk = (delta: unknown, finish_reason: string | null = null) => ({ id: `api-${calls}`, choices: [{ index: 0, delta, finish_reason }] })
    const pieces = toolCall ? [
      chunk({ role: 'assistant' }),
      chunk({ tool_calls: [{ index: 0, id: `tool-${calls}`, type: 'function', function: { name: 'mcp__session__get_session_info', arguments: '{}' } }] }),
      chunk({}, 'tool_calls'),
    ] : [chunk({ role: 'assistant', content: `Usage reply ${calls}` }), chunk({}, 'stop')]
    return new Response([...pieces, { id: `api-${calls}`, choices: [], usage: { prompt_tokens: calls * 100, completion_tokens: calls * 10, total_tokens: calls * 110 } }].map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
  } })
  writeFileSync(join(workspaceRoot, 'config.json'), JSON.stringify({ ...workspace, defaults: { model: 'usage-model', defaultLlmConnection: 'usage', permissionMode: 'allow-all', thinkingLevel: 'off' }, updatedAt: 1 }))
  writeFileSync(join(root, 'config.json'), JSON.stringify({ workspaces: [workspace], activeWorkspaceId: workspace.id, activeSessionId: null, defaultLlmConnection: 'usage', llmConnections: [{ slug: 'usage', name: 'Local usage', providerType: 'pi_compat', authType: 'none', baseUrl: `http://127.0.0.1:${endpoint.port}/v1`, customEndpoint: { api: 'openai-completions' }, models: [{ id: 'usage-model', contextWindow: 16384 }, { id: 'child-model', contextWindow: 16384 }], defaultModel: 'usage-model', createdAt: 1 }] }))
  const { ensureConfigDir } = await import('@mkagent/shared/config')
  ensureConfigDir()
  const { SessionManager, setSessionPlatform } = await import('./SessionManager')
  const { createHeadlessPlatform } = await import('../runtime/platform-headless')
  const { loadSession } = await import('@mkagent/shared/sessions')
  const { registerSettingsHandlers } = await import('../handlers/rpc/settings')
  const { RPC_CHANNELS } = await import('@mkagent/shared/protocol')
  const platform = createHeadlessPlatform()
  platform.appRootPath = resolve(import.meta.dir, '../../../..')
  setSessionPlatform(platform)
  let manager = new SessionManager()
  const events: any[] = []
  try {
    await manager.initialize()
    manager.setEventSink((_channel, _target, event) => events.push(event))
    // Actual workspace RPC validation and persisted settings, including clear.
    const handlers = new Map<string, any>()
    registerSettingsHandlers({ handle: (channel: string, handler: any) => handlers.set(channel, handler) } as any, { sessionManager: manager, platform } as any)
    const update = handlers.get(RPC_CHANNELS.workspace.SETTINGS_UPDATE)
    const get = handlers.get(RPC_CHANNELS.workspace.SETTINGS_GET)
    const starters = [{ label: 'Use skill', prompt: 'Run [skill:ws-usage:daily]' }]
    await update({}, workspace.id, 'chatStarters', starters)
    expect((await get({}, workspace.id)).chatStarters).toEqual(starters)
    await expect(update({}, workspace.id, 'chatStarters', Array(4).fill(starters[0]))).rejects.toThrow('at most 3')
    expect(JSON.parse(readFileSync(join(workspaceRoot, 'config.json'), 'utf8')).chatStarters).toEqual(starters)
    await update({}, workspace.id, 'chatStarters', [])
    expect((await get({}, workspace.id)).chatStarters).toEqual([])

    const parent = await manager.createSession(workspace.id, { name: 'Parent' })
    await manager.sendMessage(parent.id, 'Inspect this session twice and confirm.')
    expect(calls).toBe(3)
    expect((await manager.getSession(parent.id))?.tokenUsage).toMatchObject({ inputTokens: 300, outputTokens: 60, costUsd: 0 })
    await manager.sendMessage(parent.id, 'Continue the parent')
    expect((await manager.getSession(parent.id))?.tokenUsage).toMatchObject({ inputTokens: 400, outputTokens: 100 })
    const storedParent = loadSession(workspaceRoot, parent.id)!
    expect(storedParent.tokenUsage.outputTokens).toBe(100)
    const cutoff = storedParent.messages.find(m => m.type === 'assistant' && m.content.includes('Usage reply 3'))!
    expect(cutoff).toBeDefined()
    const branch = await manager.createSession(workspace.id, { name: 'Branch', branchFromSessionId: parent.id, branchFromMessageId: cutoff.id })
    expect(branch.tokenUsage?.outputTokens).toBe(0)
    await manager.sendMessage(branch.id, 'Continue only the branch')
    expect((await manager.getSession(branch.id))?.tokenUsage?.outputTokens).toBe(50)
    expect((await manager.getSession(parent.id))?.tokenUsage?.outputTokens).toBe(100)
    expect(JSON.stringify(requests[4].messages)).toContain('Usage reply 3')
    expect(JSON.stringify(requests[4].messages)).not.toContain('Continue the parent')

    // Actual registered spawn callback must preserve an explicit model and independent counters.
    const parentAgent = (manager as any).sessions.get(parent.id).agent
    const childResult = await parentAgent.onSpawnSession({ name: 'Child', prompt: 'One narrow check', model: 'child-model' })
    for (let attempt = 0; attempt < 200; attempt++) {
      if (loadSession(workspaceRoot, childResult.sessionId)?.tokenUsage.outputTokens === 60) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(childResult.model).toBe('child-model')
    expect(requests[5].model).toBe('child-model')
    expect(loadSession(workspaceRoot, childResult.sessionId)?.tokenUsage.outputTokens).toBe(60)
    expect(loadSession(workspaceRoot, parent.id)?.tokenUsage.outputTokens).toBe(100)
    expect(events.filter(e => e.type === 'complete' && e.sessionId === parent.id).at(-1)?.tokenUsage.outputTokens).toBe(100)

    manager.cleanup()
    manager = new SessionManager()
    await manager.initialize()
    await manager.sendMessage(parent.id, 'Resume parent after restart')
    expect(loadSession(workspaceRoot, parent.id)?.tokenUsage.outputTokens).toBe(170)
    expect(loadSession(workspaceRoot, branch.id)?.tokenUsage.outputTokens).toBe(50)
    const interrupted = manager.sendMessage(parent.id, 'Inspect once then stream until stopped')
    await streaming
    await manager.cancelProcessing(parent.id)
    await interrupted
    // The finished tool API's 80 output tokens must survive Stop; the in-flight
    // ninth response has no final usage yet and cannot be invented.
    expect(loadSession(workspaceRoot, parent.id)?.tokenUsage.outputTokens).toBe(250)
  } finally {
    manager.cleanup()
    endpoint.stop()
    if (oldConfig === undefined) delete process.env.CONFIG_DIR
    else process.env.CONFIG_DIR = oldConfig
    rmSync(root, { recursive: true, force: true })
  }
}, 60_000)
