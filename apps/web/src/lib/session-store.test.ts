import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./browser-crypto', () => ({
  LOCAL_UNLOCK_KDF_BASELINE_PROFILE: {
    algorithm: 'argon2id',
    memory: 65536,
    passes: 3,
    parallelism: 4,
    tagLength: 32,
  },
  calibrateLocalUnlockKdfProfile: vi.fn().mockResolvedValue({
    algorithm: 'argon2id',
    memory: 65536,
    passes: 3,
    parallelism: 4,
    tagLength: 32,
  }),
  createLocalUnlockEnvelope: vi.fn().mockResolvedValue({
    version: 'local-unlock.v1',
    nonce: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'BBBBBBBBBBBBBBBB',
    kdfProfile: {
      algorithm: 'argon2id',
      memory: 65536,
      passes: 3,
      parallelism: 4,
      tagLength: 32,
    },
  }),
  createOpaqueBundlePlaceholder: vi.fn(({ serverUrl, deviceId }: { serverUrl: string; deviceId: string }) =>
    `opaque:${serverUrl}:${deviceId}`,
  ),
  createRandomBase64Url: vi.fn((length = 16) => 'R'.repeat(length)),
  decryptLocalUnlockEnvelope: vi.fn().mockResolvedValue({
    accountKey: 'account-key',
    encryptedAccountBundle: 'bundle',
  }),
  deriveAuthProof: vi.fn().mockResolvedValue('derived_auth_proof'),
  generateAccountKey: vi.fn(() => 'A'.repeat(43)),
  normalizeLocalUnlockKdfProfile: vi.fn((input) => ({
    algorithm: 'argon2id',
    memory: Number.isFinite(input?.memory) ? Math.trunc(Number(input.memory)) : 65536,
    passes: Number.isFinite(input?.passes) ? Math.trunc(Number(input.passes)) : 3,
    parallelism: Number.isFinite(input?.parallelism) ? Math.trunc(Number(input.parallelism)) : 4,
    tagLength: 32,
  })),
}));

import { createSessionStore } from './session-store';

function createMockDependencies() {
  return {
    authClient: {
      getBootstrapState: vi.fn().mockResolvedValue({
        bootstrapState: 'INITIALIZED',
      }),
      restoreSession: vi.fn().mockResolvedValue({
        ok: true,
        sessionState: 'local_unlock_required',
        user: {
          userId: 'user_1',
          username: 'alice',
          role: 'user',
          lifecycleState: 'active',
        },
        device: {
          deviceId: 'device_1',
          deviceName: 'Alice Laptop',
          platform: 'web',
        },
      }),
      requestRemoteAuthenticationChallenge: vi.fn().mockResolvedValue({
        authSalt: 'AAAAAAAAAAAAAAAAAAAAAA',
        requiresRemoteAuthentication: true,
      }),
      completeRemoteAuthentication: vi.fn().mockResolvedValue({
        ok: true,
        sessionId: 'session_1',
        csrfToken: 'csrf_1',
        user: {
          userId: 'user_1',
          username: 'alice',
          role: 'user',
          lifecycleState: 'active',
        },
        device: {
          deviceId: 'device_1',
          deviceName: 'Alice Laptop',
          platform: 'web',
        },
      }),
      completeOnboarding: vi.fn(),
      bootstrapDevice: vi.fn(),
      signAccountKit: vi.fn(),
      reissueAccountKit: vi.fn(),
      verifyAccountKit: vi.fn(),
      getRuntimeMetadata: vi.fn().mockResolvedValue({
        serverUrl: 'https://vaultlite.example.com',
        deploymentFingerprint: 'deployment_fp_v1',
      }),
      signOnboardingAccountKit: vi.fn(),
      recentReauth: vi.fn().mockResolvedValue({
        ok: true,
        validUntil: '2026-03-19T12:05:00.000Z',
      }),
      listExtensionLinkPending: vi.fn().mockResolvedValue({
        ok: true,
        requests: [],
      }),
      approveExtensionLink: vi.fn().mockResolvedValue({
        ok: true,
        result: 'success_changed',
      }),
      rejectExtensionLink: vi.fn().mockResolvedValue({
        ok: true,
        result: 'success_changed',
      }),
      requestUnlockGrant: vi.fn().mockRejectedValue(new Error('unlock_grant_unavailable')),
      getUnlockGrantStatus: vi.fn(),
      consumeUnlockGrant: vi.fn(),
      approveUnlockGrant: vi.fn(),
      lockSession: vi.fn().mockResolvedValue({
        ok: true,
        lockRevision: 1,
        appliedScope: 'linked_surface_pair',
      }),
    },
    trustedLocalStateStore: {
      load: vi.fn().mockResolvedValue({
        username: 'alice',
        deviceId: 'device_1',
        deviceName: 'Alice Laptop',
        platform: 'web',
        authSalt: 'AAAAAAAAAAAAAAAAAAAAAA',
        encryptedAccountBundle: 'bundle',
        accountKeyWrapped: 'wrapped',
        localUnlockEnvelope: {
          version: 'local-unlock.v1',
          nonce: 'AAAAAAAAAAAAAAAA',
          ciphertext: 'BBBBBBBBBBBBBBBB',
        },
        createdAt: '2026-03-15T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
      }),
      save: vi.fn(),
      loadFirst: vi.fn(),
      clear: vi.fn(),
    },
  };
}

