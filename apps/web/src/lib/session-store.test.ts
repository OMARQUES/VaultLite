import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./browser-crypto', () => ({
  createLocalUnlockEnvelope: vi.fn().mockResolvedValue({
    version: 'local-unlock.v1',
    nonce: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'BBBBBBBBBBBBBBBB',
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
}));

import { createSessionStore } from './session-store';

function createMockDependencies() {
  return {
    authClient: {
      restoreSession: vi.fn().mockResolvedValue({
        ok: true,
        sessionState: 'local_unlock_required',
        user: {
          userId: 'user_1',
          username: 'alice',
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
  });

  test('restores a valid server session into local unlock state', async () => {
    const dependencies = createMockDependencies();
    const store = createSessionStore(dependencies as never);

    await store.restoreSession();

    expect(store.state.phase).toBe('local_unlock_required');
    expect(store.state.username).toBe('alice');
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
    expect(store.state.lastError).toBe('Request failed with status 409 (username_unavailable)');
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
    expect(store.state.lastError).toBe('server failed');
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
});
