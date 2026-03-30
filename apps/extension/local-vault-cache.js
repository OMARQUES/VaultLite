import { base64UrlToBytes, bytesToBase64Url, toArrayBuffer } from './runtime-common.js';

const DATABASE_NAME = 'vaultlite-extension-vault-cache';
const DATABASE_VERSION = 2;
const STORE_NAME = 'vault_cache_v1';
const CACHE_KEY_CONTEXT = 'vaultlite.extension.local-cache.v1';
const PROJECTION_CACHE_KEY_CONTEXT = 'vaultlite.extension.local-projection-cache.v1';
const CACHE_AAD_VERSION = 'v1';
const PROJECTION_AAD_VERSION = 'v1';
const PROJECTION_CACHE_KEY_PREFIX = 'projection:';
const CACHE_SCHEMA_VERSION = 2;
const CREDENTIAL_PAYLOAD_SCHEMA_VERSION = 1;
const PENDING_LEASE_MAX_AGE_MS = 15 * 60 * 1000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function hasIndexedDbSupport() {
  return typeof indexedDB !== 'undefined';
}

function nowIso() {
  return new Date().toISOString();
}

function buildCacheKey(input) {
  return `${input.username}:${input.deviceId}:${input.deploymentFingerprint}`;
}

function buildProjectionStorageKey(input) {
  return `${PROJECTION_CACHE_KEY_PREFIX}${buildCacheKey(input)}`;
}

function buildAad(input) {
  return textEncoder.encode(
    ['vaultlite-extension-cache', CACHE_AAD_VERSION, input.username, input.deviceId, input.deploymentFingerprint].join(
      '|',
    ),
  );
}

function buildProjectionAad(input) {
  return textEncoder.encode(
    [
      'vaultlite-extension-projection-cache',
      PROJECTION_AAD_VERSION,
      input.username,
      input.deviceId,
      input.deploymentFingerprint,
    ].join('|'),
  );
}

