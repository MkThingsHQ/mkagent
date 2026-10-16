import { describe, expect, it } from 'bun:test'
import { processEvent } from '../../processor'
import type { SessionState, ToolResultEvent } from '../../types'

const SESSION_ID = 'session-1'

function makeState(messages: any[] = []): SessionState {
  return {
    session: { id: SESSION_ID, messages, lastMessageAt: 1, isProcessing: true } as any,
    streaming: null,
  }
}

function toolResult(fields: Partial<ToolResultEvent> = {}): ToolResultEvent {
  return {
    type: 'tool_result',
    sessionId: SESSION_ID,
    toolUseId: 'tu-1',
    toolName: 'mcp__session__browser_tool',
    result: 'Filled password field @e2 (7 characters)',
    ...fields,
  }
}

const runningFill = {
  id: 'tool-msg',
  role: 'tool',
  content: '',
  timestamp: 1,
  toolUseId: 'tu-1',
  toolName: 'mcp__session__browser_tool',
  toolInput: { command: 'fill @e2 hunter2' },
  toolStatus: 'executing',
}

describe('tool_result input replacement', () => {
  it('replaces the input from tool_start with the one sent on the result', () => {
    const redacted = { command: 'fill @e2 [password: 7 characters]' }
    const next = processEvent(makeState([runningFill]), toolResult({ toolInput: redacted })).state

    expect(next.session.messages[0]).toMatchObject({
      toolInput: redacted,
      toolResult: 'Filled password field @e2 (7 characters)',
      toolStatus: 'completed',
    })
  })

  it('keeps the input from tool_start when the result carries none', () => {
    const next = processEvent(makeState([runningFill]), toolResult()).state

    expect(next.session.messages[0]!.toolInput).toEqual({ command: 'fill @e2 hunter2' })
    expect(next.session.messages[0]!.toolStatus).toBe('completed')
  })

  it('stores the input on a message created from a result without tool_start', () => {
    const redacted = { command: 'fill @e2 [password: 7 characters]' }
    const next = processEvent(makeState(), toolResult({ toolInput: redacted })).state

    expect(next.session.messages).toHaveLength(1)
    expect(next.session.messages[0]).toMatchObject({ toolUseId: 'tu-1', toolInput: redacted, toolStatus: 'completed' })
  })
})
