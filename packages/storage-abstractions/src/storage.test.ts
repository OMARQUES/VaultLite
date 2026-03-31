import { describe, expect, test } from 'vitest';

import { createInMemoryVaultLiteStorage } from './index';

describe('createInMemoryVaultLiteStorage', () => {
  test('consumes invites and rejects reused tokens', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.invites.create({
      inviteId: 'invite_1',
      tokenHash: 'token-hash-1',
      tokenPreview: 'tok...001',
      createdByUserId: 'owner_1',
      expiresAt: '2026-03-20T00:00:00.000Z',
      consumedAt: null,
      consumedByUserId: null,
      revokedAt: null,
      revokedByUserId: null,
      createdAt: '2026-03-15T00:00:00.000Z',
    });

    const beforeConsume = await storage.invites.findUsableByTokenHash(
      'token-hash-1',
      '2026-03-16T00:00:00.000Z',
    );
    expect(beforeConsume?.inviteId).toBe('invite_1');

    await storage.invites.markConsumed({
      inviteId: 'invite_1',
      consumedByUserId: 'user_1',
      consumedAtIso: '2026-03-16T01:00:00.000Z',
    });

    const afterConsume = await storage.invites.findUsableByTokenHash(
      'token-hash-1',
      '2026-03-16T02:00:00.000Z',
    );
    expect(afterConsume).toBeNull();
  });

  test('enforces expected bundle version during auth bundle replacement', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.users.create({
      userId: 'user_1',
      username: 'alice',
      role: 'user',
      authSalt: 'salt-1',
      authVerifier: 'proof-1',
      encryptedAccountBundle: 'bundle-1',
      accountKeyWrapped: 'wrapped-1',
      bundleVersion: 0,
      lifecycleState: 'active',
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
    });

    await storage.users.replaceAuthBundle({
      userId: 'user_1',
      authSalt: 'salt-2',
      authVerifier: 'proof-2',
      encryptedAccountBundle: 'bundle-2',
      accountKeyWrapped: 'wrapped-2',
      expectedBundleVersion: 0,
      updatedAtIso: '2026-03-15T01:00:00.000Z',
    });

    await expect(
      storage.users.replaceAuthBundle({
        userId: 'user_1',
        authSalt: 'salt-3',
        authVerifier: 'proof-3',
        encryptedAccountBundle: 'bundle-3',
        accountKeyWrapped: 'wrapped-3',
        expectedBundleVersion: 0,
        updatedAtIso: '2026-03-15T02:00:00.000Z',
      }),
    ).rejects.toThrow('Bundle version mismatch');
  });

  test('revokes sessions and devices by user', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.devices.register({
      deviceId: 'device_1',
      userId: 'user_1',
      deviceName: 'Laptop',
      platform: 'web',
      deviceState: 'active',
      createdAt: '2026-03-15T00:00:00.000Z',
      revokedAt: null,
    });
    await storage.sessions.create({
      sessionId: 'session_1',
      userId: 'user_1',
      deviceId: 'device_1',
      csrfToken: 'csrf_1',
      createdAt: '2026-03-15T00:00:00.000Z',
      expiresAt: '2026-03-15T08:00:00.000Z',
      recentReauthAt: null,
      revokedAt: null,
      rotatedFromSessionId: null,
    });

    await storage.devices.revokeByUserId('user_1', '2026-03-15T03:00:00.000Z');
    await storage.sessions.revokeByUserId('user_1', '2026-03-15T03:00:00.000Z');

    const device = await storage.devices.findById('device_1');
    const session = await storage.sessions.findBySessionId('session_1');
    expect(device?.revokedAt).toBe('2026-03-15T03:00:00.000Z');
    expect(session?.revokedAt).toBe('2026-03-15T03:00:00.000Z');
  });

  test('replaces live vault deletes with tombstones', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.vaultItems.create({
      itemId: 'item_1',
      ownerUserId: 'user_1',
      itemType: 'login',
      revision: 1,
      encryptedPayload: 'encrypted_payload_v1',
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
    });

    await expect(
      storage.vaultItems.delete('item_1', 'user_1', '2026-03-15T00:10:00.000Z'),
    ).resolves.toBe(true);
    await expect(storage.vaultItems.findByItemId('item_1', 'user_1')).resolves.toBeNull();
    await expect(storage.vaultItems.listByOwnerUserId('user_1')).resolves.toEqual([]);
    await expect(storage.vaultItems.findTombstoneByItemId('item_1', 'user_1')).resolves.toEqual(
      expect.objectContaining({
        itemId: 'item_1',
        ownerUserId: 'user_1',
        itemType: 'login',
        revision: 2,
        encryptedPayload: 'encrypted_payload_v1',
      }),
    );
    await expect(storage.vaultItems.listTombstonesByOwnerUserId('user_1')).resolves.toEqual([
      expect.objectContaining({
        itemId: 'item_1',
      }),
    ]);
  });

  test('restores tombstoned items within retention window and is idempotent when already active', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.vaultItems.create({
      itemId: 'item_1',
      ownerUserId: 'user_1',
      itemType: 'document',
      revision: 1,
      encryptedPayload: 'encrypted_payload_v1',
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
    });

    await storage.vaultItems.delete('item_1', 'user_1', '2026-03-15T00:10:00.000Z');
    const restored = await storage.vaultItems.restore({
      itemId: 'item_1',
      ownerUserId: 'user_1',
      restoredAtIso: '2026-03-15T00:20:00.000Z',
      restoreRetentionDays: 30,
    });
    expect(restored.status).toBe('success_changed');
    expect(restored.item).toEqual(
      expect.objectContaining({
        itemId: 'item_1',
        revision: 3,
        encryptedPayload: 'encrypted_payload_v1',
      }),
    );

    const replay = await storage.vaultItems.restore({
      itemId: 'item_1',
      ownerUserId: 'user_1',
      restoredAtIso: '2026-03-15T00:21:00.000Z',
      restoreRetentionDays: 30,
    });
    expect(replay.status).toBe('success_no_op');
    expect(replay.item?.itemId).toBe('item_1');
  });

  test('stores and paginates item history records and prunes by retention cutoff', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.vaultItemHistory.create({
      historyId: 'hist_1',
      ownerUserId: 'user_1',
      itemId: 'item_1',
      itemRevision: 2,
      changeType: 'update',
      encryptedDiffPayload: 'diff_encrypted_1',
      sourceDeviceId: 'device_1',
      createdAt: '2026-03-15T00:10:00.000Z',
    });
    await storage.vaultItemHistory.create({
      historyId: 'hist_2',
      ownerUserId: 'user_1',
      itemId: 'item_1',
      itemRevision: 3,
      changeType: 'update',
      encryptedDiffPayload: 'diff_encrypted_2',
      sourceDeviceId: 'device_1',
      createdAt: '2026-03-16T00:10:00.000Z',
    });
    await storage.vaultItemHistory.create({
      historyId: 'hist_3',
      ownerUserId: 'user_1',
      itemId: 'item_1',
      itemRevision: 4,
      changeType: 'delete',
      encryptedDiffPayload: null,
      sourceDeviceId: 'device_1',
      createdAt: '2026-03-17T00:10:00.000Z',
    });

    const firstPage = await storage.vaultItemHistory.listByItem({
      ownerUserId: 'user_1',
      itemId: 'item_1',
      limit: 2,
    });
    expect(firstPage.records.map((record) => record.historyId)).toEqual(['hist_3', 'hist_2']);
    expect(firstPage.nextCursor).toBe('hist_2');

    const secondPage = await storage.vaultItemHistory.listByItem({
      ownerUserId: 'user_1',
      itemId: 'item_1',
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.records.map((record) => record.historyId)).toEqual(['hist_1']);
    expect(secondPage.nextCursor).toBeNull();

    const pruned = await storage.vaultItemHistory.pruneByOwnerOlderThan({
      ownerUserId: 'user_1',
      cutoffIso: '2026-03-16T12:00:00.000Z',
      limit: 10,
    });
    expect(pruned).toBe(2);

    const remaining = await storage.vaultItemHistory.listByItem({
      ownerUserId: 'user_1',
      itemId: 'item_1',
      limit: 10,
    });
    expect(remaining.records.map((record) => record.historyId)).toEqual(['hist_3']);
  });

  test('supports pending attachment records, idempotency lookup, and uploaded transition', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.attachmentBlobs.put({
      key: 'attachment_1',
      ownerUserId: 'user_1',
      itemId: 'item_doc_1',
      fileName: 'policy.pdf',
      lifecycleState: 'pending',
      envelope: '',
      contentType: 'application/pdf',
      size: 2048,
      idempotencyKey: 'idem_1',
      uploadToken: 'upload_token_1',
      expiresAt: '2026-03-15T12:15:00.000Z',
      uploadedAt: null,
      attachedAt: null,
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
    });

    const listed = await storage.attachmentBlobs.listByOwnerAndItem('user_1', 'item_doc_1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.lifecycleState).toBe('pending');

    const byIdempotency = await storage.attachmentBlobs.findByOwnerItemAndIdempotency(
      'user_1',
      'item_doc_1',
      'idem_1',
    );
    expect(byIdempotency?.key).toBe('attachment_1');

    const uploaded = await storage.attachmentBlobs.markUploaded({
      key: 'attachment_1',
      ownerUserId: 'user_1',
      envelope: 'encrypted_blob_payload',
      updatedAt: '2026-03-15T12:01:00.000Z',
      uploadedAt: '2026-03-15T12:01:00.000Z',
    });
    expect(uploaded.lifecycleState).toBe('uploaded');
    expect(uploaded.uploadedAt).toBe('2026-03-15T12:01:00.000Z');
    expect(uploaded.envelope).toBe('encrypted_blob_payload');

    const attached = await storage.attachmentBlobs.markAttached({
      key: 'attachment_1',
      ownerUserId: 'user_1',
      itemId: 'item_doc_1',
      updatedAt: '2026-03-15T12:02:00.000Z',
      attachedAt: '2026-03-15T12:02:00.000Z',
    });
    expect(attached.lifecycleState).toBe('attached');
    expect(attached.attachedAt).toBe('2026-03-15T12:02:00.000Z');

    const replay = await storage.attachmentBlobs.markAttached({
      key: 'attachment_1',
      ownerUserId: 'user_1',
      itemId: 'item_doc_1',
      updatedAt: '2026-03-15T12:03:00.000Z',
      attachedAt: '2026-03-15T12:03:00.000Z',
    });
    expect(replay.lifecycleState).toBe('attached');

    await expect(
      storage.attachmentBlobs.markAttached({
        key: 'attachment_1',
        ownerUserId: 'user_1',
        itemId: 'item_other',
        updatedAt: '2026-03-15T12:04:00.000Z',
        attachedAt: '2026-03-15T12:04:00.000Z',
      }),
    ).rejects.toThrow('attachment_already_bound_to_other_item');
  });

  test('tracks deployment state transitions and checkpoint attempts', async () => {
    const storage = createInMemoryVaultLiteStorage();
    const initial = await storage.deploymentState.get();
    expect(initial.bootstrapState).toBe('UNINITIALIZED_PUBLIC_OPEN');

    const pending = await storage.deploymentState.transitionToOwnerCreatedCheckpointPending({
      ownerUserId: 'user_owner_1',
      ownerCreatedAt: '2026-03-15T12:00:00.000Z',
      bootstrapPublicClosedAt: '2026-03-15T12:00:00.000Z',
    });
    expect(pending.changed).toBe(true);
    expect(pending.state.bootstrapState).toBe('OWNER_CREATED_CHECKPOINT_PENDING');

    const attempted = await storage.deploymentState.recordCheckpointDownloadAttempt({
      ownerUserId: 'user_owner_1',
      requestId: 'req_1',
      attemptedAt: '2026-03-15T12:01:00.000Z',
    });
    expect(attempted.checkpointDownloadAttemptCount).toBe(1);

    const completed = await storage.deploymentState.completeInitialization({
      completedAt: '2026-03-15T12:02:00.000Z',
    });
    expect(completed.changed).toBe(true);
    expect(completed.state.bootstrapState).toBe('INITIALIZED');
  });

  test('applies windowed auth rate limits with deterministic cooldown reset', async () => {
    const storage = createInMemoryVaultLiteStorage();
    const first = await storage.authRateLimits.increment({
      key: 'remote-auth:alice',
      nowIso: '2026-03-15T12:00:00.000Z',
      windowSeconds: 300,
    });
    expect(first.attemptCount).toBe(1);
    expect(first.windowStartedAt).toBe('2026-03-15T12:00:00.000Z');

    const second = await storage.authRateLimits.increment({
      key: 'remote-auth:alice',
      nowIso: '2026-03-15T12:01:00.000Z',
      windowSeconds: 300,
    });
    expect(second.attemptCount).toBe(2);
    expect(second.windowStartedAt).toBe('2026-03-15T12:00:00.000Z');

    const postCooldown = await storage.authRateLimits.increment({
      key: 'remote-auth:alice',
      nowIso: '2026-03-15T12:06:01.000Z',
      windowSeconds: 300,
    });
    expect(postCooldown.attemptCount).toBe(1);
    expect(postCooldown.windowStartedAt).toBe('2026-03-15T12:06:01.000Z');
  });

  test('consumes realtime one-time tokens exactly once and prunes expired records', async () => {
    const storage = createInMemoryVaultLiteStorage();

    await expect(
      storage.realtimeOneTimeTokens.consume({
        tokenKey: 'realtime-connect-jti:abc',
        consumedAt: '2026-03-15T12:00:00.000Z',
        expiresAt: '2026-03-15T12:02:00.000Z',
      }),
    ).resolves.toEqual({ consumed: true });

    await expect(
      storage.realtimeOneTimeTokens.consume({
        tokenKey: 'realtime-connect-jti:abc',
        consumedAt: '2026-03-15T12:00:01.000Z',
        expiresAt: '2026-03-15T12:02:01.000Z',
      }),
    ).resolves.toEqual({ consumed: false });

    await expect(
      storage.realtimeOneTimeTokens.pruneExpired({
        nowIso: '2026-03-15T12:03:00.000Z',
        limit: 10,
      }),
    ).resolves.toBe(1);

    await expect(
      storage.realtimeOneTimeTokens.consume({
        tokenKey: 'realtime-connect-jti:abc',
        consumedAt: '2026-03-15T12:03:01.000Z',
        expiresAt: '2026-03-15T12:05:00.000Z',
      }),
    ).resolves.toEqual({ consumed: true });
  });

  test('stores and resolves canonical site icons by normalized domain', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.siteIconCache.upsert({
      domain: 'WWW.Example.COM',
      dataUrl: 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCC',
      sourceUrl: 'https://www.example.com/favicon.ico',
      updatedAt: '2026-03-22T10:00:00.000Z',
      fetchedAt: '2026-03-22T10:00:00.000Z',
    });

    await expect(storage.siteIconCache.findByDomain('www.example.com')).resolves.toEqual(
      expect.objectContaining({
        domain: 'www.example.com',
      }),
    );
    await expect(storage.siteIconCache.listByDomains(['example.com', 'www.example.com'])).resolves.toEqual([
      expect.objectContaining({
        domain: 'www.example.com',
      }),
    ]);
  });

  test('stores manual icon overrides per user with domain scoping', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.manualSiteIconOverrides.upsert({
      userId: 'user_1',
      domain: 'Portal.Example.com',
      dataUrl: 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCC',
      source: 'url',
      updatedAt: '2026-03-22T10:00:00.000Z',
    });
    await storage.manualSiteIconOverrides.upsert({
      userId: 'user_2',
      domain: 'portal.example.com',
      dataUrl: 'data:image/png;base64,DDDDDDDDEEEEEEEEFFFFFFFF',
      source: 'file',
      updatedAt: '2026-03-22T11:00:00.000Z',
    });

    await expect(
      storage.manualSiteIconOverrides.findByUserIdAndDomain('user_1', 'portal.example.com'),
    ).resolves.toEqual(
      expect.objectContaining({
        userId: 'user_1',
        domain: 'portal.example.com',
        source: 'url',
      }),
    );
    await expect(
      storage.manualSiteIconOverrides.listByUserIdAndDomains('user_1', ['portal.example.com']),
    ).resolves.toEqual([
      expect.objectContaining({
        userId: 'user_1',
        domain: 'portal.example.com',
      }),
    ]);
    await expect(storage.manualSiteIconOverrides.remove('user_1', 'portal.example.com')).resolves.toBe(true);
    await expect(
      storage.manualSiteIconOverrides.findByUserIdAndDomain('user_1', 'portal.example.com'),
    ).resolves.toBeNull();
  });

  test('persists realtime outbox entries and marks publish/failure state', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.realtimeOutbox.enqueue({
      id: 'outbox_1',
      userId: 'user_1',
      topic: 'vault.item.upserted',
      aggregateId: 'item_1',
      idempotencyKey: 'idem_1',
      eventId: 'evt_1',
      occurredAt: '2026-03-22T12:00:00.000Z',
      sourceDeviceId: 'device_1',
      payloadJson: '{"itemId":"item_1"}',
      createdAt: '2026-03-22T12:00:00.000Z',
      publishedAt: null,
      attemptCount: 0,
      lastError: null,
    });

    await expect(storage.realtimeOutbox.listPendingByUserId('user_1', 10)).resolves.toEqual([
      expect.objectContaining({
        id: 'outbox_1',
        publishedAt: null,
      }),
    ]);

    await storage.realtimeOutbox.markFailed({
      id: 'outbox_1',
      failedAt: '2026-03-22T12:00:30.000Z',
      lastError: 'network_timeout',
    });
    await expect(storage.realtimeOutbox.listPendingByUserId('user_1', 10)).resolves.toEqual([
      expect.objectContaining({
        id: 'outbox_1',
        attemptCount: 1,
        lastError: 'network_timeout',
      }),
    ]);

    await storage.realtimeOutbox.markPublished({
      id: 'outbox_1',
      publishedAt: '2026-03-22T12:01:00.000Z',
    });
    await expect(storage.realtimeOutbox.listPendingByUserId('user_1', 10)).resolves.toEqual([]);
  });
});
