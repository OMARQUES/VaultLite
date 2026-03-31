import { base64UrlToBytes, bytesToBase64Url, toArrayBuffer } from './runtime-common.js';
import { argon2idAsync } from './vendor/noble-hashes/argon2.js';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const LOCAL_UNLOCK_KDF_FLOOR = Object.freeze({
  algorithm: 'argon2id',
  memory: 32768,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
});

const LOCAL_UNLOCK_KDF_CEILING = Object.freeze({
  algorithm: 'argon2id',
  memory: 131072,
  passes: 4,
  parallelism: 4,
  tagLength: 32,
});

export const LOCAL_UNLOCK_KDF_PROFILE = Object.freeze({
  algorithm: 'argon2id',
  memory: 65536,
  passes: 3,
  parallelism: 4,
  tagLength: 32,
});

const LOCAL_UNLOCK_KDF_TARGET_MIN_MS = 600;
const LOCAL_UNLOCK_KDF_TARGET_MAX_MS = 900;

export function normalizeLocalUnlockKdfProfile(rawProfile) {
  const memory = Number.isFinite(rawProfile?.memory)
    ? Math.trunc(Number(rawProfile.memory))
    : LOCAL_UNLOCK_KDF_PROFILE.memory;
  const passes = Number.isFinite(rawProfile?.passes)
    ? Math.trunc(Number(rawProfile.passes))
    : LOCAL_UNLOCK_KDF_PROFILE.passes;
  const parallelism = Number.isFinite(rawProfile?.parallelism)
    ? Math.trunc(Number(rawProfile.parallelism))
    : LOCAL_UNLOCK_KDF_PROFILE.parallelism;
  const rawTagLength = Number.isFinite(rawProfile?.tagLength)
    ? Math.trunc(Number(rawProfile.tagLength))
    : Number.isFinite(rawProfile?.dkLen)
      ? Math.trunc(Number(rawProfile.dkLen))
      : LOCAL_UNLOCK_KDF_PROFILE.tagLength;
  return Object.freeze({
    algorithm: 'argon2id',
    memory: Math.max(LOCAL_UNLOCK_KDF_FLOOR.memory, Math.min(memory, LOCAL_UNLOCK_KDF_CEILING.memory)),
    passes: Math.max(LOCAL_UNLOCK_KDF_FLOOR.passes, Math.min(passes, LOCAL_UNLOCK_KDF_CEILING.passes)),
    parallelism: Math.max(
      LOCAL_UNLOCK_KDF_FLOOR.parallelism,
      Math.min(parallelism, LOCAL_UNLOCK_KDF_CEILING.parallelism),
    ),
    tagLength: rawTagLength === 32 ? 32 : LOCAL_UNLOCK_KDF_PROFILE.tagLength,
  });
}

async function deriveKeyMaterial(password, authSalt, profile = LOCAL_UNLOCK_KDF_PROFILE) {
  let saltBytes;
  try {
    saltBytes = base64UrlToBytes(authSalt);
  } catch (error) {
    const stateError = new Error('trusted_state_invalid_auth_salt');
    stateError.cause = error;
    throw stateError;
  }

  try {
    return await argon2idAsync(password, saltBytes, {
      m: profile.memory,
      t: profile.passes,
      p: profile.parallelism,
      dkLen: profile.tagLength,
    });
  } catch (error) {
    const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
    if (
      error instanceof RangeError ||
      message.includes('array') ||
      message.includes('memory') ||
      message.includes('allocation')
    ) {
      const memoryError = new Error('argon2_memory_budget_exceeded');
      memoryError.cause = error;
      throw memoryError;
    }
    const runtimeError = new Error('argon2_runtime_unavailable');
    runtimeError.cause = error;
    throw runtimeError;
  }
}

async function importRawAesKey(keyMaterial, usage) {
  return crypto.subtle.importKey('raw', toArrayBuffer(keyMaterial), { name: 'AES-GCM' }, false, [usage]);
}

async function benchmarkLocalUnlockKdfProfile(profile) {
  const samplePassword = `vaultlite-local-kdf:${bytesToBase64Url(crypto.getRandomValues(new Uint8Array(12)))}`;
  const sampleSalt = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const startedAt = performance.now();
  await deriveKeyMaterial(samplePassword, sampleSalt, profile);
  return performance.now() - startedAt;
}

