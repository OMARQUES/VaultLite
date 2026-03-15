import { argon2idAsync } from '@noble/hashes/argon2.js';
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const ACCOUNT_KDF_PROFILE = {
  memory: 65536,
  passes: 3,
  parallelism: 4,
  tagLength: 32,
} as const;

export interface LocalUnlockEnvelope {
  version: 'local-unlock.v1';
  nonce: string;
  ciphertext: string;
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

async function deriveKeyMaterial(password: string, authSalt: string): Promise<Uint8Array> {
  return argon2idAsync(password, base64UrlToBytes(authSalt), {
    m: ACCOUNT_KDF_PROFILE.memory,
    t: ACCOUNT_KDF_PROFILE.passes,
    p: ACCOUNT_KDF_PROFILE.parallelism,
    dkLen: ACCOUNT_KDF_PROFILE.tagLength,
  });
}

async function importAesKey(keyMaterial: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(keyMaterial), { name: 'AES-GCM' }, false, [
    usage,
  ]);
}

async function importAccountKey(accountKey: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(base64UrlToBytes(accountKey)),
    { name: 'AES-GCM' },
    false,
    [usage],
  );
}

export function createRandomBase64Url(length = 16): string {
  return bytesToBase64Url(randomBytes(length));
}

export function generateAccountKey(): string {
  return createRandomBase64Url(32);
}

export async function deriveAuthProof(password: string, authSalt: string): Promise<string> {
  const keyMaterial = await deriveKeyMaterial(password, authSalt);
  return bytesToBase64Url(keyMaterial);
}

export async function createLocalUnlockEnvelope(input: {
  password: string;
  authSalt: string;
  payload: unknown;
}): Promise<LocalUnlockEnvelope> {
  const keyMaterial = await deriveKeyMaterial(input.password, input.authSalt);
  const key = await importAesKey(keyMaterial, 'encrypt');
  const nonce = randomBytes(12);
  const plaintext = textEncoder.encode(JSON.stringify(input.payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
    key,
    plaintext,
  );

  return {
    version: 'local-unlock.v1',
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptLocalUnlockEnvelope<T>(input: {
  password: string;
  authSalt: string;
  envelope: LocalUnlockEnvelope;
}): Promise<T> {
  const keyMaterial = await deriveKeyMaterial(input.password, input.authSalt);
  const key = await importAesKey(keyMaterial, 'decrypt');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(input.envelope.nonce)) },
    key,
    toArrayBuffer(base64UrlToBytes(input.envelope.ciphertext)),
  );

  return JSON.parse(textDecoder.decode(plaintext)) as T;
}

export function createOpaqueBundlePlaceholder(input: {
  username: string;
  serverUrl: string;
  deviceId: string;
}): string {
  return bytesToBase64Url(
    utf8ToBytes(
      JSON.stringify({
        version: 'bundle-placeholder.v1',
        username: input.username,
        serverUrl: input.serverUrl,
        deviceId: input.deviceId,
      }),
    ),
  );
}

export async function encryptVaultItemPayload(input: {
  accountKey: string;
  itemType: 'login' | 'document';
  payload: unknown;
}): Promise<string> {
  const key = await importAccountKey(input.accountKey, 'encrypt');
  const nonce = randomBytes(12);
  const aad = textEncoder.encode(`vault-item:${input.itemType}`);
  const plaintext = textEncoder.encode(JSON.stringify(input.payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad),
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
        aad: `vault-item:${input.itemType}`,
      }),
    ),
  );
}

export async function decryptVaultItemPayload<T>(input: {
  accountKey: string;
  encryptedPayload: string;
}): Promise<T> {
  const envelope = JSON.parse(textDecoder.decode(base64UrlToBytes(input.encryptedPayload))) as {
    nonce: string;
    ciphertext: string;
    authTag: string;
    aad: string;
  };
  const key = await importAccountKey(input.accountKey, 'decrypt');
  const encryptedBytes = new Uint8Array(
    base64UrlToBytes(envelope.ciphertext).length + base64UrlToBytes(envelope.authTag).length,
  );
  encryptedBytes.set(base64UrlToBytes(envelope.ciphertext), 0);
  encryptedBytes.set(
    base64UrlToBytes(envelope.authTag),
    base64UrlToBytes(envelope.ciphertext).length,
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(envelope.nonce)),
      additionalData: toArrayBuffer(textEncoder.encode(envelope.aad)),
    },
    key,
    toArrayBuffer(encryptedBytes),
  );

  return JSON.parse(textDecoder.decode(plaintext)) as T;
}
