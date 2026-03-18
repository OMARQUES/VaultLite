import { computed, reactive, readonly, ref } from 'vue';

import { decryptVaultItemPayload, encryptVaultItemPayload } from './browser-crypto';
import type { SessionStore } from './session-store';
import type { VaultLiteVaultClient } from './vault-client';
import { buildVaultSearchIndex, queryVaultSearchIndex } from './vault-search';

export interface VaultCustomField {
  label: string;
  value: string;
}

interface PayloadWithCustomFields {
  customFields: VaultCustomField[];
}

export interface LoginVaultItemPayload extends PayloadWithCustomFields {
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
}

export interface DocumentVaultItemPayload extends PayloadWithCustomFields {
  title: string;
  content: string;
}

export interface CardVaultItemPayload extends PayloadWithCustomFields {
  title: string;
  cardholderName: string;
  brand: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  securityCode: string;
  notes: string;
}

export interface SecureNoteVaultItemPayload extends PayloadWithCustomFields {
  title: string;
  content: string;
}

export type VaultPayloadByType = {
  login: LoginVaultItemPayload;
  document: DocumentVaultItemPayload;
  card: CardVaultItemPayload;
  secure_note: SecureNoteVaultItemPayload;
};

type VaultItemType = keyof VaultPayloadByType;

type VaultWorkspaceItemByType<T extends VaultItemType> = {
  itemId: string;
  itemType: T;
  revision: number;
  createdAt: string;
  updatedAt: string;
  payload: VaultPayloadByType[T];
};

export type VaultWorkspaceItem =
  | VaultWorkspaceItemByType<'login'>
  | VaultWorkspaceItemByType<'document'>
  | VaultWorkspaceItemByType<'card'>
  | VaultWorkspaceItemByType<'secure_note'>;

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
  createCard(payload: CardVaultItemPayload): Promise<void>;
  createSecureNote(payload: SecureNoteVaultItemPayload): Promise<void>;
  updateItem(item: VaultWorkspaceItem): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  setSearchQuery(query: string): void;
}

function normalizeCustomFields(fields: unknown): VaultCustomField[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields
    .map((field) => {
      const candidate = field as Partial<VaultCustomField>;
      return {
        label: typeof candidate.label === 'string' ? candidate.label : '',
        value: typeof candidate.value === 'string' ? candidate.value : '',
      };
    })
    .filter((field) => field.label.trim().length > 0 || field.value.trim().length > 0);
}

function normalizeLoginPayload(
  payload: Partial<LoginVaultItemPayload> &
    Pick<LoginVaultItemPayload, 'title' | 'username' | 'password'>,
): LoginVaultItemPayload {
  return {
    title: payload.title,
    username: payload.username,
    password: payload.password,
    urls: payload.urls ?? [],
    notes: payload.notes ?? '',
    customFields: normalizeCustomFields(payload.customFields),
  };
}

function normalizeDocumentPayload(
  payload: Partial<DocumentVaultItemPayload> &
    Pick<DocumentVaultItemPayload, 'title' | 'content'>,
): DocumentVaultItemPayload {
  return {
    title: payload.title,
    content: payload.content,
    customFields: normalizeCustomFields(payload.customFields),
  };
}

function normalizeCardPayload(
  payload: Partial<CardVaultItemPayload> &
    Pick<
      CardVaultItemPayload,
      'title' | 'cardholderName' | 'brand' | 'number' | 'expiryMonth' | 'expiryYear' | 'securityCode'
    >,
): CardVaultItemPayload {
  return {
    title: payload.title,
    cardholderName: payload.cardholderName,
    brand: payload.brand,
    number: payload.number,
    expiryMonth: payload.expiryMonth,
    expiryYear: payload.expiryYear,
    securityCode: payload.securityCode,
    notes: payload.notes ?? '',
    customFields: normalizeCustomFields(payload.customFields),
  };
}

function normalizeSecureNotePayload(
  payload: Partial<SecureNoteVaultItemPayload> &
    Pick<SecureNoteVaultItemPayload, 'title' | 'content'>,
): SecureNoteVaultItemPayload {
  return {
    title: payload.title,
    content: payload.content,
    customFields: normalizeCustomFields(payload.customFields),
  };
}

function normalizePayloadByType<T extends VaultItemType>(
  itemType: T,
  payload: unknown,
): VaultPayloadByType[T] {
  if (itemType === 'login') {
    return normalizeLoginPayload(payload as LoginVaultItemPayload) as VaultPayloadByType[T];
  }
  if (itemType === 'document') {
    return normalizeDocumentPayload(payload as DocumentVaultItemPayload) as VaultPayloadByType[T];
  }
  if (itemType === 'card') {
    return normalizeCardPayload(payload as CardVaultItemPayload) as VaultPayloadByType[T];
  }
  return normalizeSecureNotePayload(payload as SecureNoteVaultItemPayload) as VaultPayloadByType[T];
}

async function decryptRecord(
  accountKey: string,
  record: {
    itemId: string;
    itemType: VaultItemType;
    revision: number;
    encryptedPayload: string;
    createdAt: string;
    updatedAt: string;
  },
): Promise<VaultWorkspaceItem> {
  const payload = normalizePayloadByType(
    record.itemType,
    await decryptVaultItemPayload({
      accountKey,
      encryptedPayload: record.encryptedPayload,
    }),
  );

  return {
    itemId: record.itemId,
    itemType: record.itemType,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    payload,
  } as VaultWorkspaceItem;
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
      state.items = await Promise.all(response.items.map((item) => decryptRecord(accountKey, item)));
      rebuildIndex();
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      state.isLoading = false;
    }
  }

  async function createItem<T extends VaultItemType>(
    itemType: T,
    payload: VaultPayloadByType[T],
  ) {
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
    state.items = [...state.items, await decryptRecord(accountKey, created)];
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
      await createItem('document', normalizeDocumentPayload(payload));
    },
    async createCard(payload) {
      await createItem('card', normalizeCardPayload(payload));
    },
    async createSecureNote(payload) {
      await createItem('secure_note', normalizeSecureNotePayload(payload));
    },
    async updateItem(item) {
      state.lastError = null;

      try {
        const { accountKey } = input.sessionStore.getUnlockedVaultContext();
        const payload = normalizePayloadByType(item.itemType, item.payload);
        const encryptedPayload = await encryptVaultItemPayload({
          accountKey,
          itemType: item.itemType,
          payload,
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
