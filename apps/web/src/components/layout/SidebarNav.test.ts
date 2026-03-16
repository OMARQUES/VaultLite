import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, test } from 'vitest';

import SidebarNav from './SidebarNav.vue';

async function mountSidebarAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/vault', component: { template: '<div />' } },
      { path: '/vault/item/:itemId', component: { template: '<div />' } },
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
      deviceName: 'Primary Browser',
      onLock: () => undefined,
    },
  });

  await flushPromises();
  return wrapper;
}

describe('SidebarNav', () => {
  test('shows vault IA blocks on vault routes and keeps cards/notes hidden in this phase', async () => {
    const wrapper = await mountSidebarAt('/vault');

    expect(wrapper.text()).toContain('All');
    expect(wrapper.text()).toContain('Favorites');
    expect(wrapper.text()).toContain('Trash');
    expect(wrapper.text()).toContain('Login');
    expect(wrapper.text()).toContain('Documents');
    expect(wrapper.text()).toContain('Folders');
    expect(wrapper.text()).toContain('New folder');
    expect(wrapper.text()).toContain('Vault');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.text()).not.toContain('Cards');
    expect(wrapper.text()).not.toContain('Notes');
  });

  test('keeps the app links and session meta visible', async () => {
    const wrapper = await mountSidebarAt('/settings');

    expect(wrapper.text()).toContain('Vault');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.text()).toContain('User');
    expect(wrapper.text()).toContain('Device');
    expect(wrapper.text()).toContain('Lock now');
  });

  test('preserves q search query while changing vault scope links', async () => {
    const wrapper = await mountSidebarAt('/vault?scope=all&type=all&folder=all&q=hub');

    const favoritesLink = wrapper.findAll('a').find((node) => node.text().trim() === 'Favorites');
    expect(favoritesLink).toBeDefined();
    expect(favoritesLink!.attributes('href')).toContain('q=hub');
  });

  test('creates a folder through the new-folder dialog flow', async () => {
    const wrapper = await mountSidebarAt('/vault');

    const trigger = wrapper.findAll('button').find((node) => node.text().trim() === 'New folder');
    expect(trigger).toBeDefined();
    await trigger!.trigger('click');
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
});
