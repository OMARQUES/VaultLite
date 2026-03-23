import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { sessionStoreKey } from './app-context';
import App from './App.vue';
import { VAULT_UNAUTHORIZED_EVENT } from './lib/http-events';
import { createVaultLiteRouter } from './router';

function createSessionStore(
  phase:
    | 'anonymous'
    | 'remote_authentication_required'
    | 'local_unlock_required'
    | 'ready'
    | 'onboarding_export_required'
    | 'onboarding_in_progress',
) {
  return {
    state: reactive({
      phase,
      bootstrapState: 'INITIALIZED' as 'INITIALIZED' | null,
      username: phase === 'ready' || phase === 'local_unlock_required' ? 'alice' : null,
      userId: phase === 'ready' || phase === 'local_unlock_required' ? 'user_1' : null,
      role: (phase === 'ready' || phase === 'local_unlock_required' ? 'user' : null) as
        | 'owner'
        | 'user'
        | null,
      deviceId: phase === 'ready' || phase === 'local_unlock_required' ? 'device_1' : null,
      deviceName: phase === 'ready' || phase === 'local_unlock_required' ? 'Primary Browser' : null,
      lifecycleState: phase === 'ready' ? ('active' as const) : null,
      bundleVersion: phase === 'ready' || phase === 'local_unlock_required' ? 0 : null,
      lockRevision: 0,
      lastUnlockedLockRevision: 0,
      lastError: null,
      lastActivityAt: null,
      autoLockAfterMs: 5 * 60 * 1000,
    }),
    refreshBootstrapState: vi.fn().mockResolvedValue(undefined),
    restoreSession: vi.fn().mockResolvedValue(undefined),
    refreshSessionPolicy: vi.fn().mockResolvedValue(undefined),
    updateSessionPolicy: vi.fn().mockResolvedValue({
      policy: { unlockIdleTimeoutMs: 5 * 60 * 1000 },
    }),
    prepareOnboarding: vi.fn(),
    finalizeOnboarding: vi.fn(),
    remoteAuthenticate: vi.fn(),
    bootstrapDevice: vi.fn(),
    localUnlock: vi.fn(),
    reissueAccountKit: vi.fn(),
    confirmRecentReauth: vi.fn(),
    listDevices: vi.fn().mockResolvedValue({
      devices: [],
    }),
    revokeDevice: vi.fn(),
    rotatePassword: vi.fn(),
    getRuntimeMetadata: vi.fn().mockResolvedValue({
      serverUrl: 'https://vaultlite.local',
      deploymentFingerprint: 'development_deployment',
    }),
    handleUnauthorized: vi.fn(function handleUnauthorized(
      this: { state: { username: string | null; phase: string; lastError: string | null } },
      input?: { message?: string | null; reasonCode?: string | null },
    ) {
      const shouldRequireUnlock = input?.reasonCode === 'account_suspended' && Boolean(this.state.username);
      this.state.phase = shouldRequireUnlock ? 'local_unlock_required' : 'remote_authentication_required';
      this.state.lastError =
        input?.message ?? 'Your trusted session is no longer valid. Add this device again to continue.';
    }),
    setAutoLockAfterMs: vi.fn(),
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
      sessionStore.state.bootstrapState = 'INITIALIZED';
      sessionStore.state.username = 'alice';
      sessionStore.state.userId = 'user_1';
      sessionStore.state.role = 'user';
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

  test('preserves /admin target through unlock and reaches admin after local unlock', async () => {
    window.history.pushState({}, '', '/admin/invites');
    const sessionStore = createSessionStore('local_unlock_required');
    sessionStore.state.role = 'owner';
    sessionStore.localUnlock.mockImplementation(async () => {
      sessionStore.state.phase = 'ready';
      sessionStore.state.role = 'owner';
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

    expect(router.currentRoute.value.fullPath).toBe('/unlock?next=/admin/invites');
    const passwordInput = wrapper.find('input[type="password"]');
    await passwordInput.setValue('correct-password');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/admin/invites');
  });

  test('uses the public shell on auth routes', async () => {
    const { wrapper, sessionStore } = await mountAppAt('/auth', 'remote_authentication_required');

    expect(wrapper.find('[data-testid="public-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vault-shell"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Add a device');
    expect(wrapper.text()).toContain('Onboarding');
    expect(wrapper.text()).toContain('Add device');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(1);
  });

  test('does not render authenticated vault shell when session is not ready on /vault', async () => {
    const { wrapper, sessionStore } = await mountAppAt('/vault', 'anonymous');

    expect(wrapper.find('[data-testid="vault-shell"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="auth-gate"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="public-shell"]').exists()).toBe(true);
    expect(window.location.pathname).toBe('/auth');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(1);
  });

  test('keeps unlock as single-task by hiding public navigation links', async () => {
    const { wrapper, sessionStore } = await mountAppAt('/unlock', 'local_unlock_required');

    expect(wrapper.find('[data-testid="public-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('VaultLite');
    expect(wrapper.text()).not.toContain('Home');
    expect(wrapper.text()).not.toContain('Onboarding');
    expect(wrapper.text()).not.toContain('Add device');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(1);
  });

  test('keeps onboarding focused by hiding public navigation links', async () => {
    const { wrapper, sessionStore } = await mountAppAt('/onboarding', 'anonymous');

    expect(wrapper.find('[data-testid="public-shell"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('VaultLite');
    expect(wrapper.text()).not.toContain('Home');
    expect(wrapper.text()).not.toContain('Onboarding');
    expect(wrapper.text()).not.toContain('Add device');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(1);
  });

  test('uses the authenticated shell on settings and does not render the public nav there', async () => {
    const { wrapper, sessionStore } = await mountAppAt('/settings', 'ready');

    expect(wrapper.find('[data-testid="vault-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="public-shell"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.find('.settings-shell-page__nav').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Onboarding');
    expect(wrapper.text()).not.toContain('Auth');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(1);
  });

  test('supports authenticated settings subroutes under the same shell', async () => {
    const { wrapper, sessionStore } = await mountAppAt('/settings/security', 'ready');

    expect(wrapper.find('[data-testid="vault-shell"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="public-shell"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Security');
    expect(wrapper.text()).toContain('Password rotation');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(1);
  });

  test('redirects to /auth when an authenticated surface receives unauthorized event', async () => {
    const { sessionStore } = await mountAppAt('/vault', 'ready');
    window.dispatchEvent(
      new CustomEvent(VAULT_UNAUTHORIZED_EVENT, {
        detail: {
          source: 'vault',
          status: 401,
          code: 'unauthorized',
          message: 'unauthorized',
          url: '/api/vault/items',
        },
      }),
    );
    await flushPromises();

    expect(sessionStore.handleUnauthorized).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/auth');
  });

  test('redirects to /unlock when unauthorized event explicitly reports account suspended', async () => {
    const { sessionStore } = await mountAppAt('/vault', 'ready');
    window.dispatchEvent(
      new CustomEvent(VAULT_UNAUTHORIZED_EVENT, {
        detail: {
          source: 'vault',
          status: 401,
          code: 'account_suspended',
          message: 'account_suspended',
          url: '/api/vault/items',
        },
      }),
    );
    await flushPromises();

    expect(sessionStore.handleUnauthorized).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/unlock');
    expect(window.location.search).toContain('reason=account_suspended');
  });

  test('redirects out of /vault when session phase downgrades to local unlock after mount', async () => {
    const { sessionStore } = await mountAppAt('/vault', 'ready');

    sessionStore.state.phase = 'local_unlock_required';
    await flushPromises();

    expect(window.location.pathname).toBe('/unlock');
  });

  test('falls back to /auth when restore fails on authenticated route with unknown bootstrap state', async () => {
    window.history.pushState({}, '', '/vault?scope=all');
    const sessionStore = createSessionStore('anonymous');
    sessionStore.state.bootstrapState = null;
    sessionStore.restoreSession.mockRejectedValueOnce(new Error('restore_failed'));
    const router = createVaultLiteRouter(sessionStore);

    mount(App, {
      global: {
        plugins: [router],
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    await router.isReady();
    await flushPromises();

    expect(window.location.pathname).toBe('/auth');
    expect(window.location.search).toContain('next=');
  });

  test('retries session restore immediately after redirecting to auth for trusted remote-auth state', async () => {
    window.history.pushState({}, '', '/vault');
    const sessionStore = createSessionStore('remote_authentication_required');
    sessionStore.state.username = 'alice';
    sessionStore.state.userId = 'user_1';
    sessionStore.state.role = 'user';
    sessionStore.state.deviceId = 'device_1';
    sessionStore.state.deviceName = 'Primary Browser';
    sessionStore.restoreSession
      .mockResolvedValueOnce(undefined)
      .mockImplementation(async () => {
        sessionStore.state.phase = 'ready';
      });
    const router = createVaultLiteRouter(sessionStore);

    mount(App, {
      global: {
        plugins: [router],
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    await router.isReady();
    await flushPromises();

    expect(window.location.pathname).toBe('/auth');
    expect(sessionStore.restoreSession).toHaveBeenCalledTimes(2);
  });
});
