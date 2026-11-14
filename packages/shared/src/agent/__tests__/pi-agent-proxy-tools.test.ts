import { describe, expect, it } from 'bun:test'
import { PiAgent } from '../pi-agent'
import type { BackendConfig } from '../backend/types'

function createAgent(profile: 'default' | 'coding' = 'default') {
  const agent = new PiAgent({
    workspace: { id: 'proxy-tools-test', name: 'Proxy tools', rootPath: '/tmp/pi-proxy-tools-ws', createdAt: 1 },
    session: { id: 'proxy-tools-test', workspaceRootPath: '/tmp/pi-proxy-tools-ws', createdAt: 1, lastUsedAt: 1 },
    isHeadless: true,
    agentProfile: profile,
  } as BackendConfig)
  const sent: Array<{ type: string; tools: Array<{ name: string }> }> = []
  const runtime = agent as unknown as { send: (message: unknown) => void; subprocess: unknown; syncProxyTools: () => void }
  runtime.send = message => sent.push(message as typeof sent[number])
  runtime.subprocess = { stdin: { writable: true }, kill: () => {} }
  return { agent, runtime, sync: () => runtime.syncProxyTools(), sets: () => sent.filter(m => m.type === 'register_tools').map(m => m.tools.map(t => t.name)) }
}

describe('PiAgent proxy tools', () => {
  it('sends a complete session tool set once when unchanged', () => {
    const { sync, sets } = createAgent()
    sync(); sync()
    expect(sets()).toHaveLength(1)
    expect(sets()[0]).toContain('mcp__session__SubmitPlan')
    expect(sets()[0]).toContain('mcp__session__config_validate')
  })

  it('replaces the set when a fresh session changes to Coding mode', () => {
    const { agent, sync, sets } = createAgent()
    sync()
    agent.setAgentProfile('coding')
    expect((agent as unknown as { subprocess: unknown }).subprocess).toBeNull()
    ;(agent as unknown as { subprocess: unknown }).subprocess = { stdin: { writable: true }, kill: () => {} }
    sync()
    expect(sets()).toHaveLength(2)
    expect(sets()[1]).not.toContain('mcp__session__config_validate')
    expect(sets()[1]).toContain('mcp__session__pr_status')
    expect(sets()[1]).toContain('mcp__session__spawn_session')
    expect(sets()[1]).toContain('mcp__session__call_llm')
  })

  it('offers retained Coding tools without restoring Sources or Pages', () => {
    const { sync, sets } = createAgent('coding')
    sync()
    for (const tool of ['source_oauth_trigger', 'source_test', 'create_page', 'project_memory_append']) expect(sets()[0]).not.toContain(`mcp__session__${tool}`)
    expect(sets()[0]).toContain('mcp__session__transform_data')
    expect(sets()[0]).toContain('mcp__session__mermaid_validate')
  })

  it('sends nothing until a subprocess is available', () => {
    const { runtime, sync, sets } = createAgent()
    runtime.subprocess = null
    sync()
    expect(sets()).toHaveLength(0)
    runtime.subprocess = { stdin: { writable: true }, kill: () => {} }
    sync()
    expect(sets()).toHaveLength(1)
  })
})
