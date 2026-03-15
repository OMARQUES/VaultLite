import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import { FixedClock, QueueIdGenerator, createTestStorage } from '@vaultlite/test-utils';
import { describe, expect, test } from 'vitest';

import { createVaultLiteApi } from './app';

async function createAuthenticatedVaultFixture() {
  const storage = createTestStorage();
  const clock = new FixedClock(new Date('2026-03-15T12:00:00.000Z'));
  const idGenerator = new QueueIdGenerator([
    'item_1',
    'item_2',
    'item_3',
    'item_4',
    'item_5',
  ]);
  const accountKitKeys = generateAccountKitKeyPair();

  await storage.users.create({
    userId: 'user_1',
    username: 'alice',
    authSalt: 'A'.repeat(22),
    authVerifier: 'proof_payload',
    encryptedAccountBundle: 'bundle_payload',
    accountKeyWrapped: 'wrapped_payload',
    bundleVersion: 0,
    lifecycleState: 'active',
    createdAt: '2026-03-15T12:00:00.000Z',
    updatedAt: '2026-03-15T12:00:00.000Z',
  });
  await storage.users.create({
    userId: 'user_2',
    username: 'bob',
    authSalt: 'B'.repeat(22),
    authVerifier: 'proof_payload_bob',
    encryptedAccountBundle: 'bundle_payload_bob',
    accountKeyWrapped: 'wrapped_payload_bob',
    bundleVersion: 0,
    lifecycleState: 'active',
    createdAt: '2026-03-15T12:00:00.000Z',
    updatedAt: '2026-03-15T12:00:00.000Z',
  });
  await storage.devices.register({
    deviceId: 'device_1',
    userId: 'user_1',
    deviceName: 'Alice Browser',
    platform: 'web',
    createdAt: '2026-03-15T12:00:00.000Z',
    revokedAt: null,
  });
  await storage.devices.register({
    deviceId: 'device_2',
    userId: 'user_2',
    deviceName: 'Bob Browser',
    platform: 'web',
    createdAt: '2026-03-15T12:00:00.000Z',
    revokedAt: null,
  });
  await storage.sessions.create({
    sessionId: 'session_1',
    userId: 'user_1',
    deviceId: 'device_1',
    csrfToken: 'csrf_1',
    createdAt: '2026-03-15T12:00:00.000Z',
    expiresAt: '2026-03-15T18:00:00.000Z',
    revokedAt: null,
    rotatedFromSessionId: null,
  });
  await storage.sessions.create({
    sessionId: 'session_2',
    userId: 'user_2',
    deviceId: 'device_2',
    csrfToken: 'csrf_2',
    createdAt: '2026-03-15T12:00:00.000Z',
    expiresAt: '2026-03-15T18:00:00.000Z',
    revokedAt: null,
    rotatedFromSessionId: null,
  });

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

  return {
    app,
    storage,
    aliceHeaders: {
      cookie: 'vl_session=session_1; vl_csrf=csrf_1',
      'content-type': 'application/json',
      'x-csrf-token': 'csrf_1',
    },
    bobHeaders: {
      cookie: 'vl_session=session_2; vl_csrf=csrf_2',
      'content-type': 'application/json',
      'x-csrf-token': 'csrf_2',
    },
  };
}

describe('vault item CRUD API', () => {
  test('creates, lists, reads, updates, and deletes login items for the authenticated owner', async () => {
    const { app, aliceHeaders, storage } = await createAuthenticatedVaultFixture();

    const createResponse = await app.request('/api/vault/items', {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: 'encrypted_login_payload_v1',
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.itemType).toBe('login');
    expect(created.revision).toBe(1);

    const listResponse = await app.request('/api/vault/items', {
      headers: {
        cookie: 'vl_session=session_1',
      },
    });
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      items: [
        expect.objectContaining({
          itemId: created.itemId,
          itemType: 'login',
          revision: 1,
          encryptedPayload: 'encrypted_login_payload_v1',
        }),
      ],
    });

    const detailResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      headers: {
        cookie: 'vl_session=session_1',
      },
    });
    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toEqual(
      expect.objectContaining({
        itemId: created.itemId,
        itemType: 'login',
        revision: 1,
      }),
    );

    const updateResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'PUT',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: 'encrypted_login_payload_v2',
        expectedRevision: 1,
      }),
    });
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual(
      expect.objectContaining({
        itemId: created.itemId,
        revision: 2,
        encryptedPayload: 'encrypted_login_payload_v2',
      }),
    );

    const deleteResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'DELETE',
      headers: aliceHeaders,
    });
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      headers: {
        cookie: 'vl_session=session_1',
      },
    });
    expect(afterDeleteResponse.status).toBe(404);

    await expect(
      storage.vaultItems.findTombstoneByItemId(created.itemId, 'user_1'),
    ).resolves.toEqual(
      expect.objectContaining({
        itemId: created.itemId,
        ownerUserId: 'user_1',
        itemType: 'login',
        revision: 3,
      }),
    );
  });

  test('supports document items and enforces cross-user isolation', async () => {
    const { app, aliceHeaders, bobHeaders, storage } = await createAuthenticatedVaultFixture();

    const createResponse = await app.request('/api/vault/items', {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'document',
        encryptedPayload: 'encrypted_document_payload_v1',
      }),
    });
    const created = await createResponse.json();

    const bobReadResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      headers: {
        cookie: 'vl_session=session_2',
      },
    });
    expect(bobReadResponse.status).toBe(404);

    const bobDeleteResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'DELETE',
      headers: bobHeaders,
    });
    expect(bobDeleteResponse.status).toBe(404);
    await expect(storage.vaultItems.findTombstoneByItemId(created.itemId, 'user_1')).resolves.toBeNull();
  });

  test('rejects stale expectedRevision updates with 409 conflicts', async () => {
    const { app, aliceHeaders } = await createAuthenticatedVaultFixture();

    const createResponse = await app.request('/api/vault/items', {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: 'encrypted_login_payload_v1',
      }),
    });
    const created = await createResponse.json();

    const conflictResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'PUT',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: 'encrypted_login_payload_v2',
        expectedRevision: 99,
      }),
    });

    expect(conflictResponse.status).toBe(409);
    expect(await conflictResponse.json()).toEqual({
      ok: false,
      code: 'revision_conflict',
    });
  });
});
