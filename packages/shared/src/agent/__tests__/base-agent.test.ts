import { describe, expect, it } from 'bun:test'
import { AbortReason } from '../backend/types.ts'
import { TestAgent, createMockBackendConfig, createMockWorkspace } from './test-utils.ts'

describe('BaseAgent retained Pi-neutral behavior', () => {
  it('tracks model and thinking level', () => {
    const agent = new TestAgent(createMockBackendConfig({ model: 'model-a', thinkingLevel: 'low' }))
    expect(agent.getModel()).toBe('model-a')
    expect(agent.getThinkingLevel()).toBe('low')
    agent.setModel('model-b')
    agent.setThinkingLevel('high')
    expect(agent.getModel()).toBe('model-b')
    expect(agent.getThinkingLevel()).toBe('high')
  })

  it('tracks permission mode and workspace', () => {
    const agent = new TestAgent(createMockBackendConfig())
    agent.setPermissionMode('safe')
    expect(agent.getPermissionMode()).toBe('safe')
    expect(agent.isInSafeMode()).toBe(true)
    const workspace = createMockWorkspace({ id: 'other' })
    agent.setWorkspace(workspace)
    expect(agent.getWorkspace().id).toBe('other')
  })

  it('runs chat through the shared wrapper and completes', async () => {
    const agent = new TestAgent(createMockBackendConfig())
    const events = []
    for await (const event of agent.chat('hello')) events.push(event)
    expect(agent.chatCalls[0]?.message).toContain('hello')
    expect(events.at(-1)?.type).toBe('complete')
  })

  it('delegates handoff interrupts to forceAbort', () => {
    const agent = new TestAgent(createMockBackendConfig())
    agent.interruptForHandoff(AbortReason.InternalError)
    expect(agent.forceAbortCalls).toEqual([{ reason: AbortReason.InternalError }])
  })

  it('generates and validates mini-agent titles', async () => {
    const agent = new TestAgent(createMockBackendConfig())
    expect(await agent.generateTitle('hello')).toBe('Test Response')
  })
})
