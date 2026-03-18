import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, test } from 'vitest';

import SidebarNav from './SidebarNav.vue';

async function mountSidebarAt(path: string, role: 'owner' | 'user' = 'user') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/vault', component: { template: '<div />' } },
      { path: '/vault/item/:itemId', component: { template: '<div />' } },
      { path: '/admin/overview', component: { template: '<div />' } },
      { path: '/admin/invites', component: { template: '<div />' } },
      { path: '/admin/users', component: { template: '<div />' } },
      { path: '/admin/audit', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
    ],
  });

  await router.push(path);
  await router.isReady();

  const wrapper = mount(SidebarNav, {
    global: {
      plugins: [router],
    },
    props: {
      username: 'alice',
      role,
      deviceName: 'Primary Browser',
      onLock: () => undefined,
    },
  });

  await flushPromises();
  return { wrapper, router };
}

describe('SidebarNav', () => {
  test('shows vault IA blocks on vault routes including card and secure note tabs', async () => {
    const { wrapper } = await mountSidebarAt('/vault');

    expect(wrapper.text()).toContain('Scope');
    expect(wrapper.text()).toContain('All items');
    expect(wrapper.text()).toContain('Favorites');
    expect(wrapper.text()).toContain('Trash');
    expect(wrapper.text()).toContain('Types');
    expect(wrapper.text()).toContain('Login');
    expect(wrapper.text()).toContain('Documents');
    expect(wrapper.text()).toContain('Cards');
    expect(wrapper.text()).toContain('Secure Notes');
    expect(wrapper.text()).toContain('Folders');
    expect(wrapper.text()).toContain('All folders');
    expect(wrapper.find('button[aria-label="New folder"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Settings');
  });

  test('keeps the app links and session meta visible', async () => {
    const { wrapper } = await mountSidebarAt('/settings');

    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.text()).toContain('User');
    expect(wrapper.text()).toContain('Device');
    expect(wrapper.text()).toContain('Lock now');
  });

  test('shows admin shortcut for owner role in authenticated shell', async () => {
    const { wrapper } = await mountSidebarAt('/vault', 'owner');
    expect(wrapper.text()).toContain('Admin');
    const adminLink = wrapper.findAll('a').find((node) => (node.attributes('href') ?? '').includes('/admin/overview'));
    expect(adminLink).toBeDefined();
  });

  test('shows admin section navigation blocks on admin routes', async () => {
    const { wrapper } = await mountSidebarAt('/admin/overview', 'owner');

    expect(wrapper.text()).toContain('Admin');
    expect(wrapper.text()).toContain('Overview');
    expect(wrapper.text()).toContain('Invites');
    expect(wrapper.text()).toContain('Users');
    expect(wrapper.text()).toContain('Audit');
  });

  test('shows Vault shortcut in System footer while inside admin routes', async () => {
    const { wrapper } = await mountSidebarAt('/admin/overview', 'owner');

    const footerLink = wrapper
      .findAll('a')
      .find((node) => (node.attributes('class') ?? '').includes('sidebar-nav__link--footer'));

    expect(footerLink).toBeDefined();
    expect(footerLink!.text()).toContain('Vault');
    expect(footerLink!.attributes('href')).toContain('/vault');
  });

  test('preserves q search query while changing vault scope links', async () => {
    const { wrapper } = await mountSidebarAt('/vault?scope=all&type=all&folder=all&q=hub');

    const favoritesLink = wrapper.findAll('a').find((node) => {
      const href = node.attributes('href') ?? '';
      return href.includes('/vault') && href.includes('scope=favorites');
    });
    expect(favoritesLink).toBeDefined();
    expect(favoritesLink!.attributes('href')).toContain('q=hub');
  });

  test('creates a folder through the new-folder dialog flow', async () => {
    const { wrapper } = await mountSidebarAt('/vault');

    const trigger = wrapper.find('button[aria-label="New folder"]');
    expect(trigger.exists()).toBe(true);
    await trigger.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Create folder');

    const input = wrapper.get('.dialog-modal input');
    await input.setValue('Finance');
    await flushPromises();

    const createButton = wrapper.findAll('button').find((node) => node.text().trim() === 'Create folder');
    expect(createButton).toBeDefined();
    await createButton!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Finance');
  });

  test('switches active type filter while preserving search query', async () => {
    const { wrapper, router } = await mountSidebarAt('/vault?scope=all&type=login&folder=all&q=hub');

    const documentsLink = wrapper
      .findAll('a')
      .find((node) => {
        const href = node.attributes('href') ?? '';
        return href.includes('/vault') && href.includes('type=document');
      });

    expect(documentsLink).toBeDefined();
    await documentsLink!.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.type).toBe('document');
    expect(router.currentRoute.value.query.q).toBe('hub');
  });
});
