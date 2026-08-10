import { afterEach, describe, expect, it } from 'bun:test'
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
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  unregisterSessionScopedToolCallbacks('flow-session')
  if (originalConfigDir === undefined) delete process.env.CONFIG_DIR
  else process.env.CONFIG_DIR = originalConfigDir
})

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
})
