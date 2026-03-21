import { base64UrlToBytes, bytesToBase64Url, toArrayBuffer } from './runtime-common.js';
import { argon2idAsync } from './vendor/noble-hashes/argon2.js';

const textDecoder = new TextDecoder();

export const LOCAL_UNLOCK_KDF_PROFILE = Object.freeze({
  algorithm: 'argon2id',
  memory: 65536,
  passes: 3,
  parallelism: 4,
  dkLen: 32,
});

async function deriveKeyMaterial(password, authSalt) {
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
      m: LOCAL_UNLOCK_KDF_PROFILE.memory,
      t: LOCAL_UNLOCK_KDF_PROFILE.passes,
      p: LOCAL_UNLOCK_KDF_PROFILE.parallelism,
      dkLen: LOCAL_UNLOCK_KDF_PROFILE.dkLen,
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

export async function decryptLocalUnlockEnvelope(input) {
  if (input?.envelope?.version !== 'local-unlock.v1') {
    throw new Error('unsupported_local_unlock_version');
  }
  const keyMaterial = await deriveKeyMaterial(input.password, input.authSalt);
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

async function importAccountKey(accountKey, usage) {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(base64UrlToBytes(accountKey)),
    { name: 'AES-GCM' },
    false,
    [usage],
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
