import { describe, expect, it } from 'bun:test';
import { MANUAL_COMPACT_WAIT_MS, PROMPT_COMPACT_WAIT_MS, waitForCompaction } from './compaction-wait.ts';

function virtualClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('waitForCompaction', () => {
  it('returns immediately when nothing is compacting', async () => {
    const clock = virtualClock();
    const result = await waitForCompaction({ isCompacting: false }, { timeoutMs: 1000, sleep: clock.sleep, now: clock.now });
    expect(result).toEqual({ waitedMs: 0, timedOut: false });
  });

  it('waits until the flag clears and reports the elapsed time', async () => {
    const clock = virtualClock();
    const session = { isCompacting: true };
    const sleep = async (ms: number) => {
      await clock.sleep(ms);
      if (clock.now() >= 600) session.isCompacting = false;
    };
    const result = await waitForCompaction(session, { timeoutMs: 5000, sleep, now: clock.now });
    expect(result).toEqual({ waitedMs: 600, timedOut: false });
  });

  it('gives up after the budget while the flag is still set (regression for #1060)', async () => {
    const clock = virtualClock();
    const session = { isCompacting: true };
    const logs: string[] = [];
    const result = await waitForCompaction(session, {
      timeoutMs: 1000,
      sleep: clock.sleep,
      now: clock.now,
      log: (m) => logs.push(m),
    });
    expect(result.timedOut).toBe(true);
    expect(result.waitedMs).toBeGreaterThanOrEqual(1000);
    expect(result.waitedMs).toBeLessThan(1400);
    expect(session.isCompacting).toBe(true);
    expect(logs.at(-1)).toContain('still running');
  });

  it('leaves the manual compaction most of the host deadline', () => {
    expect(MANUAL_COMPACT_WAIT_MS).toBeLessThanOrEqual(PROMPT_COMPACT_WAIT_MS - 120_000);
  });
});
