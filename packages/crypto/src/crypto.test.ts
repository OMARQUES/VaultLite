import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_KDF_PROFILE,
  BACKUP_KDF_PROFILE,
  assertSupportedVersion,
  canonicalizeAccountKitPayload,
  createBackupPackageV1,
  decryptBackupPayload,
  decryptBlobEnvelope,
  decryptVaultEnvelope,
  deriveBackupKey,
  deriveMasterKey,
  encryptBackupPayload,
  generateAccountKitKeyPair,
  generateAccountKey,
  normalizeAccountKey,
  parseAndValidateBackupPackageV1,
  signAccountKitPayload,
  verifyAccountKitSignature,
  encryptBlobEnvelope,
  encryptVaultEnvelope,
} from './index';

describe('crypto primitives', () => {
  it('derives the expected Argon2id test vector', () => {
    const derived = deriveMasterKey({
      password: 'correct horse battery staple',
      salt: Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
    });

    expect(ACCOUNT_KDF_PROFILE).toMatchObject({
      algorithm: 'argon2id',
      memory: 65536,
      passes: 3,
      parallelism: 4,
      tagLength: 32,
    });
    expect(derived.toString('hex')).toBe('aeb08a81bdb9da07c32f8f9d2c87cfba3313c0fdc7468179e494c56680f0ae8d');
  });

  it('generates and normalizes Account Keys in a stable format', () => {
    const accountKey = generateAccountKey();

    expect(accountKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(normalizeAccountKey(accountKey)).toHaveLength(32);
  });

  it('rejects unsupported ciphertext versions', () => {
    expect(() => assertSupportedVersion('vault.v2', ['vault.v1'])).toThrow(/Unsupported version/);
  });

  it('encrypts and decrypts vault payloads', () => {
    const key = Buffer.alloc(32, 7);
    const payload = Buffer.from(JSON.stringify({ itemType: 'login', secret: 'hunter2' }), 'utf8');

    const envelope = encryptVaultEnvelope({
      key,
      plaintext: payload,
      aad: 'vault-item:login',
      nonce: Buffer.alloc(12, 1),
    });
    const decrypted = decryptVaultEnvelope({ key, envelope, aad: 'vault-item:login' });

    expect(envelope.version).toBe('vault.v1');
    expect(decrypted.toString('utf8')).toBe(payload.toString('utf8'));
  });

  it('rejects tampered vault ciphertext', () => {
    const key = Buffer.alloc(32, 9);
    const payload = Buffer.from('secret', 'utf8');
    const envelope = encryptVaultEnvelope({
      key,
      plaintext: payload,
      aad: 'vault-item:login',
      nonce: Buffer.alloc(12, 2),
    });

    expect(() => decryptVaultEnvelope({
      key,
      envelope: { ...envelope, ciphertext: envelope.ciphertext.slice(0, -1) + 'A' },
      aad: 'vault-item:login',
    })).toThrow();
  });

  it('encrypts and decrypts blob payloads', () => {
    const key = Buffer.alloc(32, 5);
    const payload = Buffer.from('blob-data', 'utf8');

    const envelope = encryptBlobEnvelope({
      key,
      plaintext: payload,
      contentType: 'application/octet-stream',
      nonce: Buffer.alloc(12, 3),
    });
    const decrypted = decryptBlobEnvelope({ key, envelope });

    expect(envelope.version).toBe('blob.v1');
    expect(decrypted.toString('utf8')).toBe('blob-data');
  });

  it('canonicalizes Account Kit payloads deterministically', () => {
    const canonical = canonicalizeAccountKitPayload({
      username: 'alice',
      version: 'account-kit.v1',
      issuedAt: '2026-03-15T12:00:00.000Z',
      serverUrl: 'https://vaultlite.example.com',
      deploymentFingerprint: 'fp_owner_deployment',
      accountKey: 'A'.repeat(43),
    });

    expect(canonical).toBe('{"accountKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","deploymentFingerprint":"fp_owner_deployment","issuedAt":"2026-03-15T12:00:00.000Z","serverUrl":"https://vaultlite.example.com","username":"alice","version":"account-kit.v1"}');
  });

  it('signs and verifies Account Kit payloads', () => {
    const payload = {
      version: 'account-kit.v1',
      serverUrl: 'https://vaultlite.example.com',
      username: 'alice',
      accountKey: 'A'.repeat(43),
      deploymentFingerprint: 'fp_owner_deployment',
      issuedAt: '2026-03-15T12:00:00.000Z',
    } as const;
    const keyPair = generateAccountKitKeyPair();
    const signature = signAccountKitPayload({ payload, privateKey: keyPair.privateKey });

    expect(verifyAccountKitSignature({ payload, signature, publicKey: keyPair.publicKey })).toBe(true);
    expect(verifyAccountKitSignature({
      payload: { ...payload, username: 'mallory' },
      signature,
      publicKey: keyPair.publicKey,
    })).toBe(false);
  });

  it('encrypts and decrypts backup payloads with deterministic nonce', () => {
    const { key } = deriveBackupKey({
      passphrase: 'StrongBackupPassphrase!',
      salt: Buffer.alloc(16, 4),
    });
    const encrypted = encryptBackupPayload({
      key,
      plaintext: '{"version":"vaultlite.export.v1"}',
      nonce: Buffer.alloc(12, 5),
    });

    const decrypted = decryptBackupPayload({
      key,
      ciphertext: encrypted.ciphertext,
      authTag: encrypted.authTag,
      nonce: encrypted.nonce,
    });

    expect(BACKUP_KDF_PROFILE).toMatchObject({
      algorithm: 'argon2id',
      memory: 65536,
      passes: 3,
      parallelism: 1,
      dkLen: 32,
    });
    expect(decrypted).toBe('{"version":"vaultlite.export.v1"}');
  });

  it('creates and validates encrypted backup packages', () => {
    const backupPackage = createBackupPackageV1({
      passphrase: 'StrongBackupPassphrase!',
      exportPayload: {
        version: 'vaultlite.export.v1',
        exportedAt: '2026-03-18T12:00:00.000Z',
        source: {
          app: 'vaultlite-web',
          schemaVersion: 1,
          username: 'alice',
          deploymentFingerprint: 'development_deployment',
        },
        vault: {
          items: [
            {
              itemId: 'item_1',
              itemType: 'login',
              revision: 1,
              createdAt: '2026-03-18T11:00:00.000Z',
              updatedAt: '2026-03-18T11:30:00.000Z',
              payload: {
                title: 'Email',
                username: 'alice@example.com',
                password: 'opaque',
                urls: ['https://example.com'],
                notes: '',
                customFields: [],
              },
            },
          ],
          tombstones: [],
          counts: {
            items: 1,
            tombstones: 0,
          },
        },
        uiState: {
          favorites: ['item_1'],
          folderAssignments: {
            item_1: 'personal',
          },
          folders: [{ id: 'personal', name: 'Personal' }],
        },
      },
      source: {
        app: 'vaultlite-web',
        schemaVersion: 1,
        username: 'alice',
        deploymentFingerprint: 'development_deployment',
      },
      manifest: {
        itemCount: 1,
        tombstoneCount: 0,
        uiStateIncluded: true,
        attachmentMode: 'none',
        attachmentCount: 0,
        attachmentBytes: 0,
      },
      createdAt: '2026-03-18T12:01:00.000Z',
      salt: Buffer.alloc(16, 6),
      nonce: Buffer.alloc(12, 7),
    });

    const parsed = parseAndValidateBackupPackageV1({
      packageJson: backupPackage,
      passphrase: 'StrongBackupPassphrase!',
    });

    expect(parsed.package.version).toBe('vaultlite.backup.v1');
    expect(parsed.package.vault.attachments).toEqual([]);
    expect(parsed.exportPayload.version).toBe('vaultlite.export.v1');
    expect(parsed.exportPayload.vault.counts.items).toBe(1);
  });
});
