import type { LocalUnlockEnvelope } from './browser-crypto';

export interface TrustedLocalStateRecord {
  username: string;
  deviceId: string;
  deviceName: string;
  platform: 'web' | 'extension';
  authSalt: string;
  encryptedAccountBundle: string;
  accountKeyWrapped: string;
  localUnlockEnvelope: LocalUnlockEnvelope;
  accountKit?: {
    payload: {
      version: 'account-kit.v1';
      serverUrl: string;
      username: string;
      accountKey: string;
      deploymentFingerprint: string;
      issuedAt: string;
    };
    signature: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TrustedLocalStateStore {
  save(record: TrustedLocalStateRecord): Promise<void>;
  load(username: string): Promise<TrustedLocalStateRecord | null>;
  loadFirst(): Promise<TrustedLocalStateRecord | null>;
  clear(username: string): Promise<void>;
}

const DATABASE_NAME = 'vaultlite-trusted-state';
const STORE_NAME = 'trusted-state';
const DATABASE_VERSION = 1;

function sanitizeTrustedLocalStateRecord(
  record: TrustedLocalStateRecord | Record<string, unknown> | null | undefined,
): TrustedLocalStateRecord | null {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const sanitized = { ...(record as Record<string, unknown>) };
  // Legacy versions persisted accountKit payloads containing accountKey.
  delete sanitized.accountKit;

  return sanitized as unknown as TrustedLocalStateRecord;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, {
        keyPath: 'username',
      });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function createTrustedLocalStateStore(): TrustedLocalStateStore {
  return {
    async save(record) {
      const sanitized = sanitizeTrustedLocalStateRecord(record);
      if (!sanitized) {
        return;
      }
      await withStore('readwrite', (store) => store.put(sanitized));
    },
    async load(username) {
      const loaded =
        (await withStore<TrustedLocalStateRecord | undefined>('readonly', (store) =>
          store.get(username),
        )) ?? null;
      const sanitized = sanitizeTrustedLocalStateRecord(loaded);
      if (!sanitized) {
        return null;
      }
      if (loaded?.accountKit !== undefined) {
        await withStore('readwrite', (store) => store.put(sanitized));
      }
      return sanitized;
    },
    async loadFirst() {
      const database = await openDatabase();
      const loaded = await new Promise<TrustedLocalStateRecord | null>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          resolve(cursor ? (cursor.value as TrustedLocalStateRecord) : null);
        };
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error);
      });

      const sanitized = sanitizeTrustedLocalStateRecord(loaded);
      if (!sanitized) {
        return null;
      }
      if (loaded?.accountKit !== undefined) {
        await withStore('readwrite', (store) => store.put(sanitized));
      }
      return sanitized;
    },
    async clear(username) {
      await withStore('readwrite', (store) => store.delete(username));
    },
  };
}
