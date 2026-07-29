import { describe, expect, it } from 'bun:test'
import { processEvent } from '../../processor'
import type { AgentEvent, SessionState } from '../../types'

describe('conversation rendering flow', () => {
  it('renders a tool call, its result, and the final assistant response in order', () => {
    let state: SessionState = {
      session: { id: 'flow-session', messages: [], lastMessageAt: 1 } as never,
      streaming: null,
    }
    const events: AgentEvent[] = [
      {
        type: 'tool_start',
        sessionId: 'flow-session',
        toolName: 'get_session_info',
        toolUseId: 'tool-1',
        toolInput: {},
        timestamp: 10,
      },
      {
        type: 'tool_result',
        sessionId: 'flow-session',
        toolName: 'get_session_info',
        toolUseId: 'tool-1',
        result: '{"name":"Flow Session"}',
        timestamp: 11,
      },
      {
        type: 'text_complete',
        sessionId: 'flow-session',
        text: 'Session flow verified.',
        messageId: 'assistant-1',
        timestamp: 12,
      },
      { type: 'complete', sessionId: 'flow-session' },
    ]

    for (const event of events) state = processEvent(state, event).state

    const tool = state.session.messages.find(message => message.toolUseId === 'tool-1')
    const assistant = state.session.messages.find(message => message.id === 'assistant-1')
    expect(tool?.role).toBe('tool')
    expect(tool?.toolStatus).toBe('completed')
    expect(tool?.toolResult).toContain('Flow Session')
    expect(assistant?.content).toBe('Session flow verified.')
    expect(state.session.isProcessing).toBe(false)
  })
})
