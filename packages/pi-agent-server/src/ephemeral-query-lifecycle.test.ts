import { afterEach, describe, expect, it, jest } from 'bun:test';
import {
  EphemeralQueryCancelledError,
  EphemeralQueryCoordinator,
  EphemeralQueryTimeoutError,
  type EphemeralQueryContext,
} from './ephemeral-query-lifecycle.ts';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  jest.useRealTimers();
});

describe('EphemeralQueryCoordinator', () => {
  it('enforces the deadline around the running task and cancels its registered resource', async () => {
    jest.useFakeTimers();
    const coordinator = new EphemeralQueryCoordinator();
    const task = deferred<string>();
    let aborts = 0;
    let disposals = 0;

    const result = coordinator.run('q1', 1_000, async (context) => {
      context.setResource({
        abort: () => { aborts++; },
        dispose: () => { disposals++; },
      });
      return task.promise;
    });
    const settled = result.then(
      value => ({ status: 'fulfilled' as const, value }),
      reason => ({ status: 'rejected' as const, reason }),
    );

    await flushMicrotasks();
    expect(coordinator.has('q1')).toBe(true);

    jest.advanceTimersByTime(1_000);
    const outcome = await settled;

    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toBeInstanceOf(EphemeralQueryTimeoutError);
      expect(outcome.reason.message).toContain('1s');
    }
    expect(aborts).toBe(1);
    expect(disposals).toBe(1);
    expect(coordinator.size).toBe(0);
  });

  it('cancels only the matching query when multiple queries run concurrently', async () => {
    const coordinator = new EphemeralQueryCoordinator();
    const first = deferred<string>();
    const second = deferred<string>();
    const contexts = new Map<string, EphemeralQueryContext>();

    const p1 = coordinator.run('q1', 10_000, async (context) => {
      contexts.set('q1', context);
      return first.promise;
    });
    const p2 = coordinator.run('q2', 10_000, async (context) => {
      contexts.set('q2', context);
      return second.promise;
    });
    const p1Settled = p1.catch(error => error as Error);

    await flushMicrotasks();
    expect(coordinator.size).toBe(2);
    expect(coordinator.cancel('q1', new EphemeralQueryCancelledError('cancel q1'))).toBe(true);

    const firstError = await p1Settled;
    expect(firstError).toBeInstanceOf(EphemeralQueryCancelledError);
    expect(firstError.message).toBe('cancel q1');
    expect(coordinator.has('q1')).toBe(false);
    expect(coordinator.has('q2')).toBe(true);
    expect(contexts.get('q2')!.signal.aborted).toBe(false);

    second.resolve('second result');
    await expect(p2).resolves.toBe('second result');
    expect(coordinator.size).toBe(0);
  });

  it('ignores a late task result after timeout without resurrecting request state', async () => {
    jest.useFakeTimers();
    const coordinator = new EphemeralQueryCoordinator();
    const task = deferred<string>();

    const result = coordinator.run('late', 500, async () => task.promise);
    const settled = result.catch(error => error as Error);
    await flushMicrotasks();

    jest.advanceTimersByTime(500);
    expect(await settled).toBeInstanceOf(EphemeralQueryTimeoutError);
    expect(coordinator.size).toBe(0);

    task.resolve('too late');
    await flushMicrotasks();
    expect(coordinator.size).toBe(0);
    expect(coordinator.cancel('late')).toBe(false);
  });

  it('cleans up a resource created after cancellation without deleting a reused id', async () => {
    const coordinator = new EphemeralQueryCoordinator();
    const sessionCreation = deferred<void>();
    const replacementTask = deferred<string>();
    let aborts = 0;
    let disposals = 0;

    const stale = coordinator.run('reused', 10_000, async (context) => {
      await sessionCreation.promise;
      context.setResource({
        abort: () => { aborts++; },
        dispose: () => { disposals++; },
      });
      return 'stale result';
    });
    const staleSettled = stale.catch(error => error as Error);
    await flushMicrotasks();

    coordinator.cancel('reused', new EphemeralQueryCancelledError('cancel stale query'));
    expect(await staleSettled).toBeInstanceOf(EphemeralQueryCancelledError);

    // Cancellation removes the old registration eagerly. If a caller reuses the
    // id, settlement of the old task must not erase the replacement entry.
    const replacement = coordinator.run('reused', 10_000, async () => replacementTask.promise);
    await flushMicrotasks();
    sessionCreation.resolve(undefined);
    await flushMicrotasks();

    expect(aborts).toBe(1);
    expect(disposals).toBe(1);
    expect(coordinator.has('reused')).toBe(true);

    replacementTask.resolve('replacement result');
    await expect(replacement).resolves.toBe('replacement result');
    expect(coordinator.size).toBe(0);
  });

  it('clears the deadline after success', async () => {
    jest.useFakeTimers();
    const coordinator = new EphemeralQueryCoordinator();
    let aborts = 0;

    const result = await coordinator.run('success', 1_000, async (context) => {
      const resource = {
        abort: () => { aborts++; },
        dispose: () => {},
      };
      context.setResource(resource);
      context.clearResource(resource);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(coordinator.size).toBe(0);
    jest.advanceTimersByTime(5_000);
    expect(aborts).toBe(0);
  });

  it('cancels every active query during subprocess shutdown', async () => {
    const coordinator = new EphemeralQueryCoordinator();
    const never = new Promise<never>(() => {});
    const first = coordinator.run('q1', 10_000, async () => never).catch(error => error as Error);
    const second = coordinator.run('q2', 10_000, async () => never).catch(error => error as Error);
    await flushMicrotasks();

    coordinator.cancelAll(new EphemeralQueryCancelledError('server shutdown'));

    expect((await first).message).toBe('server shutdown');
    expect((await second).message).toBe('server shutdown');
    expect(coordinator.size).toBe(0);
  });
});
