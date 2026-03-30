const DATABASE_NAME = 'vaultlite-local-vault-cache';
const DATABASE_VERSION = 2;
const STORE_NAME = 'vault_cache_v1';
const CACHE_SCHEMA_VERSION = 2;
const CACHE_PAYLOAD_SCHEMA_VERSION = 1;
const CACHE_AAD_VERSION = 'v1';
const CACHE_KEY_CONTEXT = 'vaultlite.local-cache.v1';
const PENDING_LEASE_MAX_AGE_MS = 15 * 60 * 1000;

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
  schemaVersion: number;
}

interface StoredCacheRecordV2 {
  cacheKey: string;
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  activeSnapshotToken: string | null;
  activeEtag: string | null;
  activeGeneratedAt: string | null;
  activeItemCount: number;
  activeEncryptedPayload: string | null;
  activePayloadNonce: string | null;
  activePayloadAadVersion: typeof CACHE_AAD_VERSION | null;
  pendingSyncId: string | null;
  pendingStartedAt: string | null;
  pendingBaseSnapshotToken: string | null;
  pendingProgress: number | null;
  pendingSnapshotToken: string | null;
  pendingEtag: string | null;
  pendingGeneratedAt: string | null;
  pendingItemCount: number;
  pendingEncryptedPayload: string | null;
  pendingPayloadNonce: string | null;
  pendingPayloadAadVersion: typeof CACHE_AAD_VERSION | null;
}

export interface LocalVaultPendingFinalizeResult {
  ok: boolean;
  reason?: string;
  itemCount?: number;
  snapshotToken?: string | null;
  etag?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
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

async function listAllRecords(): Promise<Array<StoredCacheRecordV2 | Record<string, unknown>>> {
  return (
    (await withStore<Array<StoredCacheRecordV2 | Record<string, unknown>>>('readonly', (store) =>
      store.getAll() as IDBRequest<Array<StoredCacheRecordV2 | Record<string, unknown>>>,
    )) ?? []
  );
}

async function getRecord(cacheKey: string): Promise<StoredCacheRecordV2 | Record<string, unknown> | null> {
  return (await withStore<StoredCacheRecordV2 | Record<string, unknown> | null>('readonly', (store) =>
    store.get(cacheKey),
  )) ?? null;
}

function buildEmptyStoredRecord(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
}): StoredCacheRecordV2 {
  return {
    cacheKey: buildCacheKey(input),
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    schemaVersion: CACHE_SCHEMA_VERSION,
    activeSnapshotToken: null,
    activeEtag: null,
    activeGeneratedAt: null,
    activeItemCount: 0,
    activeEncryptedPayload: null,
    activePayloadNonce: null,
    activePayloadAadVersion: null,
    pendingSyncId: null,
    pendingStartedAt: null,
    pendingBaseSnapshotToken: null,
    pendingProgress: null,
    pendingSnapshotToken: null,
    pendingEtag: null,
    pendingGeneratedAt: null,
    pendingItemCount: 0,
    pendingEncryptedPayload: null,
    pendingPayloadNonce: null,
    pendingPayloadAadVersion: null,
  };
}

