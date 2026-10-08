import { describe, expect, it } from 'bun:test';
import {
  contextAfterCompaction,
  contextFromClaude,
  contextFromPi,
} from '../context-usage.ts';

describe('context occupancy snapshots', () => {
  it('uses the native SDK resolved window rather than advertised model capacity', () => {
    expect(contextFromClaude({ totalTokens: 180_000, rawMaxTokens: 200_000, maxTokens: 1_000_000, isAutoCompactEnabled: true })).toEqual({
      usedTokens: 180_000, limitTokens: 200_000, limitKind: 'compaction', isEstimate: true, isStale: false, canCompact: true,
    });
  });

  it('accepts native result context_usage metadata and does not clamp over-limit counts', () => {
    expect(contextFromClaude({ total_tokens: 210_000, raw_max_tokens: 200_000, over_limit: { kind: 'hard_limit' } })).toMatchObject({
      usedTokens: 210_000, limitTokens: 200_000, limitKind: 'context',
    });
  });

  it('does not turn absent, negative, or malformed native usage into zero', () => {
    for (const raw of [undefined, null, {}, { totalTokens: -1 }, { totalTokens: Number.NaN }, { totalTokens: '12' }, []]) {
      expect(contextFromClaude(raw)).toBeUndefined();
    }
    expect(contextFromClaude({ totalTokens: 0, rawMaxTokens: 200_000 })?.usedTokens).toBe(0);
    expect(contextFromClaude({ totalTokens: 5, rawMaxTokens: Infinity })?.limitTokens).toBeUndefined();
  });

  it('replaces 419k with post-compaction 12k while retaining the resolved limit', () => {
    const before = contextFromClaude({ totalTokens: 419_000, rawMaxTokens: 1_000_000 });
    expect(contextAfterCompaction(12_000, before)).toEqual({
      usedTokens: 12_000, limitTokens: 1_000_000, limitKind: 'compaction', isEstimate: true, isStale: false, canCompact: true,
    });
  });

  it('invalidates the old count when compaction has no post-token metadata', () => {
    const before = contextFromClaude({ totalTokens: 419_000, rawMaxTokens: 1_000_000 });
    expect(contextAfterCompaction(undefined, before)).toMatchObject({ usedTokens: null, isStale: true, limitTokens: 1_000_000 });
    expect(contextAfterCompaction(Number.NaN, before).usedTokens).toBeNull();
    expect(contextAfterCompaction(0, before)).toMatchObject({ usedTokens: 0, isStale: false });
  });

  it('uses Pi SDK token estimates and the actual configured reserve', () => {
    expect(contextFromPi({ tokens: 120_000, contextWindow: 200_000 }, { enabled: true, reserveTokens: 16_384 })).toEqual({
      usedTokens: 120_000, limitTokens: 183_616, limitKind: 'compaction', isEstimate: true, isStale: false, canCompact: true,
    });
    expect(contextFromPi({ tokens: 120_000, contextWindow: 200_000 }, { enabled: true, reserveTokens: 20_000 })?.limitTokens).toBe(180_000);
  });

  it('preserves Pi unknown-after-compaction state, or uses a supplied fresh estimate', () => {
    const raw = { tokens: null, contextWindow: 200_000 };
    expect(contextFromPi(raw, { enabled: true, reserveTokens: 16_384 })).toMatchObject({ usedTokens: null, isStale: true });
    expect(contextFromPi(raw, { enabled: true, reserveTokens: 16_384 }, 12_000)).toMatchObject({ usedTokens: 12_000, isStale: false });
  });

  it('does not invent a Pi reserve when metadata is absent or auto-compaction is off', () => {
    expect(contextFromPi({ tokens: 12, contextWindow: 200_000 })?.limitTokens).toBe(200_000);
    expect(contextFromPi({ tokens: 12, contextWindow: 200_000 }, { enabled: false, reserveTokens: 16_384 })).toMatchObject({ limitTokens: 200_000, limitKind: 'context', canCompact: true });
    expect(contextFromPi({ tokens: 12, contextWindow: 100 }, { enabled: true, reserveTokens: 200 })?.limitTokens).toBeUndefined();
  });
});
