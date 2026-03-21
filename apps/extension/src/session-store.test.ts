import { describe, expect, test } from 'vitest';

import { createExtensionSessionStore } from './session-store';

describe('createExtensionSessionStore', () => {
  test('tracks phase transitions and clears token on fail-closed boundaries', () => {
    const store = createExtensionSessionStore();

    store.setPairingRequired();
    expect(store.getSnapshot().phase).toBe('pairing_required');

    store.setLocalUnlockRequired({
      username: 'alice',
      deviceId: 'device_ext_1',
      deviceName: 'Alice Extension',
    });
    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        phase: 'local_unlock_required',
        username: 'alice',
        deviceId: 'device_ext_1',
      }),
    );

    store.setBearerSession({
      token: 'token_1',
      expiresAt: '2026-03-19T12:30:00.000Z',
    });
    expect(store.getSnapshot().hasTokenInMemory).toBe(true);

    store.setReady({
      username: 'alice',
      deviceId: 'device_ext_1',
      deviceName: 'Alice Extension',
    });
    expect(store.getSnapshot().phase).toBe('ready');

    store.clearEphemeral();
    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        phase: 'local_unlock_required',
        hasTokenInMemory: false,
      }),
    );

    store.setRemoteAuthenticationRequired('session expired');
    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        phase: 'remote_authentication_required',
        hasTokenInMemory: false,
        lastError: 'session expired',
      }),
    );
  });
});
