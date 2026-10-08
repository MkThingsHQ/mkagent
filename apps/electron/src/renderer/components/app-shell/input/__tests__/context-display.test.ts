import { describe, expect, it } from 'bun:test'
import { getContextDisplay } from '../context-display'

describe('truthful context occupancy', () => {
  it('uses the resolved compaction window and does not cap over-limit usage at 99%', () => {
    expect(getContextDisplay({ inputTokens: 900000, contextUsage: {
      usedTokens: 419000, limitTokens: 200000, limitKind: 'compaction', isEstimate: false, isStale: false, canCompact: true,
    } }, 1000000)).toMatchObject({ usedTokens: 419000, limitTokens: 200000, limitKind: 'compaction', percent: 210, canCompact: true, showWarning: true })
  })
  it('never restores legacy pre-compaction counts when a snapshot is unknown/stale', () => {
    expect(getContextDisplay({ inputTokens: 419000, contextUsage: {
      usedTokens: null, limitKind: 'context', isEstimate: true, isStale: true, canCompact: true,
    } }, 1000000)).toMatchObject({ usedTokens: null, limitTokens: null, percent: null, isStale: true, showWarning: false })
  })
  it('treats legacy counts as estimates against model capacity, never invented policy/capability', () => {
    expect(getContextDisplay({ inputTokens: 180000 }, 200000)).toMatchObject({ percent: 90, limitKind: 'context', isEstimate: true, canCompact: false })
  })
  it('shows fresh zero and supports a real post-compaction drop', () => {
    expect(getContextDisplay({ contextUsage: { usedTokens: 0, limitTokens: 200000, limitKind: 'context', isEstimate: false, isStale: false, canCompact: false } })).toMatchObject({ visible: true, usedTokens: 0, percent: 0 })
    expect(getContextDisplay({ contextUsage: { usedTokens: 12000, limitTokens: 200000, limitKind: 'compaction', isEstimate: true, isStale: false, canCompact: true } })).toMatchObject({ percent: 6, showWarning: false })
  })
  it('does not invent a limit for snapshots or show a stale count as a live warning', () => {
    expect(getContextDisplay({ contextUsage: { usedTokens: 419000, limitKind: 'compaction', isEstimate: false, isStale: true, canCompact: false } }, 200000)).toMatchObject({ limitTokens: null, percent: null, showWarning: false })
    expect(getContextDisplay(undefined, 200000).visible).toBe(false)
  })
})
