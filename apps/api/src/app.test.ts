import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import { toBase64Url } from '@vaultlite/crypto/base64';
import { FixedClock, createTestStorage } from '@vaultlite/test-utils';
import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import { createVaultLiteApi } from './app';

function sha256Base64Url(value: string): string {
  return toBase64Url(createHash('sha256').update(value).digest());
}

class IncrementingIdGenerator {
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
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

async function createAppFixture() {
  const storage = createTestStorage();
  const clock = new FixedClock(new Date('2026-03-17T12:00:00.000Z'));
  const idGenerator = new IncrementingIdGenerator();
  const accountKitKeys = generateAccountKitKeyPair();

  const app = createVaultLiteApi({
    storage,
    clock,
    idGenerator,
    deploymentFingerprint: 'deployment_fp_v1',
    serverUrl: 'https://vaultlite.example.com',
    bootstrapAdminToken: 'bootstrap-secret',
    secureCookies: true,
    accountKitPrivateKey: accountKitKeys.privateKey,
    accountKitPublicKey: accountKitKeys.publicKey,
  });

  return { app, storage };
}

async function initializeDeployment(app: ReturnType<typeof createVaultLiteApi>) {
  const verifyResponse = await app.request('/api/bootstrap/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ bootstrapToken: 'bootstrap-secret' }),
  });
  const verifyPayload = (await verifyResponse.json()) as { verificationToken: string };

  const initializeResponse = await app.request('/api/bootstrap/initialize-owner', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': 'init-owner-1',
    },
    body: JSON.stringify({
      verificationToken: verifyPayload.verificationToken,
      username: 'owner',
      authSalt: 'A'.repeat(22),
      authVerifier: 'owner-proof',
      encryptedAccountBundle: 'owner-bundle',
      accountKeyWrapped: 'owner-wrapped',
      initialDeviceName: 'Primary Browser',
      initialDevicePlatform: 'web',
    }),
  });
  const setCookies = initializeResponse.headers.getSetCookie();
  const ownerCookies = cookieHeaderFromSetCookie(setCookies);
  const ownerCsrf = getCookieValue(setCookies, 'vl_csrf');

  await app.request('/api/bootstrap/checkpoint/download-account-kit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: ownerCookies,
      'x-csrf-token': ownerCsrf,
    },
    body: JSON.stringify({
      payload: {
        version: 'account-kit.v1',
        serverUrl: 'https://vaultlite.example.com',
        username: 'owner',
        accountKey: 'B'.repeat(43),
        deploymentFingerprint: 'deployment_fp_v1',
        issuedAt: '2026-03-17T12:00:00.000Z',
      },
      signature: 'C'.repeat(32),
    }),
  });
  await app.request('/api/bootstrap/checkpoint/complete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: ownerCookies,
      'x-csrf-token': ownerCsrf,
      'x-idempotency-key': 'checkpoint-complete-1',
    },
    body: JSON.stringify({ confirmSavedOutsideBrowser: true }),
  });
}

describe('createVaultLiteApi', () => {
  test('exposes canonical runtime metadata with security headers', async () => {
    const { app } = await createAppFixture();
    const response = await app.request('/api/runtime/metadata');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      serverUrl: 'https://vaultlite.example.com',
      deploymentFingerprint: 'deployment_fp_v1',
    });
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  test('blocks onboarding while initialization is pending', async () => {
    const { app } = await createAppFixture();

    const onboardingResponse = await app.request('/api/auth/onboarding/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        inviteToken: 'invite_1',
        username: 'alice',
        authSalt: 'A'.repeat(22),
        authVerifier: 'proof_payload',
        encryptedAccountBundle: 'bundle_payload',
        accountKeyWrapped: 'wrapped_key_payload',
        accountKitExportAcknowledged: true,
        zeroRecoveryAcknowledged: true,
        initialDevice: {
          deviceId: 'device_local_1',
          deviceName: 'Alice Laptop',
          platform: 'web',
        },
      }),
    });

    expect(onboardingResponse.status).toBe(409);
    expect(await onboardingResponse.json()).toEqual({
      ok: false,
      code: 'initialization_pending',
    });
  });

  test('completes onboarding after initialization when invite hash is valid', async () => {
    const { app, storage } = await createAppFixture();
    await initializeDeployment(app);

    const inviteToken = 'invite_plain_token_1';
    await storage.invites.create({
      inviteId: 'invite_1',
      tokenHash: sha256Base64Url(inviteToken),
      tokenPreview: 'invite…ken1',
      createdByUserId: 'user_owner_1',
      expiresAt: '2026-03-18T12:00:00.000Z',
      consumedAt: null,
      consumedByUserId: null,
      revokedAt: null,
      revokedByUserId: null,
      createdAt: '2026-03-17T12:00:00.000Z',
    });

    const onboardingResponse = await app.request('/api/auth/onboarding/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        inviteToken,
        username: 'alice',
        authSalt: 'A'.repeat(22),
        authVerifier: 'proof_payload',
        encryptedAccountBundle: 'bundle_payload',
        accountKeyWrapped: 'wrapped_key_payload',
        accountKitExportAcknowledged: true,
        zeroRecoveryAcknowledged: true,
        initialDevice: {
          deviceId: 'device_local_1',
          deviceName: 'Alice Laptop',
          platform: 'web',
        },
      }),
    });

    expect(onboardingResponse.status).toBe(201);
    const payload = await onboardingResponse.json();
    expect(payload.user.role).toBe('user');
    expect(payload.user.username).toBe('alice');
  });

  test('restores session with local_unlock_required for active user', async () => {
    const { app, storage } = await createAppFixture();
    await initializeDeployment(app);

    await storage.users.create({
      userId: 'user_2',
      username: 'bob',
      role: 'user',
      authSalt: 'B'.repeat(22),
      authVerifier: 'proof_payload_bob',
      encryptedAccountBundle: 'bundle_payload_bob',
      accountKeyWrapped: 'wrapped_payload_bob',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_2',
      userId: 'user_2',
      deviceName: 'Bob Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-17T12:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_2',
      userId: 'user_2',
      deviceId: 'device_2',
      csrfToken: 'csrf_2',
      createdAt: '2026-03-17T12:00:00.000Z',
      expiresAt: '2026-03-17T18:00:00.000Z',
      recentReauthAt: null,
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const restoreResponse = await app.request('/api/auth/session/restore', {
      headers: {
        cookie: 'vl_session=session_2',
      },
    });

    expect(restoreResponse.status).toBe(200);
    expect(await restoreResponse.json()).toEqual({
      ok: true,
      sessionState: 'local_unlock_required',
      user: {
        userId: 'user_2',
        username: 'bob',
        role: 'user',
        lifecycleState: 'active',
      },
      device: {
        deviceId: 'device_2',
        deviceName: 'Bob Browser',
        platform: 'web',
      },
    });
  });
});
