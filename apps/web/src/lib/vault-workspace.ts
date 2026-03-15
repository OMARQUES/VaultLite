import { computed, reactive, readonly, ref } from 'vue';

import { decryptVaultItemPayload, encryptVaultItemPayload } from './browser-crypto';
import type { SessionStore } from './session-store';
import type { VaultLiteVaultClient } from './vault-client';
import { buildVaultSearchIndex, queryVaultSearchIndex } from './vault-search';

export interface LoginVaultItemPayload {
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
}

export interface DocumentVaultItemPayload {
  title: string;
  content: string;
}

export type VaultWorkspaceItem =
  | {
      itemId: string;
      itemType: 'login';
      revision: number;
      createdAt: string;
      updatedAt: string;
      payload: LoginVaultItemPayload;
    }
  | {
      itemId: string;
      itemType: 'document';
      revision: number;
      createdAt: string;
      updatedAt: string;
      payload: DocumentVaultItemPayload;
    };

export interface VaultWorkspaceState {
  isLoading: boolean;
  lastError: string | null;
  items: VaultWorkspaceItem[];
}

export interface VaultWorkspace {
  state: VaultWorkspaceState;
  searchQuery: Readonly<{ value: string }>;
  filteredItems: Readonly<{ value: VaultWorkspaceItem[] }>;
  load(): Promise<void>;
  createLogin(payload: LoginVaultItemPayload): Promise<void>;
  createDocument(payload: DocumentVaultItemPayload): Promise<void>;
  updateItem(item: VaultWorkspaceItem): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  setSearchQuery(query: string): void;
}

function normalizeLoginPayload(payload: Partial<LoginVaultItemPayload> & Pick<LoginVaultItemPayload, 'title' | 'username' | 'password'>): LoginVaultItemPayload {
  return {
    title: payload.title,
    username: payload.username,
    password: payload.password,
    urls: payload.urls ?? [],
    notes: payload.notes ?? '',
  };
}

async function decryptRecord(
  accountKey: string,
  record: {
    itemId: string;
    itemType: 'login' | 'document';
    revision: number;
    encryptedPayload: string;
    createdAt: string;
    updatedAt: string;
  },
): Promise<VaultWorkspaceItem> {
  if (record.itemType === 'login') {
    return {
      itemId: record.itemId,
      itemType: 'login',
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      payload: await decryptVaultItemPayload<LoginVaultItemPayload>({
        accountKey,
        encryptedPayload: record.encryptedPayload,
      }),
    };
  }

  return {
    itemId: record.itemId,
    itemType: 'document',
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    payload: await decryptVaultItemPayload<DocumentVaultItemPayload>({
      accountKey,
      encryptedPayload: record.encryptedPayload,
    }),
  };
}

export function createVaultWorkspace(input: {
  sessionStore: SessionStore;
  vaultClient: VaultLiteVaultClient;
}): VaultWorkspace {
  const searchQuery = ref('');
  const state = reactive<VaultWorkspaceState>({
    isLoading: false,
    lastError: null,
    items: [],
  });
  const searchIndex = ref(buildVaultSearchIndex([]));

  function rebuildIndex() {
    searchIndex.value = buildVaultSearchIndex(state.items);
  }

  const filteredItems = computed(() => {
    const matchingIds = new Set(queryVaultSearchIndex(searchIndex.value, searchQuery.value));
    return state.items.filter((item) => matchingIds.has(item.itemId));
  });

  async function load() {
    state.isLoading = true;
    state.lastError = null;

    try {
      const { accountKey } = input.sessionStore.getUnlockedVaultContext();
      const response = await input.vaultClient.listItems();
      state.items = await Promise.all(
        response.items.map((item) =>
          decryptRecord(accountKey, item),
        ),
      );
      rebuildIndex();
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      state.isLoading = false;
    }
  }

  async function createItem(itemType: 'login' | 'document', payload: LoginVaultItemPayload | DocumentVaultItemPayload) {
    state.lastError = null;
    const { accountKey } = input.sessionStore.getUnlockedVaultContext();
    const encryptedPayload = await encryptVaultItemPayload({
      accountKey,
      itemType,
      payload,
    });
    const created = await input.vaultClient.createItem({
      itemType,
      encryptedPayload,
    });
    state.items = [
      ...state.items,
      await decryptRecord(accountKey, created),
    ];
    rebuildIndex();
  }

  return {
    state,
    async load() {
      await load();
    },
    async createLogin(payload) {
      await createItem('login', normalizeLoginPayload(payload));
    },
    async createDocument(payload) {
      await createItem('document', payload);
    },
    async updateItem(item) {
      state.lastError = null;

      try {
        const { accountKey } = input.sessionStore.getUnlockedVaultContext();
        const encryptedPayload = await encryptVaultItemPayload({
          accountKey,
          itemType: item.itemType,
          payload: item.payload,
        });
        const updated = await input.vaultClient.updateItem({
          itemId: item.itemId,
          itemType: item.itemType,
          encryptedPayload,
          expectedRevision: item.revision,
        });
        const decrypted = await decryptRecord(accountKey, updated);
        state.items = state.items.map((current) =>
          current.itemId === decrypted.itemId ? decrypted : current,
        );
        rebuildIndex();
      } catch (error) {
        state.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    },
    async deleteItem(itemId) {
      state.lastError = null;
      await input.vaultClient.deleteItem(itemId);
      state.items = state.items.filter((item) => item.itemId !== itemId);
      rebuildIndex();
    },
    searchQuery: readonly(searchQuery),
    filteredItems,
    setSearchQuery(query) {
      searchQuery.value = query;
    },
  };
}
