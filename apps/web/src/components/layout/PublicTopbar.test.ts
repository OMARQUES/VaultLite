import { reactive } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import PublicTopbar from './PublicTopbar.vue';

const routeState = reactive({
  path: '/auth',
});

type MediaListener = (event: MediaQueryListEvent) => void;

let mediaQueryMatches = false;
let mediaListeners: MediaListener[] = [];

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  RouterLink: {
    props: ['to'],
    template: '<a :href="String(to)"><slot /></a>',
  },
}));

function installMatchMediaStub() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: mediaQueryMatches,
      media: '(max-width: 1024px)',
      onchange: null,
      addEventListener: (_name: string, listener: MediaListener) => {
        mediaListeners.push(listener);
      },
      removeEventListener: (_name: string, listener: MediaListener) => {
        mediaListeners = mediaListeners.filter((candidate) => candidate !== listener);
      },
      dispatchEvent: () => true,
      addListener: () => undefined,
      removeListener: () => undefined,
    })),
  );
}

describe('PublicTopbar', () => {
  beforeEach(() => {
    routeState.path = '/auth';
    mediaQueryMatches = false;
    mediaListeners = [];
    installMatchMediaStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('renders desktop nav links when mobile drawer is not active', () => {
    const wrapper = mount(PublicTopbar);

    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).toContain('Onboarding');
    expect(wrapper.text()).toContain('Add device');
    expect(wrapper.find('[data-testid="public-nav-menu-button"]').exists()).toBe(false);
  });

  test('renders mobile menu button and opens drawer with links', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    const wrapper = mount(PublicTopbar);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="public-nav-menu-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="public-nav-drawer"]').exists()).toBe(false);

    await wrapper.get('[data-testid="public-nav-menu-button"]').trigger('click');
    expect(wrapper.find('[data-testid="public-nav-drawer"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="public-nav-drawer"]').text()).toContain('Home');
    expect(wrapper.get('[data-testid="public-nav-drawer"]').text()).toContain('Onboarding');
    expect(wrapper.get('[data-testid="public-nav-drawer"]').text()).toContain('Add device');
  });

  test('hides all public navigation controls on onboarding and unlock routes', () => {
    routeState.path = '/onboarding';
    let wrapper = mount(PublicTopbar);
    expect(wrapper.text()).toContain('VaultLite');
    expect(wrapper.text()).not.toContain('Home');
    expect(wrapper.find('[data-testid="public-nav-menu-button"]').exists()).toBe(false);

    routeState.path = '/unlock';
    wrapper = mount(PublicTopbar);
    expect(wrapper.text()).not.toContain('Home');
    expect(wrapper.find('[data-testid="public-nav-menu-button"]').exists()).toBe(false);
  });
});
