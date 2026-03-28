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

async function createAppFixture(
  startAt = '2026-03-17T12:00:00.000Z',
  options?: { enableIconsHttpFallback?: boolean },
) {
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
    ...(options?.enableIconsHttpFallback
      ? {
          realtime: {
            enabled: false,
            wsBaseUrl: 'wss://api.vaultlite.example.com',
            connectTokenSecret: 'realtime_secret_for_tests_that_is_long_enough',
            connectTokenTtlSeconds: 45,
            authLeaseSeconds: 600,
            heartbeatIntervalMs: 25_000,
            flags: {
              realtime_ws_v1: false,
              realtime_delta_vault_v1: false,
              realtime_delta_icons_v1: false,
              realtime_delta_history_v1: false,
              realtime_delta_attachments_v1: false,
              realtime_apply_web_v1: false,
              realtime_apply_extension_v1: false,
              icons_state_sync_v1: false,
              icons_ws_apply_web_v1: false,
              icons_ws_apply_extension_v1: false,
              icons_discovery_v2_v1: false,
              icons_fast_first_v1: false,
              icons_best_later_v1: false,
              icons_http_fallback_v1: true,
              icons_manual_private_ticket_v1: false,
              icons_provider_favicon_vemetric_enabled: false,
              icons_provider_google_s2_enabled: false,
              icons_provider_icon_horse_enabled: false,
              icons_provider_duckduckgo_ip3_enabled: false,
              icons_provider_faviconextractor_enabled: false,
            },
            hubNamespace: null,
          },
        }
      : {}),
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
    expect(await response.json()).toEqual(
      expect.objectContaining({
        serverUrl: 'https://vaultlite.example.com',
        iconsAssetBaseUrl: 'https://vaultlite.example.com',
        deploymentFingerprint: 'deployment_fp_v1',
      }),
    );
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
    const { app } = await createAppFixture(undefined, { enableIconsHttpFallback: true });
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

  test('accepts icons domains batch updates and marks stale revisions without rewinding', async () => {
    const storage = createTestStorage();
    const clock = new AdjustableClock(new Date('2026-03-24T12:00:00.000Z'));
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
      realtime: {
        enabled: true,
        wsBaseUrl: 'wss://api.vaultlite.example.com',
        webAllowedOrigins: ['https://vaultlite.example.com'],
        connectTokenSecret: 'realtime_secret_for_tests_that_is_long_enough',
        connectTokenTtlSeconds: 45,
        authLeaseSeconds: 600,
        heartbeatIntervalMs: 25_000,
        flags: {
          realtime_ws_v1: false,
          realtime_delta_vault_v1: false,
          realtime_delta_icons_v1: false,
          realtime_delta_history_v1: false,
          realtime_delta_attachments_v1: false,
          realtime_apply_web_v1: false,
          realtime_apply_extension_v1: false,
          icons_state_sync_v1: true,
          icons_ws_apply_web_v1: true,
          icons_ws_apply_extension_v1: true,
          icons_discovery_v2_v1: false,
          icons_fast_first_v1: false,
          icons_best_later_v1: false,
          icons_http_fallback_v1: false,
          icons_manual_private_ticket_v1: true,
          icons_provider_favicon_vemetric_enabled: true,
          icons_provider_google_s2_enabled: true,
          icons_provider_icon_horse_enabled: true,
          icons_provider_duckduckgo_ip3_enabled: true,
          icons_provider_faviconextractor_enabled: true,
        },
        hubNamespace: {
          idFromName(name: string) {
            return name;
          },
          get() {
            return {
              async fetch() {
                return new Response(JSON.stringify({ ok: true }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                });
              },
            };
          },
        },
      },
    });

    await storage.users.create({
      userId: 'user_batch_1',
      username: 'batch-user',
      role: 'user',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-24T10:00:00.000Z',
      updatedAt: '2026-03-24T10:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_batch_1',
      userId: 'user_batch_1',
      deviceName: 'Batch Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-24T10:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_batch_1',
      userId: 'user_batch_1',
      deviceId: 'device_batch_1',
      csrfToken: 'csrf_batch_1',
      createdAt: '2026-03-24T10:00:00.000Z',
      expiresAt: '2026-03-24T20:00:00.000Z',
      recentReauthAt: null,
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const first = await app.request('/api/icons/domains/batch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_batch_1; vl_csrf=csrf_batch_1',
        'x-csrf-token': 'csrf_batch_1',
      },
      body: JSON.stringify({
        entries: [
          {
            itemId: 'item_login_1',
            itemRevision: 3,
            hosts: ['portal.example.com'],
          },
          {
            itemId: 'item_login_2',
            itemRevision: 2,
            hosts: ['docs.example.com'],
          },
        ],
      }),
    });
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        acceptedItems: 2,
        entries: expect.arrayContaining([
          expect.objectContaining({
            itemId: 'item_login_1',
            itemRevision: 3,
            result: 'success_changed',
            domainsChanged: true,
          }),
          expect.objectContaining({
            itemId: 'item_login_2',
            itemRevision: 2,
            result: 'success_changed',
            domainsChanged: true,
          }),
        ]),
      }),
    );

    const stale = await app.request('/api/icons/domains/batch', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_batch_1; vl_csrf=csrf_batch_1',
        'x-csrf-token': 'csrf_batch_1',
      },
      body: JSON.stringify({
        entries: [
          {
            itemId: 'item_login_1',
            itemRevision: 1,
            hosts: ['stale.example.com'],
          },
        ],
      }),
    });
    expect(stale.status).toBe(200);
    await expect(stale.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        acceptedItems: 0,
        entries: [
          expect.objectContaining({
            itemId: 'item_login_1',
            itemRevision: 1,
            result: 'success_no_op_stale_revision',
          }),
        ],
      }),
    );
  });

  test('retries automatic discovery on no-op domain registrations when icon state is not ready', async () => {
    const storage = createTestStorage();
    const clock = new AdjustableClock(new Date('2026-03-24T12:00:00.000Z'));
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
      iconBlobBucket: {
        async put() {
          return null;
        },
        async get() {
          return {
            async arrayBuffer() {
              return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
            },
            httpMetadata: {
              contentType: 'image/png',
            },
          };
        },
        async delete() {
          return;
        },
      },
      realtime: {
        enabled: true,
        wsBaseUrl: 'wss://api.vaultlite.example.com',
        webAllowedOrigins: ['https://vaultlite.example.com'],
        connectTokenSecret: 'realtime_secret_for_tests_that_is_long_enough',
        connectTokenTtlSeconds: 45,
        authLeaseSeconds: 600,
        heartbeatIntervalMs: 25_000,
        flags: {
          realtime_ws_v1: false,
          realtime_delta_vault_v1: false,
          realtime_delta_icons_v1: false,
          realtime_delta_history_v1: false,
          realtime_delta_attachments_v1: false,
          realtime_apply_web_v1: false,
          realtime_apply_extension_v1: false,
          icons_state_sync_v1: true,
          icons_ws_apply_web_v1: false,
          icons_ws_apply_extension_v1: false,
          icons_discovery_v2_v1: true,
          icons_fast_first_v1: false,
          icons_best_later_v1: false,
          icons_http_fallback_v1: false,
          icons_manual_private_ticket_v1: false,
          icons_provider_favicon_vemetric_enabled: false,
          icons_provider_google_s2_enabled: false,
          icons_provider_icon_horse_enabled: false,
          icons_provider_duckduckgo_ip3_enabled: false,
          icons_provider_faviconextractor_enabled: false,
        },
        hubNamespace: {
          idFromName(name: string) {
            return name;
          },
          get() {
            return {
              async fetch() {
                return new Response(JSON.stringify({ ok: true }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                });
              },
            };
          },
        },
      },
    });

    await storage.users.create({
      userId: 'user_discovery_noop',
      username: 'noop-user',
      role: 'user',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-24T10:00:00.000Z',
      updatedAt: '2026-03-24T10:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_discovery_noop',
      userId: 'user_discovery_noop',
      deviceName: 'Noop Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-24T10:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_discovery_noop',
      userId: 'user_discovery_noop',
      deviceId: 'device_discovery_noop',
      csrfToken: 'csrf_discovery_noop',
      createdAt: '2026-03-24T10:00:00.000Z',
      expiresAt: '2026-03-24T20:00:00.000Z',
      recentReauthAt: null,
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    await storage.userIconItemDomains.replaceItemHosts({
      userId: 'user_discovery_noop',
      deviceId: 'device_discovery_noop',
      surface: 'web',
      itemId: 'item_login_noop',
      itemRevision: 5,
      hosts: ['portal.example.com', 'example.com'],
      updatedAt: '2026-03-24T11:50:00.000Z',
    });
    await storage.userIconState.upsert({
      userId: 'user_discovery_noop',
      domain: 'portal.example.com',
      status: 'pending',
      objectId: null,
      updatedAt: '2026-03-24T11:00:00.000Z',
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const target = String(input);
      if (target === 'https://portal.example.com/') {
        const response = new Response('<html><head><link rel="icon" href="/favicon.ico"></head></html>', {
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
      if (target === 'https://portal.example.com/favicon.ico') {
        const response = new Response(
          new Uint8Array([
            0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 104, 4,
            0, 0, 22, 0, 0, 0,
          ]),
          {
            status: 200,
            headers: {
              'content-type': 'image/x-icon',
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
      const response = await app.request('/api/icons/domains/batch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'vl_session=session_discovery_noop; vl_csrf=csrf_discovery_noop',
          'x-csrf-token': 'csrf_discovery_noop',
        },
        body: JSON.stringify({
          entries: [
            {
              itemId: 'item_login_noop',
              itemRevision: 5,
              hosts: ['portal.example.com'],
            },
          ],
        }),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          ok: true,
          acceptedItems: 1,
          entries: [
            expect.objectContaining({
              itemId: 'item_login_noop',
              result: 'success_no_op',
            }),
          ],
        }),
      );

      let iconState = await storage.userIconState.findByUserIdAndDomain(
        'user_discovery_noop',
        'portal.example.com',
      );
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (iconState?.status === 'ready' && iconState.objectId) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        iconState = await storage.userIconState.findByUserIdAndDomain(
          'user_discovery_noop',
          'portal.example.com',
        );
      }

      expect(iconState?.status).toBe('ready');
      expect(iconState?.objectId).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('serves icon objects with CORS headers compatible with web fetches', async () => {
    const storage = createTestStorage();
    const clock = new AdjustableClock(new Date('2026-03-24T12:00:00.000Z'));
    const idGenerator = new IncrementingIdGenerator();
    const accountKitKeys = generateAccountKitKeyPair();
    const blobBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    const automaticSha256 = 'a'.repeat(64);
    const manualSha256 = 'b'.repeat(64);

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
      iconBlobBucket: {
        async put() {
          return null;
        },
        async get(key: string) {
          if (
            key === `icons/automatic/${automaticSha256}` ||
            key === `icons/manual/user_icons_1/${manualSha256}`
          ) {
            return {
              async arrayBuffer() {
                return blobBytes.slice().buffer;
              },
              httpMetadata: {
                contentType: 'image/png',
              },
            };
          }
          return null;
        },
        async delete() {
          return;
        },
      },
      realtime: {
        enabled: true,
        wsBaseUrl: 'wss://api.vaultlite.example.com',
        webAllowedOrigins: ['http://127.0.0.1:5173'],
        connectTokenSecret: 'realtime_secret_for_tests_that_is_long_enough',
        connectTokenTtlSeconds: 45,
        authLeaseSeconds: 600,
        heartbeatIntervalMs: 25_000,
        flags: {
          realtime_ws_v1: false,
          realtime_delta_vault_v1: false,
          realtime_delta_icons_v1: false,
          realtime_delta_history_v1: false,
          realtime_delta_attachments_v1: false,
          realtime_apply_web_v1: false,
          realtime_apply_extension_v1: false,
          icons_state_sync_v1: true,
          icons_ws_apply_web_v1: true,
          icons_ws_apply_extension_v1: true,
          icons_discovery_v2_v1: false,
          icons_fast_first_v1: false,
          icons_best_later_v1: false,
          icons_http_fallback_v1: false,
          icons_manual_private_ticket_v1: true,
          icons_provider_favicon_vemetric_enabled: true,
          icons_provider_google_s2_enabled: true,
          icons_provider_icon_horse_enabled: true,
          icons_provider_duckduckgo_ip3_enabled: true,
          icons_provider_faviconextractor_enabled: true,
        },
        hubNamespace: {
          idFromName(name: string) {
            return name;
          },
          get() {
            return {
              async fetch() {
                return new Response(JSON.stringify({ ok: true }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                });
              },
            };
          },
        },
      },
    });

    await storage.users.create({
      userId: 'user_icons_1',
      username: 'icons-user',
      role: 'user',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-24T10:00:00.000Z',
      updatedAt: '2026-03-24T10:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_icons_1',
      userId: 'user_icons_1',
      deviceName: 'Icons Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-24T10:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_icons_1',
      userId: 'user_icons_1',
      deviceId: 'device_icons_1',
      csrfToken: 'csrf_icons_1',
      createdAt: '2026-03-24T10:00:00.000Z',
      expiresAt: '2026-03-24T20:00:00.000Z',
      recentReauthAt: null,
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    await storage.iconObjects.create({
      objectId: 'icon_object_auto_1',
      objectClass: 'automatic_public',
      ownerUserId: null,
      sha256: automaticSha256,
      r2Key: `icons/automatic/${automaticSha256}`,
      contentType: 'image/png',
      byteLength: blobBytes.byteLength,
      createdAt: '2026-03-24T12:00:00.000Z',
      updatedAt: '2026-03-24T12:00:00.000Z',
    });
    await storage.iconObjects.create({
      objectId: 'icon_object_manual_1',
      objectClass: 'manual_private',
      ownerUserId: 'user_icons_1',
      sha256: manualSha256,
      r2Key: `icons/manual/user_icons_1/${manualSha256}`,
      contentType: 'image/png',
      byteLength: blobBytes.byteLength,
      createdAt: '2026-03-24T12:00:00.000Z',
      updatedAt: '2026-03-24T12:00:00.000Z',
    });

    const automaticResponse = await app.request(`/icons/a/${automaticSha256}`, {
      method: 'GET',
      headers: {
        origin: 'http://127.0.0.1:5173',
      },
    });
    expect(automaticResponse.status).toBe(200);
    expect(automaticResponse.headers.get('access-control-allow-origin')).toBe('*');

    const ticketResponse = await app.request('/api/icons/object-tickets', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_icons_1; vl_csrf=csrf_icons_1',
        'x-csrf-token': 'csrf_icons_1',
      },
      body: JSON.stringify({
        objectIds: ['icon_object_manual_1'],
      }),
    });
    expect(ticketResponse.status).toBe(200);
    const ticketPayload = (await ticketResponse.json()) as {
      tickets: Array<{ objectId: string; ticket: string }>;
    };
    const ticket = ticketPayload.tickets[0]?.ticket ?? '';
    expect(ticket.length).toBeGreaterThan(10);

    const manualResponse = await app.request(`/icons/m/icon_object_manual_1?ticket=${encodeURIComponent(ticket)}`, {
      method: 'GET',
      headers: {
        origin: 'http://127.0.0.1:5173',
      },
    });
    expect(manualResponse.status).toBe(200);
    expect(manualResponse.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');

    const manualDisallowedOrigin = await app.request(
      `/icons/m/icon_object_manual_1?ticket=${encodeURIComponent(ticket)}`,
      {
        method: 'GET',
        headers: {
          origin: 'https://malicious.example.com',
        },
      },
    );
    expect(manualDisallowedOrigin.status).toBe(200);
    expect(manualDisallowedOrigin.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('discovers and caches automatic site icons server-side', async () => {
    const { app } = await createAppFixture(undefined, { enableIconsHttpFallback: true });
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

  test('queues realtime outbox on publish failure and drains on next mutation', async () => {
    const storage = createTestStorage();
    const clock = new AdjustableClock(new Date('2026-03-24T12:00:00.000Z'));
    const idGenerator = new IncrementingIdGenerator();
    const accountKitKeys = generateAccountKitKeyPair();
    let failNextPublish = true;
    const publishedEvents: unknown[] = [];

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
      realtime: {
        enabled: true,
        wsBaseUrl: 'wss://api.vaultlite.example.com',
        connectTokenSecret: 'realtime_secret_for_tests_that_is_long_enough',
        connectTokenTtlSeconds: 45,
        authLeaseSeconds: 600,
        heartbeatIntervalMs: 25_000,
        flags: {
          realtime_ws_v1: true,
          realtime_delta_vault_v1: true,
          realtime_delta_icons_v1: true,
          realtime_delta_history_v1: true,
          realtime_delta_attachments_v1: true,
          realtime_apply_web_v1: true,
          realtime_apply_extension_v1: true,
          icons_state_sync_v1: false,
          icons_ws_apply_web_v1: false,
          icons_ws_apply_extension_v1: false,
          icons_discovery_v2_v1: false,
          icons_fast_first_v1: false,
          icons_best_later_v1: false,
          icons_http_fallback_v1: false,
          icons_manual_private_ticket_v1: false,
          icons_provider_favicon_vemetric_enabled: false,
          icons_provider_google_s2_enabled: false,
          icons_provider_icon_horse_enabled: false,
          icons_provider_duckduckgo_ip3_enabled: false,
          icons_provider_faviconextractor_enabled: false,
        },
        hubNamespace: {
          idFromName(name: string) {
            return name;
          },
          get() {
            return {
              async fetch(input: RequestInfo | URL, init?: RequestInit) {
                const request = input instanceof Request ? input : new Request(input, init);
                const url = new URL(request.url);
                if (url.pathname === '/publish') {
                  if (failNextPublish) {
                    failNextPublish = false;
                    throw new Error('simulated_publish_failure');
                  }
                  publishedEvents.push(await request.json());
                }
                return new Response(JSON.stringify({ ok: true }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                });
              },
            };
          },
        },
      },
    });

    await storage.users.create({
      userId: 'user_1',
      username: 'alice',
      role: 'user',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-24T10:00:00.000Z',
      updatedAt: '2026-03-24T10:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_1',
      userId: 'user_1',
      deviceName: 'Alice Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-24T10:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_1',
      userId: 'user_1',
      deviceId: 'device_1',
      csrfToken: 'csrf_1',
      createdAt: '2026-03-24T10:00:00.000Z',
      expiresAt: '2026-03-24T20:00:00.000Z',
      recentReauthAt: null,
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const first = await app.request('/api/icons/manual/upsert', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_1; vl_csrf=csrf_1',
        'x-csrf-token': 'csrf_1',
      },
      body: JSON.stringify({
        domain: 'portal.example.com',
        dataUrl: 'data:image/png;base64,AAAAAAAAAAAA',
        source: 'file',
      }),
    });
    expect(first.status).toBe(200);
    await expect(storage.realtimeOutbox.listPendingByUserId('user_1', 20)).resolves.toHaveLength(1);

    const second = await app.request('/api/icons/manual/upsert', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_1; vl_csrf=csrf_1',
        'x-csrf-token': 'csrf_1',
      },
      body: JSON.stringify({
        domain: 'app.example.com',
        dataUrl: 'data:image/png;base64,BBBBBBBBBBBB',
        source: 'file',
      }),
    });
    expect(second.status).toBe(200);
    await expect(storage.realtimeOutbox.listPendingByUserId('user_1', 20)).resolves.toEqual([]);
    expect(publishedEvents).toHaveLength(2);
  });

  test('does not consume connect token when origin is invalid and consumes atomically on first valid upgrade', async () => {
    const storage = createTestStorage();
    const clock = new AdjustableClock(new Date('2026-03-27T12:00:00.000Z'));
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
      realtime: {
        enabled: true,
        wsBaseUrl: 'wss://api.vaultlite.example.com',
        webAllowedOrigins: ['http://127.0.0.1:5173'],
        connectTokenSecret: 'realtime_secret_for_tests_that_is_long_enough',
        connectTokenTtlSeconds: 45,
        authLeaseSeconds: 600,
        heartbeatIntervalMs: 25_000,
        flags: {
          realtime_ws_v1: true,
          realtime_delta_vault_v1: true,
          realtime_delta_icons_v1: true,
          realtime_delta_history_v1: true,
          realtime_delta_attachments_v1: true,
          realtime_apply_web_v1: true,
          realtime_apply_extension_v1: true,
          icons_state_sync_v1: true,
          icons_ws_apply_web_v1: true,
          icons_ws_apply_extension_v1: true,
          icons_discovery_v2_v1: true,
          icons_fast_first_v1: false,
          icons_best_later_v1: false,
          icons_http_fallback_v1: false,
          icons_manual_private_ticket_v1: true,
          icons_provider_favicon_vemetric_enabled: true,
          icons_provider_google_s2_enabled: true,
          icons_provider_icon_horse_enabled: true,
          icons_provider_duckduckgo_ip3_enabled: true,
          icons_provider_faviconextractor_enabled: true,
        },
        hubNamespace: {
          idFromName(name: string) {
            return name;
          },
          get() {
            return {
              async fetch() {
                return new Response(JSON.stringify({ ok: true }), {
                  status: 200,
                  headers: { 'content-type': 'application/json' },
                });
              },
            };
          },
        },
      },
    });

    await storage.users.create({
      userId: 'user_ws_1',
      username: 'ws-user',
      role: 'user',
      authSalt: 'A'.repeat(22),
      authVerifier: 'proof_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_payload',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-27T10:00:00.000Z',
      updatedAt: '2026-03-27T10:00:00.000Z',
    });
    await storage.devices.register({
      deviceId: 'device_ws_1',
      userId: 'user_ws_1',
      deviceName: 'WS Browser',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-27T10:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_ws_1',
      userId: 'user_ws_1',
      deviceId: 'device_ws_1',
      csrfToken: 'csrf_ws_1',
      createdAt: '2026-03-27T10:00:00.000Z',
      expiresAt: '2026-03-27T20:00:00.000Z',
      recentReauthAt: null,
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    const tokenResponse = await app.request('/api/realtime/connect-token', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'vl_session=session_ws_1; vl_csrf=csrf_ws_1',
        'x-csrf-token': 'csrf_ws_1',
      },
      body: JSON.stringify({ cursor: 0 }),
    });
    expect(tokenResponse.status).toBe(200);
    const tokenPayload = (await tokenResponse.json()) as { connectToken: string };

    const invalidOriginAttempt = await app.request(
      `/api/realtime/ws?token=${encodeURIComponent(tokenPayload.connectToken)}&cursor=0`,
      {
        method: 'GET',
        headers: {
          upgrade: 'websocket',
          origin: 'http://evil.local',
        },
      },
    );
    expect(invalidOriginAttempt.status).toBe(403);
    expect(await invalidOriginAttempt.json()).toEqual({ ok: false, code: 'origin_not_allowed' });

    const validAttempt = await app.request(
      `/api/realtime/ws?token=${encodeURIComponent(tokenPayload.connectToken)}&cursor=0`,
      {
        method: 'GET',
        headers: {
          upgrade: 'websocket',
          origin: 'http://127.0.0.1:5173',
        },
      },
    );
    expect(validAttempt.status).toBe(200);

    const replayAttempt = await app.request(
      `/api/realtime/ws?token=${encodeURIComponent(tokenPayload.connectToken)}&cursor=0`,
      {
        method: 'GET',
        headers: {
          upgrade: 'websocket',
          origin: 'http://127.0.0.1:5173',
        },
      },
    );
    expect(replayAttempt.status).toBe(401);
    expect(await replayAttempt.json()).toEqual({ ok: false, code: 'connect_token_replayed' });
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
