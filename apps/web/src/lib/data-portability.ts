import type {
  BackupAttachmentEntryV1,
  BackupManifestV1,
  EncryptedBackupPackageV1,
  RuntimeMetadata,
  SyncSnapshotOutput,
  VaultJsonExportV1,
  VaultItemType,
} from '@vaultlite/contracts';
import {
  EncryptedBackupPackageV1Schema,
  VaultJsonExportV1Schema,
} from '@vaultlite/contracts';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import type { LoginVaultItemPayload, VaultWorkspaceTombstone } from './vault-workspace';
import { decryptVaultItemPayload, encryptVaultItemPayload } from './browser-crypto';
import type { SessionStore } from './session-store';
import type { VaultLiteVaultClient } from './vault-client';
import { loadVaultUiState, saveVaultUiState, type VaultUiState } from './vault-ui-state';

export type SupportedCsvFormat = 'vaultlite_login_csv_v1' | 'bitwarden_csv_v1';

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_PHYSICAL_ROWS = 5000;
const MAX_IMPORT_VALID_ROWS = 2000;
const IMPORT_PAGE_SIZE = 100;
const IMPORT_CREATE_CONCURRENCY = 5;
const BACKUP_AAD = 'vaultlite.backup.v1';
const MAX_BACKUP_PACKAGE_BYTES = 500 * 1024 * 1024;
const BACKUP_KDF_PROFILE = {
  algorithm: 'argon2id',
  memory: 65536,
  passes: 3,
  parallelism: 1,
  dkLen: 32,
} as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface CsvImportCandidate {
  rowIndex: number;
  sourceFormat: SupportedCsvFormat;
  status: 'valid' | 'invalid' | 'duplicate' | 'skipped_non_login';
  reason: string | null;
  title: string;
  username: string;
  firstUrl: string;
  notes: string;
  favorite: boolean;
  folder: string | null;
  payload: LoginVaultItemPayload | null;
  dedupeKey: string | null;
}

export interface CsvImportPreview {
  format: SupportedCsvFormat;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  candidates: CsvImportCandidate[];
}

export interface CsvImportExecutionRecord {
  rowIndex: number;
  status: 'created' | 'skipped_duplicate' | 'failed';
  itemId: string | null;
  reason: string | null;
}

export interface CsvImportExecutionResult {
  created: number;
  skipped: number;
  failed: number;
  records: CsvImportExecutionRecord[];
  report: {
    generatedAt: string;
    format: SupportedCsvFormat;
    totalRows: number;
    created: number;
    skipped: number;
    failed: number;
    rows: CsvImportExecutionRecord[];
  };
}

