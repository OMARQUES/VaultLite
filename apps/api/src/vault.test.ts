import { generateAccountKitKeyPair } from '@vaultlite/crypto/account-kit';
import { FixedClock, QueueIdGenerator, createTestStorage } from '@vaultlite/test-utils';
import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';

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
  await storage.deploymentState.transitionToOwnerCreatedCheckpointPending({
    ownerUserId: 'user_1',
    ownerCreatedAt: '2026-03-15T12:00:00.000Z',
    bootstrapPublicClosedAt: '2026-03-15T12:00:00.000Z',
  });
  await storage.deploymentState.completeInitialization({
    completedAt: '2026-03-15T12:00:00.000Z',
  });

  await storage.users.create({
    userId: 'user_1',
    username: 'alice',
    role: 'owner',
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
    role: 'user',
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
    deviceState: 'active',
    createdAt: '2026-03-15T12:00:00.000Z',
    revokedAt: null,
  });
  await storage.devices.register({
    deviceId: 'device_2',
    userId: 'user_2',
    deviceName: 'Bob Browser',
    platform: 'web',
    deviceState: 'active',
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
    recentReauthAt: '2026-03-15T12:00:00.000Z',
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
    recentReauthAt: null,
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
    bootstrapAdminToken: 'bootstrap-admin-token',
    secureCookies: true,
    accountKitPrivateKey: accountKitKeys.privateKey,
    accountKitPublicKey: accountKitKeys.publicKey,
  });

  return {
    app,
    storage,
    clock,
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

async function issueExtensionBearerForFixture(input: {
  storage: Awaited<ReturnType<typeof createAuthenticatedVaultFixture>>['storage'];
  clock: FixedClock;
  userId: string;
}): Promise<string> {
  const rawToken = 'extension_session_token_test_v1';
  const hashedSessionId = createHash('sha256').update(rawToken).digest('base64url');
  await input.storage.devices.register({
    deviceId: 'device_ext_1',
    userId: input.userId,
    deviceName: 'Alice Extension',
    platform: 'extension',
    deviceState: 'active',
    createdAt: input.clock.now().toISOString(),
    revokedAt: null,
  });
  await input.storage.sessions.create({
    sessionId: hashedSessionId,
    userId: input.userId,
    deviceId: 'device_ext_1',
    csrfToken: 'csrf_ext_1',
    createdAt: input.clock.now().toISOString(),
    expiresAt: new Date(input.clock.now().getTime() + 6 * 60 * 60 * 1000).toISOString(),
    recentReauthAt: input.clock.now().toISOString(),
    revokedAt: null,
    rotatedFromSessionId: null,
  });
  return rawToken;
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

  test('supports card and secure note item types', async () => {
    const { app, aliceHeaders } = await createAuthenticatedVaultFixture();

    const cardResponse = await app.request('/api/vault/items', {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'card',
        encryptedPayload: 'encrypted_card_payload_v1',
      }),
    });
    expect(cardResponse.status).toBe(201);
    expect((await cardResponse.json()).itemType).toBe('card');

    const noteResponse = await app.request('/api/vault/items', {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'secure_note',
        encryptedPayload: 'encrypted_secure_note_payload_v1',
      }),
    });
    expect(noteResponse.status).toBe(201);
    expect((await noteResponse.json()).itemType).toBe('secure_note');
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

  test('returns item_deleted_conflict when updating an item already tombstoned', async () => {
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

    const deleteResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'DELETE',
      headers: aliceHeaders,
    });
    expect(deleteResponse.status).toBe(204);

    const updateDeletedResponse = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'PUT',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: 'encrypted_login_payload_v2',
        expectedRevision: created.revision + 1,
      }),
    });
    expect(updateDeletedResponse.status).toBe(409);
    expect(await updateDeletedResponse.json()).toEqual({
      ok: false,
      code: 'item_deleted_conflict',
    });
  });

  test('treats delete replay on tombstoned item as 204 idempotent no-op', async () => {
    const { app, aliceHeaders } = await createAuthenticatedVaultFixture();

    const createResponse = await app.request('/api/vault/items', {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'document',
        encryptedPayload: 'encrypted_document_payload_v1',
      }),
    });
    const created = await createResponse.json();

    const firstDelete = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'DELETE',
      headers: aliceHeaders,
    });
    expect(firstDelete.status).toBe(204);

    const secondDelete = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'DELETE',
      headers: aliceHeaders,
    });
    expect(secondDelete.status).toBe(204);
  });

  test('restores tombstoned items and treats replay as success_no_op', async () => {
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

    const deleted = await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'DELETE',
      headers: aliceHeaders,
    });
    expect(deleted.status).toBe(204);

    const restored = await app.request(`/api/vault/items/${created.itemId}/restore`, {
      method: 'POST',
      headers: aliceHeaders,
    });
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({
      ok: true,
      result: 'success_changed',
      item: expect.objectContaining({
        itemId: created.itemId,
        itemType: 'login',
        encryptedPayload: 'encrypted_login_payload_v1',
      }),
    });

    const replay = await app.request(`/api/vault/items/${created.itemId}/restore`, {
      method: 'POST',
      headers: aliceHeaders,
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({
      ok: true,
      result: 'success_no_op',
      item: expect.objectContaining({
        itemId: created.itemId,
      }),
    });
  });

  test('rejects restore attempts after retention window expiration', async () => {
    const { app, aliceHeaders, storage } = await createAuthenticatedVaultFixture();
    await storage.vaultItems.create({
      itemId: 'item_expired_restore',
      ownerUserId: 'user_1',
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'encrypted_document_payload',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await storage.vaultItems.delete('item_expired_restore', 'user_1', '2025-12-01T00:00:00.000Z');

    const response = await app.request('/api/vault/items/item_expired_restore/restore', {
      method: 'POST',
      headers: aliceHeaders,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'restore_window_expired',
    });
  });

  test('enforces cross-user isolation for restore', async () => {
    const { app, aliceHeaders, bobHeaders } = await createAuthenticatedVaultFixture();

    const createResponse = await app.request('/api/vault/items', {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({
        itemType: 'secure_note',
        encryptedPayload: 'encrypted_secure_note_payload',
      }),
    });
    const created = await createResponse.json();

    await app.request(`/api/vault/items/${created.itemId}`, {
      method: 'DELETE',
      headers: aliceHeaders,
    });

    const bobRestore = await app.request(`/api/vault/items/${created.itemId}/restore`, {
      method: 'POST',
      headers: bobHeaders,
    });
    expect(bobRestore.status).toBe(404);
    expect(await bobRestore.json()).toEqual({
      ok: false,
      code: 'not_found',
    });
  });

  test('returns vault_item_restore_failed when restore storage throws unexpectedly', async () => {
    const { app, aliceHeaders, storage } = await createAuthenticatedVaultFixture();
    const originalRestore = storage.vaultItems.restore.bind(storage.vaultItems);
    (storage.vaultItems as { restore: typeof originalRestore }).restore = async () => {
      throw new Error('db_failure');
    };

    const response = await app.request('/api/vault/items/item_unexpected/restore', {
      method: 'POST',
      headers: aliceHeaders,
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'vault_item_restore_failed',
    });
  });

  test('creates vault item via extension bearer endpoint', async () => {
    const fixture = await createAuthenticatedVaultFixture();
    const extensionToken = await issueExtensionBearerForFixture({
      storage: fixture.storage,
      clock: fixture.clock,
      userId: 'user_1',
    });

    const response = await fixture.app.request('/api/extension/vault/items', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${extensionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: 'encrypted_login_payload_from_extension_v1',
      }),
    });

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toEqual(
      expect.objectContaining({
        itemType: 'login',
        revision: 1,
        encryptedPayload: 'encrypted_login_payload_from_extension_v1',
      }),
    );

    const historyResponse = await fixture.app.request(`/api/vault/items/${encodeURIComponent(created.itemId)}/history`, {
      headers: {
        authorization: `Bearer ${extensionToken}`,
      },
    });
    expect(historyResponse.status).toBe(200);
    expect(await historyResponse.json()).toEqual({
      records: [
        expect.objectContaining({
          changeType: 'create',
        }),
      ],
      nextCursor: null,
    });
  });

  test('returns folders snapshot and supports folder upsert + assignment mutation', async () => {
    const fixture = await createAuthenticatedVaultFixture();

    const beforeSnapshot = await fixture.app.request('/api/vault/folders/state', {
      headers: fixture.aliceHeaders,
    });
    expect(beforeSnapshot.status).toBe(200);
    expect(await beforeSnapshot.json()).toEqual({
      folders: [],
      assignments: [],
    });

    const upsertFolder = await fixture.app.request('/api/vault/folders/upsert', {
      method: 'POST',
      headers: fixture.aliceHeaders,
      body: JSON.stringify({
        folderId: 'folder_personal',
        name: 'Personal',
      }),
    });
    expect(upsertFolder.status).toBe(200);

    const createItem = await fixture.app.request('/api/vault/items', {
      method: 'POST',
      headers: fixture.aliceHeaders,
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: 'encrypted_payload_for_assignment',
      }),
    });
    expect(createItem.status).toBe(201);
    const created = await createItem.json();

    const assignFolder = await fixture.app.request('/api/vault/folders/assign', {
      method: 'POST',
      headers: fixture.aliceHeaders,
      body: JSON.stringify({
        itemId: created.itemId,
        folderId: 'folder_personal',
      }),
    });
    expect(assignFolder.status).toBe(200);

    const afterSnapshot = await fixture.app.request('/api/vault/folders/state', {
      headers: fixture.aliceHeaders,
    });
    expect(afterSnapshot.status).toBe(200);
    expect(await afterSnapshot.json()).toEqual({
      folders: [
        expect.objectContaining({
          folderId: 'folder_personal',
          name: 'Personal',
        }),
      ],
      assignments: [
        expect.objectContaining({
          itemId: created.itemId,
          folderId: 'folder_personal',
        }),
      ],
    });
  });

  test('upserts and queries form metadata via extension bearer endpoints', async () => {
    const fixture = await createAuthenticatedVaultFixture();
    const extensionToken = await issueExtensionBearerForFixture({
      storage: fixture.storage,
      clock: fixture.clock,
      userId: 'user_1',
    });

    const createItem = await fixture.app.request('/api/extension/vault/items', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${extensionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        itemType: 'login',
        encryptedPayload: 'encrypted_login_payload_for_form_metadata_v1',
      }),
    });
    expect(createItem.status).toBe(201);
    const createdItem = (await createItem.json()) as { itemId: string };

    const heuristicUpsert = await fixture.app.request('/api/extension/form-metadata/upsert', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${extensionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        itemId: null,
        origin: 'https://accounts.example.com/login?next=%2Fhome',
        formFingerprint: 'form_fp_shared',
        fieldFingerprint: 'field_fp_username',
        frameScope: 'top',
        fieldRole: 'username',
        selectorCss: '#email',
        selectorFallbacks: ['input[name=\"email\"]'],
        autocompleteToken: 'username',
        inputType: 'email',
        fieldName: 'email',
        fieldId: 'email',
        labelTextNormalized: 'email',
        placeholderNormalized: 'your email',
        confidence: 'heuristic',
        selectorStatus: 'active',
      }),
    });
    expect(heuristicUpsert.status).toBe(200);
    expect(await heuristicUpsert.json()).toEqual(
      expect.objectContaining({
        itemId: null,
        origin: 'https://accounts.example.com',
        confidence: 'heuristic',
      }),
    );

    const linkedUpsert = await fixture.app.request('/api/extension/form-metadata/upsert', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${extensionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        itemId: createdItem.itemId,
        origin: 'https://accounts.example.com',
        formFingerprint: 'form_fp_shared',
        fieldFingerprint: 'field_fp_password',
        frameScope: 'top',
        fieldRole: 'password_current',
        selectorCss: 'input[type=\"password\"]',
        selectorFallbacks: ['input[autocomplete=\"current-password\"]'],
        autocompleteToken: 'current-password',
        inputType: 'password',
        fieldName: 'password',
        fieldId: 'password',
        labelTextNormalized: 'password',
        placeholderNormalized: null,
        confidence: 'submitted_confirmed',
        selectorStatus: 'active',
      }),
    });
    expect(linkedUpsert.status).toBe(200);

    const query = await fixture.app.request('/api/extension/form-metadata/query', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${extensionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        origins: ['https://accounts.example.com/login'],
        itemId: createdItem.itemId,
      }),
    });
    expect(query.status).toBe(200);
    expect(await query.json()).toEqual({
      records: [
        expect.objectContaining({
          itemId: createdItem.itemId,
          origin: 'https://accounts.example.com',
          confidence: 'submitted_confirmed',
        }),
        expect.objectContaining({
          itemId: null,
          origin: 'https://accounts.example.com',
          confidence: 'heuristic',
        }),
      ],
    });
  });

  test('requires extension bearer for form metadata endpoints and rejects invalid input', async () => {
    const fixture = await createAuthenticatedVaultFixture();

    const missingBearer = await fixture.app.request('/api/extension/form-metadata/upsert', {
      method: 'POST',
      headers: fixture.aliceHeaders,
      body: JSON.stringify({
        itemId: null,
        origin: 'https://accounts.example.com',
        formFingerprint: 'form_fp_1',
        fieldFingerprint: 'field_fp_1',
        frameScope: 'top',
        fieldRole: 'username',
        selectorCss: '#email',
        selectorFallbacks: [],
        autocompleteToken: 'username',
        inputType: 'email',
        fieldName: 'email',
        fieldId: 'email',
        labelTextNormalized: 'email',
        placeholderNormalized: null,
        confidence: 'heuristic',
        selectorStatus: 'active',
      }),
    });
    expect(missingBearer.status).toBe(403);
    expect(await missingBearer.json()).toEqual({
      ok: false,
      code: 'extension_bearer_required',
    });

    const invalidBearer = await fixture.app.request('/api/extension/form-metadata/query', {
      method: 'POST',
      headers: {
        authorization: 'Bearer not_a_valid_extension_token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        origins: ['https://accounts.example.com'],
      }),
    });
    expect(invalidBearer.status).toBe(401);
    expect(await invalidBearer.json()).toEqual({
      ok: false,
      code: 'unauthorized',
    });

    const extensionToken = await issueExtensionBearerForFixture({
      storage: fixture.storage,
      clock: fixture.clock,
      userId: 'user_1',
    });
    const invalidInput = await fixture.app.request('/api/extension/form-metadata/upsert', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${extensionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        itemId: null,
        origin: 'notaurl',
        selectorFallbacks: ['a', 'b', 'c', 'd', 'e', 'f'],
      }),
    });
    expect(invalidInput.status).toBe(400);
    expect(await invalidInput.json()).toEqual({
      ok: false,
      code: 'invalid_input',
    });
  });
});
