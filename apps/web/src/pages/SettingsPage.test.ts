import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, test, vi } from 'vitest';

import { sessionStoreKey } from '../app-context';
import SettingsPage from './SettingsPage.vue';

function createSessionStore() {
  return {
    state: reactive({
      phase: 'ready' as const,
      bootstrapState: 'INITIALIZED' as const,
      username: 'alice',
      userId: 'user_1',
      role: 'owner' as const,
      deviceId: 'device_current',
      deviceName: 'Primary Browser',
      lifecycleState: 'active' as const,
      bundleVersion: 0,
      lastError: null as string | null,
      lastActivityAt: null as number | null,
      autoLockAfterMs: 5 * 60 * 1000,
    }),
    refreshBootstrapState: vi.fn().mockResolvedValue(undefined),
    restoreSession: vi.fn().mockResolvedValue(undefined),
    prepareOnboarding: vi.fn(),
    finalizeOnboarding: vi.fn(),
    remoteAuthenticate: vi.fn(),
    bootstrapDevice: vi.fn(),
    localUnlock: vi.fn(),
    reissueAccountKit: vi.fn(),
    confirmRecentReauth: vi.fn().mockResolvedValue({
      validUntil: '2026-03-18T12:05:00.000Z',
    }),
    listDevices: vi.fn().mockResolvedValue({
      devices: [
        {
          deviceId: 'device_current',
          deviceName: 'Primary Browser',
          platform: 'web',
          deviceState: 'active',
          createdAt: '2026-03-18T10:00:00.000Z',
          revokedAt: null,
          isCurrentDevice: true,
          lastAuthenticatedAt: '2026-03-18T11:00:00.000Z',
        },
        {
          deviceId: 'device_secondary',
          deviceName: 'Secondary Browser',
          platform: 'web',
          deviceState: 'active',
          createdAt: '2026-03-18T09:00:00.000Z',
          revokedAt: null,
          isCurrentDevice: false,
          lastAuthenticatedAt: '2026-03-18T10:30:00.000Z',
        },
      ],
    }),
    revokeDevice: vi.fn().mockResolvedValue({
      ok: true,
      result: 'success_changed',
    }),
    rotatePassword: vi.fn().mockResolvedValue({
      ok: true,
      result: 'success_changed',
      bundleVersion: 1,
      user: {
        userId: 'user_1',
        username: 'alice',
        role: 'owner',
        bundleVersion: 1,
        lifecycleState: 'active',
      },
      device: {
        deviceId: 'device_current',
        deviceName: 'Primary Browser',
        platform: 'web',
      },
    }),
    handleUnauthorized: vi.fn(),
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

async function mountSettingsPage() {
  const sessionStore = createSessionStore();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', component: SettingsPage },
      { path: '/unlock', component: { template: '<div>unlock</div>' } },
    ],
  });

  await router.push('/settings');
  await router.isReady();

  const wrapper = mount(SettingsPage, {
    global: {
      plugins: [router],
      provide: {
        [sessionStoreKey as symbol]: sessionStore,
      },
    },
  });

  await flushPromises();

  return { wrapper, sessionStore };
}

describe('SettingsPage', () => {
  test('renders trusted devices with explicit lastAuthenticated label', async () => {
    const { wrapper, sessionStore } = await mountSettingsPage();

    expect(sessionStore.listDevices).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Trusted devices');
    expect(wrapper.text()).toContain('Primary Browser');
    expect(wrapper.text()).toContain('Secondary Browser');
    expect(wrapper.text()).toContain('Última autenticação registrada');
    expect(wrapper.text()).not.toContain('Last seen');
  });

  test('revokes non-current device after recent reauth confirmation', async () => {
    const { wrapper, sessionStore } = await mountSettingsPage();

    const revokeButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Revoke');
    expect(revokeButton).toBeDefined();
    await revokeButton!.trigger('click');
    await flushPromises();

    const modalPasswordInput = wrapper.find('.dialog-modal input[type="password"]');
    expect(modalPasswordInput.exists()).toBe(true);
    await modalPasswordInput.setValue('CurrentPassword!1');

    const confirmButton = wrapper
      .findAll('.dialog-modal button')
      .find((button) => button.text().trim() === 'Revoke device');
    expect(confirmButton).toBeDefined();
    await confirmButton!.trigger('click');
    await flushPromises();

    expect(sessionStore.confirmRecentReauth).toHaveBeenCalledWith({
      password: 'CurrentPassword!1',
    });
    expect(sessionStore.revokeDevice).toHaveBeenCalledWith('device_secondary');
  });

  test('submits password rotation with validated form', async () => {
    const { wrapper, sessionStore } = await mountSettingsPage();

    const currentPasswordInput = wrapper.find('input[autocomplete="current-password"]');
    const newPasswordInputs = wrapper.findAll('input[autocomplete="new-password"]');
    expect(currentPasswordInput.exists()).toBe(true);
    expect(newPasswordInputs.length).toBe(2);

    await currentPasswordInput.setValue('CurrentPassword!1');
    await newPasswordInputs[0]!.setValue('NewPassword!2');
    await newPasswordInputs[1]!.setValue('NewPassword!2');

    const rotationForm = wrapper.findAll('form').at(-1);
    expect(rotationForm).toBeDefined();
    await rotationForm!.trigger('submit.prevent');
    await flushPromises();

    expect(sessionStore.rotatePassword).toHaveBeenCalledWith({
      currentPassword: 'CurrentPassword!1',
      nextPassword: 'NewPassword!2',
    });
  });

  test('shows a human error when password rotation fails', async () => {
    const { wrapper, sessionStore } = await mountSettingsPage();
    sessionStore.rotatePassword.mockRejectedValueOnce(
      new Error('Request failed with status 409 (stale_bundle_version)'),
    );

    const currentPasswordInput = wrapper.find('input[autocomplete="current-password"]');
    const newPasswordInputs = wrapper.findAll('input[autocomplete="new-password"]');

    await currentPasswordInput.setValue('CurrentPassword!1');
    await newPasswordInputs[0]!.setValue('NewPassword!2');
    await newPasswordInputs[1]!.setValue('NewPassword!2');

    const rotationForm = wrapper.findAll('form').at(-1);
    expect(rotationForm).toBeDefined();
    await rotationForm!.trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('Your account changed in another session. Refresh and try again.');
  });
});
