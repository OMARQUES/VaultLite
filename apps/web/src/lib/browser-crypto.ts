import { argon2idAsync } from '@noble/hashes/argon2.js';
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { AttachmentEnvelopeSchema } from '@vaultlite/contracts';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const REMOTE_AUTH_KDF_PROFILE = {
  memory: 65536,
  passes: 3,
  parallelism: 4,
  tagLength: 32,
} as const;

const LOCAL_UNLOCK_KDF_FLOOR = {
  memory: 32_768,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
} as const;

const LOCAL_UNLOCK_KDF_CEILING = {
  memory: 131_072,
  passes: 4,
  parallelism: 4,
  tagLength: 32,
} as const;

const LOCAL_UNLOCK_KDF_TARGET_MIN_MS = 600;
const LOCAL_UNLOCK_KDF_TARGET_MAX_MS = 900;

export interface LocalUnlockKdfProfile {
  algorithm: 'argon2id';
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: 32;
}

export interface LocalUnlockEnvelope {
  version: 'local-unlock.v1';
  nonce: string;
  ciphertext: string;
  kdfProfile?: LocalUnlockKdfProfile;
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

export function normalizeLocalUnlockKdfProfile(
  input?: Partial<LocalUnlockKdfProfile> | null,
): LocalUnlockKdfProfile {
  const memory = Number.isFinite(input?.memory) ? Math.trunc(Number(input?.memory)) : REMOTE_AUTH_KDF_PROFILE.memory;
  const passes = Number.isFinite(input?.passes) ? Math.trunc(Number(input?.passes)) : REMOTE_AUTH_KDF_PROFILE.passes;
  const parallelism = Number.isFinite(input?.parallelism)
    ? Math.trunc(Number(input?.parallelism))
    : REMOTE_AUTH_KDF_PROFILE.parallelism;

  return {
    algorithm: 'argon2id',
    memory: Math.max(LOCAL_UNLOCK_KDF_FLOOR.memory, Math.min(memory, LOCAL_UNLOCK_KDF_CEILING.memory)),
    passes: Math.max(LOCAL_UNLOCK_KDF_FLOOR.passes, Math.min(passes, LOCAL_UNLOCK_KDF_CEILING.passes)),
    parallelism: Math.max(
      LOCAL_UNLOCK_KDF_FLOOR.parallelism,
      Math.min(parallelism, LOCAL_UNLOCK_KDF_CEILING.parallelism),
    ),
    tagLength: 32,
  };
}

export const LOCAL_UNLOCK_KDF_BASELINE_PROFILE = normalizeLocalUnlockKdfProfile({
  memory: REMOTE_AUTH_KDF_PROFILE.memory,
  passes: REMOTE_AUTH_KDF_PROFILE.passes,
  parallelism: REMOTE_AUTH_KDF_PROFILE.parallelism,
  tagLength: 32,
});

async function deriveKeyMaterial(
  password: string,
  authSalt: string,
  profile: {
    memory: number;
    passes: number;
    parallelism: number;
    tagLength: number;
  },
): Promise<Uint8Array> {
  return argon2idAsync(password, base64UrlToBytes(authSalt), {
    m: profile.memory,
    t: profile.passes,
    p: profile.parallelism,
    dkLen: profile.tagLength,
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
  const keyMaterial = await deriveKeyMaterial(password, authSalt, REMOTE_AUTH_KDF_PROFILE);
  return bytesToBase64Url(keyMaterial);
}

async function benchmarkLocalUnlockKdfProfile(profile: LocalUnlockKdfProfile): Promise<number> {
  const samplePassword = `vaultlite-local-kdf:${createRandomBase64Url(12)}`;
  const sampleSalt = createRandomBase64Url(16);
  const startedAt = performance.now();
  await deriveKeyMaterial(samplePassword, sampleSalt, profile);
  return performance.now() - startedAt;
}

export async function calibrateLocalUnlockKdfProfile(): Promise<LocalUnlockKdfProfile> {
  const candidates: LocalUnlockKdfProfile[] = [
    LOCAL_UNLOCK_KDF_BASELINE_PROFILE,
    normalizeLocalUnlockKdfProfile({ memory: 65_536, passes: 2, parallelism: 2, tagLength: 32 }),
    normalizeLocalUnlockKdfProfile({ memory: 49_152, passes: 2, parallelism: 2, tagLength: 32 }),
    normalizeLocalUnlockKdfProfile({ memory: 32_768, passes: 2, parallelism: 1, tagLength: 32 }),
  ];

  let fallback = LOCAL_UNLOCK_KDF_BASELINE_PROFILE;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    try {
      const elapsedMs = await benchmarkLocalUnlockKdfProfile(candidate);
      if (elapsedMs <= LOCAL_UNLOCK_KDF_TARGET_MAX_MS && elapsedMs >= LOCAL_UNLOCK_KDF_TARGET_MIN_MS) {
        return candidate;
      }
      const distance = Math.abs(elapsedMs - LOCAL_UNLOCK_KDF_TARGET_MAX_MS);
      if (distance < bestDistance) {
        bestDistance = distance;
        fallback = candidate;
      }
      if (elapsedMs > LOCAL_UNLOCK_KDF_TARGET_MAX_MS) {
        continue;
      }
      return candidate;
    } catch {
      fallback = normalizeLocalUnlockKdfProfile({
        memory: Math.max(LOCAL_UNLOCK_KDF_FLOOR.memory, Math.trunc(candidate.memory / 2)),
        passes: Math.max(LOCAL_UNLOCK_KDF_FLOOR.passes, candidate.passes - 1),
        parallelism: Math.max(LOCAL_UNLOCK_KDF_FLOOR.parallelism, candidate.parallelism - 1),
        tagLength: 32,
      });
    }
  }
  return fallback;
}

export async function createLocalUnlockEnvelope(input: {
  password: string;
  authSalt: string;
  payload: unknown;
  kdfProfile?: LocalUnlockKdfProfile | null;
  calibrateKdf?: boolean;
}): Promise<LocalUnlockEnvelope> {
  const kdfProfile =
    input.kdfProfile ??
    (input.calibrateKdf === true
      ? await calibrateLocalUnlockKdfProfile()
      : LOCAL_UNLOCK_KDF_BASELINE_PROFILE);
  const normalizedProfile = normalizeLocalUnlockKdfProfile(kdfProfile);
  const keyMaterial = await deriveKeyMaterial(input.password, input.authSalt, normalizedProfile);
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
    kdfProfile: normalizedProfile,
  };
}

export async function decryptLocalUnlockEnvelope<T>(input: {
  password: string;
  authSalt: string;
  envelope: LocalUnlockEnvelope;
  kdfProfile?: LocalUnlockKdfProfile | null;
}): Promise<T> {
  const profile = normalizeLocalUnlockKdfProfile(input.envelope.kdfProfile ?? input.kdfProfile ?? null);
  const keyMaterial = await deriveKeyMaterial(input.password, input.authSalt, profile);
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
  itemType: 'login' | 'document' | 'card' | 'secure_note';
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

export async function encryptAttachmentBlobPayload(input: {
  accountKey: string;
  plaintext: ArrayBuffer;
  contentType: string;
}): Promise<string> {
  const key = await importAccountKey(input.accountKey, 'encrypt');
  const nonce = randomBytes(12);
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

  const envelope = AttachmentEnvelopeSchema.parse({
    version: 'blob.v1',
    algorithm: 'aes-256-gcm',
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(cipherBytes),
    authTag: bytesToBase64Url(authTag),
    contentType: input.contentType,
    originalSize: input.plaintext.byteLength,
  });

  return bytesToBase64Url(textEncoder.encode(JSON.stringify(envelope)));
}
