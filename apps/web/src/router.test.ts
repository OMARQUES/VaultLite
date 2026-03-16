import { describe, expect, test } from 'vitest';

import { resolveNavigationTarget } from './router';

describe('resolveNavigationTarget', () => {
  test('treats vault as the authenticated landing route and keeps settings behind ready state', () => {
    expect(
      resolveNavigationTarget({
        phase: 'ready',
        targetPath: '/',
      }),
    ).toBe('/vault');

    expect(
      resolveNavigationTarget({
        phase: 'local_unlock_required',
        targetPath: '/',
      }),
    ).toBe('/unlock');

    expect(
      resolveNavigationTarget({
        phase: 'onboarding_export_required',
        targetPath: '/',
      }),
    ).toBe('/onboarding');

    expect(
      resolveNavigationTarget({
        phase: 'remote_authentication_required',
        targetPath: '/settings',
      }),
    ).toBe('/auth');
  });

  test('protects authenticated routes including settings and route-driven vault surfaces', () => {
    expect(
      resolveNavigationTarget({
        phase: 'remote_authentication_required',
        targetPath: '/vault',
      }),
    ).toBe('/auth');

    expect(
      resolveNavigationTarget({
        phase: 'remote_authentication_required',
        targetPath: '/vault/new/login',
      }),
    ).toBe('/auth');

    expect(
      resolveNavigationTarget({
        phase: 'local_unlock_required',
        targetPath: '/vault/item/item_1/edit',
      }),
    ).toBe('/unlock');

    expect(
      resolveNavigationTarget({
        phase: 'ready',
        targetPath: '/vault/item/item_1',
      }),
    ).toBeUndefined();

    expect(
      resolveNavigationTarget({
        phase: 'ready',
        targetPath: '/settings',
      }),
    ).toBeUndefined();
  });

  test('keeps onboarding export flow pinned to onboarding until finalization', () => {
    expect(
      resolveNavigationTarget({
        phase: 'onboarding_export_required',
        targetPath: '/vault',
      }),
    ).toBe('/onboarding');

    expect(
      resolveNavigationTarget({
        phase: 'onboarding_export_required',
        targetPath: '/vault/item/item_1/edit',
      }),
    ).toBe('/onboarding');

    expect(
      resolveNavigationTarget({
        phase: 'onboarding_export_required',
        targetPath: '/settings',
      }),
    ).toBe('/onboarding');
  });
});
