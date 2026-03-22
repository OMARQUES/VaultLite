import { computed, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as browserCrypto from '../lib/browser-crypto';

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
        customFields?: Array<{
          label: string;
          value: string;
        }>;
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
        customFields?: Array<{
          label: string;
          value: string;
        }>;
      };
    }
  | {
      itemId: string;
      itemType: 'card';
      revision: number;
      createdAt: string;
      updatedAt: string;
      payload: {
        title: string;
        cardholderName: string;
        brand: string;
        number: string;
        expiryMonth: string;
        expiryYear: string;
        securityCode: string;
        notes: string;
        customFields?: Array<{
          label: string;
          value: string;
        }>;
      };
    }
  | {
      itemId: string;
      itemType: 'secure_note';
      revision: number;
      createdAt: string;
      updatedAt: string;
      payload: {
        title: string;
        content: string;
        customFields?: Array<{
          label: string;
          value: string;
        }>;
      };
    };

interface WorkspaceTombstone {
  itemId: string;
  itemType: 'login' | 'document' | 'card' | 'secure_note';
  revision: number;
  deletedAt: string;
}

let currentWorkspace: ReturnType<typeof createWorkspace>;
let mediaQueryMatches = false;
let compactDesktopQueryMatches = false;
const attachmentClientMock = {
  initAttachmentUpload: vi.fn(),
  uploadAttachmentContent: vi.fn(),
  finalizeAttachmentUpload: vi.fn(),
  getAttachmentEnvelope: vi.fn(),
  listAttachmentUploads: vi.fn(),
};

vi.mock('../lib/vault-client', () => ({
  createVaultLiteVaultClient: () => attachmentClientMock,
}));

vi.mock('../lib/vault-workspace', () => ({
  createVaultWorkspace: () => currentWorkspace,
}));

function createWorkspace(items: WorkspaceItem[], tombstones: WorkspaceTombstone[] = []) {
  const state = reactive({
    isLoading: false,
    lastError: null as string | null,
    items: [...items],
    tombstones: [...tombstones],
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
          : item.itemType === 'document' || item.itemType === 'secure_note'
            ? [item.payload.title, item.payload.content]
            : [
                item.payload.title,
                item.payload.cardholderName,
                item.payload.brand,
                item.payload.number,
                item.payload.notes,
              ];
      return values.some((value) => value.toLowerCase().includes(query));
    });
  });

  return {
    state,
    searchQuery,
    filteredItems,
    load: vi.fn().mockResolvedValue(undefined),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    triggerSync: vi.fn().mockResolvedValue(undefined),
    createLogin: vi.fn(),
    createDocument: vi.fn(),
    createCard: vi.fn(),
    createSecureNote: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    restoreItem: vi.fn(),
    setSearchQuery(query: string) {
      searchQuery.value = query;
    },
  };
}

function installMatchMediaStub() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('(max-width: 760px)')
        ? mediaQueryMatches
        : query.includes('(max-width: 1365px)')
          ? compactDesktopQueryMatches
          : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
      addListener: () => undefined,
      removeListener: () => undefined,
    })),
  );
}