function parseIsoTimestamp(value: string | null | undefined): number {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStoredRecord(
  rawRecord: StoredCacheRecordV2 | Record<string, unknown> | null,
  identity: { userId: string; deviceId: string; deploymentFingerprint: string },
): StoredCacheRecordV2 {
  if (!rawRecord || typeof rawRecord !== 'object') {
    return buildEmptyStoredRecord(identity);
  }
  const legacy = rawRecord as Record<string, unknown>;
  const next = buildEmptyStoredRecord(identity);
  next.userId = typeof legacy.userId === 'string' ? legacy.userId : identity.userId;
  next.deviceId = typeof legacy.deviceId === 'string' ? legacy.deviceId : identity.deviceId;
  next.deploymentFingerprint =
    typeof legacy.deploymentFingerprint === 'string'
      ? legacy.deploymentFingerprint
      : identity.deploymentFingerprint;

  if (
    typeof legacy.activeEncryptedPayload === 'string' &&
    typeof legacy.activePayloadNonce === 'string' &&
    legacy.activePayloadAadVersion === CACHE_AAD_VERSION
  ) {
    next.activeEncryptedPayload = legacy.activeEncryptedPayload;
    next.activePayloadNonce = legacy.activePayloadNonce;
    next.activePayloadAadVersion = CACHE_AAD_VERSION;
    next.activeSnapshotToken =
      typeof legacy.activeSnapshotToken === 'string' ? legacy.activeSnapshotToken : null;
    next.activeEtag = typeof legacy.activeEtag === 'string' ? legacy.activeEtag : null;
    next.activeGeneratedAt =
      typeof legacy.activeGeneratedAt === 'string' ? legacy.activeGeneratedAt : null;
    next.activeItemCount = Number.isFinite(Number(legacy.activeItemCount))
      ? Math.max(0, Math.trunc(Number(legacy.activeItemCount)))
      : 0;
  } else if (
    typeof legacy.encryptedPayload === 'string' &&
    typeof legacy.payloadNonce === 'string' &&
    legacy.payloadAadVersion === CACHE_AAD_VERSION
  ) {
    next.activeEncryptedPayload = legacy.encryptedPayload;
    next.activePayloadNonce = legacy.payloadNonce;
    next.activePayloadAadVersion = CACHE_AAD_VERSION;
    next.activeSnapshotToken = typeof legacy.snapshotToken === 'string' ? legacy.snapshotToken : null;
    next.activeEtag = typeof legacy.etag === 'string' ? legacy.etag : null;
    next.activeGeneratedAt = typeof legacy.generatedAt === 'string' ? legacy.generatedAt : nowIso();
    next.activeItemCount = Number.isFinite(Number(legacy.itemCount))
      ? Math.max(0, Math.trunc(Number(legacy.itemCount)))
      : 0;
  }

  if (
    typeof legacy.pendingSyncId === 'string' &&
    legacy.pendingSyncId.length > 0 &&
    typeof legacy.pendingStartedAt === 'string'
  ) {
    next.pendingSyncId = legacy.pendingSyncId;
    next.pendingStartedAt = legacy.pendingStartedAt;
    next.pendingBaseSnapshotToken =
      typeof legacy.pendingBaseSnapshotToken === 'string' ? legacy.pendingBaseSnapshotToken : null;
    next.pendingProgress = Number.isFinite(Number(legacy.pendingProgress))
      ? Math.max(0, Math.min(1, Number(legacy.pendingProgress)))
      : null;
    next.pendingSnapshotToken =
      typeof legacy.pendingSnapshotToken === 'string' ? legacy.pendingSnapshotToken : null;
    next.pendingEtag = typeof legacy.pendingEtag === 'string' ? legacy.pendingEtag : null;
    next.pendingGeneratedAt =
      typeof legacy.pendingGeneratedAt === 'string' ? legacy.pendingGeneratedAt : null;
    next.pendingEncryptedPayload =
      typeof legacy.pendingEncryptedPayload === 'string' ? legacy.pendingEncryptedPayload : null;
    next.pendingPayloadNonce =
      typeof legacy.pendingPayloadNonce === 'string' ? legacy.pendingPayloadNonce : null;
    next.pendingPayloadAadVersion =
      legacy.pendingPayloadAadVersion === CACHE_AAD_VERSION ? CACHE_AAD_VERSION : null;
    next.pendingItemCount = Number.isFinite(Number(legacy.pendingItemCount))
      ? Math.max(0, Math.trunc(Number(legacy.pendingItemCount)))
      : 0;
  }
  return next;
}

function clearPendingState(record: StoredCacheRecordV2): void {
  record.pendingSyncId = null;
  record.pendingStartedAt = null;
  record.pendingBaseSnapshotToken = null;
  record.pendingProgress = null;
  record.pendingSnapshotToken = null;
  record.pendingEtag = null;
  record.pendingGeneratedAt = null;
  record.pendingItemCount = 0;
  record.pendingEncryptedPayload = null;
  record.pendingPayloadNonce = null;
  record.pendingPayloadAadVersion = null;
}

function isPendingStale(record: StoredCacheRecordV2): boolean {
  if (!record.pendingSyncId || !record.pendingStartedAt) {
    return false;
  }
  const startedAtMs = parseIsoTimestamp(record.pendingStartedAt);
  if (!startedAtMs) {
    return true;
  }
  return Date.now() - startedAtMs > PENDING_LEASE_MAX_AGE_MS;
}

async function encryptPayload(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  key: CryptoKey;
  payload: LocalVaultCachePayloadV1;
}): Promise<{ encryptedPayload: string; payloadNonce: string; itemCount: number }> {
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
    input.key,
    textEncoder.encode(JSON.stringify(input.payload)),
  );
  return {
    encryptedPayload: bytesToBase64Url(new Uint8Array(ciphertext)),
    payloadNonce: bytesToBase64Url(nonce),
    itemCount: Array.isArray(input.payload.items) ? input.payload.items.length : 0,
  };
}

