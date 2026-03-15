import { describe, expect, it } from 'vitest';

import {
  AccountKitPayloadSchema,
  AttachmentEnvelopeSchema,
  InviteCreateInputSchema,
  OnboardingCompleteInputSchema,
  PasswordRotationInputSchema,
  RemoteAuthenticationChallengeInputSchema,
  RemoteAuthenticationInputSchema,
  VaultItemCreateInputSchema,
  VaultItemRecordSchema,
  VaultItemTombstoneRecordSchema,
  VaultItemUpdateInputSchema,
  VaultEnvelopeSchema,
} from './index';

describe('contracts schemas', () => {
  it('accepts a valid Account Kit payload', () => {
    const result = AccountKitPayloadSchema.safeParse({
      version: 'account-kit.v1',
      serverUrl: 'https://vaultlite.example.com',
      username: 'alice',
      accountKey: 'A'.repeat(43),
      deploymentFingerprint: 'fp_owner_deployment',
      issuedAt: '2026-03-15T12:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects Account Kit payloads with forbidden extra fields', () => {
    const result = AccountKitPayloadSchema.safeParse({
      version: 'account-kit.v1',
      serverUrl: 'https://vaultlite.example.com',
      username: 'alice',
      accountKey: 'A'.repeat(43),
      deploymentFingerprint: 'fp_owner_deployment',
      issuedAt: '2026-03-15T12:00:00.000Z',
      masterPassword: 'forbidden',
    });

    expect(result.success).toBe(false);
  });

  it('validates vault and attachment envelope versions separately', () => {
    expect(VaultEnvelopeSchema.safeParse({
      version: 'vault.v1',
      algorithm: 'aes-256-gcm',
      nonce: 'A'.repeat(16),
      ciphertext: 'B'.repeat(16),
      authTag: 'C'.repeat(16),
      aad: 'vault-item:login',
    }).success).toBe(true);

    expect(AttachmentEnvelopeSchema.safeParse({
      version: 'blob.v1',
      algorithm: 'aes-256-gcm',
      nonce: 'A'.repeat(16),
      ciphertext: 'B'.repeat(16),
      authTag: 'C'.repeat(16),
      contentType: 'application/pdf',
      originalSize: 1024,
    }).success).toBe(true);
  });

  it('requires expected_bundle_version for password rotation', () => {
    const result = PasswordRotationInputSchema.safeParse({
      currentPassword: 'current',
      nextPassword: 'next',
    });

    expect(result.success).toBe(false);
  });

  it('validates onboarding completion input shape', () => {
    const result = OnboardingCompleteInputSchema.safeParse({
      inviteToken: 'invite_123',
      username: 'alice',
      authSalt: 'A'.repeat(22),
      authVerifier: 'verifier_payload',
      encryptedAccountBundle: 'bundle_payload',
      accountKeyWrapped: 'wrapped_key_payload',
      accountKitExportAcknowledged: true,
      zeroRecoveryAcknowledged: true,
      initialDevice: {
        deviceId: 'device_123',
        deviceName: 'Alice laptop',
        platform: 'web',
      },
    });

    expect(result.success).toBe(true);
  });

  it('requires opaque auth proof and device id for remote authentication', () => {
    expect(
      RemoteAuthenticationChallengeInputSchema.safeParse({
        username: 'alice',
      }).success,
    ).toBe(true);

    expect(
      RemoteAuthenticationInputSchema.safeParse({
        username: 'alice',
        deviceId: 'device_123',
        authProof: 'opaque-proof',
      }).success,
    ).toBe(true);
  });

  it('validates invite issuance input', () => {
    expect(
      InviteCreateInputSchema.safeParse({
        expiresAt: '2026-03-20T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('validates encrypted vault item CRUD contracts', () => {
    expect(
      VaultItemCreateInputSchema.safeParse({
        itemType: 'login',
        encryptedPayload: 'encrypted_payload_v1',
      }).success,
    ).toBe(true);

    expect(
      VaultItemUpdateInputSchema.safeParse({
        itemType: 'document',
        encryptedPayload: 'encrypted_payload_v2',
        expectedRevision: 2,
      }).success,
    ).toBe(true);

    expect(
      VaultItemRecordSchema.safeParse({
        itemId: 'item_1',
        itemType: 'login',
        revision: 1,
        encryptedPayload: 'encrypted_payload_v1',
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('validates vault item tombstones as a distinct schema', () => {
    expect(
      VaultItemTombstoneRecordSchema.safeParse({
        itemId: 'item_1',
        ownerUserId: 'user_1',
        itemType: 'login',
        revision: 2,
        deletedAt: '2026-03-15T12:10:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      VaultItemTombstoneRecordSchema.safeParse({
        ownerUserId: 'user_1',
        itemType: 'login',
        revision: 2,
        deletedAt: '2026-03-15T12:10:00.000Z',
      }).success,
    ).toBe(false);
  });
});
