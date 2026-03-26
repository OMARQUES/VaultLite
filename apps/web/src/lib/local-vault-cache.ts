const DATABASE_NAME = 'vaultlite-local-vault-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'vault_cache_v1';
const CACHE_SCHEMA_VERSION = 1;
const CACHE_AAD_VERSION = 'v1';
const CACHE_KEY_CONTEXT = 'vaultlite.local-cache.v1';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function hasIndexedDbSupport(): boolean {
  return typeof indexedDB !== 'undefined';
}

export type CacheWarmState =
  | 'idle'
  | 'loading_local'
  | 'ready_local'
  | 'syncing'
  | 'sync_failed'
  | 'completed';

export interface LocalVaultListIndexV1 {
  itemId: string;
  itemType: 'login' | 'document' | 'card' | 'secure_note';
  title: string;
  subtitle: string;
  urlHost: string;
  revision: number;
  updatedAt: string;
  iconRef: string | null;
}

export interface LocalVaultCachePayloadV1 {
  schemaVersion: 1;
  index: LocalVaultListIndexV1[];
  items: unknown[];
  tombstones: unknown[];
}

export interface LocalVaultCacheRecordV1 {
  cacheKey: string;
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  snapshotToken: string | null;
  etag: string | null;
  generatedAt: string;
  itemCount: number;
  encryptedPayload: string;
  payloadNonce: string;
  payloadAadVersion: typeof CACHE_AAD_VERSION;
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function buildCacheKey(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
}): string {
  return `${input.userId}:${input.deviceId}:${input.deploymentFingerprint}`;
}

function buildAad(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
}): Uint8Array {
  return textEncoder.encode(
    [
      'vaultlite-local-cache',
      CACHE_AAD_VERSION,
      input.userId,
      input.deviceId,
      input.deploymentFingerprint,
    ].join('|'),
  );
}

async function deriveCacheKey(input: {
  accountKey: string;
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
}): Promise<CryptoKey> {
  const accountKeyBytes = base64UrlToBytes(input.accountKey);
  const hkdfBaseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(accountKeyBytes),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: textEncoder.encode(input.userId),
      info: textEncoder.encode(`${CACHE_KEY_CONTEXT}|${input.deviceId}|${input.deploymentFingerprint}`),
    },
    hkdfBaseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function openDatabase(): Promise<IDBDatabase> {
  if (!hasIndexedDbSupport()) {
    return Promise.reject(new Error('indexeddb_unavailable'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: 'cacheKey',
        });
      }
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

async function listAllRecords(): Promise<LocalVaultCacheRecordV1[]> {
  return (
    (await withStore<LocalVaultCacheRecordV1[]>('readonly', (store) =>
      store.getAll() as IDBRequest<LocalVaultCacheRecordV1[]>,
    )) ?? []
  );
}

export async function saveLocalVaultCache(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  accountKey: string;
  snapshotToken: string | null;
  etag: string | null;
  payload: LocalVaultCachePayloadV1;
}): Promise<void> {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(
        buildAad({
          userId: input.userId,
          deviceId: input.deviceId,
          deploymentFingerprint: input.deploymentFingerprint,
        }),
      ),
    },
    key,
    textEncoder.encode(JSON.stringify(input.payload)),
  );
  const record: LocalVaultCacheRecordV1 = {
    cacheKey: buildCacheKey({
      userId: input.userId,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
    }),
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    snapshotToken: input.snapshotToken,
    etag: input.etag,
    generatedAt: new Date().toISOString(),
    itemCount: input.payload.items.length,
    encryptedPayload: bytesToBase64Url(new Uint8Array(ciphertext)),
    payloadNonce: bytesToBase64Url(nonce),
    payloadAadVersion: CACHE_AAD_VERSION,
    schemaVersion: CACHE_SCHEMA_VERSION,
  };
  await withStore('readwrite', (store) => store.put(record));
}

function isCacheRecordV1(value: unknown): value is LocalVaultCacheRecordV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<LocalVaultCacheRecordV1>;
  return (
    typeof record.cacheKey === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.deviceId === 'string' &&
    typeof record.deploymentFingerprint === 'string' &&
    typeof record.encryptedPayload === 'string' &&
    typeof record.payloadNonce === 'string' &&
    record.payloadAadVersion === CACHE_AAD_VERSION &&
    record.schemaVersion === CACHE_SCHEMA_VERSION
  );
}

function resolveNewestRecordForIdentity(
  records: LocalVaultCacheRecordV1[],
  input: {
    userId: string;
    deviceId: string;
    deploymentFingerprint?: string;
  },
): LocalVaultCacheRecordV1 | null {
  const filtered = records.filter((record) => {
    if (record.userId !== input.userId || record.deviceId !== input.deviceId) {
      return false;
    }
    if (input.deploymentFingerprint && record.deploymentFingerprint !== input.deploymentFingerprint) {
      return false;
    }
    return true;
  });
  if (filtered.length === 0) {
    return null;
  }
  return filtered.sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))[0] ?? null;
}

export async function loadLocalVaultCache(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint?: string;
  accountKey: string;
}): Promise<{
  record: LocalVaultCacheRecordV1;
  payload: LocalVaultCachePayloadV1;
} | null> {
  if (!hasIndexedDbSupport()) {
    return null;
  }
  const all = await listAllRecords();
  const record = resolveNewestRecordForIdentity(all, {
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  if (!record || !isCacheRecordV1(record)) {
    return null;
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    userId: record.userId,
    deviceId: record.deviceId,
    deploymentFingerprint: record.deploymentFingerprint,
  });
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(record.payloadNonce)),
      additionalData: toArrayBuffer(
        buildAad({
          userId: record.userId,
          deviceId: record.deviceId,
          deploymentFingerprint: record.deploymentFingerprint,
        }),
      ),
    },
    key,
    toArrayBuffer(base64UrlToBytes(record.encryptedPayload)),
  );
  const payload = JSON.parse(textDecoder.decode(plaintext)) as LocalVaultCachePayloadV1;
  if (!payload || payload.schemaVersion !== CACHE_SCHEMA_VERSION || !Array.isArray(payload.items)) {
    return null;
  }
  return {
    record,
    payload,
  };
}

export async function clearLocalVaultCache(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint?: string;
}): Promise<void> {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const all = await listAllRecords();
  const toDelete = all.filter((record) => {
    if (record.userId !== input.userId || record.deviceId !== input.deviceId) {
      return false;
    }
    if (input.deploymentFingerprint && record.deploymentFingerprint !== input.deploymentFingerprint) {
      return false;
    }
    return true;
  });
  if (toDelete.length === 0) {
    return;
  }
  await Promise.all(
    toDelete.map((record) =>
      withStore('readwrite', (store) => store.delete(record.cacheKey)),
    ),
  );
}
