import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_KDF_PROFILE,
  assertSupportedVersion,
  canonicalizeAccountKitPayload,
  decryptBlobEnvelope,
  decryptVaultEnvelope,
  deriveMasterKey,
  generateAccountKitKeyPair,
  generateAccountKey,
  normalizeAccountKey,
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
});
