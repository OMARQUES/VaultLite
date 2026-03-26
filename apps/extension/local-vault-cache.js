import { base64UrlToBytes, bytesToBase64Url, toArrayBuffer } from './runtime-common.js';

const DATABASE_NAME = 'vaultlite-extension-vault-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'vault_cache_v1';
const CACHE_KEY_CONTEXT = 'vaultlite.extension.local-cache.v1';
const PROJECTION_CACHE_KEY_CONTEXT = 'vaultlite.extension.local-projection-cache.v1';
const CACHE_AAD_VERSION = 'v1';
const PROJECTION_AAD_VERSION = 'v1';
const PROJECTION_CACHE_KEY_PREFIX = 'projection:';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function hasIndexedDbSupport() {
  return typeof indexedDB !== 'undefined';
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

export async function loadExtensionVaultCache(input) {
  if (!hasIndexedDbSupport()) {
    return null;
  }
  const cacheKey = buildCacheKey(input);
  const record = await withStore('readonly', (store) => store.get(cacheKey));
  if (!record || typeof record !== 'object') {
    return null;
  }
  if (
    typeof record.encryptedPayload !== 'string' ||
    typeof record.payloadNonce !== 'string' ||
    record.payloadAadVersion !== CACHE_AAD_VERSION
  ) {
    return null;
  }
  const key = await deriveCacheKey({
    accountKey: input.accountKey,
    username: input.username,
    deviceId: input.deviceId,
    deploymentFingerprint: input.deploymentFingerprint,
  });
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(record.payloadNonce)),
      additionalData: toArrayBuffer(
        buildAad({
          username: input.username,
          deviceId: input.deviceId,
          deploymentFingerprint: input.deploymentFingerprint,
        }),
      ),
    },
    key,
    toArrayBuffer(base64UrlToBytes(record.encryptedPayload)),
  );
  const parsed = JSON.parse(textDecoder.decode(plaintext));
  if (!Array.isArray(parsed?.credentials)) {
    return null;
  }
  return {
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : null,
    credentials: parsed.credentials,
    snapshotToken: typeof record.snapshotToken === 'string' ? record.snapshotToken : null,
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
    key,
    textEncoder.encode(
      JSON.stringify({
        schemaVersion: 1,
        credentials: Array.isArray(input.credentials) ? input.credentials : [],
      }),
    ),
  );
  await withStore('readwrite', (store) =>
    store.put({
      cacheKey: buildCacheKey(input),
      username: input.username,
      deviceId: input.deviceId,
      deploymentFingerprint: input.deploymentFingerprint,
      snapshotToken: typeof input.snapshotToken === 'string' ? input.snapshotToken : null,
      generatedAt: new Date().toISOString(),
      encryptedPayload: bytesToBase64Url(new Uint8Array(encryptedPayload)),
      payloadNonce: bytesToBase64Url(nonce),
      payloadAadVersion: CACHE_AAD_VERSION,
    }),
  );
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
