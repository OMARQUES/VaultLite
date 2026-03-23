import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import { toBase64Url } from '@vaultlite/crypto/base64';
import type { Clock } from '@vaultlite/runtime-abstractions';
import { createTestStorage } from '@vaultlite/test-utils';
import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';

import { createVaultLiteApi } from './app';

function sha256Base64Url(value: string): string {
  return toBase64Url(createHash('sha256').update(value).digest());
}

function toBase64UrlUtf8(value: string): string {
  return toBase64Url(new TextEncoder().encode(value));
}

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

async function createAppFixture(startAt = '2026-03-17T12:00:00.000Z') {
  const storage = createTestStorage();
  const clock = new AdjustableClock(new Date(startAt));
  const idGenerator = new IncrementingIdGenerator();
  const accountKitKeys = generateAccountKitKeyPair();

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

  return { app, storage, clock };
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
  const initializePayload = (await initializeResponse.json()) as { user: { userId: string } };
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

  return {
    ownerCookies,
    ownerCsrf,
    ownerUserId: initializePayload.user.userId,
  };
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
      unlockGrantEnabled: true,
      unlockIdleTimeoutMs: 300000,
      lockRevision: 0,
      lockScope: 'linked_surface_pair',
      user: {
        userId: 'user_2',
        username: 'bob',
        role: 'user',
        bundleVersion: 0,
        lifecycleState: 'active',
      },
      device: {
        deviceId: 'device_2',
        deviceName: 'Bob Browser',
        platform: 'web',
      },
    });
  });

  test('enforces bounded rate limiting for remote authentication and unlocks after cooldown', async () => {
    const { app, storage, clock } = await createAppFixture();
    await initializeDeployment(app);

    await storage.users.create({
      userId: 'user_3',
      username: 'charlie',
      role: 'user',
      authSalt: 'C'.repeat(22),
      authVerifier: 'charlie-proof',
      encryptedAccountBundle: 'bundle_payload_charlie',
      accountKeyWrapped: 'wrapped_payload_charlie',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_charlie_1',
      userId: 'user_3',
      deviceName: 'Charlie Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-17T12:00:00.000Z',
      revokedAt: null,
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await app.request('/api/auth/remote-authentication/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'charlie',
          deviceId: 'device_charlie_1',
          authProof: 'wrong-proof',
        }),
      });
      expect(response.status).toBe(401);
    }

    const blocked = await app.request('/api/auth/remote-authentication/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'charlie',
        deviceId: 'device_charlie_1',
        authProof: 'wrong-proof',
      }),
    });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      ok: false,
      code: 'rate_limited',
    });

    clock.setNow(new Date('2026-03-17T12:06:10.000Z'));
    const postCooldown = await app.request('/api/auth/remote-authentication/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'charlie',
        deviceId: 'device_charlie_1',
        authProof: 'wrong-proof',
      }),
    });
    expect(postCooldown.status).toBe(401);
  });

  test('applies rate limiting to device bootstrap and returns generic anti-enumeration-safe response', async () => {
    const { app, clock } = await createAppFixture();
    await initializeDeployment(app);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await app.request('/api/auth/devices/bootstrap', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '203.0.113.8',
        },
        body: JSON.stringify({
          username: 'owner',
          authProof: 'invalid-proof',
          deviceName: 'Recovered Browser',
          devicePlatform: 'web',
        }),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        ok: false,
        code: 'invalid_credentials',
        message: 'Invalid credentials',
      });
    }

    const blocked = await app.request('/api/auth/devices/bootstrap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.8',
      },
      body: JSON.stringify({
        username: 'owner',
        authProof: 'invalid-proof',
        deviceName: 'Recovered Browser',
        devicePlatform: 'web',
      }),
    });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      ok: false,
      code: 'rate_limited',
    });

    clock.setNow(new Date('2026-03-17T12:06:10.000Z'));
    const postCooldown = await app.request('/api/auth/devices/bootstrap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.8',
      },
      body: JSON.stringify({
        username: 'owner',
        authProof: 'invalid-proof',
        deviceName: 'Recovered Browser',
        devicePlatform: 'web',
      }),
    });
    expect(postCooldown.status).toBe(401);
  });

  test('rejects vault item payloads above 256KB', async () => {
    const { app } = await createAppFixture();
    const { ownerCookies, ownerCsrf, ownerUserId } = await initializeDeployment(app);

    const oversizedPayload = 'A'.repeat(256 * 1024 + 1);
    const response = await app.request('/api/vault/items', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: oversizedPayload,
      }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'payload_too_large',
    });
  });

  test('rejects attachment init requests above 25MB', async () => {
    const { app, storage } = await createAppFixture();
    const { ownerCookies, ownerCsrf, ownerUserId } = await initializeDeployment(app);

    await storage.vaultItems.create({
      itemId: 'item_doc_1',
      ownerUserId,
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'bundle_payload_doc_1',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });

    const response = await app.request('/api/attachments/uploads/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        itemId: 'item_doc_1',
        fileName: 'document-1.pdf',
        contentType: 'application/pdf',
        size: 25 * 1024 * 1024 + 1,
        idempotencyKey: 'idem-attachment-size-limit',
      }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'attachment_too_large',
    });
  });

  test('rejects attachment uploads when envelope metadata does not match declared size', async () => {
    const { app, storage } = await createAppFixture();
    const { ownerCookies, ownerCsrf, ownerUserId } = await initializeDeployment(app);

    await storage.vaultItems.create({
      itemId: 'item_doc_2',
      ownerUserId,
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'bundle_payload_doc_2',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });

    const initResponse = await app.request('/api/attachments/uploads/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        itemId: 'item_doc_2',
        fileName: 'document-2.pdf',
        contentType: 'application/pdf',
        size: 10,
        idempotencyKey: 'idem-attachment-envelope-mismatch',
      }),
    });
    const initPayload = (await initResponse.json()) as { uploadId: string; uploadToken: string };

    const envelope = {
      version: 'blob.v1',
      algorithm: 'aes-256-gcm',
      nonce: toBase64UrlUtf8('nonce-value'),
      ciphertext: toBase64UrlUtf8('12345'),
      authTag: toBase64UrlUtf8('tag-value'),
      contentType: 'application/pdf',
      originalSize: 10,
    };

    const uploadResponse = await app.request(`/api/attachments/uploads/${initPayload.uploadId}/content`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        uploadToken: initPayload.uploadToken,
        encryptedEnvelope: toBase64UrlUtf8(JSON.stringify(envelope)),
      }),
    });

    expect(uploadResponse.status).toBe(400);
    expect(await uploadResponse.json()).toEqual({
      ok: false,
      code: 'attachment_envelope_mismatch',
    });
  });

  test('rejects oversized attachment envelope request body', async () => {
    const { app, storage } = await createAppFixture();
    const { ownerCookies, ownerCsrf, ownerUserId } = await initializeDeployment(app);

    await storage.vaultItems.create({
      itemId: 'item_doc_3',
      ownerUserId,
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'bundle_payload_doc_3',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });

    const initResponse = await app.request('/api/attachments/uploads/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        itemId: 'item_doc_3',
        fileName: 'document-3.pdf',
        contentType: 'application/pdf',
        size: 10,
        idempotencyKey: 'idem-attachment-envelope-too-large',
      }),
    });
    const initPayload = (await initResponse.json()) as { uploadId: string; uploadToken: string };

    const oversizedRequest = new Request(
      `http://localhost/api/attachments/uploads/${initPayload.uploadId}/content`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookies,
          'x-csrf-token': ownerCsrf,
          'content-length': String(100 * 1024 * 1024),
        },
        body: JSON.stringify({
          uploadToken: initPayload.uploadToken,
          encryptedEnvelope: toBase64UrlUtf8('tiny'),
        }),
      },
    );

    const response = await app.fetch(oversizedRequest);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'upload_envelope_too_large',
    });
  });

  test('finalizes uploaded attachments with idempotent canonical result semantics', async () => {
    const { app, storage } = await createAppFixture();
    const { ownerCookies, ownerCsrf, ownerUserId } = await initializeDeployment(app);

    await storage.vaultItems.create({
      itemId: 'item_doc_finalize_1',
      ownerUserId,
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'bundle_payload_doc_finalize_1',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });

    const initResponse = await app.request('/api/attachments/uploads/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        itemId: 'item_doc_finalize_1',
        fileName: 'finalize-1.pdf',
        contentType: 'application/pdf',
        size: 6,
        idempotencyKey: 'idem-attachment-finalize',
      }),
    });
    expect(initResponse.status).toBe(201);
    const initPayload = (await initResponse.json()) as { uploadId: string; uploadToken: string };

    const envelope = {
      version: 'blob.v1',
      algorithm: 'aes-256-gcm',
      nonce: toBase64UrlUtf8('nonce-finalize'),
      ciphertext: toBase64UrlUtf8('ABCDEF'),
      authTag: toBase64UrlUtf8('tag-finalize'),
      contentType: 'application/pdf',
      originalSize: 6,
    };

    const uploadResponse = await app.request(`/api/attachments/uploads/${initPayload.uploadId}/content`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        uploadToken: initPayload.uploadToken,
        encryptedEnvelope: toBase64UrlUtf8(JSON.stringify(envelope)),
      }),
    });
    expect(uploadResponse.status).toBe(200);

    const finalizeResponse = await app.request('/api/attachments/uploads/finalize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        uploadId: initPayload.uploadId,
        itemId: 'item_doc_finalize_1',
      }),
    });
    expect(finalizeResponse.status).toBe(200);
    expect(await finalizeResponse.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_changed',
        upload: expect.objectContaining({
          uploadId: initPayload.uploadId,
          itemId: 'item_doc_finalize_1',
          fileName: 'finalize-1.pdf',
          lifecycleState: 'attached',
        }),
      }),
    );

    const replay = await app.request('/api/attachments/uploads/finalize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        uploadId: initPayload.uploadId,
        itemId: 'item_doc_finalize_1',
      }),
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(
      expect.objectContaining({
        ok: true,
        result: 'success_no_op',
      }),
    );

    const envelopeResponse = await app.request(
      `/api/attachments/uploads/${initPayload.uploadId}/envelope`,
      {
        method: 'GET',
        headers: {
          cookie: ownerCookies,
        },
      },
    );
    expect(envelopeResponse.status).toBe(200);
    expect(await envelopeResponse.json()).toEqual(
      expect.objectContaining({
        uploadId: initPayload.uploadId,
        itemId: 'item_doc_finalize_1',
        fileName: 'finalize-1.pdf',
        encryptedEnvelope: toBase64UrlUtf8(JSON.stringify(envelope)),
      }),
    );
  });

  test('rejects finalize when upload is reused against another item', async () => {
    const { app, storage } = await createAppFixture();
    const { ownerCookies, ownerCsrf, ownerUserId } = await initializeDeployment(app);

    await storage.vaultItems.create({
      itemId: 'item_doc_finalize_2',
      ownerUserId,
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'bundle_payload_doc_finalize_2',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });
    await storage.vaultItems.create({
      itemId: 'item_doc_finalize_other',
      ownerUserId,
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'bundle_payload_doc_finalize_other',
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });

    const initResponse = await app.request('/api/attachments/uploads/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        itemId: 'item_doc_finalize_2',
        fileName: 'finalize-2.pdf',
        contentType: 'application/pdf',
        size: 5,
        idempotencyKey: 'idem-attachment-finalize-mismatch',
      }),
    });
    expect(initResponse.status).toBe(201);
    const initPayload = (await initResponse.json()) as { uploadId: string };

    const finalizeResponse = await app.request('/api/attachments/uploads/finalize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        uploadId: initPayload.uploadId,
        itemId: 'item_doc_finalize_other',
      }),
    });
    expect(finalizeResponse.status).toBe(409);
    expect(await finalizeResponse.json()).toEqual({
      ok: false,
      code: 'attachment_already_bound_to_other_item',
    });
  });

  test('resolves manual site icon overrides with user precedence', async () => {
    const { app } = await createAppFixture();
    const { ownerCookies, ownerCsrf } = await initializeDeployment(app);
    const dataUrl = 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCCDDDDDDDD';

    const upsertResponse = await app.request('/api/icons/manual/upsert', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
        'x-csrf-token': ownerCsrf,
      },
      body: JSON.stringify({
        domain: 'portal.example.com',
        dataUrl,
        source: 'url',
      }),
    });
    expect(upsertResponse.status).toBe(200);
    expect(await upsertResponse.json()).toEqual({
      ok: true,
      result: 'success_changed',
    });

    const resolveResponse = await app.request('/api/icons/resolve', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: ownerCookies,
      },
      body: JSON.stringify({
        domains: ['portal.example.com'],
      }),
    });
    expect(resolveResponse.status).toBe(200);
    expect(await resolveResponse.json()).toEqual({
      ok: true,
      icons: [
        {
          domain: 'portal.example.com',
          dataUrl,
          source: 'manual',
          sourceUrl: null,
          updatedAt: expect.any(String),
        },
      ],
    });
  });

  test('discovers and caches automatic site icons server-side', async () => {
    const { app } = await createAppFixture();
    const { ownerCookies } = await initializeDeployment(app);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target === 'https://portal.example.com/') {
        const response = new Response('<html><head><link rel="icon" href="/favicon.png"></head></html>', {
          status: 200,
          headers: {
            'content-type': 'text/html',
          },
        });
        Object.defineProperty(response, 'url', {
          configurable: true,
          value: target,
        });
        return response;
      }
      if (target === 'https://portal.example.com/favicon.png') {
        const response = new Response(
          new Uint8Array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
          ]),
          {
          status: 200,
          headers: {
            'content-type': 'image/png',
          },
          },
        );
        Object.defineProperty(response, 'url', {
          configurable: true,
          value: target,
        });
        return response;
      }
      return new Response('not_found', { status: 404 });
    }) as typeof fetch;

    try {
      const discoverResponse = await app.request('/api/icons/discover', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookies,
        },
        body: JSON.stringify({
          domains: ['portal.example.com'],
        }),
      });
      expect(discoverResponse.status).toBe(200);
      expect(await discoverResponse.json()).toEqual(
        expect.objectContaining({
          ok: true,
          unresolved: [],
          icons: [
            expect.objectContaining({
              domain: 'portal.example.com',
              dataUrl: expect.stringContaining('data:image/png;base64,'),
              source: 'automatic',
              sourceUrl: 'https://portal.example.com/favicon.png',
              updatedAt: expect.any(String),
            }),
          ],
        }),
      );

      const resolveResponse = await app.request('/api/icons/resolve', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookies,
        },
        body: JSON.stringify({
          domains: ['portal.example.com'],
        }),
      });
      expect(resolveResponse.status).toBe(200);
      expect(await resolveResponse.json()).toEqual(
        expect.objectContaining({
          ok: true,
          icons: [
            expect.objectContaining({
              domain: 'portal.example.com',
              dataUrl: expect.stringContaining('data:image/png;base64,'),
              source: 'automatic',
              sourceUrl: 'https://portal.example.com/favicon.png',
              updatedAt: expect.any(String),
            }),
          ],
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('applies security header baseline on 2xx/4xx/5xx and only applies HSTS in production over https', async () => {
    const { app, storage, clock } = await createAppFixture();

    const success = await app.request('/api/runtime/metadata');
    expect(success.status).toBe(200);
    expect(success.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(success.headers.get('x-content-type-options')).toBe('nosniff');
    expect(success.headers.get('x-frame-options')).toBe('DENY');
    expect(success.headers.get('referrer-policy')).toBe('no-referrer');
    expect(success.headers.get('permissions-policy')).toContain('camera=()');
    expect(success.headers.get('cache-control')).toBe('no-store');
    expect(success.headers.get('strict-transport-security')).toBeNull();

    const notFound = await app.request('/api/does-not-exist');
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(notFound.headers.get('cache-control')).toBe('no-store');

    const failingStorage = storage;
    const failingKeys = generateAccountKitKeyPair();
    vi.spyOn(failingStorage.deploymentState, 'get').mockRejectedValueOnce(new Error('boom'));
    const failingApp = createVaultLiteApi({
      storage: failingStorage,
      clock,
      idGenerator: new IncrementingIdGenerator(),
      runtimeMode: 'test',
      deploymentFingerprint: 'deployment_fp_v1',
      serverUrl: 'https://vaultlite.example.com',
      bootstrapAdminToken: 'bootstrap-secret',
      secureCookies: true,
      accountKitPrivateKey: failingKeys.privateKey,
      accountKitPublicKey: failingKeys.publicKey,
    });

    const serverError = await failingApp.request('/api/bootstrap/state');
    expect(serverError.status).toBe(500);
    expect(serverError.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(serverError.headers.get('cache-control')).toBe('no-store');

    const productionKeys = generateAccountKitKeyPair();
    const productionApp = createVaultLiteApi({
      storage: createTestStorage(),
      clock,
      idGenerator: new IncrementingIdGenerator(),
      runtimeMode: 'production',
      deploymentFingerprint: 'deployment_fp_v1',
      serverUrl: 'https://vaultlite.example.com',
      bootstrapAdminToken: 'bootstrap-secret-that-is-strong-enough',
      secureCookies: true,
      accountKitPrivateKey: productionKeys.privateKey,
      accountKitPublicKey: productionKeys.publicKey,
    });

    const productionResponse = await productionApp.request('/api/runtime/metadata');
    expect(productionResponse.status).toBe(200);
    expect(productionResponse.headers.get('strict-transport-security')).toContain('max-age=');
  });
});
