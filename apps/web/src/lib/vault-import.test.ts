import { describe, expect, test, vi } from 'vitest';

import type { SessionStore } from './session-store';
import type { VaultLiteVaultClient } from './vault-client';
import { createEncryptedBackupPackageV1 } from './data-portability';
import {
  executeVaultImport,
  parseVaultImportFile,
  type VaultImportPreview,
} from './vault-import';

const accountKey = 'A'.repeat(43);

function createSessionStoreStub(username = 'alice'): SessionStore {
  return {
    state: {
      phase: 'ready',
      bootstrapState: 'INITIALIZED',
      username,
      userId: 'user_1',
      role: 'owner',
      deviceId: 'device_1',
      deviceName: 'Primary Browser',
      lifecycleState: 'active',
      bundleVersion: 0,
      lastError: null,
      lastActivityAt: null,
      autoLockAfterMs: 300000,
    },
    refreshBootstrapState: vi.fn(async () => undefined),
    restoreSession: vi.fn(async () => undefined),
    refreshSessionPolicy: vi.fn(async () => undefined),
    updateSessionPolicy: vi.fn(async () => undefined),
    prepareOnboarding: vi.fn(),
    finalizeOnboarding: vi.fn(),
    remoteAuthenticate: vi.fn(),
    bootstrapDevice: vi.fn(),
    localUnlock: vi.fn(),
    reissueAccountKit: vi.fn(),
    confirmRecentReauth: vi.fn(async () => ({ validUntil: new Date().toISOString() })),
    listExtensionLinkPending: vi.fn(async () => ({ ok: true as const, requests: [] })),
    approveExtensionLink: vi.fn(),
    rejectExtensionLink: vi.fn(),
    listDevices: vi.fn(),
    revokeDevice: vi.fn(),
    rotatePassword: vi.fn(),
    resolveSiteIcons: vi.fn(async () => ({ ok: true as const, icons: [] })),
    discoverSiteIcons: vi.fn(async () => ({ ok: true as const, icons: [], unresolved: [] })),
    listManualSiteIcons: vi.fn(async () => ({ ok: true as const, icons: [] })),
    upsertManualSiteIcon: vi.fn(async () => ({ ok: true as const, result: 'success_changed' as const })),
    removeManualSiteIcon: vi.fn(async () => ({ ok: true as const, result: 'success_changed' as const })),
    getRuntimeMetadata: vi.fn(async () => ({
      serverUrl: 'https://vaultlite.local',
      deploymentFingerprint: 'development_deployment',
    })),
    handleUnauthorized: vi.fn(),
    setAutoLockAfterMs: vi.fn(),
    lock: vi.fn(),
    markActivity: vi.fn(),
    enforceAutoLock: vi.fn(),
    getUnlockedVaultContext: vi.fn(() => ({
      username,
      accountKey,
    })),
  };
}

function createVaultClientStub(): VaultLiteVaultClient {
  return {
    listItems: vi.fn(async () => ({ items: [] })),
    pullSyncSnapshot: vi.fn(async () => ({
      status: 'ok' as const,
      etag: null,
      payload: {
        snapshotToken: 'snapshot_1',
        snapshotAsOf: '2026-03-19T00:00:00.000Z',
        snapshotDigest: 'digest_1',
        pageSize: 100,
        nextCursor: null,
        entries: [],
      },
    })),
    getItem: vi.fn(),
    createItem: vi.fn(async () => ({
      itemId: 'item_created_1',
      itemType: 'login' as const,
      revision: 1,
      encryptedPayload: 'payload',
      createdAt: '2026-03-19T00:00:00.000Z',
      updatedAt: '2026-03-19T00:00:00.000Z',
    })),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    restoreItem: vi.fn(),
    initAttachmentUpload: vi.fn(),
    uploadAttachmentContent: vi.fn(),
    finalizeAttachmentUpload: vi.fn(),
    getAttachmentEnvelope: vi.fn(),
    listAttachmentUploads: vi.fn(async () => ({ uploads: [] })),
  };
}

