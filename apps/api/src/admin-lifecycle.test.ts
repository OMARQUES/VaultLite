import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import { FixedClock, createTestStorage } from '@vaultlite/test-utils';
import { describe, expect, test } from 'vitest';

import { createVaultLiteApi } from './app';

class IncrementingIdGenerator {
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }
}

async function createFixture() {
  const storage = createTestStorage();
  const clock = new FixedClock(new Date('2026-03-18T12:00:00.000Z'));
  const idGenerator = new IncrementingIdGenerator();
  const accountKitKeys = generateAccountKitKeyPair();
  const nowIso = clock.now().toISOString();

  await storage.deploymentState.transitionToOwnerCreatedCheckpointPending({
    ownerUserId: 'user_owner_1',
    ownerCreatedAt: nowIso,
    bootstrapPublicClosedAt: nowIso,
  });
  await storage.deploymentState.completeInitialization({
    completedAt: nowIso,
  });

  await storage.users.create({
    userId: 'user_owner_1',
    username: 'owner',
    role: 'owner',
    authSalt: 'A'.repeat(22),
    authVerifier: 'owner-proof',
    encryptedAccountBundle: 'owner-bundle-v1',
    accountKeyWrapped: 'owner-wrapped-v1',
    bundleVersion: 0,
    lifecycleState: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await storage.devices.register({
    deviceId: 'device_owner_1',
    userId: 'user_owner_1',
    deviceName: 'Owner Browser',
    platform: 'web',
    deviceState: 'active',
    createdAt: nowIso,
    revokedAt: null,
  });
  await storage.sessions.create({
    sessionId: 'session_owner_1',
    userId: 'user_owner_1',
    deviceId: 'device_owner_1',
    csrfToken: 'csrf_owner_1',
    createdAt: nowIso,
    expiresAt: '2026-03-18T20:00:00.000Z',
    recentReauthAt: nowIso,
    revokedAt: null,
    rotatedFromSessionId: null,
  });

  await storage.users.create({
    userId: 'user_member_1',
    username: 'member1',
    role: 'user',
    authSalt: 'B'.repeat(22),
    authVerifier: 'member-proof',
    encryptedAccountBundle: 'member-bundle-v1',
    accountKeyWrapped: 'member-wrapped-v1',
    bundleVersion: 0,
    lifecycleState: 'active',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await storage.devices.register({
    deviceId: 'device_member_1',
    userId: 'user_member_1',
    deviceName: 'Member Browser',
    platform: 'web',
    deviceState: 'active',
    createdAt: nowIso,
    revokedAt: null,
  });
  await storage.sessions.create({
    sessionId: 'session_member_1',
    userId: 'user_member_1',
    deviceId: 'device_member_1',
    csrfToken: 'csrf_member_1',
    createdAt: nowIso,
    expiresAt: '2026-03-18T20:00:00.000Z',
    recentReauthAt: nowIso,
    revokedAt: null,
    rotatedFromSessionId: null,
  });

  const app = createVaultLiteApi({
    storage,
    clock,
    idGenerator,
    runtimeMode: 'test',
    deploymentFingerprint: 'deployment_fp_v1',
    serverUrl: 'https://vaultlite.example.com',
    bootstrapAdminToken: 'bootstrap-secret',
    secureCookies: true,
    accountKitPrivateKey: accountKitKeys.privateKey,
    accountKitPublicKey: accountKitKeys.publicKey,
  });

  return {
    app,
    storage,
    ownerCookie: 'vl_session=session_owner_1; vl_csrf=csrf_owner_1',
    memberCookie: 'vl_session=session_member_1; vl_csrf=csrf_member_1',
    ownerHeaders: {
      cookie: 'vl_session=session_owner_1; vl_csrf=csrf_owner_1',
      'content-type': 'application/json',
      'x-csrf-token': 'csrf_owner_1',
    },
    memberHeaders: {
      cookie: 'vl_session=session_member_1; vl_csrf=csrf_member_1',
      'content-type': 'application/json',
      'x-csrf-token': 'csrf_member_1',
    },
  };
}

describe('admin lifecycle API', () => {
  test('lists users with lifecycle states including deprovisioned', async () => {
    const { app, storage, ownerCookie } = await createFixture();
    await storage.users.create({
      userId: 'user_member_2',
      username: 'member2',
      role: 'user',
      authSalt: 'C'.repeat(22),
      authVerifier: 'member2-proof',
      encryptedAccountBundle: 'member2-bundle-v1',
      accountKeyWrapped: 'member2-wrapped-v1',
      bundleVersion: 0,
      lifecycleState: 'deprovisioned',
      createdAt: '2026-03-18T12:00:00.000Z',
      updatedAt: '2026-03-18T12:00:00.000Z',
    });

    const response = await app.request('/api/admin/users', {
      headers: { cookie: ownerCookie },
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      users: Array<{
        userId: string;
        role: 'owner' | 'user';
        lifecycleState: 'active' | 'suspended' | 'deprovisioned';
      }>;
    };
    expect(payload.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'user_owner_1',
          role: 'owner',
          lifecycleState: 'active',
        }),
        expect.objectContaining({
          userId: 'user_member_2',
          role: 'user',
          lifecycleState: 'deprovisioned',
        }),
      ]),
    );
  });

  test('rejects admin users listing for unauthenticated and non-owner sessions', async () => {
    const { app, memberCookie } = await createFixture();

    const unauthenticated = await app.request('/api/admin/users');
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({
      ok: false,
      code: 'unauthorized',
    });

    const nonOwner = await app.request('/api/admin/users', {
      headers: { cookie: memberCookie },
    });
    expect(nonOwner.status).toBe(403);
    expect(await nonOwner.json()).toEqual({
      ok: false,
      code: 'forbidden',
    });
  });

  test('suspends target user, revokes existing sessions, and blocks subsequent authenticated access', async () => {
    const { app, storage, ownerHeaders, memberHeaders, memberCookie } = await createFixture();

    const nonOwnerSuspend = await app.request('/api/admin/users/user_member_1/suspend', {
      method: 'POST',
      headers: {
        ...memberHeaders,
        'x-idempotency-key': 'member-cannot-suspend-1',
      },
    });
    expect(nonOwnerSuspend.status).toBe(403);
    expect(await nonOwnerSuspend.json()).toEqual({
      ok: false,
      code: 'forbidden',
    });

    const suspended = await app.request('/api/admin/users/user_member_1/suspend', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'owner-suspend-member-1',
      },
    });
    expect(suspended.status).toBe(200);
    expect(await suspended.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_changed',
        user: expect.objectContaining({
          userId: 'user_member_1',
          lifecycleState: 'suspended',
        }),
      }),
    );

    const memberUser = await storage.users.findByUserId('user_member_1');
    expect(memberUser?.lifecycleState).toBe('suspended');
    const revokedSession = await storage.sessions.findBySessionId('session_member_1');
    expect(revokedSession?.revokedAt).not.toBeNull();

    const restoreAfterSuspend = await app.request('/api/auth/session/restore', {
      headers: { cookie: memberCookie },
    });
    expect(restoreAfterSuspend.status).toBe(200);
    expect(await restoreAfterSuspend.json()).toEqual({
      ok: true,
      sessionState: 'remote_authentication_required',
      unlockGrantEnabled: true,
      unlockIdleTimeoutMs: 300000,
    });

    const protectedAfterSuspend = await app.request('/api/sync/snapshot', {
      headers: { cookie: memberCookie },
    });
    expect(protectedAfterSuspend.status).toBe(401);
    expect(await protectedAfterSuspend.json()).toEqual({
      ok: false,
      code: 'unauthorized',
    });

    const remoteAuthAfterSuspend = await app.request('/api/auth/remote-authentication/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'member1',
        deviceId: 'device_member_1',
        authProof: 'member-proof',
      }),
    });
    expect(remoteAuthAfterSuspend.status).toBe(401);
    expect(await remoteAuthAfterSuspend.json()).toEqual({
      ok: false,
      code: 'invalid_credentials',
      message: 'Invalid credentials',
    });
  });

  test('reactivates suspended user, rejects invalid transitions, and restores allowed authentication', async () => {
    const { app, storage, ownerHeaders } = await createFixture();

    const firstReactivate = await app.request('/api/admin/users/user_member_1/reactivate', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'reactivate-already-active-1',
      },
    });
    expect(firstReactivate.status).toBe(200);
    expect(await firstReactivate.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_no_op',
        reasonCode: 'already_active',
      }),
    );

    const suspend = await app.request('/api/admin/users/user_member_1/suspend', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'reactivate-suspend-first-1',
      },
    });
    expect(suspend.status).toBe(200);

    const reactivate = await app.request('/api/admin/users/user_member_1/reactivate', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'reactivate-suspended-user-1',
      },
    });
    expect(reactivate.status).toBe(200);
    expect(await reactivate.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_changed',
        user: expect.objectContaining({
          userId: 'user_member_1',
          lifecycleState: 'active',
        }),
      }),
    );

    await storage.users.updateLifecycle('user_member_1', 'deprovisioned', '2026-03-18T12:05:00.000Z');
    const invalidReactivate = await app.request('/api/admin/users/user_member_1/reactivate', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'reactivate-deprovisioned-1',
      },
    });
    expect(invalidReactivate.status).toBe(409);
    expect(await invalidReactivate.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'conflict',
        reasonCode: 'already_deprovisioned',
      }),
    );

    await storage.users.updateLifecycle('user_member_1', 'active', '2026-03-18T12:06:00.000Z');
    const remoteAuthAfterReactivate = await app.request('/api/auth/remote-authentication/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'member1',
        deviceId: 'device_member_1',
        authProof: 'member-proof',
      }),
    });
    expect(remoteAuthAfterReactivate.status).toBe(200);
    expect(await remoteAuthAfterReactivate.json()).toEqual(
      expect.objectContaining({
        ok: true,
        user: expect.objectContaining({
          userId: 'user_member_1',
          lifecycleState: 'active',
        }),
      }),
    );
  });

  test('deprovisions target user with downstream invalidation and rejects non-owner mutation', async () => {
    const { app, storage, ownerHeaders, memberHeaders, ownerCookie, memberCookie } = await createFixture();

    const forbidden = await app.request('/api/admin/users/user_member_1/deprovision', {
      method: 'POST',
      headers: {
        ...memberHeaders,
        'x-idempotency-key': 'member-cannot-deprovision-1',
      },
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({
      ok: false,
      code: 'forbidden',
    });

    const deprovision = await app.request('/api/admin/users/user_member_1/deprovision', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'owner-deprovision-member-1',
      },
    });
    expect(deprovision.status).toBe(200);
    expect(await deprovision.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_changed',
        user: expect.objectContaining({
          userId: 'user_member_1',
          lifecycleState: 'deprovisioned',
          trustedDevicesCount: 0,
        }),
      }),
    );

    const memberUser = await storage.users.findByUserId('user_member_1');
    expect(memberUser?.lifecycleState).toBe('deprovisioned');
    const memberDevice = await storage.devices.findById('device_member_1');
    expect(memberDevice?.deviceState).toBe('deprovisioned');
    expect(memberDevice?.revokedAt).not.toBeNull();
    const memberSession = await storage.sessions.findBySessionId('session_member_1');
    expect(memberSession?.revokedAt).not.toBeNull();

    const protectedAfterDeprovision = await app.request('/api/sync/snapshot', {
      headers: { cookie: memberCookie },
    });
    expect(protectedAfterDeprovision.status).toBe(401);
    expect(await protectedAfterDeprovision.json()).toEqual({
      ok: false,
      code: 'unauthorized',
    });

    const remoteAuthDenied = await app.request('/api/auth/remote-authentication/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'member1',
        deviceId: 'device_member_1',
        authProof: 'member-proof',
      }),
    });
    expect(remoteAuthDenied.status).toBe(401);
    expect(await remoteAuthDenied.json()).toEqual({
      ok: false,
      code: 'invalid_credentials',
      message: 'Invalid credentials',
    });

    const list = await app.request('/api/admin/users', {
      headers: { cookie: ownerCookie },
    });
    expect(list.status).toBe(200);
    const listPayload = await list.json() as {
      users: Array<{
        userId: string;
        lifecycleState: 'active' | 'suspended' | 'deprovisioned';
      }>;
    };
    expect(listPayload.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'user_member_1',
          lifecycleState: 'deprovisioned',
        }),
      ]),
    );
  });

  test('lifecycle transition matrix stays deterministic for valid, invalid, and idempotent operations', async () => {
    const { app, ownerHeaders } = await createFixture();

    const suspendChanged = await app.request('/api/admin/users/user_member_1/suspend', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'matrix-suspend-1',
      },
    });
    expect(suspendChanged.status).toBe(200);
    expect(await suspendChanged.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_changed',
        user: expect.objectContaining({
          lifecycleState: 'suspended',
        }),
      }),
    );

    const suspendNoOp = await app.request('/api/admin/users/user_member_1/suspend', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'matrix-suspend-2',
      },
    });
    expect(suspendNoOp.status).toBe(200);
    expect(await suspendNoOp.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_no_op',
        reasonCode: 'already_suspended',
      }),
    );

    const reactivateChanged = await app.request('/api/admin/users/user_member_1/reactivate', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'matrix-reactivate-1',
      },
    });
    expect(reactivateChanged.status).toBe(200);
    expect(await reactivateChanged.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_changed',
        user: expect.objectContaining({
          lifecycleState: 'active',
        }),
      }),
    );

    const reactivateNoOp = await app.request('/api/admin/users/user_member_1/reactivate', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'matrix-reactivate-2',
      },
    });
    expect(reactivateNoOp.status).toBe(200);
    expect(await reactivateNoOp.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_no_op',
        reasonCode: 'already_active',
      }),
    );

    const deprovisionChanged = await app.request('/api/admin/users/user_member_1/deprovision', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'matrix-deprovision-1',
      },
    });
    expect(deprovisionChanged.status).toBe(200);
    expect(await deprovisionChanged.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_changed',
        user: expect.objectContaining({
          lifecycleState: 'deprovisioned',
        }),
      }),
    );

    const deprovisionNoOp = await app.request('/api/admin/users/user_member_1/deprovision', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'matrix-deprovision-2',
      },
    });
    expect(deprovisionNoOp.status).toBe(200);
    expect(await deprovisionNoOp.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_no_op',
        reasonCode: 'already_deprovisioned',
      }),
    );

    const reactivateConflict = await app.request('/api/admin/users/user_member_1/reactivate', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'matrix-reactivate-conflict-1',
      },
    });
    expect(reactivateConflict.status).toBe(409);
    expect(await reactivateConflict.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'conflict',
        reasonCode: 'already_deprovisioned',
      }),
    );

    const suspendConflict = await app.request('/api/admin/users/user_member_1/suspend', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'matrix-suspend-conflict-1',
      },
    });
    expect(suspendConflict.status).toBe(409);
    expect(await suspendConflict.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'conflict',
        reasonCode: 'already_deprovisioned',
      }),
    );
  });
});
