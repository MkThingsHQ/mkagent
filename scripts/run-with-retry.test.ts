import { describe, expect, test } from 'bun:test';
import { parseRetryArguments, runWithRetry } from './run-with-retry.ts';

describe('runWithRetry', () => {
  test('retries failed commands with capped exponential backoff', async () => {
    const exitCodes = [1, 1, 0];
    const delays: number[] = [];
    const messages: string[] = [];

    const exitCode = await runWithRetry(
      ['example'],
      { attempts: 4, baseDelayMs: 2_000, maxDelayMs: 3_000 },
      {
        run: async () => exitCodes.shift() ?? 1,
        sleep: async delayMs => { delays.push(delayMs); },
        log: message => { messages.push(message); },
      },
    );

    expect(exitCode).toBe(0);
    expect(delays).toEqual([2_000, 3_000]);
    expect(messages).toHaveLength(2);
  });

  test('returns the final failure without sleeping again', async () => {
    let runCount = 0;
    let sleepCount = 0;

    const exitCode = await runWithRetry(
      ['example'],
      { attempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
      {
        run: async () => { runCount += 1; return 7; },
        sleep: async () => { sleepCount += 1; },
        log: () => {},
      },
    );

    expect(exitCode).toBe(7);
    expect(runCount).toBe(2);
    expect(sleepCount).toBe(1);
  });

  test('parses workflow command options without invoking a shell', () => {
    expect(parseRetryArguments([
      '--attempts', '5',
      '--base-delay-ms', '1000',
      '--max-delay-ms', '8000',
      '--', 'bun', 'install', '--frozen-lockfile',
    ])).toEqual({
      command: ['bun', 'install', '--frozen-lockfile'],
      options: { attempts: 5, baseDelayMs: 1_000, maxDelayMs: 8_000 },
    });
  });
});