async function decryptPayload(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  key: CryptoKey;
  encryptedPayload: string;
  payloadNonce: string;
}): Promise<LocalVaultCachePayloadV1 | null> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(input.payloadNonce)),
      additionalData: toArrayBuffer(
        buildAad({
          userId: input.userId,
          deviceId: input.deviceId,
          deploymentFingerprint: input.deploymentFingerprint,
        }),
      ),
    },
    input.key,
    toArrayBuffer(base64UrlToBytes(input.encryptedPayload)),
  );
  const payload = JSON.parse(textDecoder.decode(plaintext)) as LocalVaultCachePayloadV1;
  if (!payload || payload.schemaVersion !== CACHE_PAYLOAD_SCHEMA_VERSION || !Array.isArray(payload.items)) {
    return null;
  }
  return payload;
}

function resolveNewestRecordForIdentity(
  records: Array<StoredCacheRecordV2 | Record<string, unknown>>,
  input: {
    userId: string;
    deviceId: string;
    deploymentFingerprint?: string;
  },
): (StoredCacheRecordV2 | Record<string, unknown>) | null {
  const filtered = records.filter((value) => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    if (candidate.userId !== input.userId || candidate.deviceId !== input.deviceId) {
      return false;
    }
    if (
      input.deploymentFingerprint &&
      typeof candidate.deploymentFingerprint === 'string' &&
      candidate.deploymentFingerprint !== input.deploymentFingerprint
    ) {
      return false;
    }
    return true;
  });
  if (filtered.length === 0) {
    return null;
  }
  return (
    filtered.sort((left, right) => {
      const leftGeneratedAt =
        typeof (left as Record<string, unknown>).activeGeneratedAt === 'string'
          ? String((left as Record<string, unknown>).activeGeneratedAt)
          : typeof (left as Record<string, unknown>).generatedAt === 'string'
            ? String((left as Record<string, unknown>).generatedAt)
            : '';
      const rightGeneratedAt =
        typeof (right as Record<string, unknown>).activeGeneratedAt === 'string'
          ? String((right as Record<string, unknown>).activeGeneratedAt)
          : typeof (right as Record<string, unknown>).generatedAt === 'string'
            ? String((right as Record<string, unknown>).generatedAt)
            : '';
      return rightGeneratedAt.localeCompare(leftGeneratedAt);
    })[0] ?? null
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
  const encrypted = await encryptPayload({
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    key,
    payload: input.payload,
  });
  const existing = normalizeStoredRecord(
    await getRecord(buildCacheKey(input)),
    {
      userId: input.userId,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
    },
  );
  existing.schemaVersion = CACHE_SCHEMA_VERSION;
  existing.activeSnapshotToken = input.snapshotToken;
  existing.activeEtag = input.etag;
  existing.activeGeneratedAt = nowIso();
  existing.activeItemCount = encrypted.itemCount;
  existing.activeEncryptedPayload = encrypted.encryptedPayload;
  existing.activePayloadNonce = encrypted.payloadNonce;
  existing.activePayloadAadVersion = CACHE_AAD_VERSION;
  clearPendingState(existing);
  await withStore('readwrite', (store) => store.put(existing));
}

