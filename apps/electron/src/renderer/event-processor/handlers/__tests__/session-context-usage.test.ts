import { describe, expect, it } from 'bun:test'
import { handleComplete, handleUsageUpdate } from '../session'
import type { SessionState } from '../../types'

const usage = { inputTokens: 419000, outputTokens: 10, totalTokens: 419010, contextTokens: 419000, costUsd: 2, contextWindow: 1000000 }
const contextUsage = { usedTokens: 12000, limitTokens: 200000, limitKind: 'compaction' as const, isEstimate: true, isStale: false, canCompact: true }
function state(): SessionState {
  return { session: { id: 's', workspaceId: 'w', workspaceName: 'Workspace', name: 'Test', messages: [], isProcessing: true, lastMessageAt: 0, tokenUsage: { ...usage, contextUsage } }, streaming: null }
}

describe('renderer occupancy is separate from cumulative usage', () => {
  it('preserves post-compaction snapshot when a legacy terminal payload omits it', () => {
    const result = handleComplete(state(), { type: 'complete', sessionId: 's', tokenUsage: { ...usage, costUsd: 3 } })
    expect(result.state.session.tokenUsage?.contextUsage).toEqual(contextUsage)
    expect(result.state.session.tokenUsage?.costUsd).toBe(3)
  })
  it('preserves occupancy and model window on legacy streaming updates', () => {
    const result = handleUsageUpdate(state(), { type: 'usage_update', sessionId: 's', tokenUsage: { inputTokens: 419000 } })
    expect(result.state.session.tokenUsage?.contextUsage).toEqual(contextUsage)
    expect(result.state.session.tokenUsage?.contextWindow).toBe(1000000)
    expect(result.state.session.tokenUsage?.costUsd).toBe(2)
  })
  it('applies 419k → 12k immediately and preserves explicit unknown state', () => {
    const initial = state()
    initial.session.tokenUsage!.contextUsage = { ...contextUsage, usedTokens: 419000 }
    const updated = handleUsageUpdate(initial, { type: 'usage_update', sessionId: 's', tokenUsage: { inputTokens: 419000, contextUsage } })
    expect(updated.state.session.tokenUsage?.contextUsage?.usedTokens).toBe(12000)
    const unknown = { ...contextUsage, usedTokens: null, isStale: true }
    const finished = handleComplete(updated.state, { type: 'complete', sessionId: 's', tokenUsage: { ...usage, contextUsage: unknown } })
    expect(finished.state.session.tokenUsage?.contextUsage).toEqual(unknown)
  })
})
