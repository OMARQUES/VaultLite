import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, test } from 'vitest';

import { createTrustedLocalStateStore } from './trusted-local-state';

describe('createTrustedLocalStateStore', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('vaultlite-trusted-state');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  test('persists and retrieves trusted local state', async () => {
    const store = createTrustedLocalStateStore();
    await store.save({
      username: 'alice',
      deviceId: 'device_1',
      deviceName: 'Alice Laptop',
      platform: 'web',
      authSalt: 'salt-1',
      encryptedAccountBundle: 'bundle-1',
      accountKeyWrapped: 'wrapped-1',
      localUnlockEnvelope: {
        version: 'local-unlock.v1',
        nonce: 'nonce-1',
        ciphertext: 'ciphertext-1',
      },
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
    });

    const record = await store.load('alice');
    expect(record?.deviceId).toBe('device_1');
    expect((await store.loadFirst())?.username).toBe('alice');

    await store.clear('alice');
    expect(await store.load('alice')).toBeNull();
  });
});
