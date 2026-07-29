import { describe, expect, it } from 'bun:test'
import type { SessionEvent } from '../dto.ts'

describe('session workflow event protocol', () => {
  it('carries workflow identity on task launch events', () => {
    const event = {
      type: 'task_backgrounded',
      sessionId: 'session-1',
      toolUseId: 'tool-1',
      taskId: 'task-1',
      kind: 'workflow',
      workflowId: 'workflow-1',
    } satisfies SessionEvent

    expect(event).toMatchObject({ kind: 'workflow', workflowId: 'workflow-1' })
  })

  it('represents live workflow agent completion events', () => {
    const event = {
      type: 'workflow_agent_completed',
      sessionId: 'session-1',
      workflowId: 'workflow-1',
      agentId: 'agent-1',
      turnId: 'turn-1',
    } satisfies SessionEvent

    expect(event.type).toBe('workflow_agent_completed')
  })
})
