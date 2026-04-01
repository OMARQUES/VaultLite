import { describe, expect, it } from 'vitest';

import {
  BackupManifestV1Schema,
  AccountKitPayloadSchema,
  AttachmentEnvelopeSchema,
  AttachmentUploadContentInputSchema,
  AttachmentUploadEnvelopeOutputSchema,
  AttachmentUploadFinalizeInputSchema,
  AttachmentUploadFinalizeOutputSchema,
  AttachmentUploadInitInputSchema,
  AttachmentUploadInitOutputSchema,
  AttachmentUploadListOutputSchema,
  EncryptedBackupPackageV1Schema,
  InviteCreateInputSchema,
  OnboardingCompleteInputSchema,
  PasswordRotationInputSchema,
  RemoteAuthenticationChallengeInputSchema,
  RemoteAuthenticationInputSchema,
  SiteIconDiscoverBatchInputSchema,
  SiteIconDiscoverBatchOutputSchema,
  SiteIconManualListOutputSchema,
  SiteIconManualUpsertInputSchema,
  SiteIconResolveBatchInputSchema,
  SiteIconResolveBatchOutputSchema,
  VaultFormFrameScopeSchema,
  VaultFormMetadataConfidenceSchema,
  VaultFormMetadataListOutputSchema,
  VaultFormMetadataRecordSchema,
  VaultFormMetadataSelectorStatusSchema,
  VaultFormMetadataUpsertInputSchema,
  VaultFormFieldRoleSchema,
  VaultJsonExportV1Schema,
  VaultItemCreateInputSchema,
  VaultItemRecordSchema,
  VaultItemRestoreOutputSchema,
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
      currentAuthProof: 'proof_payload',
      nextAuthSalt: 'A'.repeat(22),
      nextAuthVerifier: 'next_verifier_payload',
      nextEncryptedAccountBundle: 'next_bundle_payload',
      nextAccountKeyWrapped: 'next_wrapped_key_payload',
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

    expect(
      VaultItemCreateInputSchema.safeParse({
        itemType: 'login',
        encryptedPayload: 'A'.repeat(256 * 1024 + 1),
      }).success,
    ).toBe(false);

    expect(
      VaultItemRestoreOutputSchema.safeParse({
        ok: true,
        result: 'success_no_op',
        item: {
          itemId: 'item_1',
          itemType: 'login',
          revision: 3,
          encryptedPayload: 'encrypted_payload_v3',
          createdAt: '2026-03-15T12:00:00.000Z',
          updatedAt: '2026-03-15T12:05:00.000Z',
        },
      }).success,
    ).toBe(true);
  });

  it('validates form metadata schemas', () => {
    expect(VaultFormFieldRoleSchema.safeParse('username').success).toBe(true);
    expect(VaultFormMetadataConfidenceSchema.safeParse('submitted_confirmed').success).toBe(true);
    expect(VaultFormMetadataSelectorStatusSchema.safeParse('suspect').success).toBe(true);
    expect(VaultFormFrameScopeSchema.safeParse('same_origin_iframe').success).toBe(true);

    expect(
      VaultFormMetadataRecordSchema.safeParse({
        metadataId: 'meta_1',
        ownerUserId: 'user_1',
        itemId: null,
        origin: 'https://accounts.example.com',
        formFingerprint: 'form_fp_1',
        fieldFingerprint: 'field_fp_1',
        frameScope: 'top',
        fieldRole: 'username',
        selectorCss: '#email',
        selectorFallbacks: ['input[name="email"]'],
        autocompleteToken: 'username',
        inputType: 'email',
        fieldName: 'email',
        fieldId: 'email',
        labelTextNormalized: 'email',
        placeholderNormalized: 'seu email',
        confidence: 'heuristic',
        selectorStatus: 'active',
        sourceDeviceId: 'device_1',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
        lastConfirmedAt: null,
      }).success,
    ).toBe(true);

    expect(
      VaultFormMetadataUpsertInputSchema.safeParse({
        itemId: null,
        origin: 'https://accounts.example.com',
        formFingerprint: 'form_fp_1',
        fieldFingerprint: 'field_fp_1',
        frameScope: 'top',
        fieldRole: 'password_current',
        selectorCss: 'input[type="password"]',
        selectorFallbacks: ['input[autocomplete="current-password"]'],
        autocompleteToken: 'current-password',
        inputType: 'password',
        fieldName: 'password',
        fieldId: 'password',
        labelTextNormalized: 'senha',
        placeholderNormalized: null,
        confidence: 'filled',
        selectorStatus: 'active',
      }).success,
    ).toBe(true);

    expect(
      VaultFormMetadataUpsertInputSchema.safeParse({
        itemId: null,
        origin: 'https://accounts.example.com',
        formFingerprint: 'form_fp_1',
        fieldFingerprint: 'field_fp_1',
        frameScope: 'top',
        fieldRole: 'password_current',
        selectorCss: 'input[type="password"]',
        selectorFallbacks: ['a', 'b', 'c', 'd', 'e', 'f'],
        autocompleteToken: 'current-password',
        inputType: 'password',
        fieldName: 'password',
        fieldId: 'password',
        labelTextNormalized: 'senha',
        placeholderNormalized: null,
        confidence: 'filled',
        selectorStatus: 'active',
      }).success,
    ).toBe(false);

    expect(
      VaultFormMetadataListOutputSchema.safeParse({
        records: [
          {
            metadataId: 'meta_1',
            ownerUserId: null,
            itemId: null,
            origin: 'https://accounts.example.com',
            formFingerprint: 'form_fp_1',
            fieldFingerprint: 'field_fp_1',
            frameScope: 'top',
            fieldRole: 'username',
            selectorCss: '#email',
            selectorFallbacks: [],
            autocompleteToken: 'username',
            inputType: 'email',
            fieldName: 'email',
            fieldId: 'email',
            labelTextNormalized: 'email',
            placeholderNormalized: null,
            confidence: 'heuristic',
            selectorStatus: 'active',
            sourceDeviceId: null,
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
            lastConfirmedAt: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('validates attachment upload lifecycle contracts', () => {
    expect(
      AttachmentUploadInitInputSchema.safeParse({
        itemId: 'item_doc_1',
        fileName: 'document.pdf',
        contentType: 'application/pdf',
        size: 1024,
        idempotencyKey: 'idem_1',
      }).success,
    ).toBe(true);

    expect(
      AttachmentUploadInitInputSchema.safeParse({
        itemId: 'item_doc_1',
        fileName: 'document.pdf',
        contentType: 'application/pdf',
        size: 25 * 1024 * 1024 + 1,
        idempotencyKey: 'idem_2',
      }).success,
    ).toBe(false);

    expect(
      AttachmentUploadContentInputSchema.safeParse({
        uploadToken: 'upload-token',
        encryptedEnvelope: 'encrypted_payload',
      }).success,
    ).toBe(true);

    expect(
      AttachmentUploadFinalizeInputSchema.safeParse({
        uploadId: 'attachment_1',
        itemId: 'item_doc_1',
      }).success,
    ).toBe(true);

    expect(
      AttachmentUploadInitOutputSchema.safeParse({
        uploadId: 'attachment_1',
        itemId: 'item_doc_1',
        fileName: 'document.pdf',
        lifecycleState: 'pending',
        contentType: 'application/pdf',
        size: 1024,
        expiresAt: '2026-03-15T12:15:00.000Z',
        uploadedAt: null,
        attachedAt: null,
        createdAt: '2026-03-15T12:00:00.000Z',
        updatedAt: '2026-03-15T12:00:00.000Z',
        uploadToken: 'upload-token',
      }).success,
    ).toBe(true);

    expect(
      AttachmentUploadListOutputSchema.safeParse({
        uploads: [
          {
            uploadId: 'attachment_1',
            itemId: 'item_doc_1',
            fileName: 'document.pdf',
            lifecycleState: 'uploaded',
            contentType: 'application/pdf',
            size: 1024,
            expiresAt: '2026-03-15T12:15:00.000Z',
            uploadedAt: '2026-03-15T12:01:00.000Z',
            attachedAt: null,
            createdAt: '2026-03-15T12:00:00.000Z',
            updatedAt: '2026-03-15T12:01:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      AttachmentUploadFinalizeOutputSchema.safeParse({
        ok: true,
        result: 'success_changed',
        upload: {
          uploadId: 'attachment_1',
          itemId: 'item_doc_1',
          fileName: 'document.pdf',
          lifecycleState: 'attached',
          contentType: 'application/pdf',
          size: 1024,
          expiresAt: '2026-03-15T12:15:00.000Z',
          uploadedAt: '2026-03-15T12:01:00.000Z',
          attachedAt: '2026-03-15T12:02:00.000Z',
          createdAt: '2026-03-15T12:00:00.000Z',
          updatedAt: '2026-03-15T12:02:00.000Z',
        },
      }).success,
    ).toBe(true);

    expect(
      AttachmentUploadEnvelopeOutputSchema.safeParse({
        uploadId: 'attachment_1',
        itemId: 'item_doc_1',
        fileName: 'document.pdf',
        contentType: 'application/pdf',
        size: 1024,
        uploadedAt: '2026-03-15T12:01:00.000Z',
        attachedAt: '2026-03-15T12:02:00.000Z',
        encryptedEnvelope: 'encrypted_payload',
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

  it('validates site icon batch resolve/discover contracts', () => {
    expect(
      SiteIconResolveBatchInputSchema.safeParse({
        domains: ['example.com', 'foo.bar.example.com'],
      }).success,
    ).toBe(true);

    expect(
      SiteIconResolveBatchOutputSchema.safeParse({
        ok: true,
        icons: [
          {
            domain: 'example.com',
            dataUrl: 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCC',
            source: 'automatic',
            sourceUrl: 'https://example.com/favicon.ico',
            updatedAt: '2026-03-22T12:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      SiteIconDiscoverBatchInputSchema.safeParse({
        domains: ['example.com'],
        forceRefresh: true,
      }).success,
    ).toBe(true);

    expect(
      SiteIconDiscoverBatchOutputSchema.safeParse({
        ok: true,
        icons: [
          {
            domain: 'example.com',
            dataUrl: 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCC',
            source: 'automatic',
            sourceUrl: 'https://example.com/favicon.ico',
            updatedAt: '2026-03-22T12:00:00.000Z',
          },
        ],
        unresolved: [],
      }).success,
    ).toBe(true);
  });

  it('validates manual icon override contracts', () => {
    expect(
      SiteIconManualUpsertInputSchema.safeParse({
        domain: 'example.com',
        dataUrl: 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCC',
        source: 'file',
      }).success,
    ).toBe(true);

    expect(
      SiteIconManualListOutputSchema.safeParse({
        ok: true,
        icons: [
          {
            domain: 'example.com',
            dataUrl: 'data:image/png;base64,AAAAAAAABBBBBBBBCCCCCCCC',
            source: 'url',
            updatedAt: '2026-03-22T12:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('validates versioned JSON export payloads', () => {
    const result = VaultJsonExportV1Schema.safeParse({
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
            revision: 3,
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
    });

    expect(result.success).toBe(true);
  });

  it('validates encrypted backup package schema', () => {
    expect(
      BackupManifestV1Schema.safeParse({
        itemCount: 1,
        tombstoneCount: 0,
        uiStateIncluded: true,
        attachmentMode: 'none',
        attachmentCount: 0,
        attachmentBytes: 0,
      }).success,
    ).toBe(true);

    expect(
      EncryptedBackupPackageV1Schema.safeParse({
        version: 'vaultlite.backup.v1',
        createdAt: '2026-03-18T12:00:00.000Z',
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
        kdf: {
          algorithm: 'argon2id',
          memory: 65536,
          passes: 3,
          parallelism: 1,
          dkLen: 32,
          salt: 'A'.repeat(22),
        },
        encryption: {
          algorithm: 'aes-256-gcm',
          nonce: 'B'.repeat(16),
          aad: 'vaultlite.backup.v1',
        },
        payload: {
          ciphertext: 'C'.repeat(22),
          authTag: 'D'.repeat(22),
          plaintextSha256: 'E'.repeat(43),
        },
        vault: {
          attachments: [],
        },
      }).success,
    ).toBe(true);
  });
});