async function deriveAesKeyFromAccountKey(input, context) {
  const accountKeyBytes = base64UrlToBytes(input.accountKey);
  const hkdfBaseKey = await crypto.subtle.importKey('raw', toArrayBuffer(accountKeyBytes), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: textEncoder.encode(input.username),
      info: textEncoder.encode(`${context}|${input.deviceId}|${input.deploymentFingerprint}`),
    },
    hkdfBaseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function deriveCacheKey(input) {
  return deriveAesKeyFromAccountKey(input, CACHE_KEY_CONTEXT);
}

async function deriveProjectionCacheKey(input) {
  return deriveAesKeyFromAccountKey(input, PROJECTION_CACHE_KEY_CONTEXT);
}

function openDatabase() {
  if (!hasIndexedDbSupport()) {
    return Promise.reject(new Error('indexeddb_unavailable'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(mode, operation) {
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

async function getCacheRecord(cacheKey) {
  return withStore('readonly', (store) => store.get(cacheKey));
}

async function putCacheRecord(record) {
  return withStore('readwrite', (store) => store.put(record));
}

function normalizeCredentials(credentials) {
  return Array.isArray(credentials) ? credentials : [];
}

function parseIsoTimestamp(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toHex(bytes) {
  let output = '';
  for (const value of bytes) {
    output += value.toString(16).padStart(2, '0');
  }
  return output;
}

async function computeCredentialsChecksum(credentials) {
  const normalized = normalizeCredentials(credentials)
    .map((entry) => {
      const itemId = typeof entry?.itemId === 'string' ? entry.itemId : '';
      const itemType = typeof entry?.itemType === 'string' ? entry.itemType : '';
      const revision = Number.isFinite(Number(entry?.revision)) ? Math.trunc(Number(entry.revision)) : 0;
      const updatedAt = typeof entry?.updatedAt === 'string' ? entry.updatedAt : '';
      return `${itemId}:${itemType}:${revision}:${updatedAt}`;
    })
    .sort((left, right) => left.localeCompare(right))
    .join('|');
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(normalized));
  return toHex(new Uint8Array(digest));
}

async function encryptCredentialsSnapshot(input) {
  const credentials = normalizeCredentials(input.credentials);
  const payload = textEncoder.encode(
    JSON.stringify({
      schemaVersion: CREDENTIAL_PAYLOAD_SCHEMA_VERSION,
      credentials,
    }),
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encryptedPayload = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(
        buildAad({
          username: input.username,
          deviceId: input.deviceId,
          deploymentFingerprint: input.deploymentFingerprint,
        }),
      ),
    },
    input.key,
    payload,
  );
  return {
    encryptedPayload: bytesToBase64Url(new Uint8Array(encryptedPayload)),
    payloadNonce: bytesToBase64Url(nonce),
    payloadAadVersion: CACHE_AAD_VERSION,
    itemCount: credentials.length,
    checksum: await computeCredentialsChecksum(credentials),
  };
}

async function decryptCredentialsSnapshot(input) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(input.payloadNonce)),
      additionalData: toArrayBuffer(
        buildAad({
          username: input.username,
          deviceId: input.deviceId,
          deploymentFingerprint: input.deploymentFingerprint,
        }),
      ),
    },
    input.key,
    toArrayBuffer(base64UrlToBytes(input.encryptedPayload)),
  );
  const parsed = JSON.parse(textDecoder.decode(plaintext));
  const credentials = normalizeCredentials(parsed?.credentials);
  return {
    credentials,
    checksum: await computeCredentialsChecksum(credentials),
  };
}

function buildEmptyCacheRecord(input) {
  return {
    cacheKey: buildCacheKey(input),
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    schemaVersion: CACHE_SCHEMA_VERSION,
    activeSnapshotToken: null,
    activeGeneratedAt: null,
    activeEncryptedPayload: null,
    activePayloadNonce: null,
    activePayloadAadVersion: null,
    activeItemCount: 0,
    activeChecksum: null,
    pendingSyncId: null,
    pendingStartedAt: null,
    pendingBaseSnapshotToken: null,
    pendingProgress: null,
    pendingSnapshotToken: null,
    pendingGeneratedAt: null,
    pendingEncryptedPayload: null,
    pendingPayloadNonce: null,
    pendingPayloadAadVersion: null,
    pendingItemCount: 0,
    pendingChecksum: null,
  };
}

function normalizeToV2Record(rawRecord, identity) {
  if (!rawRecord || typeof rawRecord !== 'object') {
    return buildEmptyCacheRecord(identity);
  }
  const legacy = rawRecord;
  const next = buildEmptyCacheRecord(identity);
  next.username = typeof legacy.username === 'string' ? legacy.username : identity.username;
  next.deviceId = typeof legacy.deviceId === 'string' ? legacy.deviceId : identity.deviceId;
  next.deploymentFingerprint =
    typeof legacy.deploymentFingerprint === 'string' ? legacy.deploymentFingerprint : identity.deploymentFingerprint;

  if (
    typeof legacy.activeEncryptedPayload === 'string' &&
    typeof legacy.activePayloadNonce === 'string' &&
    legacy.activePayloadAadVersion === CACHE_AAD_VERSION
  ) {
    next.activeEncryptedPayload = legacy.activeEncryptedPayload;
    next.activePayloadNonce = legacy.activePayloadNonce;
    next.activePayloadAadVersion = legacy.activePayloadAadVersion;
    next.activeSnapshotToken =
      typeof legacy.activeSnapshotToken === 'string' ? legacy.activeSnapshotToken : null;
    next.activeGeneratedAt = typeof legacy.activeGeneratedAt === 'string' ? legacy.activeGeneratedAt : null;
    next.activeItemCount = Number.isFinite(Number(legacy.activeItemCount))
      ? Math.max(0, Math.trunc(Number(legacy.activeItemCount)))
      : 0;
    next.activeChecksum = typeof legacy.activeChecksum === 'string' ? legacy.activeChecksum : null;
  } else if (
    typeof legacy.encryptedPayload === 'string' &&
    typeof legacy.payloadNonce === 'string' &&
    legacy.payloadAadVersion === CACHE_AAD_VERSION
  ) {
    next.activeEncryptedPayload = legacy.encryptedPayload;
    next.activePayloadNonce = legacy.payloadNonce;
    next.activePayloadAadVersion = legacy.payloadAadVersion;
    next.activeSnapshotToken = typeof legacy.snapshotToken === 'string' ? legacy.snapshotToken : null;
    next.activeGeneratedAt = typeof legacy.generatedAt === 'string' ? legacy.generatedAt : nowIso();
    next.activeItemCount = Number.isFinite(Number(legacy.itemCount)) ? Math.max(0, Math.trunc(Number(legacy.itemCount))) : 0;
    next.activeChecksum = null;
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
    next.pendingGeneratedAt =
      typeof legacy.pendingGeneratedAt === 'string' ? legacy.pendingGeneratedAt : null;
    next.pendingEncryptedPayload =
      typeof legacy.pendingEncryptedPayload === 'string' ? legacy.pendingEncryptedPayload : null;
    next.pendingPayloadNonce =
      typeof legacy.pendingPayloadNonce === 'string' ? legacy.pendingPayloadNonce : null;
    next.pendingPayloadAadVersion =
      legacy.pendingPayloadAadVersion === CACHE_AAD_VERSION ? legacy.pendingPayloadAadVersion : null;
    next.pendingItemCount = Number.isFinite(Number(legacy.pendingItemCount))
      ? Math.max(0, Math.trunc(Number(legacy.pendingItemCount)))
      : 0;
    next.pendingChecksum = typeof legacy.pendingChecksum === 'string' ? legacy.pendingChecksum : null;
  }

  return next;
}

function isPendingSnapshotStale(record) {
  if (!record || typeof record.pendingStartedAt !== 'string' || record.pendingStartedAt.length === 0) {
    return false;
  }
  const pendingStartedAtMs = parseIsoTimestamp(record.pendingStartedAt);
  if (!pendingStartedAtMs) {
    return true;
  }
  return Date.now() - pendingStartedAtMs > PENDING_LEASE_MAX_AGE_MS;
}

function clearPendingState(record) {
  record.pendingSyncId = null;
  record.pendingStartedAt = null;
  record.pendingBaseSnapshotToken = null;
  record.pendingProgress = null;
  record.pendingSnapshotToken = null;
  record.pendingGeneratedAt = null;
  record.pendingEncryptedPayload = null;
  record.pendingPayloadNonce = null;
  record.pendingPayloadAadVersion = null;
  record.pendingItemCount = 0;
  record.pendingChecksum = null;
}

export async function loadExtensionVaultCache(input) {
  if (!hasIndexedDbSupport()) {
    return null;
  }
  const record = normalizeToV2Record(await getCacheRecord(buildCacheKey(input)), input);
  if (
    typeof record.activeEncryptedPayload !== 'string' ||
    typeof record.activePayloadNonce !== 'string' ||
    record.activePayloadAadVersion !== CACHE_AAD_VERSION
  ) {
    return null;
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const { credentials } = await decryptCredentialsSnapshot({
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    key,
    encryptedPayload: record.activeEncryptedPayload,
    payloadNonce: record.activePayloadNonce,
  });
  return {
    generatedAt: typeof record.activeGeneratedAt === 'string' ? record.activeGeneratedAt : null,
    credentials,
    snapshotToken: typeof record.activeSnapshotToken === 'string' ? record.activeSnapshotToken : null,
  };
}

export async function saveExtensionVaultCache(input) {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const encrypted = await encryptCredentialsSnapshot({
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    key,
    credentials: input.credentials,
  });
  const record = normalizeToV2Record(await getCacheRecord(buildCacheKey(input)), input);
  record.schemaVersion = CACHE_SCHEMA_VERSION;
  record.activeSnapshotToken = typeof input.snapshotToken === 'string' ? input.snapshotToken : null;
  record.activeGeneratedAt = nowIso();
  record.activeEncryptedPayload = encrypted.encryptedPayload;
  record.activePayloadNonce = encrypted.payloadNonce;
  record.activePayloadAadVersion = encrypted.payloadAadVersion;
  record.activeItemCount = encrypted.itemCount;
  record.activeChecksum = encrypted.checksum;
  clearPendingState(record);
  await putCacheRecord(record);
}

export async function beginExtensionVaultCachePending(input) {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const record = normalizeToV2Record(await getCacheRecord(buildCacheKey(input)), input);
  if (
    typeof record.pendingSyncId === 'string' &&
    record.pendingSyncId.length > 0 &&
    record.pendingSyncId !== input.syncId &&
    !isPendingSnapshotStale(record)
  ) {
    throw new Error('pending_sync_in_progress');
  }
  record.schemaVersion = CACHE_SCHEMA_VERSION;
  clearPendingState(record);
  record.pendingSyncId = input.syncId;
  record.pendingStartedAt = nowIso();
  record.pendingBaseSnapshotToken =
    typeof input.baseSnapshotToken === 'string' ? input.baseSnapshotToken : record.activeSnapshotToken ?? null;
  record.pendingProgress = 0;
  await putCacheRecord(record);
}

export async function writeExtensionVaultCachePending(input) {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const record = normalizeToV2Record(await getCacheRecord(buildCacheKey(input)), input);
  if (record.pendingSyncId !== input.syncId) {
    throw new Error('pending_sync_mismatch');
  }
  const encrypted = await encryptCredentialsSnapshot({
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    key,
    credentials: input.credentials,
  });
  record.pendingSnapshotToken = typeof input.snapshotToken === 'string' ? input.snapshotToken : null;
  record.pendingGeneratedAt = nowIso();
  record.pendingEncryptedPayload = encrypted.encryptedPayload;
  record.pendingPayloadNonce = encrypted.payloadNonce;
  record.pendingPayloadAadVersion = encrypted.payloadAadVersion;
  record.pendingItemCount = encrypted.itemCount;
  record.pendingChecksum = encrypted.checksum;
  record.pendingProgress =
    Number.isFinite(Number(input.progress)) ? Math.max(0, Math.min(1, Number(input.progress))) : 1;
  await putCacheRecord(record);
}

export async function finalizeExtensionVaultCachePending(input) {
  if (!hasIndexedDbSupport()) {
    return {
      ok: false,
      reason: 'indexeddb_unavailable',
    };
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const record = normalizeToV2Record(await getCacheRecord(buildCacheKey(input)), input);
  if (record.pendingSyncId !== input.syncId) {
    return {
      ok: false,
      reason: 'pending_sync_mismatch',
    };
  }
  if (
    typeof record.pendingEncryptedPayload !== 'string' ||
    typeof record.pendingPayloadNonce !== 'string' ||
    record.pendingPayloadAadVersion !== CACHE_AAD_VERSION
  ) {
    return {
      ok: false,
      reason: 'pending_payload_missing',
    };
  }
  const decrypted = await decryptCredentialsSnapshot({
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
    key,
    encryptedPayload: record.pendingEncryptedPayload,
    payloadNonce: record.pendingPayloadNonce,
  });
  if (
    Number.isFinite(Number(input.expectedItemCount)) &&
    Math.trunc(Number(input.expectedItemCount)) !== decrypted.credentials.length
  ) {
    return {
      ok: false,
      reason: 'pending_item_count_mismatch',
    };
  }
  if (typeof record.pendingChecksum === 'string' && record.pendingChecksum.length > 0 && record.pendingChecksum !== decrypted.checksum) {
    return {
      ok: false,
      reason: 'pending_checksum_mismatch',
    };
  }
  return {
    ok: true,
    itemCount: decrypted.credentials.length,
    checksum: decrypted.checksum,
    snapshotToken: typeof record.pendingSnapshotToken === 'string' ? record.pendingSnapshotToken : null,
  };
}

export async function promoteExtensionVaultCachePending(input) {
  if (!hasIndexedDbSupport()) {
    return {
      ok: false,
      reason: 'indexeddb_unavailable',
    };
  }
  const record = normalizeToV2Record(await getCacheRecord(buildCacheKey(input)), input);
  if (record.pendingSyncId !== input.syncId) {
    return {
      ok: false,
      reason: 'pending_sync_mismatch',
    };
  }
  if (
    typeof record.pendingEncryptedPayload !== 'string' ||
    typeof record.pendingPayloadNonce !== 'string' ||
    record.pendingPayloadAadVersion !== CACHE_AAD_VERSION
  ) {
    return {
      ok: false,
      reason: 'pending_payload_missing',
    };
  }
  record.activeSnapshotToken =
    typeof record.pendingSnapshotToken === 'string' ? record.pendingSnapshotToken : null;
  record.activeGeneratedAt =
    typeof record.pendingGeneratedAt === 'string' ? record.pendingGeneratedAt : nowIso();
  record.activeEncryptedPayload = record.pendingEncryptedPayload;
  record.activePayloadNonce = record.pendingPayloadNonce;
  record.activePayloadAadVersion = record.pendingPayloadAadVersion;
  record.activeItemCount = Number.isFinite(Number(record.pendingItemCount))
    ? Math.max(0, Math.trunc(Number(record.pendingItemCount)))
    : 0;
  record.activeChecksum = typeof record.pendingChecksum === 'string' ? record.pendingChecksum : null;
  clearPendingState(record);
  await putCacheRecord(record);
  return { ok: true };
}

export async function discardExtensionVaultCachePending(input) {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const record = normalizeToV2Record(await getCacheRecord(buildCacheKey(input)), input);
  if (input.syncId && record.pendingSyncId !== input.syncId) {
    return;
  }
  if (!record.pendingSyncId) {
    return;
  }
  clearPendingState(record);
  await putCacheRecord(record);
}

export async function clearExtensionVaultCache(input) {
  if (!hasIndexedDbSupport()) {
    return;
  }
  await withStore('readwrite', (store) => store.delete(buildCacheKey(input)));
}

export async function loadExtensionProjectionCache(input) {
  if (!hasIndexedDbSupport()) {
    return null;
  }
  const record = await withStore('readonly', (store) => store.get(buildProjectionStorageKey(input)));
  if (!record || typeof record !== 'object') {
    return null;
  }
  if (
    typeof record.encryptedProjection !== 'string' ||
    typeof record.projectionNonce !== 'string' ||
    record.projectionAadVersion !== PROJECTION_AAD_VERSION
  ) {
    return null;
  }
  const key = await deriveProjectionCacheKey({
    accountKey: input.accountKey,
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(record.projectionNonce)),
      additionalData: toArrayBuffer(
        buildProjectionAad({
          username: input.username,
          deviceId: input.deviceId,
          deploymentFingerprint: input.deploymentFingerprint,
        }),
      ),
    },
    key,
    toArrayBuffer(base64UrlToBytes(record.encryptedProjection)),
  );
  const parsed = JSON.parse(textDecoder.decode(plaintext));
  if (!Array.isArray(parsed?.items)) {
    return null;
  }
  return {
    loadedAt: Number.isFinite(Number(parsed.loadedAt)) ? Math.trunc(Number(parsed.loadedAt)) : Date.now(),
    items: parsed.items,
  };
}

export async function saveExtensionProjectionCache(input) {
  if (!hasIndexedDbSupport()) {
    return;
  }
  const key = await deriveProjectionCacheKey({
    accountKey: input.accountKey,
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encryptedProjection = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(
        buildProjectionAad({
          username: input.username,
          deviceId: input.deviceId,
          deploymentFingerprint: input.deploymentFingerprint,
        }),
      ),
    },
    key,
    textEncoder.encode(
      JSON.stringify({
        schemaVersion: 1,
        loadedAt: Number.isFinite(Number(input.loadedAt)) ? Math.trunc(Number(input.loadedAt)) : Date.now(),
        items: Array.isArray(input.items) ? input.items : [],
      }),
    ),
  );
  await withStore('readwrite', (store) =>
    store.put({
      cacheKey: buildProjectionStorageKey(input),
      username: input.username,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
      generatedAt: new Date().toISOString(),
      encryptedProjection: bytesToBase64Url(new Uint8Array(encryptedProjection)),
      projectionNonce: bytesToBase64Url(nonce),
      projectionAadVersion: PROJECTION_AAD_VERSION,
    }),
  );
}

export async function clearExtensionProjectionCache(input) {
  if (!hasIndexedDbSupport()) {
    return;
  }
  await withStore('readwrite', (store) => store.delete(buildProjectionStorageKey(input)));
}
