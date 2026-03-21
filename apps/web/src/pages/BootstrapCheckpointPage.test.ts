import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { sessionStoreKey } from '../app-context';
import BootstrapCheckpointPage from './BootstrapCheckpointPage.vue';

const replace = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace,
  }),
}));

function createSessionStore(phase: 'ready' | 'local_unlock_required') {
  return {
    state: reactive({
      phase,
      username: 'alice',
      userId: 'user_1',
      role: 'owner' as const,
      deviceId: 'device_1',
      deviceName: 'Primary Browser',
      lifecycleState: 'active' as const,
      bundleVersion: 1,
      bootstrapState: 'OWNER_CREATED_CHECKPOINT_PENDING' as const,
      lastError: null as string | null,
      lastActivityAt: Date.now(),
      autoLockAfterMs: 300_000,
    }),
    reissueAccountKit: vi.fn().mockResolvedValue({
      payload: {
        version: 'account-kit.v1',
        serverUrl: 'http://127.0.0.1:8787',
        username: 'alice',
        accountKey: 'A'.repeat(43),
        deploymentFingerprint: 'development_deployment',
        issuedAt: '2026-03-20T00:00:00.000Z',
      },
      signature: 'signed',
    }),
    refreshBootstrapState: vi.fn(),
  };
}

describe('BootstrapCheckpointPage', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  test('loads account kit when owner session is ready', async () => {
    const sessionStore = createSessionStore('ready');
    const wrapper = mount(BootstrapCheckpointPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    await flushPromises();

    expect(sessionStore.reissueAccountKit).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Account Kit ready');
    expect(wrapper.text()).toContain('Download signed Account Kit');
  });

  test('redirects to unlock when local unlock is required', async () => {
    const sessionStore = createSessionStore('local_unlock_required');
    mount(BootstrapCheckpointPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    await flushPromises();

    expect(replace).toHaveBeenCalledWith('/unlock?next=/bootstrap/checkpoint');
    expect(sessionStore.reissueAccountKit).not.toHaveBeenCalled();
  });
});
