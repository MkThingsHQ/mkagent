import { describe, expect, it } from 'bun:test';
import { PiEventAdapter } from '../backend/pi/event-adapter.ts';

const settings = { enabled: true, reserveTokens: 31_000 };
function adapt(adapter: PiEventAdapter, event: object): any[] {
  return [...adapter.adaptEvent(event as any)];
}
const billing = { input: 400_000, output: 200, cacheRead: 19_000, cacheWrite: 50, totalTokens: 419_250, cost: { total: 2 } };

describe('Pi canonical context occupancy', () => {
  it('uses SDK occupancy and resolved reserve rather than billing input', () => {
    const adapter = new PiEventAdapter();
    const events = adapt(adapter, {
      type: 'agent_end', messages: [],
      contextUsage: { tokens: 42_000, contextWindow: 500_000 }, compactionSettings: settings,
    });
    expect(events[0]).toEqual({ type: 'context_usage', contextUsage: {
      usedTokens: 42_000, limitTokens: 469_000, limitKind: 'compaction',
      isEstimate: true, isStale: false, canCompact: true,
    } });
    expect(events.at(-1).type).toBe('complete');
  });

  it('transports a standalone post-message snapshot and preserves manual capability with auto disabled', () => {
    const adapter = new PiEventAdapter();
    const events = adapt(adapter, {
      type: 'context_usage', contextUsage: { tokens: 123, contextWindow: 500_000 },
      compactionSettings: { ...settings, enabled: false },
    });
    expect(events).toHaveLength(1);
    expect(events[0].contextUsage).toMatchObject({ usedTokens: 123, limitTokens: 500_000, limitKind: 'context', canCompact: true });
  });

  it('uses fresh SDK compact estimate then unknown canonical usage, never resurrecting billable usage', () => {
    const adapter = new PiEventAdapter();
    adapt(adapter, { type: 'message_end', message: { role: 'assistant', content: [], usage: billing } });
    const compact = adapt(adapter, {
      type: 'compaction_end', reason: 'threshold', aborted: false,
      result: { estimatedTokensAfter: 12_000 },
      contextUsage: { tokens: null, contextWindow: 500_000 }, compactionSettings: settings,
    });
    expect(compact[0].contextUsage).toMatchObject({ usedTokens: 12_000, isStale: false });
    expect(compact[1]).toMatchObject({ type: 'info', compactionTrigger: 'auto' });
    const end = adapt(adapter, {
      type: 'agent_end', messages: [], contextUsage: { tokens: null, contextWindow: 500_000 }, compactionSettings: settings,
    });
    expect(end[0].contextUsage).toMatchObject({ usedTokens: null, isStale: true });
    expect(end[1].usage).toMatchObject({ inputTokens: 419_000, outputTokens: 200, costUsd: 2 });
  });

  it('invalidates old occupancy even when successful compaction has no SDK snapshot', () => {
    const adapter = new PiEventAdapter();
    const events = adapt(adapter, { type: 'compaction_end', reason: 'manual', result: {}, aborted: false });
    expect(events[0]).toMatchObject({ type: 'context_usage', contextUsage: { usedTokens: null, isStale: true } });
    expect(events[1]).toMatchObject({ type: 'info', compactionTrigger: 'manual' });
  });

  it.each([true, false])('signals failed/aborted compaction before terminal events (aborted=%s)', (aborted) => {
    const adapter = new PiEventAdapter();
    const events = adapt(adapter, { type: 'compaction_end', reason: 'threshold', aborted, errorMessage: aborted ? undefined : 'summary failed' });
    expect(events[0]).toEqual({ type: 'compaction_failed' });
    expect(events.some(e => e.type === 'info')).toBe(false);
    if (!aborted) expect(events[1].type).toBe('error');
  });
});