export interface DecryptedVaultDataset {
  items: Array<{
    itemId: string;
    itemType: VaultItemType;
    revision: number;
    createdAt: string;
    updatedAt: string;
    payload: Record<string, unknown>;
  }>;
  tombstones: VaultWorkspaceTombstone[];
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

function normalizeCell(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function normalizeForKey(value: string | null | undefined): string {
  return normalizeCell(value).toLowerCase().replace(/\s+/g, ' ');
}

function parseBoolean(value: string | null | undefined): boolean {
  const normalized = normalizeForKey(value);
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
}

function extractHostTitle(urlValue: string): string {
  const first = normalizeCell(urlValue).split(/\s*[,\n;]\s*/u).find((entry) => entry.length > 0);
  if (!first) {
    return '';
  }
  try {
    const withProtocol = /^https?:\/\//iu.test(first) ? first : `https://${first}`;
    const host = new URL(withProtocol).hostname;
    return host.replace(/^www\./iu, '');
  } catch {
    return first;
  }
}

function extractFirstUrl(urlValue: string): string {
  const first = normalizeCell(urlValue).split(/\s*[,\n;]\s*/u).find((entry) => entry.length > 0);
  return first ?? '';
}

function makeDedupeKey(input: {
  title: string;
  username: string;
  firstUrl: string;
}): string {
  return `${normalizeForKey(input.title)}|${normalizeForKey(input.username)}|${normalizeForKey(input.firstUrl)}`;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  const normalized = csvText.replace(/^\uFEFF/u, '');
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? '';
    const nextCharacter = normalized[index + 1] ?? '';

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      currentRow.push(currentCell);
      currentCell = '';
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }
      if (currentRow.some((entry) => entry.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);
  if (currentRow.some((entry) => entry.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function detectCsvFormat(headers: string[]): SupportedCsvFormat {
  const normalizedHeaders = headers.map((header) => normalizeForKey(header));
  if (
    normalizedHeaders.includes('title') &&
    normalizedHeaders.includes('username') &&
    normalizedHeaders.includes('password')
  ) {
    return 'vaultlite_login_csv_v1';
  }

  if (
    normalizedHeaders.includes('name') &&
    normalizedHeaders.includes('login_username') &&
    normalizedHeaders.includes('login_password')
  ) {
    return 'bitwarden_csv_v1';
  }

  throw new Error('unsupported_csv_format');
}

function createHeaderIndex(headers: string[]): Map<string, number> {
  const indexMap = new Map<string, number>();
  headers.forEach((header, index) => {
    indexMap.set(normalizeForKey(header), index);
  });
  return indexMap;
}

function readCell(row: string[], headers: Map<string, number>, key: string): string {
  const index = headers.get(key);
  if (typeof index !== 'number') {
    return '';
  }
  return row[index] ?? '';
}

export function parseCsvLoginImport(input: {
  csvText: string;
  existingDedupeKeys?: Set<string>;
  fileBytes?: number;
}): CsvImportPreview {
  const fileBytes = input.fileBytes ?? textEncoder.encode(input.csvText).byteLength;
  if (fileBytes > MAX_IMPORT_FILE_BYTES) {
    throw new Error('import_file_too_large');
  }

  const rows = parseCsvRows(input.csvText);
  if (rows.length < 2) {
    throw new Error('csv_missing_rows');
  }
  if (rows.length - 1 > MAX_IMPORT_PHYSICAL_ROWS) {
    throw new Error('csv_too_many_rows');
  }

  const [headerRow, ...dataRows] = rows;
  const format = detectCsvFormat(headerRow ?? []);
  const headerIndex = createHeaderIndex(headerRow ?? []);
  const existingKeys = new Set(input.existingDedupeKeys ?? []);
  const seenInFile = new Set<string>();

  const candidates: CsvImportCandidate[] = dataRows.map((row, rowOffset) => {
    const rowIndex = rowOffset + 2;
    if (format === 'bitwarden_csv_v1') {
      const typeValue = normalizeForKey(readCell(row, headerIndex, 'type'));
      if (typeValue && typeValue !== 'login') {
        return {
          rowIndex,
          sourceFormat: format,
          status: 'skipped_non_login',
          reason: 'non_login_type',
          title: '',
          username: '',
          firstUrl: '',
          notes: '',
          favorite: false,
          folder: null,
          payload: null,
          dedupeKey: null,
        };
      }
    }

    const titleSource =
      format === 'vaultlite_login_csv_v1'
        ? readCell(row, headerIndex, 'title')
        : readCell(row, headerIndex, 'name');
    const username =
      format === 'vaultlite_login_csv_v1'
        ? readCell(row, headerIndex, 'username')
        : readCell(row, headerIndex, 'login_username');
    const password =
      format === 'vaultlite_login_csv_v1'
        ? readCell(row, headerIndex, 'password')
        : readCell(row, headerIndex, 'login_password');
    const urlValue =
      format === 'vaultlite_login_csv_v1'
        ? readCell(row, headerIndex, 'url')
        : readCell(row, headerIndex, 'login_uri');
    const notes = readCell(row, headerIndex, 'notes');
    const folder = readCell(row, headerIndex, 'folder');
    const favorite = parseBoolean(readCell(row, headerIndex, 'favorite'));

    const title = normalizeCell(titleSource) || extractHostTitle(urlValue);
    const firstUrl = extractFirstUrl(urlValue);

    if (!title && !normalizeCell(username) && !normalizeCell(password) && !normalizeCell(firstUrl)) {
      return {
        rowIndex,
        sourceFormat: format,
        status: 'invalid',
        reason: 'empty_row',
        title: '',
        username: '',
        firstUrl: '',
        notes: '',
        favorite: false,
        folder: null,
        payload: null,
        dedupeKey: null,
      };
    }

    if (!title) {
      return {
        rowIndex,
        sourceFormat: format,
        status: 'invalid',
        reason: 'missing_title',
        title: '',
        username: normalizeCell(username),
        firstUrl: normalizeCell(firstUrl),
        notes: normalizeCell(notes),
        favorite,
        folder: normalizeCell(folder) || null,
        payload: null,
        dedupeKey: null,
      };
    }

    const dedupeKey = makeDedupeKey({
      title,
      username: normalizeCell(username),
      firstUrl,
    });

    if (existingKeys.has(dedupeKey) || seenInFile.has(dedupeKey)) {
      seenInFile.add(dedupeKey);
      return {
        rowIndex,
        sourceFormat: format,
        status: 'duplicate',
        reason: 'duplicate_item',
        title,
        username: normalizeCell(username),
        firstUrl: normalizeCell(firstUrl),
        notes: normalizeCell(notes),
        favorite,
        folder: normalizeCell(folder) || null,
        payload: null,
        dedupeKey,
      };
    }

    seenInFile.add(dedupeKey);

    return {
      rowIndex,
      sourceFormat: format,
      status: 'valid',
      reason: null,
      title,
      username: normalizeCell(username),
      firstUrl: normalizeCell(firstUrl),
      notes: normalizeCell(notes),
      favorite,
      folder: normalizeCell(folder) || null,
      payload: {
        title,
        username: normalizeCell(username),
        password: normalizeCell(password),
        urls: normalizeCell(firstUrl) ? [normalizeCell(firstUrl)] : [],
        notes: normalizeCell(notes),
        customFields: [],
      },
      dedupeKey,
    };
  });

  const validCandidates = candidates.filter((candidate) => candidate.status === 'valid');
  if (validCandidates.length > MAX_IMPORT_VALID_ROWS) {
    throw new Error('csv_too_many_valid_rows');
  }

  return {
    format,
    totalRows: dataRows.length,
    validRows: validCandidates.length,
    duplicateRows: candidates.filter((candidate) => candidate.status === 'duplicate').length,
    invalidRows: candidates.filter((candidate) => candidate.status === 'invalid').length,
    candidates,
  };
}

function sortByItemId<T extends { itemId: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.itemId.localeCompare(right.itemId));
}

async function pullAllSyncPages(input: {
  vaultClient: VaultLiteVaultClient;
}): Promise<SyncSnapshotOutput['entries']> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let snapshotToken: string | undefined;
    let cursor: string | undefined;
    const entries: SyncSnapshotOutput['entries'] = [];

    try {
      while (true) {
        const page = await input.vaultClient.pullSyncSnapshot({
          snapshotToken,
          cursor,
          pageSize: IMPORT_PAGE_SIZE,
        });
        if (page.status === 'not_modified') {
          return entries;
        }

        if (!snapshotToken) {
          snapshotToken = page.payload.snapshotToken;
        }
        entries.push(...page.payload.entries);
        cursor = page.payload.nextCursor ?? undefined;
        if (!cursor) {
          return entries;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('snapshot_expired') && attempt === 0) {
        continue;
      }
      throw error;
    }
  }

  return [];
}

export async function loadDecryptedVaultDataset(input: {
  sessionStore: SessionStore;
  vaultClient: VaultLiteVaultClient;
}): Promise<DecryptedVaultDataset> {
  const entries = await pullAllSyncPages({
    vaultClient: input.vaultClient,
  });
  const { accountKey } = input.sessionStore.getUnlockedVaultContext();

  const items: DecryptedVaultDataset['items'] = [];
  const tombstones: VaultWorkspaceTombstone[] = [];

  for (const entry of entries) {
    if (entry.entryType === 'item') {
      const payload = (await decryptVaultItemPayload({
        accountKey,
        encryptedPayload: entry.item.encryptedPayload,
      })) as Record<string, unknown>;
      items.push({
        itemId: entry.item.itemId,
        itemType: entry.item.itemType,
        revision: entry.item.revision,
        createdAt: entry.item.createdAt,
        updatedAt: entry.item.updatedAt,
        payload,
      });
      continue;
    }

    tombstones.push({
      itemId: entry.tombstone.itemId,
      itemType: entry.tombstone.itemType,
      revision: entry.tombstone.revision,
      deletedAt: entry.tombstone.deletedAt,
    });
  }

  return {
    items: sortByItemId(items),
    tombstones: sortByItemId(tombstones),
  };
}

export function collectExistingLoginDedupeKeys(dataset: DecryptedVaultDataset): Set<string> {
  const keys = new Set<string>();
  dataset.items
    .filter((item) => item.itemType === 'login')
    .forEach((item) => {
      const payload = item.payload as Partial<LoginVaultItemPayload>;
      const firstUrl = Array.isArray(payload.urls) ? String(payload.urls[0] ?? '') : '';
      keys.add(
        makeDedupeKey({
          title: String(payload.title ?? ''),
          username: String(payload.username ?? ''),
          firstUrl,
        }),
      );
    });
  return keys;
}

function getOrCreateFolderId(input: {
  state: VaultUiState;
  folderName: string;
}): string {
  const normalizedTarget = normalizeForKey(input.folderName);
  const existing = input.state.folders.find((folder) => normalizeForKey(folder.name) === normalizedTarget);
  if (existing) {
    return existing.id;
  }

  const idBase = normalizedTarget
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const generatedId = `${idBase || 'folder'}-${Math.random().toString(36).slice(2, 7)}`;
  input.state.folders.push({
    id: generatedId,
    name: input.folderName.trim(),
  });
  return generatedId;
}

function saveImportedUiState(input: {
  username: string;
  createdRows: Array<{ itemId: string; favorite: boolean; folder: string | null }>;
}) {
  const state = loadVaultUiState(input.username);
  for (const row of input.createdRows) {
    if (row.favorite && !state.favorites.includes(row.itemId)) {
      state.favorites.push(row.itemId);
    }
    if (row.folder) {
      const folderId = getOrCreateFolderId({
        state,
        folderName: row.folder,
      });
      state.folderAssignments[row.itemId] = folderId;
    }
  }
  saveVaultUiState(input.username, state);
}

export async function executeCsvLoginImport(input: {
  sessionStore: SessionStore;
  vaultClient: VaultLiteVaultClient;
  preview: CsvImportPreview;
  onProgress?: (progress: {
    processed: number;
    total: number;
    created: number;
    skipped: number;
    failed: number;
  }) => void;
}): Promise<CsvImportExecutionResult> {
  const validRows = input.preview.candidates.filter((candidate) => candidate.status === 'valid');
  const records: CsvImportExecutionRecord[] = [];
  const total = validRows.length;
  let processed = 0;
  let created = 0;
  let failed = 0;
  const { accountKey, username } = input.sessionStore.getUnlockedVaultContext();
  const createdRows: Array<{ itemId: string; favorite: boolean; folder: string | null }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < validRows.length) {
      const currentIndex = cursor;
      cursor += 1;
      const row = validRows[currentIndex];
      if (!row || !row.payload) {
        processed += 1;
        continue;
      }

      try {
        const encryptedPayload = await encryptVaultItemPayload({
          accountKey,
          itemType: 'login',
          payload: row.payload,
        });
        const createdItem = await input.vaultClient.createItem({
          itemType: 'login',
          encryptedPayload,
        });
        records.push({
          rowIndex: row.rowIndex,
          status: 'created',
          itemId: createdItem.itemId,
          reason: null,
        });
        createdRows.push({
          itemId: createdItem.itemId,
          favorite: row.favorite,
          folder: row.folder,
        });
        created += 1;
      } catch (error) {
        failed += 1;
        records.push({
          rowIndex: row.rowIndex,
          status: 'failed',
          itemId: null,
          reason: error instanceof Error ? error.message : String(error),
        });
      } finally {
        processed += 1;
        input.onProgress?.({
          processed,
          total,
          created,
          skipped: 0,
          failed,
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(IMPORT_CREATE_CONCURRENCY, total || 1)) }, () => worker()),
  );

  const duplicateRows = input.preview.candidates
    .filter((candidate) => candidate.status === 'duplicate')
    .map((candidate) => ({
      rowIndex: candidate.rowIndex,
      status: 'skipped_duplicate' as const,
      itemId: null,
      reason: candidate.reason ?? 'duplicate_item',
    }));

  const combinedRecords = [...records, ...duplicateRows].sort((left, right) => left.rowIndex - right.rowIndex);
  const skipped = duplicateRows.length;

  if (createdRows.length > 0) {
    saveImportedUiState({
      username,
      createdRows,
    });
  }

  return {
    created,
    skipped,
    failed,
    records: combinedRecords,
    report: {
      generatedAt: new Date().toISOString(),
      format: input.preview.format,
      totalRows: input.preview.totalRows,
      created,
      skipped,
      failed,
      rows: combinedRecords,
    },
  };
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectKeys(entry));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    for (const [key, entryValue] of entries) {
      output[key] = sortObjectKeys(entryValue);
    }
    return output;
  }
  return value;
}

