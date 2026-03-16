import { nextTick, reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { sessionStoreKey } from '../app-context';
import OnboardingPage from './OnboardingPage.vue';
import RemoteAuthenticationPage from './RemoteAuthenticationPage.vue';
import UnlockPage from './UnlockPage.vue';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push,
  }),
}));

function createSessionStore() {
  return {
    state: reactive({
      phase: 'remote_authentication_required' as const,
      username: 'alice',
      userId: 'user_1',
      deviceId: 'device_1',
      deviceName: 'Primary Browser',
      lifecycleState: 'active' as const,
      lastError: null as string | null,
      lastActivityAt: null as number | null,
    }),
    restoreSession: vi.fn(),
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

describe('auth surfaces', () => {
  beforeEach(() => {
    push.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('onboarding keeps the flow linear and does not expose raw Account Kit JSON', async () => {
    const sessionStore = createSessionStore();
    sessionStore.prepareOnboarding.mockResolvedValueOnce({
      payload: {
        version: 'account-kit.v1',
        serverUrl: 'http://127.0.0.1:8787',
        username: 'alice',
        accountKey: 'A'.repeat(43),
        deploymentFingerprint: 'development_deployment',
        issuedAt: '2026-03-15T12:00:00.000Z',
      },
      signature: 'signed',
    });

    const wrapper = mount(OnboardingPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    const inputs = wrapper.findAll('input');
    await inputs[0]?.setValue('invite_token_123');
    await inputs[1]?.setValue('alice');
    await inputs[2]?.setValue('correct horse battery staple');
    await inputs[3]?.setValue('Primary Browser');
    await wrapper.get('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('Account Kit ready');
    expect(wrapper.text()).toContain('Download signed Account Kit');
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('serverUrl');
    expect(wrapper.text()).not.toContain('deploymentFingerprint');
  });

  test('remote authentication keeps one mode active at a time and stays upload-first for add device', async () => {
    const sessionStore = createSessionStore();

    const wrapper = mount(RemoteAuthenticationPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    expect(wrapper.text()).toContain('Sign in or add a device');
    expect(wrapper.text()).toContain('Trusted device');
    expect(wrapper.text()).toContain('Add device');
    expect(wrapper.findAll('.panel-card')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Account Kit file');
    expect(wrapper.find('textarea').exists()).toBe(false);

    const addDeviceButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Add device');
    expect(addDeviceButton).toBeDefined();
    await addDeviceButton!.trigger('click');
    await nextTick();

    expect(wrapper.findAll('.panel-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('Account Kit file');
    expect(wrapper.text()).not.toContain('Authenticate trusted device');

    const fileInput = wrapper.get('input[type="file"]');
    const file = new File(['{"payload":{},"signature":"signed"}'], 'account-kit.json', {
      type: 'application/json',
    });

    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [file],
    });
    await fileInput.trigger('change');
    await nextTick();

    expect(wrapper.text()).toContain('account-kit.json');
    expect(wrapper.text()).toContain('Replace file');
    expect(wrapper.text()).toContain('Remove file');

    await wrapper.get('[data-testid="manual-json-toggle"]').trigger('click');
    await nextTick();

    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  test('unlock shows a static username line and only asks for the master password', async () => {
    const sessionStore = createSessionStore();

    const wrapper = mount(UnlockPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
      attachTo: document.body,
    });

    await flushPromises();

    expect(wrapper.text()).toContain('Unlock this device');
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.findAll('input')).toHaveLength(1);
    expect((wrapper.get('input').element as HTMLInputElement).type).toBe('password');
    expect(document.activeElement).toBe(wrapper.get('input').element);
    expect(push).not.toHaveBeenCalled();
  });
});
