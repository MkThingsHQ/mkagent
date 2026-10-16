import { afterAll, afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  registerSessionScopedToolCallbacks,
  unregisterSessionScopedToolCallbacks,
} from '../session-scoped-tool-callback-registry.ts'
import type { AgentEvent } from '@mkagent/core/types'

const resources: Array<{ stop(): void }> = []
const tempDirs: string[] = []
const originalConfigDir = process.env.CONFIG_DIR

afterEach(() => {
  for (const resource of resources.splice(0)) resource.stop()
  unregisterSessionScopedToolCallbacks('flow-session')
  unregisterSessionScopedToolCallbacks('flow-failure')
  if (originalConfigDir === undefined) delete process.env.CONFIG_DIR
  else process.env.CONFIG_DIR = originalConfigDir
})

// Config modules retain their initial root for this isolated process. Keep fixtures until every case finishes.
afterAll(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function sse(chunks: unknown[]): Response {
  return new Response(
    chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

describe('Pi conversation flow with a local OpenAI-compatible endpoint', () => {
  it('calls the model, executes a session tool, and emits the final result', async () => {
    let completionCalls = 0
    const requestBodies: Array<Record<string, unknown>> = []
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname.endsWith('/models')) {
          return Response.json({ object: 'list', data: [{ id: 'flow-model', object: 'model' }] })
        }
        if (!url.pathname.endsWith('/chat/completions')) return new Response('not found', { status: 404 })
        requestBodies.push(await request.json() as Record<string, unknown>)
        completionCalls += 1
        if (completionCalls === 1) {
          return sse([
            { id: 'chat-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' } }] },
            { id: 'chat-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-session-info', type: 'function', function: { name: 'mcp__session__get_session_info', arguments: '{}' } }] } }] },
            { id: 'chat-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
          ])
        }
        return sse([
          { id: 'chat-2', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: 'Session flow verified.' } }] },
          { id: 'chat-2', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        ])
      },
    })
    resources.push(server)

    const workspaceRoot = mkdtempSync(join(tmpdir(), 'mkagent-flow-'))
    tempDirs.push(workspaceRoot)
    const configDir = join(workspaceRoot, 'config')
    process.env.CONFIG_DIR = configDir
    const { ensureConfigDir } = await import('../../config/storage.ts')
    ensureConfigDir()
    const { PiAgent } = await import('../pi-agent.ts')
    registerSessionScopedToolCallbacks('flow-session', {
      getSessionInfoFn: () => ({
        id: 'flow-session',
        name: 'Flow Session',
        permissionMode: 'allow-all',
        createdAt: 1,
        isActive: true,
      }),
    })

    const agent = new PiAgent({
      provider: 'pi',
      providerType: 'pi_compat',
      authType: 'none',
      model: 'flow-model',
      workspace: {
        id: 'flow-workspace',
        name: 'Flow Workspace',
        slug: 'flow-workspace',
        rootPath: workspaceRoot,
        createdAt: Date.now(),
      },
      session: {
        id: 'flow-session',
        workspaceRootPath: workspaceRoot,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        permissionMode: 'allow-all',
      },
      isHeadless: true,
      skipConfigWatcher: true,
      runtime: {
        paths: {
          node: process.execPath,
          piServer: resolve(import.meta.dir, '../../../../pi-agent-server/src/index.ts'),
        },
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        customEndpoint: { api: 'openai-completions' },
        customModels: [{ id: 'flow-model', contextWindow: 16_384 }],
      },
    })

    const events: AgentEvent[] = []
    try {
      for await (const event of agent.chat('Inspect this session with get_session_info, then confirm.')) {
        events.push(event)
      }
    } finally {
      agent.destroy()
    }

    expect(completionCalls).toBe(2)
    expect(requestBodies[1]).toBeDefined()
    expect(JSON.stringify(requestBodies[1])).toContain('Flow Session')
    expect(events.some(event => event.type === 'tool_start')).toBe(true)
    expect(events.some(event => event.type === 'tool_result')).toBe(true)
    expect(events.some(event => event.type === 'text_complete' && event.text.includes('Session flow verified.'))).toBe(true)
    expect(events.at(-1)?.type).toBe('complete')
  }, 30_000)
  it('marks a failed session tool as an error and delivers it to the model', async () => {
    let completionCalls = 0
    const requestBodies: Array<Record<string, unknown>> = []
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname.endsWith('/models')) {
          return Response.json({ object: 'list', data: [{ id: 'flow-model', object: 'model' }] })
        }
        if (!url.pathname.endsWith('/chat/completions')) return new Response('not found', { status: 404 })
        requestBodies.push(await request.json() as Record<string, unknown>)
        completionCalls += 1
        if (completionCalls === 1) {
          return sse([
            { id: 'chat-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' } }] },
            { id: 'chat-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-session-info', type: 'function', function: { name: 'mcp__session__get_session_info', arguments: '{}' } }] } }] },
            { id: 'chat-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
          ])
        }
        return sse([
          { id: 'chat-2', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: 'Tool failure received.' } }] },
          { id: 'chat-2', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        ])
      },
    })
    resources.push(server)

    const workspaceRoot = mkdtempSync(join(tmpdir(), 'mkagent-flow-'))
    tempDirs.push(workspaceRoot)
    const configDir = join(workspaceRoot, 'config')
    process.env.CONFIG_DIR = configDir
    const { ensureConfigDir } = await import('../../config/storage.ts')
    ensureConfigDir()
    const { PiAgent } = await import('../pi-agent.ts')
    registerSessionScopedToolCallbacks('flow-failure', {
      getSessionInfoFn: () => { throw new Error('Expected tool failure') },
    })

    const agent = new PiAgent({
      provider: 'pi',
      providerType: 'pi_compat',
      authType: 'none',
      model: 'flow-model',
      workspace: {
        id: 'flow-workspace',
        name: 'Flow Workspace',
        slug: 'flow-workspace',
        rootPath: workspaceRoot,
        createdAt: Date.now(),
      },
      session: {
        id: 'flow-failure',
        workspaceRootPath: workspaceRoot,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        permissionMode: 'allow-all',
      },
      isHeadless: true,
      skipConfigWatcher: true,
      runtime: {
        paths: {
          node: process.execPath,
          piServer: resolve(import.meta.dir, '../../../../pi-agent-server/src/index.ts'),
        },
        baseUrl: `http://127.0.0.1:${server.port}/v1`,
        customEndpoint: { api: 'openai-completions' },
        customModels: [{ id: 'flow-model', contextWindow: 16_384 }],
      },
    })

    const events: AgentEvent[] = []
    try {
      for await (const event of agent.chat('Inspect this session with get_session_info, then confirm.')) {
        events.push(event)
      }
    } finally {
      agent.destroy()
    }

    expect(completionCalls).toBe(2)
    expect(requestBodies[1]).toBeDefined()
    expect(JSON.stringify(requestBodies[1])).toContain('Expected tool failure')
    expect(events.some(event => event.type === 'tool_start')).toBe(true)
    expect(events.some(event => event.type === 'tool_result' && event.isError && event.result.includes('Expected tool failure'))).toBe(true)
    expect(events.some(event => event.type === 'text_complete' && event.text.includes('Tool failure received.'))).toBe(true)
    expect(events.at(-1)?.type).toBe('complete')
  }, 30_000)
  it('runs a shell in the Pi subprocess, reads live output, and stops only that task', async () => {
    let calls = 0
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0,
      async fetch(request) {
        if (!new URL(request.url).pathname.endsWith('/chat/completions')) return new Response('not found', { status: 404 })
        calls++
        return sse(calls === 1 ? [
          { id: 'bg1', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-bg', type: 'function', function: { name: 'bash', arguments: JSON.stringify({ command: 'echo subprocess-live; sleep 30', run_in_background: true }) } }] } }] },
          { id: 'bg1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ] : [
          { id: 'bg2', choices: [{ index: 0, delta: { role: 'assistant', content: 'Command started.' } }] },
          { id: 'bg2', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        ])
      },
    })
    resources.push(server)
    const root = mkdtempSync(join(tmpdir(), 'mkagent-bg-flow-'))
    tempDirs.push(root)
    process.env.CONFIG_DIR = join(root, 'config')
    const { ensureConfigDir } = await import('../../config/storage.ts')
    ensureConfigDir()
    const { PiAgent } = await import('../pi-agent.ts')
    const agent = new PiAgent({ provider: 'pi', providerType: 'pi_compat', authType: 'none', model: 'flow-model',
      workspace: { id: 'flow-workspace', name: 'Flow', slug: 'flow', rootPath: root, createdAt: 1 },
      session: { id: 'flow-bg', workspaceRootPath: root, createdAt: 1, lastUsedAt: 1, permissionMode: 'allow-all' },
      isHeadless: true, skipConfigWatcher: true,
      runtime: { paths: { node: process.execPath, piServer: resolve(import.meta.dir, '../../../../pi-agent-server/src/index.ts') }, baseUrl: `http://127.0.0.1:${server.port}/v1`, customEndpoint: { api: 'openai-completions' }, customModels: [{ id: 'flow-model', contextWindow: 16_384 }] },
    })
    const events: AgentEvent[] = []
    agent.setPermissionMode('allow-all')
    agent.setBackgroundEventSink(event => events.push(event))
    try {
      for await (const event of agent.chat('Run the command in the background.')) events.push(event)
      const launched = events.find(event => event.type === 'shell_backgrounded')
      if (!launched) throw new Error(JSON.stringify(events))
      if (launched?.type !== 'shell_backgrounded') throw new Error('No shell background event')
      const result = events.find(event => event.type === 'tool_result' && event.toolUseId === launched.toolUseId)
      expect(result?.type === 'tool_result' && result.result).toContain('Output is being written to:')
      expect(await agent.stopBackgroundTask(launched.shellId)).toBe(true)
      expect(events).toContainEqual(expect.objectContaining({ type: 'task_completed', taskId: launched.shellId, status: 'stopped' }))
    } finally { agent.destroy() }
  }, 30_000)

})
