import { describe, expect, test } from 'vitest';

import { createInMemoryVaultLiteStorage } from './index';

describe('createInMemoryVaultLiteStorage', () => {
  test('consumes invites and rejects reused tokens', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.invites.create({
      inviteId: 'invite_1',
      inviteToken: 'token-1',
      createdByUserId: 'owner_1',
      expiresAt: '2026-03-20T00:00:00.000Z',
      consumedAt: null,
      createdAt: '2026-03-15T00:00:00.000Z',
    });

    const beforeConsume = await storage.invites.findUsableByToken(
      'token-1',
      '2026-03-16T00:00:00.000Z',
    );
    expect(beforeConsume?.inviteId).toBe('invite_1');

    await storage.invites.consume('invite_1', '2026-03-16T01:00:00.000Z');

    const afterConsume = await storage.invites.findUsableByToken(
      'token-1',
      '2026-03-16T02:00:00.000Z',
    );
    expect(afterConsume).toBeNull();
  });

  test('enforces expected bundle version during auth bundle replacement', async () => {
    const storage = createInMemoryVaultLiteStorage();
    await storage.users.create({
      userId: 'user_1',
      username: 'alice',
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

    await expect(storage.vaultItems.delete('item_1', 'user_1')).resolves.toBe(true);
    await expect(storage.vaultItems.findByItemId('item_1', 'user_1')).resolves.toBeNull();
    await expect(storage.vaultItems.listByOwnerUserId('user_1')).resolves.toEqual([]);
    await expect(storage.vaultItems.findTombstoneByItemId('item_1', 'user_1')).resolves.toEqual(
      expect.objectContaining({
        itemId: 'item_1',
        ownerUserId: 'user_1',
        itemType: 'login',
        revision: 2,
      }),
    );
    await expect(storage.vaultItems.listTombstonesByOwnerUserId('user_1')).resolves.toEqual([
      expect.objectContaining({
        itemId: 'item_1',
      }),
    ]);
  });
});