describe('vault import', () => {
  test('parses supported CSV import files', async () => {
    const sessionStore = createSessionStoreStub();
    const vaultClient = createVaultClientStub();
    const csv = new File(
      [
        [
          'title,username,password,url,notes,folder,favorite',
          'Email,alice@example.com,pass123,https://example.com,Primary account,Personal,true',
        ].join('\n'),
      ],
      'import.csv',
      { type: 'text/csv' },
    );

    const preview = await parseVaultImportFile({
      file: csv,
      sessionStore,
      vaultClient,
    });

    expect(preview.format).toBe('vaultlite_login_csv_v1');
    expect(preview.validRows).toBe(1);
  });

  test('parses Bitwarden JSON with login and secure note', async () => {
    const sessionStore = createSessionStoreStub();
    const vaultClient = createVaultClientStub();
    const json = new File(
      [
        JSON.stringify({
          encrypted: false,
          folders: [{ id: 'folder_1', name: 'Personal' }],
          items: [
            {
              id: 'cipher_login',
              type: 1,
              name: 'Email',
              notes: 'Primary',
              favorite: true,
              folderId: 'folder_1',
              login: {
                username: 'alice@example.com',
                password: 'secret',
                uris: [{ uri: 'https://example.com' }],
              },
            },
            {
              id: 'cipher_note',
              type: 2,
              name: 'Secure note',
              notes: 'Hello',
              favorite: false,
            },
          ],
        }),
      ],
      'bitwarden.json',
      { type: 'application/json' },
    );

    const preview = await parseVaultImportFile({
      file: json,
      sessionStore,
      vaultClient,
    });

    expect(preview.format).toBe('bitwarden_json_v1');
    expect(preview.validRows).toBe(2);
    expect(preview.rows.some((row) => row.itemType === 'secure_note')).toBe(true);
  });

  test('parses vaultlite JSON export format', async () => {
    const sessionStore = createSessionStoreStub();
    const vaultClient = createVaultClientStub();
    const file = new File(
      [
        JSON.stringify({
          version: 'vaultlite.export.v1',
          exportedAt: '2026-03-19T00:00:00.000Z',
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
                createdAt: '2026-03-19T00:00:00.000Z',
                updatedAt: '2026-03-19T00:00:00.000Z',
                payload: {
                  title: 'Email',
                  username: 'alice@example.com',
                  password: 'secret',
                  urls: ['https://example.com'],
                  notes: 'Primary account',
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
              item_1: 'folder_1',
            },
            folders: [{ id: 'folder_1', name: 'Personal' }],
          },
        }),
      ],
      'vaultlite-export.json',
      { type: 'application/json' },
    );

    const preview = await parseVaultImportFile({
      file,
      sessionStore,
      vaultClient,
    });

    expect(preview.format).toBe('vaultlite_json_export_v1');
    expect(preview.validRows).toBe(1);
    expect(preview.rows[0]?.title).toBe('Email');
  });

  test('requires passphrase and parses vaultlite encrypted backup package', async () => {
    const sessionStore = createSessionStoreStub();
    const vaultClient = createVaultClientStub();
    const exportPayload = {
      version: 'vaultlite.export.v1' as const,
      exportedAt: '2026-03-19T00:00:00.000Z',
      source: {
        app: 'vaultlite-web' as const,
        schemaVersion: 1,
        username: 'alice',
        deploymentFingerprint: 'development_deployment',
      },
      vault: {
        items: [
          {
            itemId: 'item_1',
            itemType: 'login' as const,
            revision: 1,
            createdAt: '2026-03-19T00:00:00.000Z',
            updatedAt: '2026-03-19T00:00:00.000Z',
            payload: {
              title: 'Email',
              username: 'alice@example.com',
              password: 'secret',
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
      uiState: null,
    };

    const backupPassphrase = 'BackupPassphrase_123!';
    const backup = await createEncryptedBackupPackageV1({
      passphrase: backupPassphrase,
      exportPayload,
      source: exportPayload.source,
    });
    const file = new File([JSON.stringify(backup)], 'vaultlite-backup.vlbk.json', {
      type: 'application/json',
    });

    await expect(
      parseVaultImportFile({
        file,
        sessionStore,
        vaultClient,
      }),
    ).rejects.toThrow('backup_passphrase_required');

    const preview = await parseVaultImportFile({
      file,
      sessionStore,
      vaultClient,
      backupPassphrase,
    });
    expect(preview.format).toBe('vaultlite_encrypted_backup_v1');
    expect(preview.validRows).toBe(1);

    await expect(
      parseVaultImportFile({
        file,
        sessionStore,
        vaultClient,
        backupPassphrase: 'wrong-passphrase',
      }),
    ).rejects.toThrow('backup_decrypt_failed');
  }, 60000);

  test('imports backup attachments using existing encrypted envelopes', async () => {
    const sessionStore = createSessionStoreStub();
    const vaultClient = createVaultClientStub();
    const initAttachmentUpload = vi.mocked(vaultClient.initAttachmentUpload);
    const uploadAttachmentContent = vi.mocked(vaultClient.uploadAttachmentContent);
    const finalizeAttachmentUpload = vi.mocked(vaultClient.finalizeAttachmentUpload);

    initAttachmentUpload.mockResolvedValue({
      uploadId: 'upload_1',
      itemId: 'item_created_1',
      fileName: 'report.pdf',
      lifecycleState: 'pending',
      contentType: 'application/pdf',
      size: 5,
      expiresAt: '2026-03-19T00:10:00.000Z',
      uploadedAt: null,
      attachedAt: null,
      createdAt: '2026-03-19T00:00:00.000Z',
      updatedAt: '2026-03-19T00:00:00.000Z',
      uploadToken: 'token_1',
    });
    uploadAttachmentContent.mockResolvedValue({
      uploadId: 'upload_1',
      itemId: 'item_created_1',
      fileName: 'report.pdf',
      lifecycleState: 'uploaded',
      contentType: 'application/pdf',
      size: 5,
      expiresAt: '2026-03-19T00:10:00.000Z',
      uploadedAt: '2026-03-19T00:00:01.000Z',
      attachedAt: null,
      createdAt: '2026-03-19T00:00:00.000Z',
      updatedAt: '2026-03-19T00:00:01.000Z',
    });
    finalizeAttachmentUpload.mockResolvedValue({
      ok: true,
      result: 'success_changed',
      upload: {
        uploadId: 'upload_1',
        itemId: 'item_created_1',
        fileName: 'report.pdf',
        lifecycleState: 'attached',
        contentType: 'application/pdf',
        size: 5,
        expiresAt: '2026-03-19T00:10:00.000Z',
        uploadedAt: '2026-03-19T00:00:01.000Z',
        attachedAt: '2026-03-19T00:00:02.000Z',
        createdAt: '2026-03-19T00:00:00.000Z',
        updatedAt: '2026-03-19T00:00:02.000Z',
      },
    });

    const preview: VaultImportPreview = {
      format: 'vaultlite_encrypted_backup_v1',
      totalRows: 1,
      validRows: 1,
      duplicateRows: 0,
      invalidRows: 0,
      unsupportedRows: 0,
      reviewRequiredRows: 0,
      attachmentRows: 1,
      attachmentCount: 1,
      rows: [
        {
          rowIndex: 1,
          sourceFormat: 'vaultlite_encrypted_backup_v1',
          sourceRef: 'vaultlite_encrypted_backup_v1:item_1',
          itemType: 'document',
          title: 'Doc',
          username: '',
          firstUrl: '',
          attachmentCount: 1,
          status: 'valid',
          reason: null,
        },
      ],
      candidates: [
        {
          sourceFormat: 'vaultlite_encrypted_backup_v1',
          sourceRef: 'vaultlite_encrypted_backup_v1:item_1',
          sourceItemId: 'item_1',
          itemType: 'document',
          title: 'Doc',
          notes: '',
          content: 'content',
          username: '',
          password: '',
          totp: '',
          urls: [],
          favoriteHint: false,
          folderHint: null,
          archivedHint: false,
          customFields: [],
          attachments: [
            {
              fileName: 'report.pdf',
              contentType: 'application/pdf',
              size: 5,
              bytes: null,
              encryptedEnvelope: 'encrypted-envelope-value',
              sourcePath: null,
              attachmentFingerprint: 'fingerprint_1',
              errorCode: null,
            },
          ],
          provenance: {},
          dedupeKey: 'document|doc|fingerprint_1',
          status: 'valid',
          reason: null,
          rowIndex: 1,
          existingItemId: null,
        },
      ],
    };

    const result = await executeVaultImport({
      preview,
      sessionStore,
      vaultClient,
    });

    expect(result.created).toBe(1);
    expect(result.attachmentsCreated).toBe(1);
    expect(uploadAttachmentContent).toHaveBeenCalledWith('upload_1', {
      uploadToken: 'token_1',
      encryptedEnvelope: 'encrypted-envelope-value',
    });
  }, 60000);

  test('marks review-required rows as skipped_review_required during execution', async () => {
    const sessionStore = createSessionStoreStub();
    const vaultClient = createVaultClientStub();
    const preview: VaultImportPreview = {
      format: 'onepassword_1pux_v1',
      totalRows: 1,
      validRows: 0,
      duplicateRows: 0,
      invalidRows: 0,
      unsupportedRows: 0,
      reviewRequiredRows: 1,
      attachmentRows: 0,
      attachmentCount: 0,
      rows: [
        {
          rowIndex: 1,
          sourceFormat: 'onepassword_1pux_v1',
          sourceRef: 'onepassword_1pux_v1:row_1',
          itemType: 'document',
          title: 'Document',
          username: '',
          firstUrl: '',
          attachmentCount: 0,
          status: 'possible_duplicate_requires_review',
          reason: 'possible_duplicate_requires_review',
        },
      ],
      candidates: [
        {
          sourceFormat: 'onepassword_1pux_v1',
          sourceRef: 'onepassword_1pux_v1:row_1',
          sourceItemId: null,
          itemType: 'document',
          title: 'Document',
          notes: '',
          content: 'Body',
          username: '',
          password: '',
          totp: '',
          urls: [],
          favoriteHint: false,
          folderHint: null,
          archivedHint: false,
          customFields: [],
          attachments: [],
          provenance: {},
          dedupeKey: null,
          status: 'possible_duplicate_requires_review',
          reason: 'possible_duplicate_requires_review',
          rowIndex: 1,
          existingItemId: null,
        },
      ],
    };

    const result = await executeVaultImport({
      preview,
      sessionStore,
      vaultClient,
    });

    expect(result.skipped).toBe(1);
    expect(result.records[0]?.status).toBe('skipped_review_required');
  });
});