export function serializeDeterministicJson(value: unknown, pretty = true): string {
  const sorted = sortObjectKeys(value);
  return JSON.stringify(sorted, null, pretty ? 2 : 0);
}

export function buildVaultJsonExportV1(input: {
  dataset: DecryptedVaultDataset;
  includeTombstones: boolean;
  includeUiState: boolean;
  source: RuntimeMetadata & {
    username: string;
  };
}): VaultJsonExportV1 {
  const uiState = input.includeUiState ? loadVaultUiState(input.source.username) : null;
  const items = sortByItemId(
    input.dataset.items.map((item) => ({
      itemId: item.itemId,
      itemType: item.itemType,
      revision: item.revision,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      payload: sortObjectKeys(item.payload) as Record<string, unknown>,
    })),
  );
  const tombstones = input.includeTombstones
    ? sortByItemId(
        input.dataset.tombstones.map((tombstone) => ({
          itemId: tombstone.itemId,
          itemType: tombstone.itemType,
          revision: tombstone.revision,
          deletedAt: tombstone.deletedAt,
        })),
      )
    : [];

  return VaultJsonExportV1Schema.parse({
    version: 'vaultlite.export.v1',
    exportedAt: new Date().toISOString(),
    source: {
      app: 'vaultlite-web',
      schemaVersion: 1,
      username: input.source.username,
      deploymentFingerprint: input.source.deploymentFingerprint,
    },
    vault: {
      items,
      tombstones,
      counts: {
        items: items.length,
        tombstones: tombstones.length,
      },
    },
    uiState: uiState
      ? {
          favorites: [...new Set(uiState.favorites)].sort((left, right) => left.localeCompare(right)),
          folderAssignments: Object.fromEntries(
            Object.entries(uiState.folderAssignments).sort(([left], [right]) => left.localeCompare(right)),
          ),
          folders: [...uiState.folders].sort((left, right) => left.id.localeCompare(right.id)),
        }
      : null,
  });
}

