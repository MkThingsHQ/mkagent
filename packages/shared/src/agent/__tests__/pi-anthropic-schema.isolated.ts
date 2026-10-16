import { expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

it('sends closed Anthropic schemas through the actual Pi SDK and preloaded interceptor', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mkagent-anthropic-schema-'))
  const oldConfig = process.env.CONFIG_DIR
  process.env.CONFIG_DIR = root
  let body: any
  const endpoint = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    body = await request.json()
    const events = [
      ['message_start', { type: 'message_start', message: { id: 'schema-1', type: 'message', role: 'assistant', content: [], model: 'schema-model', stop_reason: null, stop_sequence: null, usage: { input_tokens: 40, output_tokens: 0 } } }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Anthropic schema verified' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 12 } }],
      ['message_stop', { type: 'message_stop' }],
    ]
    return new Response(events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  } })
  const { ensureConfigDir } = await import('../../config/storage')
  ensureConfigDir()
  const { PiAgent } = await import('../pi-agent')
  const agent = new PiAgent({
    provider: 'pi', providerType: 'pi_compat', authType: 'none', model: 'schema-model',
    workspace: { id: 'schema-ws', name: 'Schema', slug: 'schema', rootPath: root, createdAt: 1 },
    session: { id: 'schema-session', workspaceRootPath: root, createdAt: 1, lastUsedAt: 1 },
    isHeadless: true, skipConfigWatcher: true,
    runtime: { paths: { node: process.execPath, piServer: resolve(import.meta.dir, '../../../../pi-agent-server/src/index.ts'), interceptor: resolve(import.meta.dir, '../../unified-network-interceptor.ts') }, baseUrl: `http://127.0.0.1:${endpoint.port}`, customEndpoint: { api: 'anthropic-messages' }, customModels: [{ id: 'schema-model', contextWindow: 16384 }] },
  })
  try {
    const events: any[] = []
    for await (const event of agent.chat('Confirm schemas.')) events.push(event)
    expect(events.some(e => e.type === 'text_complete' && e.text === 'Anthropic schema verified')).toBe(true)
    expect(events.at(-1)?.usage).toMatchObject({ inputTokens: 40, outputTokens: 12 })
    const tool = body.tools.find((t: any) => t.name === 'mcp__session__get_session_info')
    expect(tool).toBeDefined()
    expect(tool.input_schema.additionalProperties).toBe(false)
    expect(tool.input_schema.properties._intent).toBeDefined()
    expect(tool.input_schema.properties._displayName).toBeDefined()
  } finally {
    agent.destroy()
    endpoint.stop()
    if (oldConfig === undefined) delete process.env.CONFIG_DIR
    else process.env.CONFIG_DIR = oldConfig
    rmSync(root, { recursive: true, force: true })
  }
}, 30_000)
