/**
 * Bounded wait for an in-flight Pi SDK compaction.
 *
 * Concurrent compactions crash the SDK on a shared AbortController
 * (craft-agents-oss#464), so prompts and manual /compact serialize behind
 * `session.isCompacting`. The wait has a budget: a stuck compaction must not
 * consume the host's whole RPC deadline before the caller gets to act
 * (craft-agents-oss#1060). Callers decide what to do on `timedOut`.
 */

export interface CompactionWaitResult {
  /** Milliseconds spent waiting; 0 when nothing was in flight. */
  waitedMs: number;
  /** True when the budget ran out while the flag was still set. */
  timedOut: boolean;
}

export interface CompactionWaitOptions {
  timeoutMs: number;
  /** Poll interval, default 200 ms. */
  pollMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Budget for waiting on a prior compaction before a manual /compact starts.
 * Well under the host's 300 s compact RPC deadline (PiAgent.compactTimeoutMs)
 * so the manual compaction itself, which can take 60-120 s, still fits.
 */
export const MANUAL_COMPACT_WAIT_MS = 120_000;

/** Budget for waiting on a prior compaction before a prompt; matches the host deadline. */
export const PROMPT_COMPACT_WAIT_MS = 300_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForCompaction(
  session: { isCompacting: boolean },
  options: CompactionWaitOptions,
): Promise<CompactionWaitResult> {
  const { timeoutMs, pollMs = 200, sleep = defaultSleep, now = Date.now, log } = options;
  if (!session.isCompacting) return { waitedMs: 0, timedOut: false };

  log?.('Waiting for in-flight compaction to finish...');
  const start = now();
  while (session.isCompacting) {
    const waitedMs = now() - start;
    if (waitedMs >= timeoutMs) {
      log?.(`Compaction still running after ${Math.floor(waitedMs / 1000)}s; giving up the wait`);
      return { waitedMs, timedOut: true };
    }
    await sleep(pollMs);
  }
  const waitedMs = now() - start;
  log?.(`Compaction finished after ${Math.floor(waitedMs / 1000)}s`);
  return { waitedMs, timedOut: false };
}