export async function calibrateLocalUnlockKdfProfile() {
  const candidates = [
    LOCAL_UNLOCK_KDF_PROFILE,
    normalizeLocalUnlockKdfProfile({ memory: 65536, passes: 2, parallelism: 2 }),
    normalizeLocalUnlockKdfProfile({ memory: 49152, passes: 2, parallelism: 2 }),
    normalizeLocalUnlockKdfProfile({ memory: 32768, passes: 2, parallelism: 1 }),
  ];
  let fallbackProfile = LOCAL_UNLOCK_KDF_PROFILE;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    try {
      const elapsedMs = await benchmarkLocalUnlockKdfProfile(candidate);
      if (elapsedMs >= LOCAL_UNLOCK_KDF_TARGET_MIN_MS && elapsedMs <= LOCAL_UNLOCK_KDF_TARGET_MAX_MS) {
        return candidate;
      }
      const distance = Math.abs(elapsedMs - LOCAL_UNLOCK_KDF_TARGET_MAX_MS);
      if (distance < bestDistance) {
        bestDistance = distance;
        fallbackProfile = candidate;
      }
      if (elapsedMs <= LOCAL_UNLOCK_KDF_TARGET_MAX_MS) {
        return candidate;
      }
    } catch {
      fallbackProfile = normalizeLocalUnlockKdfProfile({
        memory: Math.max(LOCAL_UNLOCK_KDF_FLOOR.memory, Math.trunc(candidate.memory / 2)),
        passes: Math.max(LOCAL_UNLOCK_KDF_FLOOR.passes, candidate.passes - 1),
        parallelism: Math.max(LOCAL_UNLOCK_KDF_FLOOR.parallelism, candidate.parallelism - 1),
      });
    }
  }
  return fallbackProfile;
}

export async function decryptLocalUnlockEnvelope(input) {
  if (input?.envelope?.version !== 'local-unlock.v1') {
    throw new Error('unsupported_local_unlock_version');
  }
  const profile = normalizeLocalUnlockKdfProfile(input?.envelope?.kdfProfile ?? input?.kdfProfile ?? null);
  const keyMaterial = await deriveKeyMaterial(input.password, input.authSalt, profile);
  const key = await importRawAesKey(keyMaterial, 'decrypt');
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(input.envelope.nonce)),
    },
    key,
    toArrayBuffer(base64UrlToBytes(input.envelope.ciphertext)),
  );
  return JSON.parse(textDecoder.decode(plaintext));
}

export async function createLocalUnlockEnvelope(input) {
  const profile = normalizeLocalUnlockKdfProfile(input?.kdfProfile ?? null);
  const keyMaterial = await deriveKeyMaterial(input.password, input.authSalt, profile);
  const key = await importRawAesKey(keyMaterial, 'encrypt');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(input.payload ?? null));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
    },
    key,
    plaintext,
  );
  return {
    version: 'local-unlock.v1',
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    kdfProfile: profile,
  };
}

async function importAccountKey(accountKey, usage) {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(base64UrlToBytes(accountKey)),
    { name: 'AES-GCM' },
    false,
    [usage],
  );
}

export async function encryptVaultItemPayload(input) {
  const itemType =
    typeof input?.itemType === 'string' && input.itemType.trim().length > 0
      ? input.itemType.trim()
      : 'secure_note';
  const key = await importAccountKey(input.accountKey, 'encrypt');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aadValue = `vault-item:${itemType}`;
  const aadBytes = textEncoder.encode(aadValue);
  const plaintext = textEncoder.encode(JSON.stringify(input.payload ?? null));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aadBytes),
    },
    key,
    plaintext,
  );
  const encryptedBytes = new Uint8Array(ciphertext);
  const authTagLength = 16;
  const cipherBytes = encryptedBytes.slice(0, encryptedBytes.length - authTagLength);
  const authTag = encryptedBytes.slice(encryptedBytes.length - authTagLength);

  return bytesToBase64Url(
    textEncoder.encode(
      JSON.stringify({
        version: 'vault.v1',
        algorithm: 'aes-256-gcm',
        nonce: bytesToBase64Url(nonce),
        ciphertext: bytesToBase64Url(cipherBytes),
        authTag: bytesToBase64Url(authTag),
        aad: aadValue,
      }),
    ),
  );
}

