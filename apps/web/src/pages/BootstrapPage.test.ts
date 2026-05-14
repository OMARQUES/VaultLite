import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';

import BootstrapPage from './BootstrapPage.vue';

const push = vi.fn();
const bootstrapVerify = vi.fn();
const bootstrapInitializeOwner = vi.fn();
const getRuntimeMetadata = vi.fn();
const restoreSession = vi.fn();
const localUnlock = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push,
  }),
}));

vi.mock('../lib/auth-client', () => ({
  createVaultLiteAuthClient: () => ({
    bootstrapVerify,
    bootstrapInitializeOwner,
    getRuntimeMetadata,
  }),
}));

vi.mock('../composables/useSessionStore', () => ({
  useSessionStore: () => ({
    restoreSession,
    localUnlock,
  }),
}));

vi.mock('../lib/browser-crypto', () => ({
  createLocalUnlockEnvelope: vi.fn().mockResolvedValue({ kdfProfile: { name: 'test' } }),
  createOpaqueBundlePlaceholder: vi.fn((input) => JSON.stringify(input)),
  createRandomBase64Url: vi.fn(() => 'random_id'),
  deriveAuthProof: vi.fn().mockResolvedValue('auth_proof'),
  generateAccountKey: vi.fn(() => 'account_key'),
}));

vi.mock('../lib/trusted-local-state', () => ({
  createTrustedLocalStateStore: () => ({
    save: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('BootstrapPage', () => {
  test('shows bootstrap token as step 1 of 3 and owner account as step 2 of 3', async () => {
    bootstrapVerify.mockResolvedValueOnce({ verificationToken: 'verified' });

    const wrapper = mount(BootstrapPage);

    expect(wrapper.text()).toContain('BOOTSTRAP · STEP 1 OF 3');
    expect(wrapper.text()).toContain('Initialize deployment');
    expect(wrapper.text()).toContain('Bootstrap token');
    expect(wrapper.text()).not.toContain('Step 1 of 2');

    await wrapper.get('input').setValue('bootstrap_token');
    await wrapper.get('form').trigger('submit.prevent');

    expect(bootstrapVerify).toHaveBeenCalledWith({ bootstrapToken: 'bootstrap_token' });
    expect(wrapper.text()).toContain('BOOTSTRAP · STEP 2 OF 3');
    expect(wrapper.text()).toContain('Create owner account');
    expect(wrapper.text()).toContain("Forgotten master passwords can't be recovered.");
    expect(wrapper.text()).not.toContain('Step 2 of 2');
  });
});
