import { describe, expect, test } from 'vitest';

import {
  sameLocalUnlockKdfProfile,
  shouldRewriteLocalUnlockEnvelope,
  shouldScheduleLocalUnlockEnvelopeMaintenance,
} from '../local-unlock-maintenance.js';

const BASE_PROFILE = Object.freeze({
  memory: 64 * 1024,
  passes: 3,
  parallelism: 1,
  tagLength: 32,
});

describe('local unlock maintenance helpers', () => {
  test('compares equivalent KDF profiles including dkLen fallback', () => {
    expect(
      sameLocalUnlockKdfProfile(BASE_PROFILE, {
        memory: 64 * 1024,
        passes: 3,
        parallelism: 1,
        dkLen: 32,
      }),
    ).toBe(true);
  });

  test('requests envelope rewrite when the stored envelope is missing a KDF profile', () => {
    expect(
      shouldRewriteLocalUnlockEnvelope({
        currentProfile: BASE_PROFILE,
        nextProfile: BASE_PROFILE,
        envelopeHasProfile: false,
      }),
    ).toBe(true);
  });

  test('does not request envelope rewrite when the calibrated profile matches', () => {
    expect(
      shouldRewriteLocalUnlockEnvelope({
        currentProfile: BASE_PROFILE,
        nextProfile: { ...BASE_PROFILE },
        envelopeHasProfile: true,
      }),
    ).toBe(false);
  });

  test('supports the unlock maintenance path without depending on a background constant', () => {
    expect(() =>
      shouldScheduleLocalUnlockEnvelopeMaintenance({
        trustedState: {
          localUnlockEnvelope: {
            kdfProfile: BASE_PROFILE,
          },
        },
        password: 'correct horse battery staple',
      }),
    ).not.toThrow();
    expect(
      shouldScheduleLocalUnlockEnvelopeMaintenance({
        trustedState: {
          localUnlockEnvelope: {
            kdfProfile: BASE_PROFILE,
          },
        },
        password: 'correct horse battery staple',
      }),
    ).toBe(true);
  });
});
