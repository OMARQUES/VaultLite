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

  test('sanitizes legacy records that persisted account kit payload with accountKey', async () => {
    const store = createTrustedLocalStateStore();
    await store.save({
      username: 'legacy',
      deviceId: 'device_legacy',
      deviceName: 'Legacy Browser',
      platform: 'web',
      authSalt: 'salt-legacy',
      encryptedAccountBundle: 'bundle-legacy',
      accountKeyWrapped: 'wrapped-legacy',
      localUnlockEnvelope: {
        version: 'local-unlock.v1',
        nonce: 'nonce-legacy',
        ciphertext: 'ciphertext-legacy',
      },
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
      // Legacy shape intentionally injected for migration sanitization coverage.
      accountKit: {
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'legacy',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T00:00:00.000Z',
        },
        signature: 'legacy_signature',
      },
    } as never);

    const sanitized = await store.load('legacy');
    expect(sanitized).not.toBeNull();
    expect(sanitized).not.toHaveProperty('accountKit');

    const raw = await new Promise<Record<string, unknown> | null>((resolve, reject) => {
      const request = indexedDB.open('vaultlite-trusted-state');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('trusted-state', 'readonly');
        transaction.oncomplete = () => db.close();
        const getRequest = transaction.objectStore('trusted-state').get('legacy');
        getRequest.onerror = () => reject(getRequest.error);
        getRequest.onsuccess = () => resolve((getRequest.result as Record<string, unknown>) ?? null);
      };
    });

    expect(raw).not.toBeNull();
    expect(raw).not.toHaveProperty('accountKit');
  });

  test('never persists accountKit when saving trusted local state', async () => {
    const store = createTrustedLocalStateStore();
    await store.save({
      username: 'owner',
      deviceId: 'device_owner',
      deviceName: 'Owner Browser',
      platform: 'web',
      authSalt: 'salt-owner',
      encryptedAccountBundle: 'bundle-owner',
      accountKeyWrapped: 'wrapped-owner',
      localUnlockEnvelope: {
        version: 'local-unlock.v1',
        nonce: 'nonce-owner',
        ciphertext: 'ciphertext-owner',
      },
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
      accountKit: {
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'owner',
          accountKey: 'B'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T00:00:00.000Z',
        },
        signature: 'signed_owner',
      },
    } as never);

    const loaded = await store.load('owner');
    expect(loaded).not.toBeNull();
    expect(loaded).not.toHaveProperty('accountKit');
  });
});
