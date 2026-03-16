import { computed, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { sessionStoreKey } from '../app-context';
import VaultShellPage from './VaultShellPage.vue';

type WorkspaceItem =
  | {
      itemId: string;
      itemType: 'login';
      revision: number;
      createdAt: string;
      updatedAt: string;
      payload: {
        title: string;
        username: string;
        password: string;
        urls: string[];
        notes: string;
      };
    }
  | {
      itemId: string;
      itemType: 'document';
      revision: number;
      createdAt: string;
      updatedAt: string;
      payload: {
        title: string;
        content: string;
      };
    };

let currentWorkspace: ReturnType<typeof createWorkspace>;

vi.mock('../lib/vault-client', () => ({
  createVaultLiteVaultClient: () => ({}),
}));

vi.mock('../lib/vault-workspace', () => ({
  createVaultWorkspace: () => currentWorkspace,
}));

function createWorkspace(items: WorkspaceItem[]) {
  const state = reactive({
    isLoading: false,
    lastError: null as string | null,
    items: [...items],
  });
  const searchQuery = ref('');
  const filteredItems = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) {
      return state.items;
    }

    return state.items.filter((item) => {
      const values =
        item.itemType === 'login'
          ? [item.payload.title, item.payload.username, item.payload.urls.join(' '), item.payload.notes]
          : [item.payload.title, item.payload.content];
      return values.some((value) => value.toLowerCase().includes(query));
    });
  });

  return {
    state,
    searchQuery,
    filteredItems,
    load: vi.fn().mockResolvedValue(undefined),
    createLogin: vi.fn(),
    createDocument: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    setSearchQuery(query: string) {
      searchQuery.value = query;
    },
  };
}

function createSessionStore() {
  return {
    state: reactive({
      phase: 'ready' as const,
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

async function mountVaultAt(path: string, items: WorkspaceItem[]) {
  currentWorkspace = createWorkspace(items);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/vault', component: VaultShellPage },
      { path: '/vault/new/login', component: VaultShellPage },
      { path: '/vault/new/document', component: VaultShellPage },
      { path: '/vault/item/:itemId', component: VaultShellPage },
      { path: '/vault/item/:itemId/edit', component: VaultShellPage },
    ],
  });

  await router.push(path);
  await router.isReady();

  const wrapper = mount(VaultShellPage, {
    global: {
      plugins: [router],
      provide: {
        [sessionStoreKey as symbol]: createSessionStore(),
      },
    },
    attachTo: document.body,
  });

  await flushPromises();

  return { wrapper, router, workspace: currentWorkspace };
}

describe('VaultShellPage', () => {
  beforeEach(() => {
    currentWorkspace = createWorkspace([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  test('shows the vault empty state without surfacing Account Kit reissue in the vault', async () => {
    const { wrapper } = await mountVaultAt('/vault', []);

    expect(wrapper.text()).toContain('Vault');
    expect(wrapper.text()).toContain('Your vault is empty');
    expect(wrapper.text()).toContain('Create your first item');
    expect(wrapper.text()).toContain('New');
    expect(wrapper.text()).not.toContain('Reissue Account Kit');
  });

  test('shows the empty search state with a reset filters action', async () => {
    const { wrapper } = await mountVaultAt('/vault', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 3,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'GitHub',
          username: 'alice',
          password: 'secret',
          urls: ['https://github.com'],
          notes: '',
        },
      },
    ]);

    await wrapper.get('[data-testid="vault-search-input"]').setValue('missing');
    await flushPromises();

    expect(wrapper.text()).toContain('No results');
    expect(wrapper.text()).toContain('Reset filters');
  });

  test('syncs search state with q in route query and keeps q while opening item detail', async () => {
    const { wrapper, router } = await mountVaultAt('/vault?scope=all&type=all&folder=all&q=hub', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 3,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'GitHub',
          username: 'alice',
          password: 'secret',
          urls: ['https://github.com'],
          notes: '',
        },
      },
      {
        itemId: 'item_2',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-16T10:00:00.000Z',
        updatedAt: '2026-03-16T10:00:00.000Z',
        payload: {
          title: 'Google',
          username: 'alice',
          password: 'secret',
          urls: ['https://google.com'],
          notes: '',
        },
      },
    ]);

    await flushPromises();

    const searchInput = wrapper.get('[data-testid="vault-search-input"]');
    expect((searchInput.element as HTMLInputElement).value).toBe('hub');
    expect(wrapper.findAll('.vault-list-row')).toHaveLength(1);
    expect(wrapper.text()).toContain('GitHub');
    expect(wrapper.text()).not.toContain('Google');

    await searchInput.setValue('git');
    await flushPromises();

    expect(router.currentRoute.value.query.q).toBe('git');

    await wrapper.get('.vault-list-row__main').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toContain('/vault/item/item_1');
    expect(router.currentRoute.value.query.q).toBe('git');
  });

  test('asks for confirmation before discarding dirty edits', async () => {
    const { wrapper } = await mountVaultAt('/vault/item/item_1/edit', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 3,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'GitHub',
          username: 'alice',
          password: 'secret',
          urls: ['https://github.com'],
          notes: '',
        },
      },
    ]);

    const titleInput = wrapper.get('input[name="title"]');
    await titleInput.setValue('GitHub updated');
    const cancelButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel');
    expect(cancelButton).toBeDefined();
    await cancelButton!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Discard changes?');
    expect(wrapper.text()).toContain('Keep editing');
    expect(wrapper.text()).toContain('Discard changes');
  });

  test('renders trash context as read-only with restore as the primary action', async () => {
    window.localStorage.setItem(
      'vaultlite:vault-ui:alice',
      JSON.stringify({
        favorites: [],
        trashed: ['item_1'],
        folderAssignments: {},
        folders: [
          { id: 'work', name: 'Work' },
          { id: 'personal', name: 'Personal' },
          { id: 'family', name: 'Family' },
        ],
      }),
    );

    const { wrapper } = await mountVaultAt('/vault/item/item_1?scope=trash', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 3,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'GitHub',
          username: 'alice',
          password: 'secret',
          urls: ['https://github.com'],
          notes: '',
        },
      },
    ]);

    expect(wrapper.text()).toContain('Restore');
    expect(wrapper.text()).toContain('Delete permanently');
    expect(wrapper.text()).not.toContain('Edit');
  });
});
