import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { sessionStoreKey } from '../app-context';
import OnboardingPage from './OnboardingPage.vue';
import RemoteAuthenticationPage from './RemoteAuthenticationPage.vue';
import UnlockPage from './UnlockPage.vue';

const push = vi.fn();
const routeState = reactive({
  path: '/onboarding',
  query: {} as Record<string, string>,
});

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push,
  }),
  useRoute: () => routeState,
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
      autoLockAfterMs: 5 * 60 * 1000,
    }),
    restoreSession: vi.fn(),
    prepareOnboarding: vi.fn(),
    finalizeOnboarding: vi.fn(),
    remoteAuthenticate: vi.fn(),
    bootstrapDevice: vi.fn(),
    localUnlock: vi.fn(),
    reissueAccountKit: vi.fn(),
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

describe('auth surfaces', () => {
  beforeEach(() => {
    push.mockReset();
    routeState.path = '/onboarding';
    routeState.query = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('onboarding starts on step 1 with explicit progression and contextual password warning', async () => {
    const sessionStore = createSessionStore();

    const wrapper = mount(OnboardingPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    expect(wrapper.text()).toContain('ONBOARDING');
    expect(wrapper.text()).toContain('Step 1 of 2');
    expect(wrapper.text()).toContain('Create account and initial device');
    expect(wrapper.text()).toContain('Set your account password and name this first trusted device.');
    expect(wrapper.text()).toContain("Forgotten master passwords can't be recovered.");
    expect(wrapper.text()).toContain("Used to unlock your vault on trusted devices. It can't be recovered.");
    expect(wrapper.text()).toContain('Continue');
    expect(wrapper.text()).not.toContain('Generate Account Kit');
    expect(wrapper.text()).not.toContain('Finalize account creation');
  });

  test('onboarding treats prefilled invite token as accepted context instead of exposing raw token', async () => {
    routeState.query = {
      inviteToken: 'invite_prefilled_abcdef1234567890',
    };
    const sessionStore = createSessionStore();

    const wrapper = mount(OnboardingPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    expect(wrapper.text()).toContain('Invite accepted');
    expect(wrapper.text()).toContain('Use different token');
    expect(wrapper.text()).not.toContain('invite_prefilled_abcdef1234567890');
  });

  test('onboarding step 2 requires download and explicit acknowledgment before finishing setup', async () => {
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
    sessionStore.finalizeOnboarding.mockResolvedValueOnce({
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

    expect(wrapper.text()).toContain('Step 2 of 2');
    expect(wrapper.text()).toContain('Save your Account Kit');
    expect(wrapper.text()).toContain("You'll need this signed file to set up a new device.");
    expect(wrapper.text()).toContain('Account Kit ready');
    expect(wrapper.text()).toContain('Signed and verified');
    expect(wrapper.text()).toContain('Issued for');
    expect(wrapper.text()).toContain('Device');
    expect(wrapper.text()).toContain('Deployment fingerprint');
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.text()).toContain('Primary Browser');
    expect(wrapper.text()).toContain('development_deployment');
    expect(wrapper.text()).toContain('Download signed Account Kit');
    expect(wrapper.text()).toContain('Finish setup');
    expect(wrapper.text()).toContain('I saved the Account Kit outside this browser.');
    expect(wrapper.find('.onboarding-step__download-action').exists()).toBe(true);
    expect(wrapper.find('.onboarding-step__final-actions').exists()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('serverUrl');

    const finishButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Finish setup');
    expect(finishButton).toBeDefined();
    expect((finishButton!.element as HTMLButtonElement).disabled).toBe(true);

    const checkbox = wrapper.get('input[type="checkbox"]');
    await checkbox.setValue(true);
    await flushPromises();
    expect((finishButton!.element as HTMLButtonElement).disabled).toBe(true);

    const downloadButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'Download signed Account Kit');
    expect(downloadButton).toBeDefined();
    await downloadButton!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Download again');
    expect(wrapper.text()).toContain('Download started. Save it outside this browser.');
    expect((finishButton!.element as HTMLButtonElement).disabled).toBe(false);

    await finishButton!.trigger('click');
    await flushPromises();

    expect(sessionStore.finalizeOnboarding).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/vault');
  });

  test('auth page is dedicated to add device and keeps upload flow minimal', async () => {
    const sessionStore = createSessionStore();

    const wrapper = mount(RemoteAuthenticationPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    expect(wrapper.text()).toContain('Add a device');
    expect(wrapper.text()).not.toContain('Add device');
    expect(wrapper.text()).not.toContain('Trusted device');
    expect(wrapper.findAll('.panel-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('Account Kit file');
    expect(wrapper.text()).not.toContain('Authenticate trusted device');
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('h2').exists()).toBe(false);
    expect(wrapper.text()).toContain('Choose Account Kit file');

    const fileInput = wrapper.get('input[type="file"]');
    const file = new File(['{"payload":{},"signature":"signed"}'], 'account-kit.json', {
      type: 'application/json',
    });

    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [file],
    });
    await fileInput.trigger('change');
    await flushPromises();

    expect(wrapper.text()).toContain('account-kit.json');
    expect(wrapper.text()).not.toContain('Replace file');
    expect(wrapper.text()).not.toContain('Remove file');
    expect(wrapper.find('button[aria-label="Upload Account Kit file"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Paste JSON manually instead');
    expect(wrapper.get('[data-testid="manual-json-toggle"]').attributes('aria-expanded')).toBe('false');

    await wrapper.get('[data-testid="manual-json-toggle"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="manual-json-toggle"]').attributes('aria-expanded')).toBe('true');
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
    expect(wrapper.text()).toContain('Enter your master password to unlock this trusted device.');
    expect(wrapper.text()).toContain('alice');
    expect(wrapper.text()).toContain('Device');
    expect(wrapper.text()).toContain('Primary Browser');
    expect(wrapper.findAll('input')).toHaveLength(1);
    expect((wrapper.get('input').element as HTMLInputElement).type).toBe('password');
    expect(document.activeElement).toBe(wrapper.get('input').element);
    expect(push).not.toHaveBeenCalled();
  });

  test('unlock surfaces suspended-account message from route reason', async () => {
    routeState.path = '/unlock';
    routeState.query = {
      reason: 'account_suspended',
    };
    const sessionStore = createSessionStore();

    const wrapper = mount(UnlockPage, {
      global: {
        provide: {
          [sessionStoreKey as symbol]: sessionStore,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('Your account is suspended. Ask the owner to reactivate access.');
  });
});
