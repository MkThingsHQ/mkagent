import { describe, expect, it } from 'bun:test'
import { processEvent } from '../../processor'
import type { AgentEvent, SessionState } from '../../types'

const SESSION_ID = 'session-1'
const RETRY_TURN_ID = 'turn-retry'

function makeState(
  messages: any[] = [],
  options: {
    streaming?: SessionState['streaming']
    currentStatus?: { message: string; statusType?: string }
  } = {},
): SessionState {
  return {
    session: {
      id: SESSION_ID,
      messages,
      lastMessageAt: 1,
      isProcessing: true,
      currentStatus: options.currentStatus,
    } as any,
    streaming: options.streaming ?? null,
  }
}

/** Exercise the public processor dispatch so new event union cases cannot be wired only at handler level. */
function applyEvent(state: SessionState, event: AgentEvent): SessionState {
  return processEvent(state, event).state
}

function retryRows(state: SessionState): any[] {
  return state.session.messages.filter(
    message => message.role === 'status' && message.statusType === 'retrying',
  )
}

function beginBackoff(state: SessionState, message = 'Connection Error. Retrying in 2s (attempt 1/4)...'): SessionState {
  return applyEvent(state, {
    type: 'retry',
    sessionId: SESSION_ID,
    phase: 'backoff',
    message,
  })
}

function messageIds(state: SessionState): string[] {
  return state.session.messages.map(message => message.id)
}

