import { describe, expect, test } from 'vitest';

import { ForegroundRefreshCoordinator } from './foreground-refresh-coordinator';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ForegroundRefreshCoordinator', () => {
  test('reruns a domain once when a new request arrives during an in-flight refresh', async () => {
    const coordinator = new ForegroundRefreshCoordinator();
    const firstRun = createDeferred<void>();
    const calls: string[] = [];

    const initialPromise = coordinator.run(
      'icons_manual',
      async () => {
        calls.push('first');
        await firstRun.promise;
      },
      { force: true },
    );

    const pendingPromise = coordinator.run(
      'icons_manual',
      async () => {
        calls.push('second');
      },
      { force: true },
    );

    firstRun.resolve();

    await Promise.all([initialPromise, pendingPromise]);

    expect(calls).toEqual(['first', 'second']);
  });

  test('still honors cooldown when no pending rerun is requested', async () => {
    const coordinator = new ForegroundRefreshCoordinator();
    let calls = 0;

    await coordinator.run(
      'attachments_state',
      async () => {
        calls += 1;
      },
      { cooldownMs: 60_000 },
    );

    await coordinator.run(
      'attachments_state',
      async () => {
        calls += 1;
      },
      { cooldownMs: 60_000 },
    );

    expect(calls).toBe(1);
  });
});
