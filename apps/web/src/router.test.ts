import { describe, expect, test } from 'vitest';

import { resolveNavigationTarget } from './router';

function resolveTarget(input: {
  phase:
    | 'anonymous'
    | 'remote_authentication_required'
    | 'onboarding_export_required'
    | 'local_unlock_required'
    | 'ready';
  targetPath: string;
  bootstrapState?: 'UNINITIALIZED_PUBLIC_OPEN' | 'OWNER_CREATED_CHECKPOINT_PENDING' | 'INITIALIZED' | null;
  role?: 'owner' | 'user' | null;
  targetFullPath?: string;
  nextParam?: string | null;
}) {
  return resolveNavigationTarget({
    phase: input.phase,
    targetPath: input.targetPath,
    bootstrapState: input.bootstrapState ?? 'INITIALIZED',
    role: input.role ?? 'user',
    targetFullPath: input.targetFullPath,
    nextParam: input.nextParam,
  });
}

describe('resolveNavigationTarget', () => {
  test('treats vault as the authenticated landing route and keeps settings behind ready state', () => {
    expect(resolveTarget({ phase: 'ready', targetPath: '/' })).toBe('/vault');

    expect(resolveTarget({ phase: 'local_unlock_required', targetPath: '/' })).toBe('/unlock');

    expect(resolveTarget({ phase: 'onboarding_export_required', targetPath: '/' })).toBeUndefined();

    expect(resolveTarget({ phase: 'remote_authentication_required', targetPath: '/settings' })).toBe(
      '/auth?next=%2Fsettings',
    );
  });

  test('protects authenticated routes including settings and route-driven vault surfaces', () => {
    expect(resolveTarget({ phase: 'remote_authentication_required', targetPath: '/vault' })).toBe(
      '/auth?next=%2Fvault',
    );

    expect(resolveTarget({ phase: 'remote_authentication_required', targetPath: '/vault/new/login' })).toBe(
      '/auth?next=%2Fvault%2Fnew%2Flogin',
    );

    expect(resolveTarget({ phase: 'local_unlock_required', targetPath: '/vault/item/item_1/edit' })).toBe(
      '/unlock?next=%2Fvault%2Fitem%2Fitem_1%2Fedit',
    );

    expect(
      resolveTarget({
        phase: 'local_unlock_required',
        targetPath: '/auth',
        nextParam: '/admin/invites',
      }),
    ).toBe('/unlock?next=%2Fadmin%2Finvites');

    expect(resolveTarget({ phase: 'ready', targetPath: '/vault/item/item_1' })).toBeUndefined();

    expect(resolveTarget({ phase: 'ready', targetPath: '/settings' })).toBeUndefined();
  });

  test('keeps onboarding export flow pinned to onboarding until finalization', () => {
    expect(resolveTarget({ phase: 'onboarding_export_required', targetPath: '/vault' })).toBe('/auth?next=%2Fvault');

    expect(resolveTarget({ phase: 'onboarding_export_required', targetPath: '/vault/item/item_1/edit' })).toBe(
      '/auth?next=%2Fvault%2Fitem%2Fitem_1%2Fedit',
    );

    expect(resolveTarget({ phase: 'onboarding_export_required', targetPath: '/settings' })).toBe(
      '/auth?next=%2Fsettings',
    );
  });

  test('preserves admin destination through unlock redirect', () => {
    expect(
      resolveTarget({
        phase: 'local_unlock_required',
        targetPath: '/admin',
        targetFullPath: '/admin/invites',
        role: 'owner',
      }),
    ).toBe('/unlock?next=%2Fadmin%2Finvites');
  });

  test('enforces bootstrap matrix routes before initialization', () => {
    expect(
      resolveTarget({
        phase: 'anonymous',
        targetPath: '/auth',
        bootstrapState: 'UNINITIALIZED_PUBLIC_OPEN',
        role: null,
      }),
    ).toBe('/bootstrap');

    expect(
      resolveTarget({
        phase: 'remote_authentication_required',
        targetPath: '/vault',
        bootstrapState: 'OWNER_CREATED_CHECKPOINT_PENDING',
        role: null,
      }),
    ).toBe('/auth?next=/bootstrap/checkpoint');

    expect(
      resolveTarget({
        phase: 'ready',
        targetPath: '/vault',
        bootstrapState: 'OWNER_CREATED_CHECKPOINT_PENDING',
        role: 'owner',
      }),
    ).toBe('/bootstrap/checkpoint');
  });
});
