import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { sessionStoreKey } from './app-context';
import App from './App.vue';
import { createVaultLiteRouter } from './router';

function createSessionStore(
  phase:
    | 'anonymous'
    | 'remote_authentication_required'
    | 'local_unlock_required'
    | 'ready'
    | 'onboarding_export_required',
) {
  return {
    state: reactive({
      phase,
      username: phase === 'ready' || phase === 'local_unlock_required' ? 'alice' : null,
      userId: phase === 'ready' || phase === 'local_unlock_required' ? 'user_1' : null,
      deviceId: phase === 'ready' || phase === 'local_unlock_required' ? 'device_1' : null,
      deviceName: phase === 'ready' || phase === 'local_unlock_required' ? 'Primary Browser' : null,
      lifecycleState: phase === 'ready' ? ('active' as const) : null,
      lastError: null,
      lastActivityAt: null,
    }),
    restoreSession: vi.fn().mockResolvedValue(undefined),
    prepareOnboarding: vi.fn(),
    finalizeOnboarding: vi.fn(),
    remoteAuthenticate: vi.fn(),
    bootstrapDevice: vi.fn(),
    localUnlock: vi.fn(),
    reissueAccountKit: vi.fn(),
    lock: vi.fn(),
    markActivity: vi.fn(),
    enforceAutoLock: vi.fn(),
    getUnlockedVaultContext: vi.fn().mockReturnValue({
      username: 'alice',
      accountKey: 'A'.repeat(43),
    }),
  };
}

async function mountAppAt(
  path: string,
  phase: Parameters<typeof createSessionStore>[0],
) {
  window.history.pushState({}, '', path);
  const sessionStore = createSessionStore(phase);
  const router = createVaultLiteRouter(sessionStore);

  const wrapper = mount(App, {
    global: {
      plugins: [router],
      provide: {
        [sessionStoreKey as symbol]: sessionStore,
      },
    },
  });

  await router.isReady();
  await flushPromises();

  return { wrapper, sessionStore };
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App shell', () => {
  test('redirects from / to /unlock after restore when trusted device requires local unlock', async () => {
    window.history.pushState({}, '', '/');
    const sessionStore = createSessionStore('anonymous');
    sessionStore.restoreSession.mockImplementation(async () => {
      sessionStore.state.phase = 'local_unlock_required';
      sessionStore.state.username = 'alice';
      sessionStore.state.userId = 'user_1';
      sessionStore.state.deviceId = 'device_1';
      sessionStore.state.deviceName = 'Primary Browser';
      sessionStore.state.lifecycleState = 'active';
    });
    const router = createVaultLiteRouter(sessionStore);

    const wrapper = mount(App, {
      global: {
        plugins: [router],
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    await router.isReady();
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/unlock');
    expect(wrapper.text()).toContain('Unlock this device');
  });

  test('uses the public shell on auth routes', async () => {
    const { wrapper, sessionStore } = await mountAppAt('/auth', 'remote_authentication_required');

    expect(wrapper.find('[data-testid="public-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vault-shell"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Sign in or add a device');
    expect(wrapper.text()).toContain('Onboarding');
    expect(wrapper.text()).toContain('Auth');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(1);
  });

  test('uses the authenticated shell on settings and does not render the public nav there', async () => {
    const { wrapper, sessionStore } = await mountAppAt('/settings', 'ready');

    expect(wrapper.find('[data-testid="vault-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="public-shell"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Security');
    expect(wrapper.text()).toContain('Account Kit');
    expect(wrapper.text()).toContain('Reissue Account Kit');
    expect(wrapper.text()).not.toContain('Password');
    expect(wrapper.text()).not.toContain('Onboarding');
    expect(wrapper.text()).not.toContain('Auth');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(1);
  });
});