describe('createSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage?.removeItem('vaultlite:auto-lock-after-ms');
    globalThis.localStorage?.removeItem('vaultlite:web-unlock-cache.v1');
    globalThis.localStorage?.removeItem('vaultlite:web-unlock-cache-legacy-cleaned.v1');
    globalThis.sessionStorage?.removeItem('vaultlite:web-unlock-cache.v1');
  });

  test('restores a valid server session into local unlock state', async () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    await store.restoreSession();

    expect(store.state.phase).toBe('local_unlock_required');
    expect(store.state.username).toBe('alice');
  });

  test('does not restore ready state from encrypted cache without ephemeral key', async () => {
    const dependencies = createMockDependencies();
    globalThis.sessionStorage?.setItem(
      'vaultlite:web-unlock-cache.v1',
      JSON.stringify({
        username: 'alice',
        deviceId: 'device_1',
        algorithm: 'AES-GCM',
        iv: 'AAAAAAAAAAAAAAAA',
        ciphertext: 'BBBBBBBBBBBBBBBBBBBBBBBB',
        expiresAt: Date.now() + 60_000,
        lockRevision: 0,
      }),
    );
    const store = createSessionStore(dependencies as never);

    await store.restoreSession();

    expect(store.state.phase).toBe('local_unlock_required');
    expect(store.state.username).toBe('alice');
    expect(globalThis.sessionStorage?.getItem('vaultlite:web-unlock-cache.v1')).toBeNull();
  });

  test('stores encrypted unlock cache without plaintext secret and falls back to local unlock', async () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    await store.localUnlock({
      username: 'alice',
      password: 'correct-password',
    });

    const persistedCache = globalThis.sessionStorage?.getItem('vaultlite:web-unlock-cache.v1');
    expect(persistedCache).toContain('"ciphertext"');
    expect(persistedCache).not.toContain('account-key');

    await store.restoreSession();

    expect(store.state.phase).toBe('local_unlock_required');
    expect(store.state.username).toBe('alice');
    expect(dependencies.authClient.requestUnlockGrant).not.toHaveBeenCalled();
  });

  test('drops encrypted unlock cache when backend lock revision advances', async () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    await store.localUnlock({
      username: 'alice',
      password: 'correct-password',
    });

    dependencies.authClient.restoreSession.mockResolvedValueOnce({
      ok: true,
      sessionState: 'local_unlock_required',
      lockRevision: 6,
      user: {
        userId: 'user_1',
        username: 'alice',
        role: 'user',
        lifecycleState: 'active',
      },
      device: {
        deviceId: 'device_1',
        deviceName: 'Alice Laptop',
        platform: 'web',
      },
    });

    await store.restoreSession();

    expect(store.state.phase).toBe('local_unlock_required');
    expect(globalThis.sessionStorage?.getItem('vaultlite:web-unlock-cache.v1')).toBeNull();
  });

  test('cleans legacy unlock cache from localStorage on boot', async () => {
    const dependencies = createMockDependencies();
    globalThis.localStorage?.setItem(
      'vaultlite:web-unlock-cache.v1',
      JSON.stringify({
        username: 'alice',
        deviceId: 'device_1',
        accountKey: 'A'.repeat(43),
        expiresAt: Date.now() + 60_000,
        lockRevision: 0,
      }),
    );
    const store = createSessionStore(dependencies as never);

    await store.restoreSession();

    expect(store.state.phase).toBe('local_unlock_required');
    expect(globalThis.localStorage?.getItem('vaultlite:web-unlock-cache.v1')).toBeNull();
    expect(globalThis.localStorage?.getItem('vaultlite:web-unlock-cache-legacy-cleaned.v1')).toBe('1');
  });

  test('restoreSession resolves quickly in local unlock phase without bridge polling', async () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    const result = await Promise.race([
      store.restoreSession().then(() => 'resolved'),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 100);
      }),
    ]);

    expect(result).toBe('resolved');
    expect(store.state.phase).toBe('local_unlock_required');
    expect(dependencies.authClient.requestUnlockGrant).not.toHaveBeenCalled();
  });

  test('restoreSession does not send bridge nudge on /unlock', async () => {
    const dependencies = createMockDependencies();
    const postMessageSpy = vi.spyOn(window, 'postMessage');
    window.history.replaceState({}, '', '/unlock');
    const store = createSessionStore(dependencies as never);

    await store.restoreSession();
    expect(postMessageSpy).not.toHaveBeenCalled();
    expect(dependencies.authClient.requestUnlockGrant).not.toHaveBeenCalled();
  });

  test('locks after auto-lock threshold when ready', () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);
    return store
      .localUnlock({
        username: 'alice',
        password: 'correct-password',
      })
      .then(() => {
        store.markActivity(0);
        store.enforceAutoLock(5 * 60 * 1000 + 1);

        expect(store.state.phase).toBe('local_unlock_required');
      });
  });

  test('uses default auto-lock configuration when no persisted value exists', () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    expect(store.state.autoLockAfterMs).toBe(5 * 60 * 1000);
  });

  test('updates and persists auto-lock configuration and enforces with the configured value', async () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    await store.localUnlock({
      username: 'alice',
      password: 'correct-password',
    });

    store.setAutoLockAfterMs(60 * 1000);
    expect(store.state.autoLockAfterMs).toBe(60 * 1000);
    expect(globalThis.localStorage?.getItem('vaultlite:auto-lock-after-ms')).toBe(String(60 * 1000));

    store.markActivity(0);
    store.enforceAutoLock(60 * 1000 + 1);
    expect(store.state.phase).toBe('local_unlock_required');
  });

  test('localUnlock fails closed when trusted local state is missing', async () => {
    const dependencies = createMockDependencies();
    dependencies.trustedLocalStateStore.load.mockResolvedValueOnce(null);
    const store = createSessionStore(dependencies as never);

    await expect(
      store.localUnlock({
        username: 'alice',
        password: 'correct-password',
      }),
    ).rejects.toThrow('This device is no longer trusted for this account. Add the device again.');

    expect(store.state.phase).toBe('remote_authentication_required');
    expect(store.state.lastError).toBe('This device is no longer trusted for this account. Add the device again.');
  });

  test('localUnlock fails when server session is no longer unlock-eligible (suspended/revoked)', async () => {
    const dependencies = createMockDependencies();
    dependencies.authClient.restoreSession.mockResolvedValueOnce({
      ok: true,
      sessionState: 'remote_authentication_required',
    });
    const store = createSessionStore(dependencies as never);

    await expect(
      store.localUnlock({
        username: 'alice',
        password: 'correct-password',
      }),
    ).rejects.toThrow('Your account is suspended or your session is no longer valid.');

    expect(store.state.phase).toBe('local_unlock_required');
    expect(store.state.lastError).toBe('Your account is suspended or your session is no longer valid.');
  });

  test('remoteAuthenticate fails closed when trusted local state is missing', async () => {
    const dependencies = createMockDependencies();
    dependencies.trustedLocalStateStore.load.mockResolvedValueOnce(null);
    const store = createSessionStore(dependencies as never);

    await expect(
      store.remoteAuthenticate({
        username: 'alice',
        password: 'correct-password',
      }),
    ).rejects.toThrow('This device is no longer trusted for this account. Add the device again.');

    expect(store.state.phase).toBe('remote_authentication_required');
    expect(store.state.lastError).toBe('This device is no longer trusted for this account. Add the device again.');
    expect(dependencies.authClient.requestRemoteAuthenticationChallenge).not.toHaveBeenCalled();
  });

  test('handleUnauthorized transitions back to unlock-required with explicit error', () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);
    return store.restoreSession().then(() => {
      store.handleUnauthorized({
        reasonCode: 'account_suspended',
      });

      expect(store.state.phase).toBe('local_unlock_required');
      expect(store.state.lastError).toBe('Your account is suspended. Ask the owner to reactivate access.');
    });
  });

  test('prepareOnboarding uses canonical runtime metadata and does not persist trusted local state', async () => {
    const dependencies = createMockDependencies();
    dependencies.authClient.signOnboardingAccountKit.mockResolvedValue({
      signature: 'signed_payload',
    });
    const store = createSessionStore(dependencies as never);

    const accountKit = await store.prepareOnboarding({
      inviteToken: 'invite_1',
      username: 'alice',
      password: 'correct-password',
      deviceName: 'Alice Browser',
    });

    expect(dependencies.authClient.getRuntimeMetadata).toHaveBeenCalledTimes(1);
    expect(dependencies.authClient.signOnboardingAccountKit).toHaveBeenCalledWith({
      inviteToken: 'invite_1',
      username: 'alice',
      payload: expect.objectContaining({
        serverUrl: 'https://vaultlite.example.com',
        deploymentFingerprint: 'deployment_fp_v1',
      }),
    });
    expect(dependencies.authClient.completeOnboarding).not.toHaveBeenCalled();
    expect(dependencies.trustedLocalStateStore.save).not.toHaveBeenCalled();
    expect(store.state.phase).toBe('onboarding_export_required');
    expect(accountKit.payload.serverUrl).toBe('https://vaultlite.example.com');
  });

  test('prepareOnboarding surfaces username_unavailable without persisting trusted local state', async () => {
    const dependencies = createMockDependencies();
    dependencies.authClient.signOnboardingAccountKit.mockRejectedValue(
      new Error('Request failed with status 409 (username_unavailable)'),
    );
    const store = createSessionStore(dependencies as never);

    await expect(
      store.prepareOnboarding({
        inviteToken: 'invite_1',
        username: 'alice',
        password: 'correct-password',
        deviceName: 'Alice Browser',
      }),
    ).rejects.toThrow('Request failed with status 409 (username_unavailable)');

    expect(dependencies.trustedLocalStateStore.save).not.toHaveBeenCalled();
    expect(store.state.phase).toBe('remote_authentication_required');
    expect(store.state.lastError).toBe('This username is already in use.');
  });

  test('finalizeOnboarding persists trusted local state only after remote completion succeeds', async () => {
    const dependencies = createMockDependencies();
    dependencies.authClient.signOnboardingAccountKit.mockResolvedValue({
      signature: 'signed_payload',
    });
    dependencies.authClient.completeOnboarding.mockResolvedValue({
      ok: true,
      sessionId: 'session_1',
      csrfToken: 'csrf_1',
      user: {
        userId: 'user_1',
        username: 'alice',
        role: 'user',
        lifecycleState: 'active',
      },
      device: {
        deviceId: 'device_1',
        deviceName: 'Alice Browser',
        platform: 'web',
      },
    });
    const store = createSessionStore(dependencies as never);

    await store.prepareOnboarding({
      inviteToken: 'invite_1',
      username: 'alice',
      password: 'correct-password',
      deviceName: 'Alice Browser',
    });
    await store.finalizeOnboarding();

    expect(dependencies.authClient.completeOnboarding).toHaveBeenCalledTimes(1);
    expect(dependencies.trustedLocalStateStore.save).toHaveBeenCalledTimes(1);
    const persisted = dependencies.trustedLocalStateStore.save.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted).not.toHaveProperty('accountKit');
    expect(store.state.phase).toBe('ready');
  });

  test('finalizeOnboarding clears pending onboarding and does not persist local state on failure', async () => {
    const dependencies = createMockDependencies();
    dependencies.authClient.signOnboardingAccountKit.mockResolvedValue({
      signature: 'signed_payload',
    });
    dependencies.authClient.completeOnboarding.mockRejectedValue(new Error('server failed'));
    const store = createSessionStore(dependencies as never);

    await store.prepareOnboarding({
      inviteToken: 'invite_1',
      username: 'alice',
      password: 'correct-password',
      deviceName: 'Alice Browser',
    });

    await expect(store.finalizeOnboarding()).rejects.toThrow('server failed');
    expect(dependencies.trustedLocalStateStore.save).not.toHaveBeenCalled();
    expect(store.state.phase).toBe('remote_authentication_required');
    expect(store.state.lastError).toBe('Something went wrong on our side. Please try again.');
  });

  test('bootstrapDevice fails closed when Account Kit deployment metadata does not match current runtime metadata', async () => {
    const dependencies = createMockDependencies();
    dependencies.authClient.verifyAccountKit.mockResolvedValue({
      status: 'valid',
    });
    dependencies.authClient.getRuntimeMetadata.mockResolvedValue({
      serverUrl: 'https://vaultlite.example.com',
      deploymentFingerprint: 'deployment_fp_v1',
    });
    const store = createSessionStore(dependencies as never);

    await expect(
      store.bootstrapDevice({
        username: 'alice',
        password: 'correct-password',
        deviceName: 'Recovered Browser',
        accountKitJson: JSON.stringify({
          payload: {
            version: 'account-kit.v1',
            serverUrl: 'https://different.example.com',
            username: 'alice',
            accountKey: 'A'.repeat(43),
            deploymentFingerprint: 'different_deployment',
            issuedAt: '2026-03-15T12:00:00.000Z',
          },
          signature: 'signed_payload',
        }),
      }),
    ).rejects.toThrow('Account Kit deployment mismatch');
    expect(dependencies.authClient.requestRemoteAuthenticationChallenge).not.toHaveBeenCalled();
  });

  test('bootstrapDevice persists sanitized trusted local state without accountKit', async () => {
    const dependencies = createMockDependencies();
    dependencies.authClient.verifyAccountKit.mockResolvedValue({
      status: 'valid',
    });
    dependencies.authClient.bootstrapDevice.mockResolvedValue({
      ok: true,
      sessionId: 'session_bootstrap_1',
      csrfToken: 'csrf_bootstrap_1',
      authSalt: 'A'.repeat(22),
      encryptedAccountBundle: 'bundle_bootstrap_1',
      accountKeyWrapped: 'wrapped_bootstrap_1',
      user: {
        userId: 'user_1',
        username: 'alice',
        role: 'user',
        lifecycleState: 'active',
      },
      device: {
        deviceId: 'device_bootstrap_1',
        deviceName: 'Recovered Browser',
        platform: 'web',
      },
    });
    const store = createSessionStore(dependencies as never);

    await store.bootstrapDevice({
      username: 'alice',
      password: 'correct-password',
      deviceName: 'Recovered Browser',
      accountKitJson: JSON.stringify({
        payload: {
          version: 'account-kit.v1',
          serverUrl: 'https://vaultlite.example.com',
          username: 'alice',
          accountKey: 'A'.repeat(43),
          deploymentFingerprint: 'deployment_fp_v1',
          issuedAt: '2026-03-15T12:00:00.000Z',
        },
        signature: 'signed_payload',
      }),
    });

    expect(dependencies.trustedLocalStateStore.save).toHaveBeenCalledTimes(1);
    const persisted = dependencies.trustedLocalStateStore.save.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted).not.toHaveProperty('accountKit');
  });

  test('reissueAccountKit returns a fresh signed kit without persisting it into trusted local state', async () => {
    const dependencies = createMockDependencies();
    dependencies.authClient.reissueAccountKit.mockResolvedValue({
      signature: 'reissued_signature',
    });
    const store = createSessionStore(dependencies as never);

    await store.localUnlock({
      username: 'alice',
      password: 'correct-password',
    });
    const reissued = await store.reissueAccountKit();

    expect(reissued.signature).toBe('reissued_signature');
    expect(dependencies.trustedLocalStateStore.save).not.toHaveBeenCalled();
  });

  test('approveExtensionLink sends trusted package with approval nonce without forcing extra local reauth', async () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    await store.localUnlock({
      username: 'alice',
      password: 'correct-password',
    });
    const reauthCallsAfterUnlock = dependencies.authClient.recentReauth.mock.calls.length;

    await store.approveExtensionLink({
      requestId: 'request_1234567890123456',
    });

    expect(dependencies.authClient.recentReauth.mock.calls.length).toBe(reauthCallsAfterUnlock);
    expect(dependencies.authClient.approveExtensionLink).toHaveBeenCalledWith({
      requestId: 'request_1234567890123456',
      approvalNonce: 'R'.repeat(16),
      package: {
        authSalt: 'AAAAAAAAAAAAAAAAAAAAAA',
        encryptedAccountBundle: 'bundle',
        accountKeyWrapped: 'wrapped',
        localUnlockEnvelope: {
          version: 'local-unlock.v1',
          nonce: 'AAAAAAAAAAAAAAAA',
          ciphertext: 'BBBBBBBBBBBBBBBB',
        },
      },
    });
  });

  test('rejectExtensionLink delegates reauth policy to backend and rejects request', async () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    await store.restoreSession();
    await store.rejectExtensionLink({
      requestId: 'request_abcdefghijklmn',
      rejectionReasonCode: 'user_rejected',
    });

    expect(dependencies.authClient.recentReauth).not.toHaveBeenCalled();
    expect(dependencies.authClient.rejectExtensionLink).toHaveBeenCalledWith({
      requestId: 'request_abcdefghijklmn',
      rejectionReasonCode: 'user_rejected',
    });
  });
});