export async function beginLocalVaultCachePending(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  syncId: string;
  baseSnapshotToken?: string | null;
}): Promise<void> {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const record = normalizeStoredRecord(
    await getRecord(buildCacheKey(input)),
    {
      userId: input.userId,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
    },
  );
  if (record.pendingSyncId && record.pendingSyncId !== input.syncId && !isPendingStale(record)) {
    throw new Error('pending_sync_in_progress');
  }
  clearPendingState(record);
  record.pendingSyncId = input.syncId;
  record.pendingStartedAt = nowIso();
  record.pendingBaseSnapshotToken = input.baseSnapshotToken ?? record.activeSnapshotToken ?? null;
  record.pendingProgress = 0;
  await withStore('readwrite', (store) => store.put(record));
}

export async function writeLocalVaultCachePending(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  accountKey: string;
  syncId: string;
  snapshotToken: string | null;
  etag: string | null;
  payload: LocalVaultCachePayloadV1;
  progress?: number;
}): Promise<void> {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const record = normalizeStoredRecord(
    await getRecord(buildCacheKey(input)),
    {
      userId: input.userId,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
    },
  );
  if (record.pendingSyncId !== input.syncId) {
    throw new Error('pending_sync_mismatch');
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const encrypted = await encryptPayload({
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    key,
    payload: input.payload,
  });
  record.pendingSnapshotToken = input.snapshotToken;
  record.pendingEtag = input.etag;
  record.pendingGeneratedAt = nowIso();
  record.pendingItemCount = encrypted.itemCount;
  record.pendingEncryptedPayload = encrypted.encryptedPayload;
  record.pendingPayloadNonce = encrypted.payloadNonce;
  record.pendingPayloadAadVersion = CACHE_AAD_VERSION;
  record.pendingProgress = Number.isFinite(Number(input.progress))
    ? Math.max(0, Math.min(1, Number(input.progress)))
    : 1;
  await withStore('readwrite', (store) => store.put(record));
}

export async function finalizeLocalVaultCachePending(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  accountKey: string;
  syncId: string;
  expectedItemCount?: number;
}): Promise<LocalVaultPendingFinalizeResult> {
  if (!hasIndexedDbSupport()) {
    return { ok: false, reason: 'indexeddb_unavailable' };
  }
  const record = normalizeStoredRecord(
    await getRecord(buildCacheKey(input)),
    {
      userId: input.userId,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
    },
  );
  if (record.pendingSyncId !== input.syncId) {
    return { ok: false, reason: 'pending_sync_mismatch' };
  }
  if (
    typeof record.pendingEncryptedPayload !== 'string' ||
    typeof record.pendingPayloadNonce !== 'string' ||
    record.pendingPayloadAadVersion !== CACHE_AAD_VERSION
  ) {
    return { ok: false, reason: 'pending_payload_missing' };
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const payload = await decryptPayload({
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    key,
    encryptedPayload: record.pendingEncryptedPayload,
    payloadNonce: record.pendingPayloadNonce,
  });
  if (!payload) {
    return { ok: false, reason: 'pending_payload_invalid' };
  }
  if (
    Number.isFinite(Number(input.expectedItemCount)) &&
    Math.trunc(Number(input.expectedItemCount)) !== payload.items.length
  ) {
    return { ok: false, reason: 'pending_item_count_mismatch' };
  }
  return {
    ok: true,
    itemCount: payload.items.length,
    snapshotToken: record.pendingSnapshotToken,
    etag: record.pendingEtag,
  };
}

export async function promoteLocalVaultCachePending(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  syncId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!hasIndexedDbSupport()) {
    return { ok: false, reason: 'indexeddb_unavailable' };
  }
  const record = normalizeStoredRecord(
    await getRecord(buildCacheKey(input)),
    {
      userId: input.userId,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
    },
  );
  if (record.pendingSyncId !== input.syncId) {
    return { ok: false, reason: 'pending_sync_mismatch' };
  }
  if (
    typeof record.pendingEncryptedPayload !== 'string' ||
    typeof record.pendingPayloadNonce !== 'string' ||
    record.pendingPayloadAadVersion !== CACHE_AAD_VERSION
  ) {
    return { ok: false, reason: 'pending_payload_missing' };
  }
  record.activeSnapshotToken = record.pendingSnapshotToken;
  record.activeEtag = record.pendingEtag;
  record.activeGeneratedAt = record.pendingGeneratedAt ?? nowIso();
  record.activeItemCount = record.pendingItemCount;
  record.activeEncryptedPayload = record.pendingEncryptedPayload;
  record.activePayloadNonce = record.pendingPayloadNonce;
  record.activePayloadAadVersion = record.pendingPayloadAadVersion;
  clearPendingState(record);
  await withStore('readwrite', (store) => store.put(record));
  return { ok: true };
}

