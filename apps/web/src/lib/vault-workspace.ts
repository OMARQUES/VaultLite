import { computed, reactive, readonly, ref } from 'vue';

import { decryptVaultItemPayload, encryptVaultItemPayload } from './browser-crypto';
import { toHumanErrorMessage } from './human-error';
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

export interface VaultWorkspaceTombstone {
  itemId: string;
  itemType: VaultItemType;
  revision: number;
  deletedAt: string;
}

export interface VaultWorkspaceState {
  isLoading: boolean;
  lastError: string | null;
  items: VaultWorkspaceItem[];
  tombstones: VaultWorkspaceTombstone[];
}

export interface VaultWorkspace {
  state: VaultWorkspaceState;
  searchQuery: Readonly<{ value: string }>;
  filteredItems: Readonly<{ value: VaultWorkspaceItem[] }>;
  load(): Promise<void>;
  startSync(): void;
  stopSync(): void;
  triggerSync(reason?: string): Promise<void>;
  createLogin(payload: LoginVaultItemPayload): Promise<void>;
  createDocument(payload: DocumentVaultItemPayload): Promise<void>;
  createCard(payload: CardVaultItemPayload): Promise<void>;
  createSecureNote(payload: SecureNoteVaultItemPayload): Promise<void>;
  updateItem(item: VaultWorkspaceItem): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  restoreItem(itemId: string): Promise<void>;
  setSearchQuery(query: string): void;
}