function base64UrlLength(rawBytes: number): number {
  if (rawBytes <= 0) {
    return 0;
  }
  return Math.ceil((rawBytes * 4) / 3);
}

function estimateEncryptedBackupSize(canonicalPayloadBytes: number): number {
  const fixedPackageOverheadBytes = 8192;
  return (
    fixedPackageOverheadBytes +
    base64UrlLength(canonicalPayloadBytes) +
    base64UrlLength(16) +
    base64UrlLength(32)
  );
}

export async function collectBackupAttachmentEntries(input: {
  dataset: DecryptedVaultDataset;
  vaultClient: VaultLiteVaultClient;
}): Promise<BackupAttachmentEntryV1[]> {
  const entries: BackupAttachmentEntryV1[] = [];
  for (const item of input.dataset.items) {
    const uploads = await input.vaultClient.listAttachmentUploads(item.itemId);
    const attached = uploads.uploads.filter((upload) => upload.lifecycleState === 'attached');
    for (const upload of attached) {
      const envelope = await input.vaultClient.getAttachmentEnvelope(upload.uploadId);
      const envelopeSha256 = await sha256Base64Url(textEncoder.encode(envelope.encryptedEnvelope));
      entries.push({
        uploadId: envelope.uploadId,
        itemId: envelope.itemId,
        fileName: envelope.fileName,
        contentType: envelope.contentType,
        size: envelope.size,
        uploadedAt: envelope.uploadedAt,
        attachedAt: envelope.attachedAt,
        envelope: envelope.encryptedEnvelope,
        envelopeSha256,
      });
    }
  }

  return entries.sort((left, right) => left.uploadId.localeCompare(right.uploadId));
}