export async function encryptAttachmentBlobPayload(input) {
  const key = await importAccountKey(input.accountKey, 'encrypt');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
    },
    key,
    input.plaintext,
  );
  const encryptedBytes = new Uint8Array(ciphertext);
  const authTagLength = 16;
  const cipherBytes = encryptedBytes.slice(0, encryptedBytes.length - authTagLength);
  const authTag = encryptedBytes.slice(encryptedBytes.length - authTagLength);

  return bytesToBase64Url(
    textEncoder.encode(
      JSON.stringify({
        version: 'blob.v1',
        algorithm: 'aes-256-gcm',
        nonce: bytesToBase64Url(nonce),
        ciphertext: bytesToBase64Url(cipherBytes),
        authTag: bytesToBase64Url(authTag),
        contentType: typeof input?.contentType === 'string' ? input.contentType : 'application/octet-stream',
        originalSize:
          input?.plaintext instanceof ArrayBuffer
            ? input.plaintext.byteLength
            : ArrayBuffer.isView(input?.plaintext)
              ? input.plaintext.byteLength
              : 0,
      }),
    ),
  );
}

export async function decryptVaultItemPayload(input) {
  const envelopeRaw = textDecoder.decode(base64UrlToBytes(input.encryptedPayload));
  const envelope = JSON.parse(envelopeRaw);
  const cipherBytes = base64UrlToBytes(envelope.ciphertext);
  const authTagBytes = base64UrlToBytes(envelope.authTag);
  const sealed = new Uint8Array(cipherBytes.length + authTagBytes.length);
  sealed.set(cipherBytes, 0);
  sealed.set(authTagBytes, cipherBytes.length);

  const key = await importAccountKey(input.accountKey, 'decrypt');
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(envelope.nonce)),
      additionalData: toArrayBuffer(new TextEncoder().encode(envelope.aad ?? '')),
    },
    key,
    toArrayBuffer(sealed),
  );

  return JSON.parse(textDecoder.decode(plaintext));
}

export function normalizeCredentialPayload(rawPayload) {
  return normalizeVaultItemPayload('login', rawPayload);
}

function normalizedString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizedStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function normalizeNumberOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function maskCardNumber(value) {
  const digits = normalizedString(value).replace(/\D/g, '');
  if (digits.length < 4) {
    return '••••';
  }
  return `•••• ${digits.slice(-4)}`;
}

export function normalizeVaultItemPayload(itemType, rawPayload) {
  const title = normalizedString(rawPayload?.title, `Untitled ${itemType ?? 'item'}`);
  if (itemType === 'login') {
    return {
      title,
      username: normalizedString(rawPayload?.username),
      password: normalizedString(rawPayload?.password),
      urls: normalizedStringArray(rawPayload?.urls),
      notes: normalizedString(rawPayload?.notes),
      customFields: Array.isArray(rawPayload?.customFields) ? rawPayload.customFields : [],
      searchText: [
        title,
        normalizedString(rawPayload?.username),
        ...normalizedStringArray(rawPayload?.urls),
        normalizedString(rawPayload?.notes),
      ].join(' '),
    };
  }
  if (itemType === 'card') {
    const number = normalizedString(rawPayload?.number);
    return {
      title,
      cardholderName: normalizedString(rawPayload?.cardholderName),
      brand: normalizedString(rawPayload?.brand),
      number,
      numberMasked: maskCardNumber(number),
      expiryMonth: normalizeNumberOrNull(rawPayload?.expiryMonth),
      expiryYear: normalizeNumberOrNull(rawPayload?.expiryYear),
      securityCode: normalizedString(rawPayload?.securityCode),
      notes: normalizedString(rawPayload?.notes),
      customFields: Array.isArray(rawPayload?.customFields) ? rawPayload.customFields : [],
      searchText: [
        title,
        normalizedString(rawPayload?.cardholderName),
        normalizedString(rawPayload?.brand),
        normalizedString(rawPayload?.notes),
      ].join(' '),
    };
  }
  if (itemType === 'document') {
    const content = normalizedString(rawPayload?.content);
    return {
      title,
      content,
      customFields: Array.isArray(rawPayload?.customFields) ? rawPayload.customFields : [],
      searchText: `${title} ${content}`,
    };
  }
  if (itemType === 'secure_note') {
    const content = normalizedString(rawPayload?.content);
    return {
      title,
      content,
      customFields: Array.isArray(rawPayload?.customFields) ? rawPayload.customFields : [],
      searchText: `${title} ${content}`,
    };
  }

  return {
    title,
    searchText: title,
  };
}

export function buildCredentialFingerprint(input) {
  const firstUrl = Array.isArray(input.urls) && input.urls.length > 0 ? input.urls[0] : '';
  const raw = `${input.title ?? ''}|${input.username ?? ''}|${firstUrl}`;
  return bytesToBase64Url(new TextEncoder().encode(raw)).slice(0, 48);
}
