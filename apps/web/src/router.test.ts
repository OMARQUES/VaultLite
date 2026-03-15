import { describe, expect, test } from 'vitest';

import { resolveNavigationTarget } from './router';

describe('resolveNavigationTarget', () => {
  test('redirects vault access to auth or unlock depending on phase', () => {
    expect(
      resolveNavigationTarget({
        phase: 'remote_authentication_required',
        targetPath: '/vault',
      }),
    ).toBe('/auth');

    expect(
      resolveNavigationTarget({
        phase: 'local_unlock_required',
        targetPath: '/vault',
      }),
    ).toBe('/unlock');

    expect(
      resolveNavigationTarget({
        phase: 'ready',
        targetPath: '/vault',
      }),
    ).toBeUndefined();
  });

  test('keeps onboarding export flow on onboarding route until finalized', () => {
    expect(
      resolveNavigationTarget({
        phase: 'onboarding_export_required',
        targetPath: '/vault',
      }),
    ).toBe('/onboarding');

    expect(
      resolveNavigationTarget({
        phase: 'onboarding_export_required',
        targetPath: '/auth',
      }),
    ).toBe('/onboarding');
  });
});