const SYNC_PAGE_SIZE = 25;
const SYNC_INTERVAL_MS = 30_000;
const SYNC_INTERVAL_JITTER_RATIO = 0.2;
const SYNC_ERROR_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;

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
    tombstones: [],
  });
  const searchIndex = ref(buildVaultSearchIndex([]));
  let lastSnapshotEtag: string | null = null;
  let pullGeneration = 0;
  let activePullGeneration: number | null = null;
  let activePullAbortController: AbortController | null = null;
  let activePullPromise: Promise<void> | null = null;
  let pendingPull = false;
  let syncStarted = false;
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let syncBackoffIndex = 0;

  const onWindowFocus = () => {
    void triggerSync('focus').catch(() => undefined);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void triggerSync('visibility').catch(() => undefined);
    }
  };

  function rebuildIndex() {
    searchIndex.value = buildVaultSearchIndex(state.items);
  }

  const filteredItems = computed(() => {
    const matchingIds = new Set(queryVaultSearchIndex(searchIndex.value, searchQuery.value));
    return state.items.filter((item) => matchingIds.has(item.itemId));
  });

  function isSessionReady(): boolean {
    return input.sessionStore.state.phase === 'ready';
  }

  function withIntervalJitter(baseMs: number): number {
    const jitter = 1 + (Math.random() * 2 - 1) * SYNC_INTERVAL_JITTER_RATIO;
    return Math.max(1_000, Math.round(baseMs * jitter));
  }

  function scheduleNextSync(delayMs: number) {
    if (!syncStarted) {
      return;
    }
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    syncTimer = setTimeout(() => {
      void triggerSync('interval').catch(() => undefined);
    }, delayMs);
  }

  async function applySnapshotEntries(entries: Array<{
    entryType: 'item' | 'tombstone';
    item?: {
      itemId: string;
      itemType: VaultItemType;
      revision: number;
      encryptedPayload: string;
      createdAt: string;
      updatedAt: string;
    };
    tombstone?: {
      itemId: string;
      itemType: VaultItemType;
      revision: number;
      deletedAt: string;
    };
  }>) {
    const { accountKey } = input.sessionStore.getUnlockedVaultContext();
    const itemEntries = entries
      .filter((entry): entry is { entryType: 'item'; item: NonNullable<typeof entry.item> } =>
        entry.entryType === 'item' && Boolean(entry.item),
      )
      .map((entry) => entry.item);
    const tombstoneEntries = entries
      .filter(
        (
          entry,
        ): entry is { entryType: 'tombstone'; tombstone: NonNullable<typeof entry.tombstone> } =>
          entry.entryType === 'tombstone' && Boolean(entry.tombstone),
      )
      .map((entry) => entry.tombstone)
      .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
    state.items = await Promise.all(itemEntries.map((item) => decryptRecord(accountKey, item)));
    state.tombstones = tombstoneEntries.map((entry) => ({ ...entry }));
    rebuildIndex();
  }

  async function runSnapshotPull(reason: string): Promise<boolean> {
    if (!isSessionReady()) {
      return false;
    }

    const generation = ++pullGeneration;
    activePullGeneration = generation;
    const abortController = new AbortController();
    activePullAbortController = abortController;
    let didApply = false;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let snapshotToken: string | undefined;
      let cursor: string | undefined;
      const mergedEntries: Array<{
        entryType: 'item' | 'tombstone';
        item?: {
          itemId: string;
          itemType: VaultItemType;
          revision: number;
          encryptedPayload: string;
          createdAt: string;
          updatedAt: string;
        };
        tombstone?: {
          itemId: string;
          itemType: VaultItemType;
          revision: number;
          deletedAt: string;
        };
      }> = [];

      try {
        while (true) {
          if (!isSessionReady() || abortController.signal.aborted || activePullGeneration !== generation) {
            return false;
          }

          const page = await input.vaultClient.pullSyncSnapshot({
            snapshotToken,
            cursor,
            pageSize: SYNC_PAGE_SIZE,
            etag: snapshotToken ? undefined : lastSnapshotEtag ?? undefined,
            signal: abortController.signal,
          });

          if (page.status === 'not_modified') {
            lastSnapshotEtag = page.etag ?? lastSnapshotEtag;
            return true;
          }

          if (!snapshotToken) {
            snapshotToken = page.payload.snapshotToken;
          }
          mergedEntries.push(...page.payload.entries);
          cursor = page.payload.nextCursor ?? undefined;
          if (!cursor) {
            if (!isSessionReady() || abortController.signal.aborted || activePullGeneration !== generation) {
              return false;
            }
            await applySnapshotEntries(mergedEntries);
            lastSnapshotEtag = page.etag ?? `"${page.payload.snapshotDigest}"`;
            didApply = true;
            return true;
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return false;
        }
        const rawMessage = error instanceof Error ? error.message : String(error);
        const isSnapshotExpired = rawMessage.includes('snapshot_expired');
        if (isSnapshotExpired && attempt === 0) {
          continue;
        }
        throw error;
      }
    }

    return didApply;
  }

  async function triggerSync(reason = 'manual'): Promise<void> {
    if (!isSessionReady()) {
      return;
    }

    if (activePullPromise) {
      pendingPull = true;
      activePullAbortController?.abort();
      return;
    }

    state.lastError = null;
    activePullPromise = (async () => {
      try {
        const ok = await runSnapshotPull(reason);
        if (ok) {
          syncBackoffIndex = 0;
          scheduleNextSync(withIntervalJitter(SYNC_INTERVAL_MS));
        } else if (syncStarted) {
          scheduleNextSync(withIntervalJitter(SYNC_INTERVAL_MS));
        }
      } catch (error) {
        state.lastError = toHumanErrorMessage(error);
        syncBackoffIndex = Math.min(syncBackoffIndex + 1, SYNC_ERROR_BACKOFF_MS.length - 1);
        scheduleNextSync(SYNC_ERROR_BACKOFF_MS[syncBackoffIndex] ?? SYNC_ERROR_BACKOFF_MS.at(-1) ?? 60_000);
        throw error;
      } finally {
        activePullPromise = null;
        activePullAbortController = null;
        activePullGeneration = null;
        if (pendingPull) {
          pendingPull = false;
          void triggerSync('pending_pull').catch(() => undefined);
        }
      }
    })();

    await activePullPromise;
  }

  async function load() {
    state.isLoading = true;
    state.lastError = null;

    try {
      await triggerSync('load');
    } catch (error) {
      state.lastError = toHumanErrorMessage(error);
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
    state.tombstones = state.tombstones.filter((entry) => entry.itemId !== created.itemId);
    rebuildIndex();
    if (syncStarted) {
      void triggerSync('post_mutation').catch(() => undefined);
    }
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
        state.tombstones = state.tombstones.filter((entry) => entry.itemId !== decrypted.itemId);
        rebuildIndex();
      } catch (error) {
        state.lastError = toHumanErrorMessage(error);
        throw error;
      }
      if (syncStarted) {
        void triggerSync('post_mutation').catch(() => undefined);
      }
    },
    async deleteItem(itemId) {
      state.lastError = null;
      const current = state.items.find((item) => item.itemId === itemId) ?? null;
      await input.vaultClient.deleteItem(itemId);
      state.items = state.items.filter((item) => item.itemId !== itemId);
      if (current) {
        const tombstone: VaultWorkspaceTombstone = {
          itemId,
          itemType: current.itemType,
          revision: current.revision + 1,
          deletedAt: new Date().toISOString(),
        };
        state.tombstones = [tombstone, ...state.tombstones.filter((entry) => entry.itemId !== itemId)];
      }
      rebuildIndex();
      if (syncStarted) {
        void triggerSync('post_mutation').catch(() => undefined);
      }
    },
    async restoreItem(itemId) {
      state.lastError = null;
      const restoreOutput = await input.vaultClient.restoreItem(itemId);
      const { accountKey } = input.sessionStore.getUnlockedVaultContext();
      const decrypted = await decryptRecord(accountKey, restoreOutput.item);
      const existingIndex = state.items.findIndex((item) => item.itemId === decrypted.itemId);
      if (existingIndex >= 0) {
        state.items = state.items.map((item) => (item.itemId === decrypted.itemId ? decrypted : item));
      } else {
        state.items = [...state.items, decrypted];
      }
      state.tombstones = state.tombstones.filter((entry) => entry.itemId !== decrypted.itemId);
      rebuildIndex();
      if (syncStarted) {
        void triggerSync('post_mutation').catch(() => undefined);
      }
    },
    startSync() {
      if (syncStarted) {
        return;
      }
      syncStarted = true;
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', onWindowFocus);
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
      scheduleNextSync(withIntervalJitter(SYNC_INTERVAL_MS));
      void triggerSync('start').catch(() => undefined);
    },
    stopSync() {
      syncStarted = false;
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      activePullAbortController?.abort();
      activePullAbortController = null;
      activePullPromise = null;
      activePullGeneration = null;
      pendingPull = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onWindowFocus);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    },
    triggerSync,
    searchQuery: readonly(searchQuery),
    filteredItems,
    setSearchQuery(query) {
      searchQuery.value = query;
    },
  };
}
