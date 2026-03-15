import { describe, expect, test } from 'vitest';

import { CryptoIdGenerator, EqualityCsrfValidator, SequentialIdGenerator } from './index';

describe('SequentialIdGenerator', () => {
  test('creates deterministic prefixed ids', () => {
    const generator = new SequentialIdGenerator();

    expect(generator.nextId('invite')).toBe('invite_000001');
    expect(generator.nextId('invite')).toBe('invite_000002');
  });
});

describe('EqualityCsrfValidator', () => {
  test('rejects missing tokens and accepts exact matches', () => {
    const validator = new EqualityCsrfValidator();

    expect(validator.ensureValid(null, 'token')).toBe(false);
    expect(validator.ensureValid('token', null)).toBe(false);
    expect(validator.ensureValid('left', 'right')).toBe(false);
    expect(validator.ensureValid('token', 'token')).toBe(true);
  });
});

describe('CryptoIdGenerator', () => {
  test('creates non-repeating prefixed ids for runtime use', () => {
    const generator = new CryptoIdGenerator();
    const first = generator.nextId('invite');
    const second = generator.nextId('invite');

    expect(first).toMatch(/^invite_[a-f0-9]{32}$/);
    expect(second).toMatch(/^invite_[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
  });
});
