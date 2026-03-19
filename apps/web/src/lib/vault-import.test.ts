import { describe, expect, test, vi } from 'vitest';

import type { SessionStore } from './session-store';
import type { VaultLiteVaultClient } from './vault-client';
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
    prepareOnboarding: vi.fn(),
    finalizeOnboarding: vi.fn(),
    remoteAuthenticate: vi.fn(),
    bootstrapDevice: vi.fn(),
    localUnlock: vi.fn(),
    reissueAccountKit: vi.fn(),
    confirmRecentReauth: vi.fn(async () => ({ validUntil: new Date().toISOString() })),
    listDevices: vi.fn(),
    revokeDevice: vi.fn(),
    rotatePassword: vi.fn(),
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