async function deriveBackupKey(input: {
  passphrase: string;
  salt: Uint8Array;
}): Promise<Uint8Array> {
  return argon2idAsync(input.passphrase, input.salt, {
    m: BACKUP_KDF_PROFILE.memory,
    t: BACKUP_KDF_PROFILE.passes,
    p: BACKUP_KDF_PROFILE.parallelism,
    dkLen: BACKUP_KDF_PROFILE.dkLen,
  });
}

async function sha256Base64Url(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(input));
  return bytesToBase64Url(new Uint8Array(digest));
}

function randomBase64Url(byteLength: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function createEncryptedBackupPackageV1(input: {
  passphrase: string;
  exportPayload: VaultJsonExportV1;
  source: EncryptedBackupPackageV1['source'];
  attachments?: BackupAttachmentEntryV1[];
  manifest?: Partial<BackupManifestV1>;
  maxPackageBytes?: number;
}): Promise<EncryptedBackupPackageV1> {
  const plaintext = serializeDeterministicJson(VaultJsonExportV1Schema.parse(input.exportPayload), false);
  const attachments = [...(input.attachments ?? [])].sort((left, right) =>
    left.uploadId.localeCompare(right.uploadId),
  );
  const packageLimit = input.maxPackageBytes ?? MAX_BACKUP_PACKAGE_BYTES;
  const attachmentBytes = attachments.reduce((total, attachment) => total + attachment.size, 0);
  const canonicalPackageJson = serializeDeterministicJson(
    {
      exportPayload: input.exportPayload,
      attachments,
    },
    false,
  );
  const estimatedFinalBytes = estimateEncryptedBackupSize(textEncoder.encode(canonicalPackageJson).byteLength);
  if (estimatedFinalBytes > packageLimit) {
    throw new Error('backup_size_limit_exceeded');
  }
  const plaintextBytes = textEncoder.encode(plaintext);
  const salt = randomBase64Url(16);
  const nonce = randomBase64Url(12);
  const keyMaterial = await deriveBackupKey({
    passphrase: input.passphrase,
    salt: base64UrlToBytes(salt),
  });
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyMaterial),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(nonce)),
      additionalData: toArrayBuffer(textEncoder.encode(BACKUP_AAD)),
    },
    cryptoKey,
    plaintextBytes,
  );

  const encryptedBytes = new Uint8Array(encrypted);
  const authTagLength = 16;
  const cipherBytes = encryptedBytes.slice(0, encryptedBytes.length - authTagLength);
  const authTag = encryptedBytes.slice(encryptedBytes.length - authTagLength);
  const plaintextSha256 = await sha256Base64Url(plaintextBytes);
  const manifest: BackupManifestV1 = {
    itemCount: input.exportPayload.vault.counts.items,
    tombstoneCount: input.exportPayload.vault.counts.tombstones,
    uiStateIncluded: input.exportPayload.uiState !== null,
    attachmentMode: attachments.length > 0 ? 'inline_encrypted_blobs' : 'none',
    attachmentCount: attachments.length,
    attachmentBytes,
    ...(input.manifest ?? {}),
  };

  const backupPackage = EncryptedBackupPackageV1Schema.parse({
    version: 'vaultlite.backup.v1',
    createdAt: new Date().toISOString(),
    source: input.source,
    manifest,
    kdf: {
      algorithm: BACKUP_KDF_PROFILE.algorithm,
      memory: BACKUP_KDF_PROFILE.memory,
      passes: BACKUP_KDF_PROFILE.passes,
      parallelism: BACKUP_KDF_PROFILE.parallelism,
      dkLen: BACKUP_KDF_PROFILE.dkLen,
      salt,
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      nonce,
      aad: BACKUP_AAD,
    },
    payload: {
      ciphertext: bytesToBase64Url(cipherBytes),
      authTag: bytesToBase64Url(authTag),
      plaintextSha256,
    },
    vault: {
      attachments,
    },
  });

  if (textEncoder.encode(serializeDeterministicJson(backupPackage, false)).byteLength > packageLimit) {
    throw new Error('backup_size_limit_exceeded');
  }

  const decrypted = await decryptEncryptedBackupPackageV1({
    backupPackage,
    passphrase: input.passphrase,
  });
  if (serializeDeterministicJson(decrypted, false) !== plaintext) {
    throw new Error('backup_package_validation_failed');
  }

  return backupPackage;
}

