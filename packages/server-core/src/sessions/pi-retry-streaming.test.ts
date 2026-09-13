import { describe, expect, it } from 'bun:test'
import type { AgentEvent } from '@mkagent/core/types'
import type { SessionEvent } from '@mkagent/shared/protocol'
import { SessionManager, createManagedSession } from './SessionManager.ts'

type ManagedSession = ReturnType<typeof createManagedSession>
type EventHarness = {
  handleAgentEvent(managed: ManagedSession, event: AgentEvent): boolean
  emit(workspaceId: string, event: SessionEvent): void
  persistSession(managed: ManagedSession): void
  nextTimestamp(): number
  activeViewingByWorkspace: Map<string, string>
}

function harness() {
  const manager = Object.create(SessionManager.prototype) as EventHarness
  const events: SessionEvent[] = []
  manager.emit = (_workspaceId, event) => { events.push(event) }
  manager.persistSession = () => {}
  manager.nextTimestamp = () => Date.now()
  manager.activeViewingByWorkspace = new Map()
  const managed = createManagedSession({ id: 'retry-test' }, {
    id: 'workspace', slug: 'workspace', name: 'Test', rootPath: '/unused-retry-test', createdAt: Date.now(),
  })
  return {
    managed,
    events,
    fire: (event: AgentEvent) => manager.handleAgentEvent(managed, event),
  }
}

describe('Pi retry streaming boundaries', () => {
  it('forwards discard and retry events without persisting transient state', () => {
    const { managed, events, fire } = harness()
    fire({ type: 'text_delta', text: 'Failed partial', turnId: 'attempt-0' })
    fire({ type: 'text_discard', turnId: 'attempt-0' })
    fire({ type: 'retry', phase: 'backoff', message: 'Retrying in 2s...' })

    expect(events).toEqual([
      { type: 'text_delta', sessionId: managed.id, delta: 'Failed partial', turnId: 'attempt-0' },
      { type: 'text_discard', sessionId: managed.id, turnId: 'attempt-0' },
      { type: 'retry', sessionId: managed.id, phase: 'backoff', message: 'Retrying in 2s...' },
    ])
    expect(managed.messages).toHaveLength(0)
    expect(managed.currentStatus).toBeUndefined()
  })

  it('persists only the recovered completed answer', () => {
    const { managed, events, fire } = harness()
    fire({ type: 'text_delta', text: 'Discard me', turnId: 'attempt-0' })
    fire({ type: 'text_discard', turnId: 'attempt-0' })
    fire({ type: 'retry', phase: 'active' })
    fire({ type: 'text_delta', text: 'Recovered', turnId: 'attempt-1' })
    fire({ type: 'text_complete', text: 'Recovered', turnId: 'attempt-1' })
    fire({ type: 'retry', phase: 'end' })

    expect(managed.messages).toHaveLength(1)
    expect(managed.messages[0]).toMatchObject({
      role: 'assistant',
      content: 'Recovered',
      turnId: 'attempt-1',
    })
    expect(events.filter(event => event.type === 'text_complete')).toHaveLength(1)
  })
})
