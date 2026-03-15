import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import { FixedClock, QueueIdGenerator, createTestStorage } from '@vaultlite/test-utils';
import { describe, expect, test } from 'vitest';

import { createVaultLiteApi } from './app';

async function createAppFixture(input: {
  storage?: ReturnType<typeof createTestStorage>;
} = {}) {
  const storage = input.storage ?? createTestStorage();
  const clock = new FixedClock(new Date('2026-03-15T12:00:00.000Z'));
  const idGenerator = new QueueIdGenerator([
    'invite_1',
    'user_1',
    'session_1',
    'csrf_1',
    'device_1',
    'session_2',
    'csrf_2',
    'device_2',
    'session_3',
    'csrf_3',
  ]);
  const accountKitKeys = generateAccountKitKeyPair();

  const app = createVaultLiteApi({
    storage,
    clock,
    idGenerator,
    deploymentFingerprint: 'deployment_fp_v1',
    serverUrl: 'https://vaultlite.example.com',
    bootstrapAdminToken: 'bootstrap-admin-token',
    secureCookies: true,
    accountKitPrivateKey: accountKitKeys.privateKey,
    accountKitPublicKey: accountKitKeys.publicKey,
  });

  return { app, storage };
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
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  test('issues invite, completes onboarding, and sets hardened cookies', async () => {
    const { app, storage } = await createAppFixture();

    const inviteResponse = await app.request('/api/auth/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-admin-token': 'bootstrap-admin-token',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-20T00:00:00.000Z',
      }),
    });

    expect(inviteResponse.status).toBe(201);
    const invitePayload = await inviteResponse.json();
    expect(invitePayload.inviteToken).toBe('invite_invite_1');

    const onboardingResponse = await app.request('/api/auth/onboarding/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteToken: 'invite_invite_1',
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
    const setCookieHeaders = onboardingResponse.headers.getSetCookie();
    expect(setCookieHeaders.some((value) => value.includes('vl_session='))).toBe(true);
    expect(setCookieHeaders.some((value) => value.includes('HttpOnly'))).toBe(true);
    expect(setCookieHeaders.some((value) => value.includes('SameSite=Strict'))).toBe(true);
    expect(setCookieHeaders.some((value) => value.includes('Secure'))).toBe(true);

    const onboardingPayload = await onboardingResponse.json();
    expect(onboardingPayload.user.username).toBe('alice');
    expect(onboardingPayload.device.deviceId).toBe('device_local_1');

    const storedUser = await storage.users.findByUsername('alice');
    expect(storedUser?.lifecycleState).toBe('active');
  });

  test('signs onboarding account kit before persistence and keeps invite usable', async () => {
    const { app, storage } = await createAppFixture();

    const inviteResponse = await app.request('/api/auth/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-admin-token': 'bootstrap-admin-token',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-20T00:00:00.000Z',
      }),
    });
    const invitePayload = await inviteResponse.json();

    const signResponse = await app.request('/api/auth/onboarding/account-kit/sign', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteToken: invitePayload.inviteToken,
        username: 'alice',
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'alice',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
      }),
    });

    expect(signResponse.status).toBe(200);
    const inviteStillUsable = await storage.invites.findUsableByToken(
      invitePayload.inviteToken,
      '2026-03-15T12:00:00.000Z',
    );
    expect(inviteStillUsable?.consumedAt).toBeNull();
    expect(await storage.users.findByUsername('alice')).toBeNull();
  });

  test('rejects onboarding account kit signing when the username is already taken and keeps invite usable', async () => {
    const { app, storage } = await createAppFixture();

    await storage.users.create({
      userId: 'user_existing_1',
      username: 'alice',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_key_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    });

    const inviteResponse = await app.request('/api/auth/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-admin-token': 'bootstrap-admin-token',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-20T00:00:00.000Z',
      }),
    });
    const invitePayload = await inviteResponse.json();

    const signResponse = await app.request('/api/auth/onboarding/account-kit/sign', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteToken: invitePayload.inviteToken,
        username: 'alice',
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'alice',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
      }),
    });

    expect(signResponse.status).toBe(409);
    expect(await signResponse.json()).toEqual({
      ok: false,
      code: 'username_unavailable',
    });
    const inviteStillUsable = await storage.invites.findUsableByToken(
      invitePayload.inviteToken,
      '2026-03-15T12:00:00.000Z',
    );
    expect(inviteStillUsable?.consumedAt).toBeNull();
  });

  test('rejects onboarding account kit signing when payload metadata mismatches runtime metadata', async () => {
    const { app } = await createAppFixture();

    const inviteResponse = await app.request('/api/auth/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-admin-token': 'bootstrap-admin-token',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-20T00:00:00.000Z',
      }),
    });
    const invitePayload = await inviteResponse.json();

    const signResponse = await app.request('/api/auth/onboarding/account-kit/sign', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteToken: invitePayload.inviteToken,
        username: 'alice',
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'http://127.0.0.1:5173',
          username: 'alice',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
      }),
    });

    expect(signResponse.status).toBe(400);
    expect(await signResponse.json()).toEqual({
      ok: false,
      code: 'account_kit_payload_mismatch',
    });
  });

  test('normalizes invite expiration timestamps before onboarding validation', async () => {
    const { app } = await createAppFixture();
    const inviteResponse = await app.request('/api/auth/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-admin-token': 'bootstrap-admin-token',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-15T10:00:00.000-03:00',
      }),
    });
    const invitePayload = await inviteResponse.json();

    const onboardingResponse = await app.request('/api/auth/onboarding/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteToken: invitePayload.inviteToken,
        username: 'normalized_invite_user',
        authSalt: 'salt_1',
        authVerifier: 'verifier_1',
        encryptedAccountBundle: 'bundle_1',
        accountKeyWrapped: 'wrapped_1',
        accountKitExportAcknowledged: true,
        zeroRecoveryAcknowledged: true,
        initialDevice: {
          deviceId: 'device_normalized',
          deviceName: 'Normalized Device',
          platform: 'web',
        },
      }),
    });

    expect(onboardingResponse.status).toBe(201);
  });

  test('does not leave partial onboarding state behind when atomic completion fails', async () => {
    const storage = createTestStorage({
      failOnCompleteOnboardingAtomicStep: 'session',
    });
    const { app } = await createAppFixture({ storage });

    const inviteResponse = await app.request('/api/auth/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-admin-token': 'bootstrap-admin-token',
      },
      body: JSON.stringify({
        expiresAt: '2026-03-20T00:00:00.000Z',
      }),
    });
    const invitePayload = await inviteResponse.json();

    const onboardingResponse = await app.request('/api/auth/onboarding/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inviteToken: invitePayload.inviteToken,
        username: 'atomic_failure_user',
        authSalt: 'A'.repeat(22),
        authVerifier: 'proof_payload',
        encryptedAccountBundle: 'bundle_payload',
        accountKeyWrapped: 'wrapped_key_payload',
        accountKitExportAcknowledged: true,
        zeroRecoveryAcknowledged: true,
        initialDevice: {
          deviceId: 'device_atomic_failure',
          deviceName: 'Atomic Failure Device',
          platform: 'web',
        },
      }),
    });

    expect(onboardingResponse.status).toBe(500);
    expect(await storage.users.findByUsername('atomic_failure_user')).toBeNull();
    const inviteStillUsable = await storage.invites.findUsableByToken(
      invitePayload.inviteToken,
      '2026-03-15T12:00:00.000Z',
    );
    expect(inviteStillUsable?.consumedAt).toBeNull();
    expect(await storage.devices.findById('device_atomic_failure')).toBeNull();
    expect(await storage.sessions.findBySessionId('session_session_1')).toBeNull();
  });

  test('returns anti-enumeration challenge and generic invalid-credentials failure', async () => {
    const { app } = await createAppFixture();

    const unknownChallengeResponse = await app.request('/api/auth/remote-authentication/challenge', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'missing-user',
      }),
    });
    expect(unknownChallengeResponse.status).toBe(200);
    const unknownChallengePayload = await unknownChallengeResponse.json();
    expect(unknownChallengePayload.requiresRemoteAuthentication).toBe(true);
    expect(typeof unknownChallengePayload.authSalt).toBe('string');

    const invalidResponse = await app.request('/api/auth/remote-authentication/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'missing-user',
        deviceId: 'device_local_1',
        authProof: 'wrong-proof',
      }),
    });

    expect(invalidResponse.status).toBe(401);
    expect(await invalidResponse.json()).toEqual({
      ok: false,
      code: 'invalid_credentials',
      message: 'Invalid credentials',
    });
  });

  test('restores valid session and blocks suspended users from new remote authentication', async () => {
    const { app, storage } = await createAppFixture();

    await storage.users.create({
      userId: 'user_existing_1',
      username: 'alice',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_key_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_local_1',
      userId: 'user_existing_1',
      deviceName: 'Alice Laptop',
      platform: 'web',
      createdAt: '2026-03-15T12:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_active_1',
      userId: 'user_existing_1',
      deviceId: 'device_local_1',
      csrfToken: 'csrf_active_1',
      createdAt: '2026-03-15T12:00:00.000Z',
      expiresAt: '2026-03-15T18:00:00.000Z',
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const restoreResponse = await app.request('/api/auth/session/restore', {
      headers: {
        cookie: 'vl_session=session_active_1',
      },
    });

    expect(restoreResponse.status).toBe(200);
    const restorePayload = await restoreResponse.json();
    expect(restorePayload.sessionState).toBe('local_unlock_required');

    await storage.users.updateLifecycle(
      'user_existing_1',
      'suspended',
      '2026-03-15T13:00:00.000Z',
    );

    const authResponse = await app.request('/api/auth/remote-authentication/complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        username: 'alice',
        deviceId: 'device_local_1',
        authProof: 'proof_payload',
      }),
    });

    expect(authResponse.status).toBe(401);
    expect(await authResponse.json()).toEqual({
      ok: false,
      code: 'invalid_credentials',
      message: 'Invalid credentials',
    });
  });

  test('requires csrf and authenticated session for account kit signing and verifies kit authenticity', async () => {
    const { app, storage } = await createAppFixture();

    await storage.users.create({
      userId: 'user_existing_1',
      username: 'alice',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_key_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_local_1',
      userId: 'user_existing_1',
      deviceName: 'Alice Laptop',
      platform: 'web',
      createdAt: '2026-03-15T12:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_active_1',
      userId: 'user_existing_1',
      deviceId: 'device_local_1',
      csrfToken: 'csrf_active_1',
      createdAt: '2026-03-15T12:00:00.000Z',
      expiresAt: '2026-03-15T18:00:00.000Z',
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const forbiddenResponse = await app.request('/api/auth/account-kit/sign', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_active_1; vl_csrf=csrf_active_1',
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'alice',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
      }),
    });

    expect(forbiddenResponse.status).toBe(403);

    const signResponse = await app.request('/api/auth/account-kit/sign', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_active_1; vl_csrf=csrf_active_1',
        'x-csrf-token': 'csrf_active_1',
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'alice',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
      }),
    });

    expect(signResponse.status).toBe(200);
    const signPayload = await signResponse.json();

    const verifyResponse = await app.request('/api/auth/account-kit/verify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'alice',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
        signature: signPayload.signature,
      }),
    });

    expect(verifyResponse.status).toBe(200);
    expect(await verifyResponse.json()).toEqual({
      status: 'valid',
    });

    const invalidVerifyResponse = await app.request('/api/auth/account-kit/verify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'alice',
          accountKey: 'B'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
        signature: signPayload.signature,
      }),
    });

    expect(invalidVerifyResponse.status).toBe(200);
    expect(await invalidVerifyResponse.json()).toEqual({
      status: 'invalid',
    });
  });

  test('rejects account kit reissue when canonical runtime metadata mismatches', async () => {
    const { app, storage } = await createAppFixture();

    await storage.users.create({
      userId: 'user_existing_1',
      username: 'alice',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_key_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_local_1',
      userId: 'user_existing_1',
      deviceName: 'Alice Laptop',
      platform: 'web',
      createdAt: '2026-03-15T12:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_active_1',
      userId: 'user_existing_1',
      deviceId: 'device_local_1',
      csrfToken: 'csrf_active_1',
      createdAt: '2026-03-15T12:00:00.000Z',
      expiresAt: '2026-03-15T18:00:00.000Z',
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const reissueResponse = await app.request('/api/auth/account-kit/reissue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_active_1; vl_csrf=csrf_active_1',
        'x-csrf-token': 'csrf_active_1',
      },
      body: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'http://127.0.0.1:5173',
          username: 'alice',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
      }),
    });

    expect(reissueResponse.status).toBe(400);
    expect(await reissueResponse.json()).toEqual({
      ok: false,
      code: 'account_kit_payload_mismatch',
    });
  });

  test('exposes placeholder namespaces for attachments and lifecycle admin surfaces', async () => {
    const { app } = await createAppFixture();

    expect((await app.request('/api/attachments')).status).toBe(501);
    expect((await app.request('/api/admin/users')).status).toBe(501);
  });
});