function createSessionStore(role: 'owner' | 'user' = 'user') {
  return {
    state: reactive({
      phase: 'ready' as const,
      username: 'alice',
      userId: 'user_1',
      role,
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
    getRuntimeMetadata: vi.fn().mockResolvedValue({
      serverUrl: 'https://vaultlite.local',
      deploymentFingerprint: 'development_deployment',
    }),
    resolveSiteIcons: vi.fn().mockResolvedValue({ ok: true, icons: [] }),
    discoverSiteIcons: vi.fn().mockResolvedValue({ ok: true, icons: [], unresolved: [] }),
    listManualSiteIcons: vi.fn().mockResolvedValue({ ok: true, icons: [] }),
    upsertManualSiteIcon: vi.fn(),
    removeManualSiteIcon: vi.fn(),
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

async function mountVaultAt(
  path: string,
  items: WorkspaceItem[],
  options: {
    role?: 'owner' | 'user';
    tombstones?: WorkspaceTombstone[];
  } = {},
) {
  currentWorkspace = createWorkspace(items, options.tombstones ?? []);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/vault', component: VaultShellPage },
      { path: '/vault/new/login', component: VaultShellPage },
      { path: '/vault/new/document', component: VaultShellPage },
      { path: '/vault/new/card', component: VaultShellPage },
      { path: '/vault/new/secure-note', component: VaultShellPage },
      { path: '/vault/item/:itemId', component: VaultShellPage },
      { path: '/vault/item/:itemId/edit', component: VaultShellPage },
      { path: '/admin/overview', component: { template: '<div>admin</div>' } },
    ],
  });

  await router.push(path);
  await router.isReady();

  const wrapper = mount(VaultShellPage, {
    global: {
      plugins: [router],
      provide: {
        [sessionStoreKey as symbol]: createSessionStore(options.role),
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
    mediaQueryMatches = false;
    compactDesktopQueryMatches = false;
    installMatchMediaStub();
    attachmentClientMock.initAttachmentUpload.mockReset();
    attachmentClientMock.uploadAttachmentContent.mockReset();
    attachmentClientMock.finalizeAttachmentUpload.mockReset();
    attachmentClientMock.getAttachmentEnvelope.mockReset();
    attachmentClientMock.listAttachmentUploads.mockReset();
    attachmentClientMock.listAttachmentUploads.mockResolvedValue({ uploads: [] });
    attachmentClientMock.finalizeAttachmentUpload.mockResolvedValue({
      ok: true,
      result: 'success_changed',
      upload: {
        uploadId: 'attachment_default',
        itemId: 'item_doc_1',
        fileName: 'default.txt',
        lifecycleState: 'attached',
        contentType: 'text/plain',
        size: 1,
        expiresAt: '2026-03-15T12:15:00.000Z',
        uploadedAt: '2026-03-15T12:00:10.000Z',
        attachedAt: '2026-03-15T12:00:20.000Z',
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:20.000Z',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  test('shows the vault empty state without surfacing Account Kit reissue in the vault', async () => {
    const { wrapper } = await mountVaultAt('/vault', []);

    expect(wrapper.text()).toContain('No items yet');
    expect(wrapper.text()).toContain('Create your first login, document, card, or secure note.');
    expect(wrapper.text()).toContain('New login');
    expect(wrapper.text()).toContain('New document');
    expect(wrapper.text()).toContain('New card');
    expect(wrapper.text()).toContain('New secure note');
    expect(wrapper.findAll('.vault-empty-create-card')).toHaveLength(4);
    expect(wrapper.text()).not.toContain('Reissue Account Kit');
  });

  test('keeps card-style empty state when search has no matches', async () => {
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

    expect(wrapper.text()).toContain('No matches found');
    expect(wrapper.findAll('.vault-empty-create-card')).toHaveLength(4);
    expect(wrapper.text()).not.toContain('Clear filters');
  });

  test('shows contextual create card when type filter is active', async () => {
    const { wrapper } = await mountVaultAt('/vault?type=login&scope=all&folder=all', [
      {
        itemId: 'item_1',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Docs',
          content: 'content',
        },
      },
    ]);

    expect(wrapper.findAll('.vault-empty-create-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('New login');
    expect(wrapper.text()).not.toContain('New document');
    expect(wrapper.text()).not.toContain('New card');
    expect(wrapper.text()).not.toContain('New secure note');
  });

  test('shows active filter summary to disambiguate scope, type and folder context', async () => {
    const { wrapper } = await mountVaultAt('/vault?scope=all&type=login&folder=personal&q=hub', [
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

    expect(wrapper.text()).toContain('All items');
    expect(wrapper.text()).toContain('Type: Login');
    expect(wrapper.text()).toContain('Folder: Personal');
  });

  test('uses mobile task-first header and sheet-based secondary actions', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    const { wrapper } = await mountVaultAt('/vault', []);
    await flushPromises();

    expect(wrapper.find('[data-testid="vault-mobile-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vault-mobile-filter-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vault-mobile-create-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vault-mobile-account-button"]').exists()).toBe(true);

    await wrapper.get('[data-testid="vault-mobile-filter-button"]').trigger('click');
    expect(wrapper.find('[data-testid="vault-mobile-filter-sheet"]').exists()).toBe(true);

    await wrapper.get('[data-testid="vault-mobile-create-button"]').trigger('click');
    expect(wrapper.find('[data-testid="vault-mobile-create-sheet"]').exists()).toBe(true);
  });

  test('shows favorite indicator on mobile list rows for favorited items', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    window.localStorage.setItem(
      'vaultlite:vault-ui:alice',
      JSON.stringify({
        favorites: ['item_1'],
        trashed: [],
        folderAssignments: {},
        folders: [
          { id: 'work', name: 'Work' },
          { id: 'personal', name: 'Personal' },
          { id: 'family', name: 'Family' },
        ],
      }),
    );

    const { wrapper } = await mountVaultAt('/vault', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
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
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Google',
          username: 'alice',
          password: 'secret',
          urls: ['https://google.com'],
          notes: '',
        },
      },
    ]);

    expect(wrapper.find('[data-testid="vault-mobile-favorite-indicator-item_1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vault-mobile-favorite-indicator-item_2"]').exists()).toBe(false);
  });

  test('blocks unsafe URL schemes and embedded credentials in item URL opener', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const firstMount = await mountVaultAt('/vault/item/item_1', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Unsafe Link',
          username: 'alice',
          password: 'secret',
          urls: ['javascript:alert(1)'],
          notes: '',
        },
      },
    ]);

    await firstMount.wrapper.get('button[aria-label="Open URL"]').trigger('click');
    expect(openSpy).not.toHaveBeenCalled();
    expect(firstMount.wrapper.text()).toContain('Invalid or unsafe URL');

    const secondMount = await mountVaultAt('/vault/item/item_2', [
      {
        itemId: 'item_2',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Credentials URL',
          username: 'alice',
          password: 'secret',
          urls: ['https://alice:secret@example.com'],
          notes: '',
        },
      },
    ]);
    await secondMount.wrapper.get('button[aria-label="Open URL"]').trigger('click');
    expect(openSpy).not.toHaveBeenCalled();
    expect(secondMount.wrapper.text()).toContain('Invalid or unsafe URL');
  });

  test('opens only absolute http/https URLs with noopener,noreferrer', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { wrapper } = await mountVaultAt('/vault/item/item_1', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Safe Link',
          username: 'alice',
          password: 'secret',
          urls: ['https://vaultlite.example.com/login'],
          notes: '',
        },
      },
    ]);

    await wrapper.get('button[aria-label="Open URL"]').trigger('click');
    expect(openSpy).toHaveBeenCalledWith(
      'https://vaultlite.example.com/login',
      '_blank',
      'noopener,noreferrer',
    );
  });

  test('hides default filter summary chips on mobile list when no filters are active', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    const { wrapper } = await mountVaultAt('/vault', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
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

    expect(wrapper.findAll('.vault-active-summary__chip')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('All items');
    expect(wrapper.text()).not.toContain('All folders');
  });

  test('keeps mobile filter sheet open while applying filters and exposes clear action without duplicate done buttons', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    const { wrapper, router } = await mountVaultAt('/vault', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
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

    await wrapper.get('[data-testid="vault-mobile-filter-button"]').trigger('click');
    expect(wrapper.find('[data-testid="vault-mobile-filter-sheet"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Clear all');
    expect(wrapper.text()).not.toContain('Done');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Favorites')!
      .trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.scope).toBe('favorites');
    expect(wrapper.find('[data-testid="vault-mobile-filter-sheet"]').exists()).toBe(true);
  });

  test('keeps account sheet focused on account/session actions only', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    const { wrapper } = await mountVaultAt('/vault', []);

    await wrapper.get('[data-testid="vault-mobile-account-button"]').trigger('click');

    expect(wrapper.find('[data-testid="vault-mobile-account-sheet"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.text()).toContain('Lock now');
    expect(wrapper.text()).not.toContain('Clear filters');
  });

  test('allows owner to open admin from mobile account sheet', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    const { wrapper, router } = await mountVaultAt('/vault', [], { role: 'owner' });

    await wrapper.get('[data-testid="vault-mobile-account-button"]').trigger('click');
    expect(wrapper.find('[data-testid="vault-mobile-account-sheet"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vault-mobile-admin-button"]').exists()).toBe(true);

    await wrapper.get('[data-testid="vault-mobile-admin-button"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/admin/overview');
  });

  test('uses top app bar save on mobile editor without duplicated header title', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    const { wrapper } = await mountVaultAt('/vault/new/login', []);

    expect(wrapper.find('[data-testid="vault-mobile-editor-save"]').exists()).toBe(true);
    expect(wrapper.find('.mobile-surface-header__title').exists()).toBe(false);
    expect(wrapper.find('.editor-action-bar').exists()).toBe(false);
  });

  test('moves mobile detail delete action into overflow sheet instead of body action cluster', async () => {
    mediaQueryMatches = true;
    installMatchMediaStub();
    const { wrapper } = await mountVaultAt('/vault/item/item_1', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Hub',
          username: 'alice',
          password: 'secret',
          urls: ['https://hub.example'],
          notes: '',
        },
      },
    ]);

    expect(wrapper.find('[data-testid="vault-mobile-detail-overflow"]').exists()).toBe(true);
    expect(wrapper.find('.detail-actions .detail-card__trash-action').exists()).toBe(false);

    await wrapper.get('[data-testid="vault-mobile-detail-overflow"]').trigger('click');
    expect(wrapper.find('[data-testid="vault-mobile-detail-action-sheet"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Move to trash');
  });

  test('shows compact desktop back-to-list action when detail is open in single-surface viewport', async () => {
    mediaQueryMatches = false;
    compactDesktopQueryMatches = true;
    installMatchMediaStub();
    const { wrapper, router } = await mountVaultAt('/vault/item/item_1', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Hub',
          username: 'alice',
          password: 'secret',
          urls: ['https://hub.example'],
          notes: '',
        },
      },
    ]);

    expect(wrapper.find('[data-testid="vault-compact-back-button"]').exists()).toBe(true);
    await wrapper.get('[data-testid="vault-compact-back-button"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/vault');
  });

  test('keeps detail header primary actions grouped in a horizontal row on compact desktop', async () => {
    mediaQueryMatches = false;
    compactDesktopQueryMatches = true;
    installMatchMediaStub();
    const { wrapper } = await mountVaultAt('/vault/item/item_1', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Hub',
          username: 'alice',
          password: 'secret',
          urls: ['https://hub.example'],
          notes: '',
        },
      },
    ]);

    expect(wrapper.find('.detail-actions.detail-actions--keep-row').exists()).toBe(true);
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

  test('allows deselecting the active item by clicking the selected row again', async () => {
    const { wrapper, router } = await mountVaultAt('/vault/item/item_1?scope=all&type=all&folder=all&q=hub', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Hub',
          username: 'alice',
          password: 'secret',
          urls: ['https://hub.example'],
          notes: '',
        },
      },
    ]);

    const selectedRow = wrapper.find('.vault-list-row.is-active .vault-list-row__main');
    expect(selectedRow.exists()).toBe(true);
    await selectedRow.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/vault');
    expect(router.currentRoute.value.query.q).toBe('hub');
  });

  test('uses icon-only edit action on item detail header', async () => {
    const { wrapper } = await mountVaultAt('/vault/item/item_1', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Hub',
          username: 'alice',
          password: 'secret',
          urls: ['https://hub.example'],
          notes: '',
        },
      },
    ]);

    expect(wrapper.find('button[aria-label="Edit item"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Edit');
  });

  test('shows favicon/avatar at the left of editable title on editor header', async () => {
    const { wrapper } = await mountVaultAt('/vault/item/item_1/edit', [
      {
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
        payload: {
          title: 'Hub',
          username: 'alice',
          password: 'secret',
          urls: ['https://hub.example'],
          notes: '',
        },
      },
    ]);

    expect(wrapper.find('.detail-card__editor-avatar').exists()).toBe(true);
    const avatar = wrapper.find('.detail-card__editor-avatar');
    const hasImage = avatar.find('img').exists();
    const hasMonogramText = avatar.text().trim().length > 0;
    expect(hasImage || hasMonogramText).toBe(true);
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

    const titleInput = wrapper.get('.detail-card__title-input');
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
    const { wrapper } = await mountVaultAt('/vault/item/item_1?scope=trash', [], {
      tombstones: [
        {
          itemId: 'item_1',
          itemType: 'login',
          revision: 3,
          deletedAt: '2026-03-15T10:00:00.000Z',
        },
      ],
    });

    expect(wrapper.text()).toContain('Restore');
    expect(wrapper.text()).toContain('Permanent delete is not available in V1.');
    expect(wrapper.text()).not.toContain('Edit');
  });

  test('renders attachment lifecycle states for document detail', async () => {
    attachmentClientMock.listAttachmentUploads.mockResolvedValueOnce({
      uploads: [
        {
          uploadId: 'attachment_1',
          itemId: 'item_doc_1',
          fileName: 'document.pdf',
          lifecycleState: 'uploaded',
          contentType: 'application/pdf',
          size: 1024,
          expiresAt: '2026-03-15T12:15:00.000Z',
          uploadedAt: '2026-03-15T12:00:30.000Z',
          attachedAt: null,
          createdAt: '2026-03-15T12:00:00.000Z',
          updatedAt: '2026-03-15T12:00:30.000Z',
        },
      ],
    });

    const { wrapper } = await mountVaultAt('/vault/item/item_doc_1', [
      {
        itemId: 'item_doc_1',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Document',
          content: 'content',
        },
      },
    ]);

    await flushPromises();

    expect(attachmentClientMock.listAttachmentUploads).toHaveBeenCalledWith('item_doc_1');
    expect(wrapper.text()).toContain('Attachments');
    expect(wrapper.text()).toContain('Uploaded');
    expect(wrapper.text()).toContain('application/pdf');
    expect(wrapper.text()).toContain('attachment_1');
    expect(wrapper.find('button[aria-label="Download attachment_1"]').exists()).toBe(true);
  });

  test('renders document preview and custom fields in detail view', async () => {
    const { wrapper } = await mountVaultAt('/vault/item/item_doc_1', [
      {
        itemId: 'item_doc_1',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Server Notes',
          content: 'Line one\nLine two',
          customFields: [
            { label: 'Environment', value: 'Production' },
            { label: 'Owner', value: 'Platform Team' },
          ],
        },
      },
    ]);

    await flushPromises();

    expect(wrapper.text()).toContain('Document preview');
    expect(wrapper.text()).toContain('Line one');
    expect(wrapper.text()).toContain('Environment');
    expect(wrapper.text()).toContain('Production');
    expect(wrapper.text()).toContain('Owner');
    expect(wrapper.text()).toContain('Platform Team');
    expect(wrapper.find('button[aria-label="Copy Environment"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Copy Owner"]').exists()).toBe(true);
  });

  test('creates document with custom fields', async () => {
    const { wrapper, workspace } = await mountVaultAt('/vault/new/document', []);

    workspace.createDocument.mockImplementation(async (payload: {
      title: string;
      content: string;
      customFields?: Array<{ label: string; value: string }>;
    }) => {
      workspace.state.items.push({
        itemId: 'item_doc_created_2',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-16T12:00:00.000Z',
        updatedAt: '2026-03-16T12:00:00.000Z',
        payload,
      });
    });

    await wrapper.get('.detail-card__title-input').setValue('Runbook');
    await wrapper.get('textarea').setValue('Main document body');

    await wrapper.get('button[aria-label="Add custom field"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Label');
    expect(wrapper.text()).not.toContain('Value');

    const customLabelInputs = wrapper.findAll('input[name="custom-field-label"]');
    const customValueInputs = wrapper.findAll('input[name="custom-field-value"]');
    expect(customLabelInputs.length).toBe(1);
    expect(customValueInputs.length).toBe(1);
    expect(customLabelInputs[0].attributes('placeholder')).toBe('Field name');
    expect(customValueInputs[0].attributes('placeholder')).toBe('Field value');

    await customLabelInputs[0].setValue('System');
    await customValueInputs[0].setValue('Payments');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Save')!
      .trigger('click');
    await flushPromises();

    expect(workspace.createDocument).toHaveBeenCalledWith({
      title: 'Runbook',
      content: 'Main document body',
      customFields: [{ label: 'System', value: 'Payments' }],
    });
  });

  test('shows compact module empty hints for custom fields and attachments', async () => {
    const { wrapper } = await mountVaultAt('/vault/new/document', []);

    expect(wrapper.text()).toContain('No custom fields yet.');
    expect(wrapper.text()).toContain('No attachments yet.');
  });

  test('creates login with custom fields', async () => {
    const { wrapper, workspace } = await mountVaultAt('/vault/new/login', []);

    workspace.createLogin.mockImplementation(async (payload: {
      title: string;
      username: string;
      password: string;
      urls: string[];
      notes: string;
      customFields?: Array<{ label: string; value: string }>;
    }) => {
      workspace.state.items.push({
        itemId: 'item_login_created_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-16T12:00:00.000Z',
        updatedAt: '2026-03-16T12:00:00.000Z',
        payload,
      });
    });

    await wrapper.get('.detail-card__title-input').setValue('AWS Console');
    await wrapper.get('input[autocomplete="username"]').setValue('alice@example.com');
    await wrapper.get('input[autocomplete="current-password"]').setValue('super-secret');

    await wrapper.get('button[aria-label="Add custom field"]').trigger('click');
    await flushPromises();

    const customLabelInputs = wrapper.findAll('input[name="custom-field-label"]');
    const customValueInputs = wrapper.findAll('input[name="custom-field-value"]');
    expect(customLabelInputs.length).toBe(1);
    expect(customValueInputs.length).toBe(1);

    await customLabelInputs[0].setValue('Tenant');
    await customValueInputs[0].setValue('Production');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Save')!
      .trigger('click');
    await flushPromises();

    expect(workspace.createLogin).toHaveBeenCalledWith({
      title: 'AWS Console',
      username: 'alice@example.com',
      password: 'super-secret',
      urls: [],
      notes: '',
      customFields: [{ label: 'Tenant', value: 'Production' }],
    });
  });

  test('shows attachments for login item detail', async () => {
    attachmentClientMock.listAttachmentUploads.mockResolvedValueOnce({
      uploads: [
        {
          uploadId: 'attachment_login_1',
          itemId: 'item_login_1',
          fileName: 'login.txt',
          lifecycleState: 'uploaded',
          contentType: 'text/plain',
          size: 64,
          expiresAt: '2026-03-15T12:15:00.000Z',
          uploadedAt: '2026-03-15T12:00:30.000Z',
          attachedAt: null,
          createdAt: '2026-03-15T12:00:00.000Z',
          updatedAt: '2026-03-15T12:00:30.000Z',
        },
      ],
    });

    const { wrapper } = await mountVaultAt('/vault/item/item_login_1', [
      {
        itemId: 'item_login_1',
        itemType: 'login',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Login',
          username: 'alice',
          password: 'secret',
          urls: [],
          notes: '',
          customFields: [],
        },
      },
    ]);

    await flushPromises();

    expect(attachmentClientMock.listAttachmentUploads).toHaveBeenCalledWith('item_login_1');
    expect(wrapper.text()).toContain('Attachments');
    expect(wrapper.text()).toContain('Uploaded');
  });

  test('queues attachments during document creation and uploads them after save', async () => {
    vi.spyOn(browserCrypto, 'encryptAttachmentBlobPayload').mockResolvedValue(
      'encrypted_blob_payload',
    );
    attachmentClientMock.initAttachmentUpload.mockResolvedValueOnce({
      uploadId: 'attachment_queued_1',
      itemId: 'item_doc_created_1',
      fileName: 'notes.txt',
      lifecycleState: 'pending',
      contentType: 'text/plain',
      size: 12,
      expiresAt: '2026-03-15T12:15:00.000Z',
      uploadedAt: null,
      attachedAt: null,
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
      uploadToken: 'upload_token_created_1',
    });
    attachmentClientMock.uploadAttachmentContent.mockResolvedValueOnce({
      uploadId: 'attachment_queued_1',
      itemId: 'item_doc_created_1',
      fileName: 'notes.txt',
      lifecycleState: 'uploaded',
      contentType: 'text/plain',
      size: 12,
      expiresAt: '2026-03-15T12:15:00.000Z',
      uploadedAt: '2026-03-15T12:00:10.000Z',
      attachedAt: null,
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:10.000Z',
    });
    attachmentClientMock.finalizeAttachmentUpload.mockResolvedValueOnce({
      ok: true,
      result: 'success_changed',
      upload: {
        uploadId: 'attachment_queued_1',
        itemId: 'item_doc_created_1',
        fileName: 'notes.txt',
        lifecycleState: 'attached',
        contentType: 'text/plain',
        size: 12,
        expiresAt: '2026-03-15T12:15:00.000Z',
        uploadedAt: '2026-03-15T12:00:10.000Z',
        attachedAt: '2026-03-15T12:00:12.000Z',
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:12.000Z',
      },
    });
    attachmentClientMock.listAttachmentUploads.mockResolvedValue({
      uploads: [
        {
          uploadId: 'attachment_queued_1',
          itemId: 'item_doc_created_1',
          fileName: 'notes.txt',
          lifecycleState: 'attached',
          contentType: 'text/plain',
          size: 12,
          expiresAt: '2026-03-15T12:15:00.000Z',
          uploadedAt: '2026-03-15T12:00:10.000Z',
          attachedAt: '2026-03-15T12:00:12.000Z',
          createdAt: '2026-03-15T12:00:00.000Z',
          updatedAt: '2026-03-15T12:00:12.000Z',
        },
      ],
    });

    const { wrapper, workspace, router } = await mountVaultAt('/vault/new/document', []);

    workspace.createDocument.mockImplementation(async (payload: {
      title: string;
      content: string;
      customFields?: Array<{ label: string; value: string }>;
    }) => {
      workspace.state.items.push({
        itemId: 'item_doc_created_1',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-16T12:00:00.000Z',
        updatedAt: '2026-03-16T12:00:00.000Z',
        payload,
      });
    });

    await wrapper.get('.detail-card__title-input').setValue('Architecture Notes');
    await wrapper.get('textarea').setValue('Initial draft');

    const fileInput = wrapper.get('input[type="file"]');
    const file = new File(['queued file'], 'notes.txt', {
      type: 'text/plain',
      lastModified: 456,
    });
    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [file],
    });
    await fileInput.trigger('change');
    await flushPromises();

    expect(wrapper.text()).toContain('Queued');
    expect(wrapper.text()).toContain('text/plain');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Save')!
      .trigger('click');
    await flushPromises();

    expect(workspace.createDocument).toHaveBeenCalledWith({
      title: 'Architecture Notes',
      content: 'Initial draft',
      customFields: [],
    });
    expect(attachmentClientMock.initAttachmentUpload).toHaveBeenCalledWith({
      itemId: 'item_doc_created_1',
      fileName: 'notes.txt',
      contentType: 'text/plain',
      size: 11,
      idempotencyKey: 'item-attachment:item_doc_created_1:text/plain:11:456',
    });
    expect(attachmentClientMock.uploadAttachmentContent).toHaveBeenCalledWith(
      'attachment_queued_1',
      {
        uploadToken: 'upload_token_created_1',
        encryptedEnvelope: 'encrypted_blob_payload',
      },
    );
    expect(attachmentClientMock.finalizeAttachmentUpload).toHaveBeenCalledWith(
      'attachment_queued_1',
      'item_doc_created_1',
    );
    expect(router.currentRoute.value.path).toBe('/vault/item/item_doc_created_1');
  });

  test('uploads encrypted document attachment through init and upload endpoints', async () => {
    vi.spyOn(browserCrypto, 'encryptAttachmentBlobPayload').mockResolvedValue(
      'encrypted_blob_payload',
    );
    attachmentClientMock.initAttachmentUpload.mockResolvedValueOnce({
      uploadId: 'attachment_1',
      itemId: 'item_doc_1',
      fileName: 'note.txt',
      lifecycleState: 'pending',
      contentType: 'text/plain',
      size: 5,
      expiresAt: '2026-03-15T12:15:00.000Z',
      uploadedAt: null,
      attachedAt: null,
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:00.000Z',
      uploadToken: 'upload_token_1',
    });
    attachmentClientMock.uploadAttachmentContent.mockResolvedValueOnce({
      uploadId: 'attachment_1',
      itemId: 'item_doc_1',
      fileName: 'note.txt',
      lifecycleState: 'uploaded',
      contentType: 'text/plain',
      size: 5,
      expiresAt: '2026-03-15T12:15:00.000Z',
      uploadedAt: '2026-03-15T12:00:10.000Z',
      attachedAt: null,
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:10.000Z',
    });
    attachmentClientMock.finalizeAttachmentUpload.mockResolvedValueOnce({
      ok: true,
      result: 'success_changed',
      upload: {
        uploadId: 'attachment_1',
        itemId: 'item_doc_1',
        fileName: 'note.txt',
        lifecycleState: 'attached',
        contentType: 'text/plain',
        size: 5,
        expiresAt: '2026-03-15T12:15:00.000Z',
        uploadedAt: '2026-03-15T12:00:10.000Z',
        attachedAt: '2026-03-15T12:00:12.000Z',
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:12.000Z',
      },
    });
    attachmentClientMock.listAttachmentUploads
      .mockResolvedValueOnce({ uploads: [] })
      .mockResolvedValueOnce({
        uploads: [
          {
            uploadId: 'attachment_1',
            itemId: 'item_doc_1',
            fileName: 'note.txt',
            lifecycleState: 'attached',
            contentType: 'text/plain',
            size: 5,
            expiresAt: '2026-03-15T12:15:00.000Z',
            uploadedAt: '2026-03-15T12:00:10.000Z',
            attachedAt: '2026-03-15T12:00:12.000Z',
            createdAt: '2026-03-15T12:00:00.000Z',
            updatedAt: '2026-03-15T12:00:12.000Z',
          },
        ],
      });

    const { wrapper } = await mountVaultAt('/vault/item/item_doc_1/edit', [
      {
        itemId: 'item_doc_1',
        itemType: 'document',
        revision: 1,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        payload: {
          title: 'Document',
          content: 'content',
        },
      },
    ]);

    await flushPromises();

    const fileInput = wrapper.get('input[type="file"]');
    const file = new File(['hello'], 'note.txt', {
      type: 'text/plain',
      lastModified: 123,
    });
    Object.defineProperty(fileInput.element, 'files', {
      configurable: true,
      value: [file],
    });
    await fileInput.trigger('change');
    await flushPromises();

    expect(attachmentClientMock.initAttachmentUpload).toHaveBeenCalledWith({
      itemId: 'item_doc_1',
      fileName: 'note.txt',
      contentType: 'text/plain',
      size: 5,
      idempotencyKey: 'item-attachment:item_doc_1:text/plain:5:123',
    });
    expect(attachmentClientMock.uploadAttachmentContent).toHaveBeenCalledWith('attachment_1', {
      uploadToken: 'upload_token_1',
      encryptedEnvelope: 'encrypted_blob_payload',
    });
    expect(attachmentClientMock.finalizeAttachmentUpload).toHaveBeenCalledWith(
      'attachment_1',
      'item_doc_1',
    );
    expect(wrapper.text()).toContain('Attached');
  });
});
