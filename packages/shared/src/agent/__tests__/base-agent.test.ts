import { beforeEach, describe, expect, it } from 'bun:test'
import { AbortReason } from '../backend/types.ts'
import { TestAgent, createMockBackendConfig, createMockWorkspace } from './test-utils.ts'

describe('BaseAgent retained Pi-neutral behavior', () => {
  let agent: TestAgent

  beforeEach(() => {
    agent = new TestAgent(createMockBackendConfig())
  })

  it('initializes with the configured model', () => expect(agent.getModel()).toBe('test-model'))

  it('allows setting the model', () => {
    agent.setModel('new-model')
    expect(agent.getModel()).toBe('new-model')
  })

  it('initializes with the configured thinking level', () => expect(agent.getThinkingLevel()).toBe('medium'))

  it('allows setting the thinking level', () => {
    agent.setThinkingLevel('max')
    expect(agent.getThinkingLevel()).toBe('max')
  })

  it('has a valid permission mode', () => expect(['safe', 'ask', 'allow-all']).toContain(agent.getPermissionMode()))

  it('notifies on permission mode changes', () => {
    let notified = ''
    agent.onPermissionModeChange = mode => { notified = mode }
    agent.setPermissionMode('allow-all')
    expect(notified).toBe('allow-all')
  })

  it('cycles permission modes', () => {
    const initial = agent.getPermissionMode()
    expect(agent.cyclePermissionMode()).not.toBe(initial)
  })

  it('returns the configured workspace', () => expect(agent.getWorkspace().id).toBe('test-workspace-id'))

  it('has and updates the session ID', () => {
    expect(agent.getSessionId()).toBeTruthy()
    agent.setSessionId('new-session')
    expect(agent.getSessionId()).toBe('new-session')
  })

  it('exposes the permission manager', () => expect(agent.getPermissionManager()).toBeTruthy())

  it('tracks processing state', () => expect(agent.isProcessing()).toBe(false))

  it('tracks abort calls', async () => {
    await agent.abort('test reason')
    expect(agent.abortCalls).toEqual([{ reason: 'test reason' }])
  })

  it('tracks permission responses', () => {
    agent.respondToPermission('req-1', true, false)
    expect(agent.respondToPermissionCalls).toEqual([{ requestId: 'req-1', allowed: true, alwaysAllow: false }])
  })

  it('cleans up through destroy and dispose', () => {
    expect(() => agent.destroy()).not.toThrow()
    expect(() => agent.dispose()).not.toThrow()
  })

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