export async function discardLocalVaultCachePending(input: {
  userId: string;
  deviceId: string;
  deploymentFingerprint: string;
  syncId?: string;
}): Promise<void> {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const record = normalizeStoredRecord(
    await getRecord(buildCacheKey(input)),
    {
      userId: input.userId,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
    },
  );
  if (input.syncId && record.pendingSyncId !== input.syncId) {
    return;
  }
  if (!record.pendingSyncId) {
    return;
  }
  clearPendingState(record);
  await withStore('readwrite', (store) => store.put(record));
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
  const newest = resolveNewestRecordForIdentity(all, {
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  if (!newest) {
    return null;
  }
  const normalized = normalizeStoredRecord(newest, {
    userId: input.userId,
    deviceId: input.deviceId,
    deploymentFingerprint:
      typeof (newest as Record<string, unknown>).deploymentFingerprint === 'string'
        ? String((newest as Record<string, unknown>).deploymentFingerprint)
        : input.deploymentFingerprint ?? 'unknown',
  });
  if (
    typeof normalized.activeEncryptedPayload !== 'string' ||
    typeof normalized.activePayloadNonce !== 'string' ||
    normalized.activePayloadAadVersion !== CACHE_AAD_VERSION
  ) {
    return null;
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    userId: normalized.userId,
    deviceId: normalized.deviceId,
    deploymentFingerprint: normalized.deploymentFingerprint,
  });
  const payload = await decryptPayload({
    userId: normalized.userId,
    deviceId: normalized.deviceId,
    deploymentFingerprint: normalized.deploymentFingerprint,
    key,
    encryptedPayload: normalized.activeEncryptedPayload,
    payloadNonce: normalized.activePayloadNonce,
  });
  if (!payload) {
    return null;
  }
  return {
    record: {
      cacheKey: normalized.cacheKey,
      userId: normalized.userId,
      deviceId: normalized.deviceId,
      deploymentFingerprint: normalized.deploymentFingerprint,
      snapshotToken: normalized.activeSnapshotToken,
      etag: normalized.activeEtag,
      generatedAt: normalized.activeGeneratedAt ?? nowIso(),
      itemCount: normalized.activeItemCount,
      encryptedPayload: normalized.activeEncryptedPayload,
      payloadNonce: normalized.activePayloadNonce,
      payloadAadVersion: CACHE_AAD_VERSION,
      schemaVersion: normalized.schemaVersion,
    },
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
  const toDelete = all.filter((value) => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const record = value as Record<string, unknown>;
    if (record.userId !== input.userId || record.deviceId !== input.deviceId) {
      return false;
    }
    if (
      input.deploymentFingerprint &&
      typeof record.deploymentFingerprint === 'string' &&
      record.deploymentFingerprint !== input.deploymentFingerprint
    ) {
      return false;
    }
    return true;
  });
  if (toDelete.length === 0) {
    return;
  }
  await Promise.all(
    toDelete.map((record) =>
      withStore('readwrite', (store) =>
        store.delete(String((record as Record<string, unknown>).cacheKey ?? '')),
      ),
    ),
  );
}
