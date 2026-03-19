import { argon2Sync, createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type {
  BackupAttachmentEntryV1,
  BackupManifestV1,
  EncryptedBackupPackageV1,
  VaultJsonExportV1,
} from '@vaultlite/contracts';
import {
  EncryptedBackupPackageV1Schema,
  VaultJsonExportV1Schema,
} from '@vaultlite/contracts';
import { fromBase64Url, toBase64Url } from './base64';

export interface BackupKdfProfile {
  algorithm: 'argon2id';
  memory: number;
  passes: number;
  parallelism: number;
  dkLen: number;
}

export const BACKUP_KDF_PROFILE: BackupKdfProfile = {
  algorithm: 'argon2id',
  memory: 65536,
  passes: 3,
  parallelism: 1,
  dkLen: 32,
};

const BACKUP_AAD = 'vaultlite.backup.v1';
const GCM_NONCE_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;

interface CanonicalRecord {
  [key: string]: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value && typeof value === 'object') {
    const sortedEntries = Object.entries(value as CanonicalRecord).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const output: CanonicalRecord = {};
    for (const [key, entryValue] of sortedEntries) {
      output[key] = canonicalize(entryValue);
    }
    return output;
  }
  return value;
}

function serializeCanonical(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256Base64Url(value: string): string {
  return toBase64Url(createHash('sha256').update(value, 'utf8').digest());
}

export function deriveBackupKey(input: {
  passphrase: string;
  salt?: Buffer;
  profile?: Partial<BackupKdfProfile>;
}): {
  key: Buffer;
  salt: Buffer;
  profile: BackupKdfProfile;
} {
  const profile = {
    ...BACKUP_KDF_PROFILE,
    ...(input.profile ?? {}),
    algorithm: 'argon2id' as const,
  };
  const salt = input.salt ?? randomBytes(16);
  const key = argon2Sync('argon2id', {
    message: input.passphrase,
    nonce: salt,
    memory: profile.memory,
    passes: profile.passes,
    parallelism: profile.parallelism,
    tagLength: profile.dkLen,
  });

  return {
    key,
    salt,
    profile,
  };
}

export function encryptBackupPayload(input: {
  key: Buffer;
  plaintext: string;
  nonce?: Buffer;
}): {
  ciphertext: string;
  authTag: string;
  nonce: string;
  plaintextSha256: string;
} {
  const nonce = input.nonce ?? randomBytes(GCM_NONCE_LENGTH);
  const cipherInstance = createCipheriv('aes-256-gcm', input.key, nonce, {
    authTagLength: GCM_AUTH_TAG_LENGTH,
  });
  cipherInstance.setAAD(Buffer.from(BACKUP_AAD, 'utf8'));
  const ciphertext = Buffer.concat([
    cipherInstance.update(Buffer.from(input.plaintext, 'utf8')),
    cipherInstance.final(),
  ]);
  const authTag = cipherInstance.getAuthTag();

  return {
    ciphertext: toBase64Url(ciphertext),
    authTag: toBase64Url(authTag),
    nonce: toBase64Url(nonce),
    plaintextSha256: sha256Base64Url(input.plaintext),
  };
}

export function decryptBackupPayload(input: {
  key: Buffer;
  ciphertext: string;
  authTag: string;
  nonce: string;
}): string {
  const decipher = createDecipheriv('aes-256-gcm', input.key, fromBase64Url(input.nonce), {
    authTagLength: GCM_AUTH_TAG_LENGTH,
  });
  decipher.setAAD(Buffer.from(BACKUP_AAD, 'utf8'));
  decipher.setAuthTag(fromBase64Url(input.authTag));
  const plaintext = Buffer.concat([
    decipher.update(fromBase64Url(input.ciphertext)),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export function createBackupPackageV1(input: {
  passphrase: string;
  exportPayload: VaultJsonExportV1;
  source: EncryptedBackupPackageV1['source'];
  manifest: BackupManifestV1;
  attachments?: BackupAttachmentEntryV1[];
  createdAt?: string;
  salt?: Buffer;
  nonce?: Buffer;
}): EncryptedBackupPackageV1 {
  const parsedExport = VaultJsonExportV1Schema.parse(input.exportPayload);
  const canonicalPlaintext = serializeCanonical(parsedExport);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const { key, salt, profile } = deriveBackupKey({
    passphrase: input.passphrase,
    salt: input.salt,
  });
  const encrypted = encryptBackupPayload({
    key,
    plaintext: canonicalPlaintext,
    nonce: input.nonce,
  });

  return EncryptedBackupPackageV1Schema.parse({
    version: 'vaultlite.backup.v1',
    createdAt,
    source: input.source,
    manifest: input.manifest,
    kdf: {
      algorithm: profile.algorithm,
      memory: profile.memory,
      passes: profile.passes,
      parallelism: profile.parallelism,
      dkLen: profile.dkLen,
      salt: toBase64Url(salt),
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      nonce: encrypted.nonce,
      aad: BACKUP_AAD,
    },
    payload: {
      ciphertext: encrypted.ciphertext,
      authTag: encrypted.authTag,
      plaintextSha256: encrypted.plaintextSha256,
    },
    vault: {
      attachments: input.attachments ?? [],
    },
  });
}

export function parseAndValidateBackupPackageV1(input: {
  packageJson: string | EncryptedBackupPackageV1;
  passphrase: string;
}): {
  package: EncryptedBackupPackageV1;
  exportPayload: VaultJsonExportV1;
} {
  const parsedPackage = EncryptedBackupPackageV1Schema.parse(
    typeof input.packageJson === 'string' ? JSON.parse(input.packageJson) : input.packageJson,
  );
  const { key } = deriveBackupKey({
    passphrase: input.passphrase,
    salt: fromBase64Url(parsedPackage.kdf.salt),
    profile: {
      memory: parsedPackage.kdf.memory,
      passes: parsedPackage.kdf.passes,
      parallelism: parsedPackage.kdf.parallelism,
      dkLen: parsedPackage.kdf.dkLen,
    },
  });
  const plaintext = decryptBackupPayload({
    key,
    ciphertext: parsedPackage.payload.ciphertext,
    authTag: parsedPackage.payload.authTag,
    nonce: parsedPackage.encryption.nonce,
  });
  if (sha256Base64Url(plaintext) !== parsedPackage.payload.plaintextSha256) {
    throw new Error('Backup payload integrity mismatch');
  }

  return {
    package: parsedPackage,
    exportPayload: VaultJsonExportV1Schema.parse(JSON.parse(plaintext)),
  };
}
