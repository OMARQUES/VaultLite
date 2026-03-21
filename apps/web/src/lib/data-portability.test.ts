import { describe, expect, test, vi } from 'vitest';

import type { RuntimeMetadata } from '@vaultlite/contracts';
import type { SessionStore } from './session-store';
import type { VaultLiteVaultClient } from './vault-client';
import { saveVaultUiState } from './vault-ui-state';
import {
  buildVaultJsonExportV1,
  collectExistingLoginDedupeKeys,
  createEncryptedBackupPackageV1,
  decryptEncryptedBackupPackageV1,
  executeCsvLoginImport,
  loadDecryptedVaultDataset,
  parseCsvLoginImport,
  serializeDeterministicJson,
} from './data-portability';
import { encryptVaultItemPayload } from './browser-crypto';

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
    listExtensionLinkPending: vi.fn(async () => ({ ok: true as const, requests: [] })),
    approveExtensionLink: vi.fn(),
    rejectExtensionLink: vi.fn(),
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

async function createEncryptedLoginRecord(input: {
  itemId: string;
  title: string;
  username: string;
  password?: string;
  urls?: string[];
}): Promise<{
  itemId: string;
  itemType: 'login';
  revision: number;
  encryptedPayload: string;
  createdAt: string;
  updatedAt: string;
}> {
  return {
    itemId: input.itemId,
    itemType: 'login',
    revision: 1,
    encryptedPayload: await encryptVaultItemPayload({
      accountKey,
      itemType: 'login',
      payload: {
        title: input.title,
        username: input.username,
        password: input.password ?? '',
        urls: input.urls ?? [],
        notes: '',
        customFields: [],
      },
    }),
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };
}

describe('data portability helpers', () => {
  test('parses vaultlite and bitwarden CSV formats', () => {
    const vaultliteCsv = [
      'title,username,password,url,notes,folder,favorite',
      'Email,alice@example.com,pass123,https://example.com,Primary account,Personal,true',
    ].join('\n');
    const preview = parseCsvLoginImport({
      csvText: vaultliteCsv,
    });

    expect(preview.format).toBe('vaultlite_login_csv_v1');
    expect(preview.validRows).toBe(1);
    expect(preview.candidates[0]?.payload?.title).toBe('Email');

    const bitwardenCsv = [
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password',
      'Personal,1,login,Email,Primary account,,,https://example.com,alice@example.com,pass123',
      'Personal,0,note,Secret note,skip this,,,,,',
    ].join('\n');
    const bwPreview = parseCsvLoginImport({
      csvText: bitwardenCsv,
    });

    expect(bwPreview.format).toBe('bitwarden_csv_v1');
    expect(bwPreview.validRows).toBe(1);
    expect(bwPreview.candidates.filter((candidate) => candidate.status === 'skipped_non_login')).toHaveLength(
      1,
    );
  });

  test('marks duplicates against existing dedupe keys', () => {
    const csv = [
      'title,username,password,url,notes,folder,favorite',
      'Email,alice@example.com,pass123,https://example.com,,,',
    ].join('\n');
    const key = 'email|alice@example.com|https://example.com';
    const preview = parseCsvLoginImport({
      csvText: csv,
      existingDedupeKeys: new Set([key]),
    });

    expect(preview.duplicateRows).toBe(1);
    expect(preview.candidates[0]?.status).toBe('duplicate');
  });

  test('loads and decrypts dataset via sync snapshot', async () => {
    const loginRecord = await createEncryptedLoginRecord({
      itemId: 'item_1',
      title: 'Email',
      username: 'alice@example.com',
      urls: ['https://example.com'],
    });
    const sessionStore = createSessionStoreStub();
    const vaultClient = {
      pullSyncSnapshot: vi.fn(async () => ({
        status: 'ok',
        etag: null,
        payload: {
          snapshotToken: 'snapshot_1',
          snapshotAsOf: '2026-03-19T00:00:00.000Z',
          snapshotDigest: 'digest_1',
          pageSize: 100,
          nextCursor: null,
          entries: [
            {
              entryType: 'item',
              item: loginRecord,
            },
          ],
        },
      })),
    } as unknown as VaultLiteVaultClient;

    const dataset = await loadDecryptedVaultDataset({
      sessionStore,
      vaultClient,
    });

    expect(dataset.items).toHaveLength(1);
    expect(dataset.items[0]?.payload.title).toBe('Email');
    expect(collectExistingLoginDedupeKeys(dataset).has('email|alice@example.com|https://example.com')).toBe(
      true,
    );
  });

  test('executes CSV import with report and ui-state updates', async () => {
    const username = 'import-user';
    const sessionStore = createSessionStoreStub(username);
    saveVaultUiState(username, {
      favorites: [],
      folderAssignments: {},
      folders: [{ id: 'personal', name: 'Personal' }],
    });

    const preview = parseCsvLoginImport({
      csvText: [
        'title,username,password,url,notes,folder,favorite',
        'Email,alice@example.com,pass123,https://example.com,,Personal,true',
        'Bank,alice.bank@example.com,pass456,https://bank.example.com,,Finance,false',
      ].join('\n'),
    });
    const createdIds = ['item_a', 'item_b'];
    let createdIndex = 0;
    const vaultClient = {
      createItem: vi.fn(async () => ({
        itemId: createdIds[createdIndex++] ?? `item_${createdIndex}`,
        itemType: 'login',
        revision: 1,
        encryptedPayload: 'payload',
        createdAt: '2026-03-19T00:00:00.000Z',
        updatedAt: '2026-03-19T00:00:00.000Z',
      })),
    } as unknown as VaultLiteVaultClient;

    const result = await executeCsvLoginImport({
      sessionStore,
      vaultClient,
      preview,
    });

    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.report.rows).toHaveLength(2);
  });

  test(
    'builds deterministic JSON export and encrypted backup package',
    async () => {
    const dataset = {
      items: [
        {
          itemId: 'item_2',
          itemType: 'document' as const,
          revision: 1,
          createdAt: '2026-03-19T00:00:00.000Z',
          updatedAt: '2026-03-19T00:00:00.000Z',
          payload: {
            content: 'abc',
            title: 'Doc',
          },
        },
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
    };
    saveVaultUiState('alice', {
      favorites: ['item_1'],
      folderAssignments: { item_1: 'personal' },
      folders: [{ id: 'personal', name: 'Personal' }],
    });
    const runtimeMetadata: RuntimeMetadata = {
      serverUrl: 'https://vaultlite.local',
      deploymentFingerprint: 'development_deployment',
    };
    const exportPayload = buildVaultJsonExportV1({
      dataset,
      includeTombstones: false,
      includeUiState: true,
      source: {
        ...runtimeMetadata,
        username: 'alice',
      },
    });

    const serialized = serializeDeterministicJson(exportPayload, true);
    expect(serialized).toContain('"version": "vaultlite.export.v1"');
    expect(exportPayload.vault.items[0]?.itemId).toBe('item_1');

    const backup = await createEncryptedBackupPackageV1({
      passphrase: 'VeryStrongBackupPassphrase!',
      exportPayload,
      source: exportPayload.source,
    });
    const decrypted = await decryptEncryptedBackupPackageV1({
      backupPackage: backup,
      passphrase: 'VeryStrongBackupPassphrase!',
    });

    expect(backup.version).toBe('vaultlite.backup.v1');
    expect(decrypted.version).toBe('vaultlite.export.v1');
      expect(decrypted.vault.counts.items).toBe(2);
    },
    60000,
  );
});