describe('Pi retry lifecycle event processing', () => {
  it('routes text_discard through the processor and removes only unfinished assistant text for its turn', () => {
    const state = makeState([
      { id: 'user', role: 'user', content: 'hello', timestamp: 1 },
      {
        id: 'completed-same-turn',
        role: 'assistant',
        content: 'keep completed',
        timestamp: 2,
        turnId: RETRY_TURN_ID,
        isStreaming: false,
        isPending: false,
      },
      {
        id: 'intermediate-same-turn',
        role: 'assistant',
        content: 'keep intermediate',
        timestamp: 3,
        turnId: RETRY_TURN_ID,
        isIntermediate: true,
        isStreaming: false,
        isPending: false,
      },
      {
        id: 'failed-partial',
        role: 'assistant',
        content: 'discard this partial',
        timestamp: 4,
        turnId: RETRY_TURN_ID,
        isStreaming: true,
        isPending: true,
      },
      {
        id: 'other-turn-partial',
        role: 'assistant',
        content: 'keep other turn',
        timestamp: 5,
        turnId: 'turn-other',
        isStreaming: true,
        isPending: true,
      },
      {
        id: 'same-turn-tool',
        role: 'tool',
        timestamp: 6,
        turnId: RETRY_TURN_ID,
        toolUseId: 'tool-1',
        toolName: 'Read',
        toolStatus: 'completed',
        toolResult: 'ok',
      },
    ], {
      streaming: { content: 'discard this partial', turnId: RETRY_TURN_ID },
    })

    const next = applyEvent(state, {
      type: 'text_discard',
      sessionId: SESSION_ID,
      turnId: RETRY_TURN_ID,
    })

    expect(messageIds(next)).toEqual([
      'user',
      'completed-same-turn',
      'intermediate-same-turn',
      'other-turn-partial',
      'same-turn-tool',
    ])
    expect(next.streaming).toBeNull()
  })

  it('does not clear streaming state belonging to a different turn', () => {
    const state = makeState([
      {
        id: 'failed-partial',
        role: 'assistant',
        content: 'discard this partial',
        timestamp: 1,
        turnId: RETRY_TURN_ID,
        isStreaming: true,
        isPending: true,
      },
    ], {
      streaming: { content: 'other partial', turnId: 'turn-other' },
    })

    const next = applyEvent(state, {
      type: 'text_discard',
      sessionId: SESSION_ID,
      turnId: RETRY_TURN_ID,
    })

    expect(next.session.messages).toHaveLength(0)
    expect(next.streaming).toEqual({ content: 'other partial', turnId: 'turn-other' })
  })

  it('keeps failed attempts out of a later successful response while preserving completed, intermediate, and other-turn messages', () => {
    let state = makeState([
      {
        id: 'completed-same-turn',
        role: 'assistant',
        content: 'earlier completed response',
        timestamp: 1,
        turnId: RETRY_TURN_ID,
        isStreaming: false,
        isPending: false,
      },
      {
        id: 'intermediate-same-turn',
        role: 'assistant',
        content: 'earlier tool commentary',
        timestamp: 2,
        turnId: RETRY_TURN_ID,
        isIntermediate: true,
        isStreaming: false,
        isPending: false,
      },
      {
        id: 'other-turn-message',
        role: 'assistant',
        content: 'unrelated completed response',
        timestamp: 3,
        turnId: 'turn-other',
        isStreaming: false,
        isPending: false,
      },
    ])

    state = applyEvent(state, {
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'First failed answer. ',
      turnId: RETRY_TURN_ID,
    })
    state = applyEvent(state, { type: 'text_discard', sessionId: SESSION_ID, turnId: RETRY_TURN_ID })
    state = beginBackoff(state)
    state = applyEvent(state, { type: 'retry', sessionId: SESSION_ID, phase: 'active' })

    state = applyEvent(state, {
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'Different failed answer. ',
      turnId: RETRY_TURN_ID,
    })
    state = applyEvent(state, { type: 'text_discard', sessionId: SESSION_ID, turnId: RETRY_TURN_ID })
    state = beginBackoff(state, 'Connection Error. Retrying in 4s (attempt 2/4)...')
    state = applyEvent(state, { type: 'retry', sessionId: SESSION_ID, phase: 'active' })

    state = applyEvent(state, {
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'Good answer.',
      turnId: RETRY_TURN_ID,
    })
    state = applyEvent(state, {
      type: 'text_complete',
      sessionId: SESSION_ID,
      text: 'Good answer.',
      turnId: RETRY_TURN_ID,
      messageId: 'successful-response',
      timestamp: 10,
    })
    state = applyEvent(state, { type: 'retry', sessionId: SESSION_ID, phase: 'end' })

    expect(messageIds(state)).toEqual([
      'completed-same-turn',
      'intermediate-same-turn',
      'other-turn-message',
      'successful-response',
    ])
    expect(state.session.messages.find(message => message.id === 'successful-response')?.content).toBe('Good answer.')
    expect(state.session.messages.some(message => message.content?.includes('First failed answer'))).toBe(false)
    expect(state.session.messages.some(message => message.content?.includes('Different failed answer'))).toBe(false)
    expect(retryRows(state)).toHaveLength(0)
    expect(state.session.currentStatus).toBeUndefined()
    expect(state.streaming).toBeNull()
  })

  it('keeps exhausted partial output out of the transcript and preserves unrelated messages', () => {
    let state = makeState([
      {
        id: 'completed',
        role: 'assistant',
        content: 'keep completed',
        timestamp: 1,
        turnId: RETRY_TURN_ID,
        isStreaming: false,
        isPending: false,
      },
      {
        id: 'intermediate',
        role: 'assistant',
        content: 'keep intermediate',
        timestamp: 2,
        turnId: RETRY_TURN_ID,
        isIntermediate: true,
        isStreaming: false,
        isPending: false,
      },
      {
        id: 'other-turn',
        role: 'assistant',
        content: 'keep other turn',
        timestamp: 3,
        turnId: 'turn-other',
        isStreaming: false,
        isPending: false,
      },
    ])

    state = applyEvent(state, {
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'final failed partial',
      turnId: RETRY_TURN_ID,
    })
    state = applyEvent(state, { type: 'text_discard', sessionId: SESSION_ID, turnId: RETRY_TURN_ID })
    state = beginBackoff(state)
    state = applyEvent(state, { type: 'retry', sessionId: SESSION_ID, phase: 'end' })
    state = applyEvent(state, {
      type: 'typed_error',
      sessionId: SESSION_ID,
      error: {
        code: 'network_error',
        title: 'Connection Error',
        message: 'Could not reach the AI service.',
        actions: [{ key: 'r', label: 'Retry', action: 'retry' }],
        canRetry: true,
      },
      timestamp: 20,
    })
    state = applyEvent(state, { type: 'complete', sessionId: SESSION_ID })

    expect(messageIds(state)).toEqual(['completed', 'intermediate', 'other-turn', expect.stringMatching(/^msg-/)])
    expect(state.session.messages.some(message => message.content?.includes('final failed partial'))).toBe(false)
    expect(state.session.messages.at(-1)?.role).toBe('error')
    expect(retryRows(state)).toHaveLength(0)
    expect(state.session.currentStatus).toBeUndefined()
    expect(state.streaming).toBeNull()
  })

  it('upserts a single transient retry row as backoff attempts advance', () => {
    const compacting = {
      id: 'compacting',
      role: 'status',
      content: 'Compacting context...',
      statusType: 'compacting',
      timestamp: 1,
    }
    let state = beginBackoff(makeState([compacting]))
    state = beginBackoff(state, 'Connection Error. Retrying in 4s (attempt 2/4)...')

    expect(retryRows(state)).toHaveLength(1)
    expect(retryRows(state)[0]?.content).toBe('Connection Error. Retrying in 4s (attempt 2/4)...')
    expect(messageIds(state)).toContain('compacting')
    expect(state.session.currentStatus).toEqual({
      message: 'Connection Error. Retrying in 4s (attempt 2/4)...',
      statusType: 'retrying',
    })
  })

  for (const phase of ['active', 'end'] as const) {
    it(`removes the transient retry row and indicator on retry ${phase}`, () => {
      const compacting = {
        id: 'compacting',
        role: 'status',
        content: 'Compacting context...',
        statusType: 'compacting',
        timestamp: 1,
      }
      const state = beginBackoff(makeState([compacting]))
      const next = applyEvent(state, { type: 'retry', sessionId: SESSION_ID, phase })

      expect(retryRows(next)).toHaveLength(0)
      expect(messageIds(next)).toContain('compacting')
      expect(next.session.currentStatus).toBeUndefined()
    })
  }

  it('does not infer retry activation from a text delta or tool start during backoff', () => {
    const statusText = 'Connection Error. Retrying in 2s (attempt 1/4)...'
    let state = beginBackoff(makeState(), statusText)

    state = applyEvent(state, {
      type: 'text_delta',
      sessionId: SESSION_ID,
      delta: 'late failed-attempt delta',
      turnId: RETRY_TURN_ID,
    })
    expect(state.session.currentStatus?.message).toBe(statusText)
    expect(retryRows(state)).toHaveLength(1)

    state = applyEvent(state, {
      type: 'tool_start',
      sessionId: SESSION_ID,
      toolUseId: 'tool-1',
      toolName: 'Read',
      toolInput: { file_path: 'README.md' },
      turnId: RETRY_TURN_ID,
    })
    expect(state.session.currentStatus?.message).toBe(statusText)
    expect(retryRows(state)).toHaveLength(1)
  })

  const terminalEvents: Array<{ label: string; event: AgentEvent }> = [
    {
      label: 'complete',
      event: { type: 'complete', sessionId: SESSION_ID },
    },
    {
      label: 'plain error',
      event: { type: 'error', sessionId: SESSION_ID, error: 'request failed', timestamp: 10 },
    },
    {
      label: 'typed error',
      event: {
        type: 'typed_error',
        sessionId: SESSION_ID,
        error: {
          code: 'network_error',
          title: 'Connection Error',
          message: 'Could not reach the AI service.',
          actions: [],
          canRetry: true,
        },
        timestamp: 10,
      },
    },
  ]

  for (const { label, event } of terminalEvents) {
    it(`removes retry UI as a fail-safe on ${label}`, () => {
      const compacting = {
        id: 'compacting',
        role: 'status',
        content: 'Compacting context...',
        statusType: 'compacting',
        timestamp: 1,
      }
      const state = beginBackoff(makeState([compacting]))
      const next = applyEvent(state, event)

      expect(retryRows(next)).toHaveLength(0)
      expect(messageIds(next)).toContain('compacting')
      expect(next.session.currentStatus).toBeUndefined()
    })
  }

  it('leaves no retry status spinner after interruption', () => {
    const state = beginBackoff(makeState())
    const next = applyEvent(state, {
      type: 'interrupted',
      sessionId: SESSION_ID,
      message: {
        id: 'interrupted',
        role: 'info',
        content: 'Response interrupted',
        timestamp: 10,
      },
    })

    expect(retryRows(next)).toHaveLength(0)
    expect(next.session.currentStatus).toBeUndefined()
  })
})
