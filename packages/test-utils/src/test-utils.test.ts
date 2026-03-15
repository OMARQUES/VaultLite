import { describe, expect, test } from 'vitest';

import { FixedClock, QueueIdGenerator } from './index';

describe('test utils', () => {
  test('provides deterministic clock and queued ids', () => {
    const clock = new FixedClock(new Date('2026-03-15T00:00:00.000Z'));
    const generator = new QueueIdGenerator(['1', '2']);

    expect(clock.now().toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(generator.nextId('user')).toBe('user_1');
    expect(generator.nextId('user')).toBe('user_2');
  });
});
