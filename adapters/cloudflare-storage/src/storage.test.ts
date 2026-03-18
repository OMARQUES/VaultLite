import { describe, expect, test, vi } from 'vitest';

import {
  applyCloudflareMigrations,
  createFallbackCloudflareStorage,
  loadCloudflareMigrations,
} from './index';

describe('cloudflare storage adapter', () => {
  test('exposes at least one migration and applies them statement-by-statement in order', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    await applyCloudflareMigrations({
      prepare() {
        return {
          bind() {
            return this;
          },
          first() {
            throw new Error('Not used in migration test');
          },
          all() {
            throw new Error('Not used in migration test');
          },
          run,
        };
      },
      exec() {
        throw new Error('Not used in migration test');
      },
    });

    const migrations = await loadCloudflareMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    expect(run.mock.calls.length).toBeGreaterThan(migrations.length);
  });

  test('provides in-memory fallback storage for local integration', async () => {
    const storage = createFallbackCloudflareStorage();
    await storage.invites.create({
      inviteId: 'invite_1',
      tokenHash: 'token_hash_1',
      tokenPreview: 'tok...001',
      createdByUserId: 'owner_1',
      expiresAt: '2026-03-20T00:00:00.000Z',
      consumedAt: null,
      consumedByUserId: null,
      revokedAt: null,
      revokedByUserId: null,
      createdAt: '2026-03-15T00:00:00.000Z',
    });

    const invite = await storage.invites.findUsableByTokenHash(
      'token_hash_1',
      '2026-03-16T00:00:00.000Z',
    );
    expect(invite?.inviteId).toBe('invite_1');
  });

  test('fallback storage keeps tombstones after live vault delete', async () => {
    const storage = createFallbackCloudflareStorage();
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
    await expect(storage.vaultItems.findTombstoneByItemId('item_1', 'user_1')).resolves.toEqual(
      expect.objectContaining({ itemId: 'item_1', revision: 2 }),
    );
  });
});
