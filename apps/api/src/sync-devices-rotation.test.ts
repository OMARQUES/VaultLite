import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import type { Clock } from '@vaultlite/runtime-abstractions';
import { createTestStorage } from '@vaultlite/test-utils';
import { describe, expect, test } from 'vitest';

import { createVaultLiteApi } from './app';

class IncrementingIdGenerator {
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }
}

class AdjustableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  setNow(next: Date): void {
    this.current = new Date(next);
  }
}

function cookieHeaderFromSetCookie(setCookies: string[]): string {
  return setCookies.map((value) => value.split(';')[0]).join('; ');
}

function getCookieValue(setCookies: string[], cookieName: string): string {
  for (const value of setCookies) {
    const firstSegment = value.split(';')[0] ?? '';
    if (firstSegment.startsWith(`${cookieName}=`)) {
      return decodeURIComponent(firstSegment.slice(cookieName.length + 1));
    }
  }
  throw new Error(`Missing cookie ${cookieName}`);
}

async function createFixture(startAt = '2026-03-17T12:00:00.000Z') {
  const storage = createTestStorage();
  const clock = new AdjustableClock(new Date(startAt));
  const idGenerator = new IncrementingIdGenerator();
  const accountKitKeys = generateAccountKitKeyPair();

  await storage.deploymentState.transitionToOwnerCreatedCheckpointPending({
    ownerUserId: 'user_owner_1',
    ownerCreatedAt: startAt,
    bootstrapPublicClosedAt: startAt,
  });
  await storage.deploymentState.completeInitialization({
    completedAt: startAt,
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
    createdAt: startAt,
    updatedAt: startAt,
  });

  await storage.devices.register({
    deviceId: 'device_owner_1',
    userId: 'user_owner_1',
    deviceName: 'Primary Browser',
    platform: 'web',
    deviceState: 'active',
    createdAt: startAt,
    revokedAt: null,
  });
  await storage.sessions.create({
    sessionId: 'session_owner_1',
    userId: 'user_owner_1',
    deviceId: 'device_owner_1',
    csrfToken: 'csrf_owner_1',
    createdAt: startAt,
    expiresAt: '2026-03-17T20:00:00.000Z',
    recentReauthAt: startAt,
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
    clock,
    ownerCookie: 'vl_session=session_owner_1; vl_csrf=csrf_owner_1',
    ownerHeaders: {
      cookie: 'vl_session=session_owner_1; vl_csrf=csrf_owner_1',
      'content-type': 'application/json',
      'x-csrf-token': 'csrf_owner_1',
    },
  };
}

describe('sync/devices/password-rotation', () => {
  test('enforces snapshot token context and expiry deterministically', async () => {
    const { app, storage, clock, ownerCookie } = await createFixture();
    await storage.vaultItems.create({
      itemId: 'item_1',
      ownerUserId: 'user_owner_1',
      itemType: 'login',
      revision: 1,
      encryptedPayload: 'payload_1',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });
    await storage.vaultItems.create({
      itemId: 'item_2',
      ownerUserId: 'user_owner_1',
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'payload_2',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });

    const first = await app.request('/api/sync/snapshot?pageSize=1', {
      headers: { cookie: ownerCookie },
    });
    expect(first.status).toBe(200);
    const firstPayload = await first.json() as {
      snapshotToken: string;
      nextCursor: string | null;
    };
    expect(firstPayload.nextCursor).toBeTruthy();

    const second = await app.request(
      `/api/sync/snapshot?snapshotToken=${encodeURIComponent(firstPayload.snapshotToken)}&cursor=${encodeURIComponent(firstPayload.nextCursor ?? '')}&pageSize=1`,
      { headers: { cookie: ownerCookie } },
    );
    expect(second.status).toBe(200);

    const mismatchPageSize = await app.request(
      `/api/sync/snapshot?snapshotToken=${encodeURIComponent(firstPayload.snapshotToken)}&cursor=${encodeURIComponent(firstPayload.nextCursor ?? '')}&pageSize=2`,
      { headers: { cookie: ownerCookie } },
    );
    expect(mismatchPageSize.status).toBe(409);
    expect(await mismatchPageSize.json()).toEqual({
      ok: false,
      code: 'invalid_snapshot_context',
    });

    const missingToken = await app.request(
      `/api/sync/snapshot?cursor=${encodeURIComponent(firstPayload.nextCursor ?? '')}`,
      { headers: { cookie: ownerCookie } },
    );
    expect(missingToken.status).toBe(409);
    expect(await missingToken.json()).toEqual({
      ok: false,
      code: 'invalid_snapshot_context',
    });

    clock.setNow(new Date('2026-03-17T12:06:01.000Z'));
    const expired = await app.request(
      `/api/sync/snapshot?snapshotToken=${encodeURIComponent(firstPayload.snapshotToken)}&cursor=${encodeURIComponent(firstPayload.nextCursor ?? '')}&pageSize=1`,
      { headers: { cookie: ownerCookie } },
    );
    expect(expired.status).toBe(409);
    expect(await expired.json()).toEqual({
      ok: false,
      code: 'snapshot_expired',
    });
  });

  test('applies additional IP burst limiter for sync endpoint', async () => {
    const { app, storage, clock, ownerCookie } = await createFixture();
    const nowIso = clock.now().toISOString();
    for (let index = 0; index < 1_000; index += 1) {
      await storage.authRateLimits.increment({
        key: 'sync-snapshot:ip:unknown',
        nowIso,
        windowSeconds: 5 * 60,
      });
    }

    const blocked = await app.request('/api/sync/snapshot', {
      headers: { cookie: ownerCookie },
    });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      ok: false,
      code: 'rate_limited',
    });
  });

  test('lists trusted devices with current flag and lastAuthenticatedAt semantics', async () => {
    const { app, storage, ownerCookie } = await createFixture();
    await storage.devices.register({
      deviceId: 'device_owner_2',
      userId: 'user_owner_1',
      deviceName: 'Secondary Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-17T12:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_owner_2',
      userId: 'user_owner_1',
      deviceId: 'device_owner_2',
      csrfToken: 'csrf_owner_2',
      createdAt: '2026-03-17T12:01:00.000Z',
      expiresAt: '2026-03-17T20:00:00.000Z',
      recentReauthAt: '2026-03-17T12:03:00.000Z',
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const response = await app.request('/api/auth/devices', {
      headers: { cookie: ownerCookie },
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      devices: Array<{
        deviceId: string;
        isCurrentDevice: boolean;
        lastAuthenticatedAt: string | null;
      }>;
    };

    expect(payload.devices[0]).toEqual(
      expect.objectContaining({
        deviceId: 'device_owner_1',
        isCurrentDevice: true,
      }),
    );
    expect(payload.devices).toContainEqual(
      expect.objectContaining({
        deviceId: 'device_owner_2',
        isCurrentDevice: false,
        lastAuthenticatedAt: '2026-03-17T12:03:00.000Z',
      }),
    );
  });

  test('enforces cross-user isolation for devices list and revoke', async () => {
    const { app, storage, ownerCookie, ownerHeaders } = await createFixture();
    await storage.users.create({
      userId: 'user_other_1',
      username: 'other',
      role: 'user',
      authSalt: 'C'.repeat(22),
      authVerifier: 'other-proof',
      encryptedAccountBundle: 'other-bundle-v1',
      accountKeyWrapped: 'other-wrapped-v1',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_other_1',
      userId: 'user_other_1',
      deviceName: 'Other Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-17T12:00:00.000Z',
      revokedAt: null,
    });

    const listResponse = await app.request('/api/auth/devices', {
      headers: { cookie: ownerCookie },
    });
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json() as {
      devices: Array<{ deviceId: string }>;
    };
    expect(listPayload.devices.some((device) => device.deviceId === 'device_other_1')).toBe(false);

    const revokeResponse = await app.request('/api/auth/devices/device_other_1/revoke', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'revoke-cross-user-1',
      },
    });
    expect(revokeResponse.status).toBe(404);
    expect(await revokeResponse.json()).toEqual({
      ok: false,
      code: 'device_not_found',
    });

    const otherDevice = await storage.devices.findById('device_other_1');
    expect(otherDevice?.deviceState).toBe('active');
    expect(otherDevice?.revokedAt).toBeNull();
  });

  test('revokes non-current device atomically and blocks new auth after commit', async () => {
    const { app, storage, ownerHeaders } = await createFixture();
    await storage.devices.register({
      deviceId: 'device_owner_2',
      userId: 'user_owner_1',
      deviceName: 'Secondary Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-17T12:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_owner_2',
      userId: 'user_owner_1',
      deviceId: 'device_owner_2',
      csrfToken: 'csrf_owner_2',
      createdAt: '2026-03-17T12:00:00.000Z',
      expiresAt: '2026-03-17T20:00:00.000Z',
      recentReauthAt: null,
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const selfRevoke = await app.request('/api/auth/devices/device_owner_1/revoke', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'self-revoke-1',
      },
    });
    expect(selfRevoke.status).toBe(409);
    expect(await selfRevoke.json()).toEqual({
      ok: true,
      result: 'conflict',
      reasonCode: 'cannot_revoke_current_device',
    });

    const revoke = await app.request('/api/auth/devices/device_owner_2/revoke', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'revoke-1',
      },
    });
    expect(revoke.status).toBe(200);
    expect(await revoke.json()).toEqual({
      ok: true,
      result: 'success_changed',
    });

    const targetDevice = await storage.devices.findById('device_owner_2');
    expect(targetDevice?.deviceState).toBe('revoked');
    expect(targetDevice?.revokedAt).not.toBeNull();

    const targetSession = await storage.sessions.findBySessionId('session_owner_2');
    expect(targetSession?.revokedAt).not.toBeNull();

    const remoteAuthAfterRevoke = await app.request('/api/auth/remote-authentication/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'owner',
        deviceId: 'device_owner_2',
        authProof: 'owner-proof',
      }),
    });
    expect(remoteAuthAfterRevoke.status).toBe(401);
  });

  test('rotates password atomically with idempotent replay and conflict on key reuse mismatch', async () => {
    const { app, storage, ownerHeaders } = await createFixture();

    const rotateRequestBody = {
      currentAuthProof: 'owner-proof',
      nextAuthSalt: 'B'.repeat(22),
      nextAuthVerifier: 'owner-proof-v2',
      nextEncryptedAccountBundle: 'owner-bundle-v2',
      nextAccountKeyWrapped: 'owner-wrapped-v2',
      expected_bundle_version: 0,
    };

    const firstResponse = await app.request('/api/auth/password-rotation/complete', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'rotate-1',
      },
      body: JSON.stringify(rotateRequestBody),
    });
    expect(firstResponse.status).toBe(200);
    const firstPayload = await firstResponse.json() as {
      ok: boolean;
      result: string;
      bundleVersion: number;
    };
    expect(firstPayload.ok).toBe(true);
    expect(firstPayload.result).toBe('success_changed');
    expect(firstPayload.bundleVersion).toBe(1);

    const rotatedCookies = firstResponse.headers.getSetCookie();
    const rotatedCookieHeader = cookieHeaderFromSetCookie(rotatedCookies);
    const rotatedCsrf = getCookieValue(rotatedCookies, 'vl_csrf');

    const replayResponse = await app.request('/api/auth/password-rotation/complete', {
      method: 'POST',
      headers: {
        cookie: rotatedCookieHeader,
        'content-type': 'application/json',
        'x-csrf-token': rotatedCsrf,
        'x-idempotency-key': 'rotate-1',
      },
      body: JSON.stringify(rotateRequestBody),
    });
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.json()).toEqual(firstPayload);

    const sessions = await storage.sessions.listByUserId('user_owner_1');
    const activeSessions = sessions.filter((session) => session.revokedAt === null);
    expect(activeSessions).toHaveLength(1);

    const badReuse = await app.request('/api/auth/password-rotation/complete', {
      method: 'POST',
      headers: {
        cookie: rotatedCookieHeader,
        'content-type': 'application/json',
        'x-csrf-token': rotatedCsrf,
        'x-idempotency-key': 'rotate-1',
      },
      body: JSON.stringify({
        ...rotateRequestBody,
        nextAuthVerifier: 'owner-proof-v3',
      }),
    });
    expect(badReuse.status).toBe(409);
    expect(await badReuse.json()).toEqual({
      ok: false,
      code: 'idempotency_key_reuse_conflict',
    });

    const staleVersion = await app.request('/api/auth/password-rotation/complete', {
      method: 'POST',
      headers: {
        cookie: rotatedCookieHeader,
        'content-type': 'application/json',
        'x-csrf-token': rotatedCsrf,
        'x-idempotency-key': 'rotate-2',
      },
      body: JSON.stringify({
        ...rotateRequestBody,
        currentAuthProof: 'owner-proof-v2',
        expected_bundle_version: 0,
      }),
    });
    expect(staleVersion.status).toBe(409);
    expect(await staleVersion.json()).toEqual({
      ok: false,
      code: 'stale_bundle_version',
    });
  });

  test('password rotation failure does not leak sensitive payload fields', async () => {
    const { app, ownerHeaders } = await createFixture();
    const sensitiveRequest = {
      currentAuthProof: 'wrong-proof',
      nextAuthSalt: 'D'.repeat(22),
      nextAuthVerifier: 'should-not-leak-verifier',
      nextEncryptedAccountBundle: 'should-not-leak-bundle',
      nextAccountKeyWrapped: 'should-not-leak-wrapped',
      expected_bundle_version: 0,
    };

    const response = await app.request('/api/auth/password-rotation/complete', {
      method: 'POST',
      headers: {
        ...ownerHeaders,
        'x-idempotency-key': 'rotate-redaction-1',
      },
      body: JSON.stringify(sensitiveRequest),
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      code: 'invalid_credentials',
    });

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(sensitiveRequest.currentAuthProof);
    expect(serialized).not.toContain(sensitiveRequest.nextAuthVerifier);
    expect(serialized).not.toContain(sensitiveRequest.nextEncryptedAccountBundle);
    expect(serialized).not.toContain(sensitiveRequest.nextAccountKeyWrapped);
  });
});