export async function decryptEncryptedBackupPackageV1(input: {
  backupPackage: EncryptedBackupPackageV1;
  passphrase: string;
}): Promise<VaultJsonExportV1> {
  const parsed = EncryptedBackupPackageV1Schema.parse(input.backupPackage);
  const keyMaterial = await deriveBackupKey({
    passphrase: input.passphrase,
    salt: base64UrlToBytes(parsed.kdf.salt),
  });
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyMaterial),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const cipherBytes = base64UrlToBytes(parsed.payload.ciphertext);
  const authTag = base64UrlToBytes(parsed.payload.authTag);
  const encrypted = new Uint8Array(cipherBytes.length + authTag.length);
  encrypted.set(cipherBytes, 0);
  encrypted.set(authTag, cipherBytes.length);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(parsed.encryption.nonce)),
      additionalData: toArrayBuffer(textEncoder.encode(parsed.encryption.aad)),
    },
    cryptoKey,
    toArrayBuffer(encrypted),
  );
  const plaintextBytes = new Uint8Array(decrypted);
  const computedHash = await sha256Base64Url(plaintextBytes);
  if (computedHash !== parsed.payload.plaintextSha256) {
    throw new Error('backup_payload_integrity_mismatch');
  }
  const raw = textDecoder.decode(plaintextBytes);
  return VaultJsonExportV1Schema.parse(JSON.parse(raw));
}

export function getImportLimits() {
  return {
    maxFileBytes: MAX_IMPORT_FILE_BYTES,
    maxPhysicalRows: MAX_IMPORT_PHYSICAL_ROWS,
    maxValidRows: MAX_IMPORT_VALID_ROWS,
  };
}
