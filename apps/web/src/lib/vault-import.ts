import { unzipSync } from 'fflate';

import {
  EncryptedBackupPackageV1Schema,
  type RuntimeMetadata,
  VaultJsonExportV1Schema,
  type BackupAttachmentEntryV1,
  type VaultItemType,
} from '@vaultlite/contracts';
import { encryptAttachmentBlobPayload, encryptVaultItemPayload } from './browser-crypto';
import {
  decryptEncryptedBackupPackageV1,
  loadDecryptedVaultDataset,
  type DecryptedVaultDataset,
} from './data-portability';
import type { SessionStore } from './session-store';
import type { VaultLiteVaultClient } from './vault-client';
import { loadVaultUiState, saveVaultUiState, type VaultUiState } from './vault-ui-state';

export type SupportedImportFormat =
  | 'vaultlite_login_csv_v1'
  | 'bitwarden_csv_v1'
  | 'onepassword_1pux_v1'
  | 'bitwarden_json_v1'
  | 'bitwarden_zip_v1'
  | 'vaultlite_json_export_v1'
  | 'vaultlite_encrypted_backup_v1';

export type ImportPreviewStatus =
  | 'valid'
  | 'duplicate'
  | 'invalid'
  | 'unsupported_type'
  | 'skipped_non_login'
  | 'skipped_encrypted_export'
  | 'possible_duplicate_requires_review';

export interface ParsedImportAttachment {
  fileName: string;
  contentType: string;
  size: number;
  bytes: Uint8Array | null;
  encryptedEnvelope: string | null;
  sourcePath: string | null;
  attachmentFingerprint: string | null;
  errorCode: string | null;
}

export interface ParsedImportCustomField {
  label: string;
  value: string;
}

export interface ParsedImportCandidate {
  sourceFormat: SupportedImportFormat;
  sourceRef: string;
  sourceItemId: string | null;
  itemType: Extract<VaultItemType, 'login' | 'document' | 'card' | 'secure_note'>;
  title: string;
  notes: string;
  content: string;
  username: string;
  password: string;
  totp: string;
  cardholderName?: string;
  cardBrand?: string;
  cardNumber?: string;
  cardExpiryMonth?: string;
  cardExpiryYear?: string;
  cardSecurityCode?: string;
  urls: string[];
  favoriteHint: boolean;
  folderHint: string | null;
  archivedHint: boolean;
  customFields: ParsedImportCustomField[];
  attachments: ParsedImportAttachment[];
  provenance: Record<string, unknown>;
  dedupeKey: string | null;
  status: ImportPreviewStatus;
  reason: string | null;
  rowIndex: number;
  existingItemId: string | null;
}

export interface ImportPreviewRow {
  rowIndex: number;
  sourceFormat: SupportedImportFormat;
  sourceRef: string;
  itemType: Extract<VaultItemType, 'login' | 'document' | 'card' | 'secure_note'>;
  title: string;
  username: string;
  firstUrl: string;
  attachmentCount: number;
  status: ImportPreviewStatus;
  reason: string | null;
}

export interface VaultImportPreview {
  format: SupportedImportFormat;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  unsupportedRows: number;
  reviewRequiredRows: number;
  attachmentRows: number;
  attachmentCount: number;
  candidates: ParsedImportCandidate[];
  rows: ImportPreviewRow[];
}

type VaultImportExecutionRowStatus =
  | 'created'
  | 'skipped_duplicate'
  | 'skipped_review_required'
  | 'failed'
  | 'retry_missing_attachments_for_existing_item';

export interface VaultImportExecutionRow {
  rowIndex: number;
  sourceRef: string;
  status: VaultImportExecutionRowStatus;
  itemId: string | null;
  reason: string | null;
  attachmentsCreated: number;
  attachmentsFailed: number;
}

export interface VaultImportExecutionResult {
  created: number;
  skipped: number;
  failed: number;
  attachmentsCreated: number;
  attachmentsFailed: number;
  records: VaultImportExecutionRow[];
  report: {
    generatedAt: string;
    format: SupportedImportFormat;
    totalRows: number;
    created: number;
    skipped: number;
    failed: number;
    attachmentsCreated: number;
    attachmentsFailed: number;
    rows: VaultImportExecutionRow[];
  };
}

export interface VaultImportLimits {
  maxImportFileBytes: number;
  maxArchiveUncompressedBytes: number;
  maxZipEntries: number;
  maxImportItems: number;
  maxImportAttachments: number;
  maxAttachmentSize: number;
  maxInMemoryWorkingSet: number;
}

const LIMITS: VaultImportLimits = {
  maxImportFileBytes: 300 * 1024 * 1024,
  maxArchiveUncompressedBytes: 600 * 1024 * 1024,
  maxZipEntries: 20000,
  maxImportItems: 2000,
  maxImportAttachments: 1000,
  maxAttachmentSize: 25 * 1024 * 1024,
  maxInMemoryWorkingSet: 120 * 1024 * 1024,
};

const IMPORT_CREATE_CONCURRENCY = 5;
const IMPORT_ICON_DOMAIN_BATCH_SIZE = 120;
const IMPORT_ICON_DOMAIN_SYNC_CONCURRENCY = 4;
const ATTACHMENTS_PER_ITEM_CONCURRENCY = 2;
const RETRY_ATTEMPTS = 2;
const HISTORY_RETENTION_DAYS = 30;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type ImportExecutionHistoryRecord = {
  id: string;
  scope: string;
  sourceFormat: SupportedImportFormat;
  sourceRef: string;
  sourceItemId: string | null;
  dedupeKey: string | null;
  attachmentFingerprint: string;
  status: 'attached' | 'failed';
  createdItemId: string | null;
  errorCode: string | null;
  timestamp: string;
};

const fallbackHistory = new Map<string, ImportExecutionHistoryRecord>();
const historyDbName = 'vaultlite_import_history_v1';
const historyStoreName = 'records';

function normalizeCell(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function normalizeForKey(value: string | null | undefined): string {
  return normalizeCell(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
}

function normalizeUrlForKey(value: string | null | undefined): string {
  const raw = normalizeCell(value);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/u, '') : parsed.pathname;
    return `${parsed.protocol.toLowerCase()}//${parsed.hostname.toLowerCase()}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return normalizeForKey(raw);
  }
}

function normalizeDomainForIconSync(rawUrl: string | null | undefined): string | null {
  const raw = normalizeCell(rawUrl);
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const hostname = parsed.hostname.trim().toLowerCase().replace(/\.$/u, '');
    if (!hostname || !/^[a-z0-9.-]{1,255}$/u.test(hostname)) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

function collectIconSyncHostsFromUrls(urls: string[]): string[] {
  const hosts = new Set<string>();
  for (const url of urls) {
    const domain = normalizeDomainForIconSync(url);
    if (domain) {
      hosts.add(domain);
    }
  }
  return Array.from(hosts).sort((left, right) => left.localeCompare(right));
}

async function syncImportedIconDomainsBatch(input: {
  sessionStore: SessionStore;
  entries: Array<{ itemId: string; itemRevision: number; hosts: string[] }>;
}) {
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    return;
  }
  let runtimeMetadata: RuntimeMetadata | null = null;
  try {
    runtimeMetadata = await input.sessionStore.getRuntimeMetadata();
  } catch {
    return;
  }
  if (runtimeMetadata?.realtime?.flags?.icons_state_sync_v1 !== true) {
    return;
  }

  const isPayloadError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : '';
    return (
      message.includes('request_body_too_large') ||
      message.includes('invalid_input') ||
      message.includes('request_failed_400') ||
      message.includes('request_failed_413')
    );
  };

  const shouldBackoff = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : '';
    return (
      message.includes('request_timeout') ||
      message.includes('rate_limited') ||
      message.includes('request_failed_429') ||
      message.includes('request_failed_500') ||
      message.includes('request_failed_502') ||
      message.includes('request_failed_503') ||
      message.includes('request_failed_504')
    );
  };

  let backoffAttempt = 0;
  let backoffUntil = 0;

  const nextBackoffMs = () => {
    backoffAttempt = Math.max(1, backoffAttempt + 1);
    const exponent = Math.min(backoffAttempt - 1, 6);
    const baseMs = Math.min(3_000 * 2 ** exponent, 60_000);
    const jitterMs = Math.round(Math.random() * Math.max(250, baseMs * 0.2));
    return baseMs + jitterMs;
  };

  const fallbackPerItemSync = async (entries: Array<{ itemId: string; itemRevision: number; hosts: string[] }>) => {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.max(1, Math.min(IMPORT_ICON_DOMAIN_SYNC_CONCURRENCY, entries.length)) },
      async () => {
        while (cursor < entries.length) {
          const currentIndex = cursor;
          cursor += 1;
          const entry = entries[currentIndex];
          if (!entry) {
            continue;
          }
          try {
            await input.sessionStore.putIconDomainsItem({
              itemId: entry.itemId,
              itemRevision: entry.itemRevision,
              hosts: entry.hosts,
            });
          } catch {
            // Best effort; vault import success must not depend on icon index sync.
          }
        }
      },
    );
    await Promise.allSettled(workers);
  };

  const syncChunkAdaptive = async (entries: Array<{ itemId: string; itemRevision: number; hosts: string[] }>) => {
    if (entries.length === 0) {
      return;
    }
    try {
      await input.sessionStore.putIconDomainsBatch({
        entries: entries.map((entry) => ({
          itemId: entry.itemId,
          itemRevision: entry.itemRevision,
          hosts: entry.hosts,
        })),
      });
      backoffAttempt = 0;
      backoffUntil = 0;
      return;
    } catch (error) {
      if (!isPayloadError(error)) {
        throw error;
      }
      if (entries.length <= 1) {
        await fallbackPerItemSync(entries);
        return;
      }
      const middle = Math.ceil(entries.length / 2);
      await syncChunkAdaptive(entries.slice(0, middle));
      await syncChunkAdaptive(entries.slice(middle));
    }
  };

  for (let index = 0; index < input.entries.length; index += IMPORT_ICON_DOMAIN_BATCH_SIZE) {
    if (Date.now() < backoffUntil) {
      break;
    }
    const chunk = input.entries.slice(index, index + IMPORT_ICON_DOMAIN_BATCH_SIZE);
    try {
      await syncChunkAdaptive(chunk);
    } catch (error) {
      if (shouldBackoff(error)) {
        backoffUntil = Date.now() + nextBackoffMs();
        break;
      }
      await fallbackPerItemSync(chunk);
    }
  }
}

function sanitizeFileName(name: string, fallback: string): string {
  const cleaned = normalizeCell(name).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned.slice(0, 180) : fallback;
}

function inferContentTypeFromFileName(name: string): string {
  const lowered = name.toLowerCase();
  if (lowered.endsWith('.pdf')) return 'application/pdf';
  if (lowered.endsWith('.png')) return 'image/png';
  if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) return 'image/jpeg';
  if (lowered.endsWith('.gif')) return 'image/gif';
  if (lowered.endsWith('.txt')) return 'text/plain';
  if (lowered.endsWith('.json')) return 'application/json';
  if (lowered.endsWith('.csv')) return 'text/csv';
  return 'application/octet-stream';
}

function parseBoolean(value: string | null | undefined): boolean {
  const normalized = normalizeForKey(value);
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

async function sha256Base64Url(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : Uint8Array.from(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

function buildSourceRef(format: SupportedImportFormat, sourceItemId: string | null, rowIndex: number): string {
  return `${format}:${sourceItemId ?? `row_${rowIndex}`}`;
}

function buildLoginDedupeKey(input: { title: string; username: string; firstUrl: string }): string {
  return `login|${normalizeForKey(input.title)}|${normalizeForKey(input.username)}|${normalizeUrlForKey(input.firstUrl)}`;
}

async function buildSecureNoteDedupeKey(input: { title: string; content: string }): Promise<string> {
  return `secure_note|${normalizeForKey(input.title)}|${await sha256Base64Url(normalizeForKey(input.content))}`;
}

function buildCardDedupeKey(input: {
  title: string;
  cardholderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
}): string {
  const digits = input.number.replace(/\D+/gu, '');
  const last4 = digits.slice(-4);
  return `card|${normalizeForKey(input.title)}|${normalizeForKey(input.cardholderName)}|${last4}|${normalizeForKey(input.expiryMonth)}|${normalizeForKey(input.expiryYear)}`;
}

function buildDocumentFallbackDedupeKey(input: {
  title: string;
  fileName: string;
  size: number;
  sourceFormat: SupportedImportFormat;
  sourceItemId: string;
}): string {
  return `document|${normalizeForKey(input.title)}|${normalizeForKey(input.fileName)}|${input.size}|${input.sourceFormat}|${input.sourceItemId}`;
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

function detectCsvFormat(headers: string[]): SupportedImportFormat {
  const normalizedHeaders = headers.map((header) => normalizeForKey(header));
  if (normalizedHeaders.includes('title') && normalizedHeaders.includes('username') && normalizedHeaders.includes('password')) {
    return 'vaultlite_login_csv_v1';
  }
  if (normalizedHeaders.includes('name') && normalizedHeaders.includes('login_username') && normalizedHeaders.includes('login_password')) {
    return 'bitwarden_csv_v1';
  }
  throw new Error('unsupported_import_format');
}

function ensureSafeZipPath(path: string): void {
  if (path.startsWith('/') || path.startsWith('\\') || /^[a-z]:/iu.test(path) || path.includes('../') || path.includes('..\\')) {
    throw new Error('zip_slip_detected');
  }
}

function parseZipEntries(input: Uint8Array): Map<string, Uint8Array> {
  const parsed = unzipSync(input);
  const keys = Object.keys(parsed);
  if (keys.length > LIMITS.maxZipEntries) {
    throw new Error('zip_entry_limit_exceeded');
  }
  const entries = new Map<string, Uint8Array>();
  let uncompressed = 0;
  let workingSet = 0;
  for (const key of keys) {
    ensureSafeZipPath(key);
    const content = parsed[key];
    if (!content) continue;
    uncompressed += content.byteLength;
    workingSet += content.byteLength;
    if (uncompressed > LIMITS.maxArchiveUncompressedBytes) throw new Error('archive_uncompressed_limit_exceeded');
    if (workingSet > LIMITS.maxInMemoryWorkingSet) throw new Error('import_memory_budget_exceeded');
    entries.set(key.replace(/\\/g, '/'), content);
  }
  return entries;
}

function coerceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

interface OnePasswordItemContext {
  item: Record<string, unknown>;
  vaultName: string | null;
}

interface OnePasswordSectionField {
  label: string;
  id: string;
  normalizedLabel: string;
  normalizedId: string;
  value: string;
}

const ONE_PASSWORD_VALUE_PRIORITY_KEYS = [
  'concealed',
  'string',
  'emailAddress',
  'email',
  'username',
  'url',
  'phone',
  'otp',
  'totp',
  'number',
  'creditCardType',
  'monthYear',
] as const;
const ONE_PASSWORD_METADATA_KEYS = new Set([
  'id',
  'fieldType',
  'designation',
  'indexAtSource',
  'guarded',
  'multiline',
  'dontGenerate',
  'inputTraits',
  'keyboard',
  'correction',
  'capitalization',
  'purpose',
  'name',
  'type',
]);
const ONE_PASSWORD_CARD_CATEGORY_UUIDS = new Set(['002']);
const ONE_PASSWORD_IDENTITY_CATEGORY_UUIDS = new Set(['006']);

function extract1PasswordPrimitive(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeCell(String(value));
  }
  return '';
}

function extract1PasswordFieldValue(value: unknown): string {
  const primitive = extract1PasswordPrimitive(value);
  if (primitive) {
    return primitive;
  }
  if (Array.isArray(value)) {
    const values = value.map((entry) => extract1PasswordFieldValue(entry)).filter((entry) => entry.length > 0);
    return values.join(', ');
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const record = value as Record<string, unknown>;
  for (const key of ONE_PASSWORD_VALUE_PRIORITY_KEYS) {
    if (!(key in record)) continue;
    const extracted = extract1PasswordFieldValue(record[key]);
    if (extracted) return extracted;
  }
  if (Number.isFinite(Number(record.month)) && Number.isFinite(Number(record.year))) {
    const month = String(record.month).padStart(2, '0');
    const year = String(record.year);
    return normalizeCell(`${month}/${year}`);
  }
  for (const [key, entry] of Object.entries(record)) {
    if (ONE_PASSWORD_METADATA_KEYS.has(key)) continue;
    const extracted = extract1PasswordFieldValue(entry);
    if (extracted) return extracted;
  }
  return '';
}

function parse1PasswordSectionFields(details: Record<string, unknown>): OnePasswordSectionField[] {
  const sections = Array.isArray(details.sections) ? details.sections : [];
  const output: OnePasswordSectionField[] = [];
  for (const sectionEntry of sections) {
    const section = coerceRecord(sectionEntry);
    const fields = Array.isArray(section.fields) ? section.fields : [];
    for (const fieldEntry of fields) {
      const field = coerceRecord(fieldEntry);
      const label = normalizeCell(String(field.title ?? field.label ?? field.id ?? ''));
      const id = normalizeCell(String(field.id ?? ''));
      const value = extract1PasswordFieldValue(field.value);
      if (!label || !value) continue;
      output.push({
        label,
        id,
        normalizedLabel: normalizeForKey(label),
        normalizedId: normalizeForKey(id),
        value,
      });
    }
  }
  return output;
}

function split1PasswordCardExpiry(value: string): { month: string; year: string } {
  const normalized = normalizeCell(value);
  const mmYyyy = normalized.match(/^(\d{1,2})\s*[/\-]\s*(\d{4})$/u);
  if (mmYyyy) {
    return { month: mmYyyy[1]!.padStart(2, '0'), year: mmYyyy[2]! };
  }
  const mmYy = normalized.match(/^(\d{1,2})\s*[/\-]\s*(\d{2})$/u);
  if (mmYy) {
    const year = Number(mmYy[2]!);
    const normalizedYear = year >= 70 ? `19${mmYy[2]}` : `20${mmYy[2]}`;
    return { month: mmYy[1]!.padStart(2, '0'), year: normalizedYear };
  }
  return { month: '', year: '' };
}

function infer1PasswordCardPayload(input: {
  sectionFields: OnePasswordSectionField[];
}): {
  itemType: Extract<VaultItemType, 'card' | 'secure_note'>;
  cardholderName: string;
  cardBrand: string;
  cardNumber: string;
  cardExpiryMonth: string;
  cardExpiryYear: string;
  cardSecurityCode: string;
} {
  let cardholderName = '';
  let cardBrand = '';
  let cardNumber = '';
  let cardExpiryMonth = '';
  let cardExpiryYear = '';
  let cardSecurityCode = '';

  for (const field of input.sectionFields) {
    const key = `${field.normalizedLabel} ${field.normalizedId}`.trim();
    if (!cardholderName && /cardholder|nameoncard|name on card|nome no cartao/iu.test(key)) {
      cardholderName = field.value;
      continue;
    }
    if (!cardBrand && /brand|bandeira|card type|tipo do cartao|cctype|type/iu.test(key)) {
      cardBrand = field.value;
      continue;
    }
    if (!cardNumber && /card number|credit card number|ccnum|numero do cartao|number/iu.test(key)) {
      cardNumber = field.value;
      continue;
    }
    if (!cardSecurityCode && /cvv|cvc|security code|codigo de seguranca/iu.test(key)) {
      cardSecurityCode = field.value;
      continue;
    }
    if ((!cardExpiryMonth || !cardExpiryYear) && /expiry|expiration|validade|expires|monthyear/iu.test(key)) {
      const parsed = split1PasswordCardExpiry(field.value);
      cardExpiryMonth = cardExpiryMonth || parsed.month;
      cardExpiryYear = cardExpiryYear || parsed.year;
    }
  }

  const isCardLike =
    Boolean(cardNumber) ||
    Boolean(cardholderName) ||
    Boolean(cardSecurityCode) ||
    Boolean(cardExpiryMonth) ||
    Boolean(cardBrand);

  return {
    itemType: isCardLike ? 'card' : 'secure_note',
    cardholderName,
    cardBrand,
    cardNumber,
    cardExpiryMonth,
    cardExpiryYear,
    cardSecurityCode,
  };
}

function build1PasswordCustomFields(input: {
  sectionFields: OnePasswordSectionField[];
  tags: string[];
  skipKeys?: Set<string>;
  archivedHint: boolean;
}): ParsedImportCustomField[] {
  const skipKeys = input.skipKeys ?? new Set<string>();
  const customFields: ParsedImportCustomField[] = [];
  const seen = new Set<string>();
  for (const field of input.sectionFields) {
    const dedupeKey = `${field.normalizedLabel}|${field.normalizedId}|${normalizeForKey(field.value)}`;
    if (seen.has(dedupeKey)) continue;
    const compoundKey = `${field.normalizedLabel} ${field.normalizedId}`.trim();
    const shouldSkip = Array.from(skipKeys).some((entry) => compoundKey.includes(entry) || field.normalizedId.includes(entry));
    if (shouldSkip) continue;
    customFields.push({
      label: field.label,
      value: field.value,
    });
    seen.add(dedupeKey);
  }
  if (input.tags.length > 0) {
    customFields.push({
      label: 'Imported tags',
      value: input.tags.join(', '),
    });
  }
  if (input.archivedHint) {
    customFields.push({ label: 'Imported archived', value: 'true' });
  }
  return customFields;
}

function isTransientUploadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('status 5') || message.includes('network') || message.includes('failed to fetch');
}

async function withAttachmentRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientUploadError(error) || attempt >= RETRY_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
  throw lastError;
}

function getImportScope(deploymentFingerprint: string, username: string): string {
  return `${deploymentFingerprint}:${username}`;
}

async function openHistoryDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(historyDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(historyStoreName)) {
        const store = db.createObjectStore(historyStoreName, { keyPath: 'id' });
        store.createIndex('scope', 'scope', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

function historyRecordId(input: {
  scope: string;
  sourceFormat: SupportedImportFormat;
  sourceRef: string;
  sourceItemId: string | null;
  dedupeKey: string | null;
  attachmentFingerprint: string;
}): string {
  return [
    input.scope,
    input.sourceFormat,
    input.sourceRef,
    input.sourceItemId ?? '',
    input.dedupeKey ?? '',
    input.attachmentFingerprint,
  ].join('|');
}

async function loadHistory(scope: string): Promise<Map<string, ImportExecutionHistoryRecord>> {
  const min = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const fallback = new Map<string, ImportExecutionHistoryRecord>();
  fallbackHistory.forEach((record, key) => {
    if (record.scope === scope && record.timestamp >= min) fallback.set(key, record);
  });
  const db = await openHistoryDb();
  if (!db) return fallback;
  return new Promise((resolve) => {
    const tx = db.transaction(historyStoreName, 'readonly');
    const store = tx.objectStore(historyStoreName);
    const request = store.getAll();
    request.onerror = () => resolve(fallback);
    request.onsuccess = () => {
      const map = new Map<string, ImportExecutionHistoryRecord>();
      (request.result as ImportExecutionHistoryRecord[])
        .filter((entry) => entry.scope === scope && entry.timestamp >= min)
        .forEach((entry) => map.set(entry.id, entry));
      resolve(map);
    };
  });
}

async function saveHistory(record: ImportExecutionHistoryRecord): Promise<void> {
  fallbackHistory.set(record.id, record);
  const db = await openHistoryDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(historyStoreName, 'readwrite');
    tx.objectStore(historyStoreName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function copyUiState(state: VaultUiState): VaultUiState {
  return {
    favorites: [...state.favorites],
    folderAssignments: { ...state.folderAssignments },
    folders: [...state.folders],
  };
}

function getOrCreateFolderId(input: { state: VaultUiState; folderName: string }): string {
  const normalizedTarget = normalizeForKey(input.folderName);
  const existing = input.state.folders.find((folder) => normalizeForKey(folder.name) === normalizedTarget);
  if (existing) return existing.id;
  const idBase = normalizedTarget.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  const generatedId = `${idBase || 'folder'}-${Math.random().toString(36).slice(2, 7)}`;
  input.state.folders.push({ id: generatedId, name: input.folderName.trim() });
  return generatedId;
}

function applyUiStateHints(input: {
  username: string;
  createdRows: Array<{ itemId: string; favorite: boolean; folder: string | null }>;
}): void {
  if (input.createdRows.length === 0) return;
  const next = copyUiState(loadVaultUiState(input.username));
  for (const row of input.createdRows) {
    if (row.favorite && !next.favorites.includes(row.itemId)) {
      next.favorites.push(row.itemId);
    }
    if (row.folder) {
      const folderId = getOrCreateFolderId({ state: next, folderName: row.folder });
      next.folderAssignments[row.itemId] = folderId;
    }
  }
  saveVaultUiState(input.username, next);
}

export function getVaultImportLimits(): VaultImportLimits {
  return { ...LIMITS };
}

function extractHostTitle(urlValue: string): string {
  const first = normalizeCell(urlValue).split(/\s*[,\n;]\s*/u).find((entry) => entry.length > 0);
  if (!first) return '';
  try {
    const withProtocol = /^https?:\/\//iu.test(first) ? first : `https://${first}`;
    return new URL(withProtocol).hostname.replace(/^www\./iu, '');
  } catch {
    return first;
  }
}

function extractFirstUrl(urlValue: string): string {
  const first = normalizeCell(urlValue).split(/\s*[,\n;]\s*/u).find((entry) => entry.length > 0);
  return first ?? '';
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
  if (typeof index !== 'number') return '';
  return row[index] ?? '';
}

function ensureFileSize(file: File): void {
  if (file.size > LIMITS.maxImportFileBytes) {
    throw new Error('import_file_size_exceeded');
  }
}

async function parseCsvImport(input: {
  csvText: string;
  format: Extract<SupportedImportFormat, 'vaultlite_login_csv_v1' | 'bitwarden_csv_v1'>;
}): Promise<ParsedImportCandidate[]> {
  const rows = parseCsvRows(input.csvText);
  if (rows.length < 2) throw new Error('csv_missing_rows');
  const [headers, ...dataRows] = rows;
  const headerIndex = createHeaderIndex(headers ?? []);
  const candidates: ParsedImportCandidate[] = [];

  for (let rowOffset = 0; rowOffset < dataRows.length; rowOffset += 1) {
    const row = dataRows[rowOffset] ?? [];
    const rowIndex = rowOffset + 2;
    if (input.format === 'bitwarden_csv_v1') {
      const typeValue = normalizeForKey(readCell(row, headerIndex, 'type'));
      if (typeValue && typeValue !== 'login') {
        candidates.push({
          sourceFormat: input.format,
          sourceRef: buildSourceRef(input.format, null, rowIndex),
          sourceItemId: null,
          itemType: 'login',
          title: '',
          notes: '',
          content: '',
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
          status: 'skipped_non_login',
          reason: 'non_login_type',
          rowIndex,
          existingItemId: null,
        });
        continue;
      }
    }

    const titleSource =
      input.format === 'vaultlite_login_csv_v1'
        ? readCell(row, headerIndex, 'title')
        : readCell(row, headerIndex, 'name');
    const username =
      input.format === 'vaultlite_login_csv_v1'
        ? readCell(row, headerIndex, 'username')
        : readCell(row, headerIndex, 'login_username');
    const password =
      input.format === 'vaultlite_login_csv_v1'
        ? readCell(row, headerIndex, 'password')
        : readCell(row, headerIndex, 'login_password');
    const urlValue =
      input.format === 'vaultlite_login_csv_v1'
        ? readCell(row, headerIndex, 'url')
        : readCell(row, headerIndex, 'login_uri');
    const notes = readCell(row, headerIndex, 'notes');
    const folder = readCell(row, headerIndex, 'folder');
    const favorite = parseBoolean(readCell(row, headerIndex, 'favorite'));
    const title = normalizeCell(titleSource) || extractHostTitle(urlValue);
    const firstUrl = extractFirstUrl(urlValue);

    const isEmpty =
      !title && !normalizeCell(username) && !normalizeCell(password) && !normalizeCell(firstUrl) && !normalizeCell(notes);
    const status: ImportPreviewStatus = isEmpty ? 'invalid' : title ? 'valid' : 'invalid';
    const reason = isEmpty ? 'empty_row' : title ? null : 'missing_title';

    candidates.push({
      sourceFormat: input.format,
      sourceRef: buildSourceRef(input.format, null, rowIndex),
      sourceItemId: null,
      itemType: 'login',
      title: title || '',
      notes: normalizeCell(notes),
      content: '',
      username: normalizeCell(username),
      password: normalizeCell(password),
      totp: '',
      urls: firstUrl ? [firstUrl] : [],
      favoriteHint: favorite,
      folderHint: normalizeCell(folder) || null,
      archivedHint: false,
      customFields: [],
      attachments: [],
      provenance: {},
      dedupeKey: null,
      status,
      reason,
      rowIndex,
      existingItemId: null,
    });
  }
  return candidates;
}

async function buildExistingDedupeIndex(dataset: DecryptedVaultDataset): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  for (const item of dataset.items) {
    if (item.itemType === 'login') {
      const payload = item.payload as Partial<{ title: string; username: string; urls: string[] }>;
      const key = buildLoginDedupeKey({
        title: String(payload.title ?? ''),
        username: String(payload.username ?? ''),
        firstUrl: Array.isArray(payload.urls) ? String(payload.urls[0] ?? '') : '',
      });
      index.set(key, item.itemId);
      continue;
    }
    if (item.itemType === 'card') {
      const payload = item.payload as Partial<{
        title: string;
        cardholderName: string;
        number: string;
        expiryMonth: string;
        expiryYear: string;
      }>;
      const key = buildCardDedupeKey({
        title: String(payload.title ?? ''),
        cardholderName: String(payload.cardholderName ?? ''),
        number: String(payload.number ?? ''),
        expiryMonth: String(payload.expiryMonth ?? ''),
        expiryYear: String(payload.expiryYear ?? ''),
      });
      index.set(key, item.itemId);
      continue;
    }
    if (item.itemType === 'secure_note') {
      const payload = item.payload as Partial<{ title: string; content: string }>;
      const key = await buildSecureNoteDedupeKey({
        title: String(payload.title ?? ''),
        content: String(payload.content ?? ''),
      });
      index.set(key, item.itemId);
    }
  }
  return index;
}

function formatRows(format: SupportedImportFormat, candidates: ParsedImportCandidate[]): ImportPreviewRow[] {
  return candidates.map((candidate) => ({
    rowIndex: candidate.rowIndex,
    sourceFormat: format,
    sourceRef: candidate.sourceRef,
    itemType: candidate.itemType,
    title: candidate.title,
    username: candidate.itemType === 'card' ? normalizeCell(candidate.cardholderName ?? '') : candidate.username,
    firstUrl: candidate.urls[0] ?? '',
    attachmentCount: candidate.attachments.length,
    status: candidate.status,
    reason: candidate.reason,
  }));
}

async function finalizeCandidates(
  format: SupportedImportFormat,
  candidates: ParsedImportCandidate[],
  dataset: DecryptedVaultDataset,
): Promise<VaultImportPreview> {
  if (candidates.length > LIMITS.maxImportItems) {
    throw new Error('import_item_limit_exceeded');
  }

  const existing = await buildExistingDedupeIndex(dataset);
  const seen = new Set<string>();
  let attachmentCount = 0;
  for (const candidate of candidates) {
    attachmentCount += candidate.attachments.length;
    if (candidate.status !== 'valid') continue;

    if (candidate.itemType === 'login') {
      candidate.dedupeKey = buildLoginDedupeKey({
        title: candidate.title,
        username: candidate.username,
        firstUrl: candidate.urls[0] ?? '',
      });
    } else if (candidate.itemType === 'card') {
      candidate.dedupeKey = buildCardDedupeKey({
        title: candidate.title,
        cardholderName: candidate.cardholderName ?? '',
        number: candidate.cardNumber ?? '',
        expiryMonth: candidate.cardExpiryMonth ?? '',
        expiryYear: candidate.cardExpiryYear ?? '',
      });
    } else if (candidate.itemType === 'secure_note') {
      candidate.dedupeKey = await buildSecureNoteDedupeKey({
        title: candidate.title,
        content: candidate.content,
      });
    } else {
      const attachmentHash = candidate.attachments.find((entry) => entry.attachmentFingerprint)?.attachmentFingerprint ?? null;
      if (attachmentHash) {
        candidate.dedupeKey = `document|${normalizeForKey(candidate.title)}|${attachmentHash}`;
      } else if (candidate.sourceItemId) {
        const firstAttachment = candidate.attachments[0];
        candidate.dedupeKey = buildDocumentFallbackDedupeKey({
          title: candidate.title,
          fileName: firstAttachment?.fileName ?? candidate.title,
          size: firstAttachment?.size ?? 0,
          sourceFormat: candidate.sourceFormat,
          sourceItemId: candidate.sourceItemId,
        });
      } else {
        candidate.status = 'possible_duplicate_requires_review';
        candidate.reason = 'possible_duplicate_requires_review';
      }
    }

    if (!candidate.dedupeKey) continue;
    if (existing.has(candidate.dedupeKey)) {
      candidate.status = 'duplicate';
      candidate.reason = 'duplicate_item';
      candidate.existingItemId = existing.get(candidate.dedupeKey) ?? null;
      continue;
    }
    if (seen.has(candidate.dedupeKey)) {
      candidate.status = 'duplicate';
      candidate.reason = 'duplicate_item';
      continue;
    }
    seen.add(candidate.dedupeKey);
  }

  if (attachmentCount > LIMITS.maxImportAttachments) {
    throw new Error('import_attachment_limit_exceeded');
  }

  return {
    format,
    totalRows: candidates.length,
    validRows: candidates.filter((entry) => entry.status === 'valid').length,
    duplicateRows: candidates.filter((entry) => entry.status === 'duplicate').length,
    invalidRows: candidates.filter((entry) => entry.status === 'invalid').length,
    unsupportedRows: candidates.filter((entry) => entry.status === 'unsupported_type').length,
    reviewRequiredRows: candidates.filter((entry) => entry.status === 'possible_duplicate_requires_review').length,
    attachmentRows: candidates.filter((entry) => entry.attachments.length > 0).length,
    attachmentCount,
    candidates,
    rows: formatRows(format, candidates),
  };
}

function findZipEntryName(entries: Map<string, Uint8Array>, expected: string): string | null {
  if (entries.has(expected)) return expected;
  const normalizedExpected = expected.replace(/\\/g, '/').toLowerCase();
  return Array.from(entries.keys()).find((key) => key.toLowerCase() === normalizedExpected) ?? null;
}

function findZipEntry(entries: Map<string, Uint8Array>, expected: string): Uint8Array | null {
  const key = findZipEntryName(entries, expected);
  return key ? entries.get(key) ?? null : null;
}

function resolveBitwardenZipAttachmentPath(input: {
  entries: Map<string, Uint8Array>;
  itemId: string;
  attachmentId: string | null;
  fileName: string;
}): { status: 'resolved'; path: string } | { status: 'missing' } | { status: 'ambiguous' } {
  const keys = Array.from(input.entries.keys());

  if (input.attachmentId) {
    const byId = keys.filter((key) => key === input.attachmentId || key.endsWith(`/${input.attachmentId}`));
    if (byId.length === 1) return { status: 'resolved', path: byId[0] ?? '' };
    if (byId.length > 1) return { status: 'ambiguous' };
  }

  const fullPath = `attachments/${input.itemId}/${input.fileName}`;
  const byItemPath = findZipEntryName(input.entries, fullPath);
  if (byItemPath) return { status: 'resolved', path: byItemPath };

  const byFileName = keys.filter((key) => key.endsWith(`/attachments/${input.fileName}`) || key === `attachments/${input.fileName}`);
  if (byFileName.length === 1) return { status: 'resolved', path: byFileName[0] ?? '' };
  if (byFileName.length > 1) return { status: 'ambiguous' };

  return { status: 'missing' };
}

function isBitwardenLikeJson(root: Record<string, unknown>): boolean {
  return Array.isArray(root.items) || Array.isArray(root.ciphers) || root.encrypted === true;
}

async function parseBitwardenJsonImport(input: {
  jsonText: string;
  format: Extract<SupportedImportFormat, 'bitwarden_json_v1' | 'bitwarden_zip_v1'>;
  zipEntries?: Map<string, Uint8Array>;
}): Promise<ParsedImportCandidate[]> {
  const root = JSON.parse(input.jsonText) as Record<string, unknown>;
  if (root.encrypted === true) {
    throw new Error('encrypted_export_not_supported');
  }
  const folders = new Map<string, string>();
  if (Array.isArray(root.folders)) {
    root.folders.forEach((entry) => {
      const folder = coerceRecord(entry);
      const folderId = normalizeCell(String(folder.id ?? ''));
      if (folderId) folders.set(folderId, normalizeCell(String(folder.name ?? '')));
    });
  }

  const sourceItems = Array.isArray(root.items) ? root.items : Array.isArray(root.ciphers) ? root.ciphers : [];
  const candidates: ParsedImportCandidate[] = [];
  for (let index = 0; index < sourceItems.length; index += 1) {
    const rowIndex = index + 1;
    const item = coerceRecord(sourceItems[index]);
    const itemId = normalizeCell(String(item.id ?? '')) || null;
    const sourceRef = buildSourceRef(input.format, itemId, rowIndex);
    const type = Number(item.type ?? -1);
    const favoriteHint = Boolean(item.favorite);
    const folderHint = folders.get(normalizeCell(String(item.folderId ?? ''))) ?? null;
    const customFields: ParsedImportCustomField[] = (Array.isArray(item.fields) ? item.fields : [])
      .map((field) => coerceRecord(field))
      .map((field) => ({
        label: normalizeCell(String(field.name ?? field.label ?? '')),
        value: normalizeCell(String(field.value ?? '')),
      }))
      .filter((field) => field.label.length > 0);

    if (type === 1) {
      const login = coerceRecord(item.login);
      const title = normalizeCell(String(item.name ?? '')) || extractHostTitle(String(login.username ?? ''));
      const urls = Array.isArray(login.uris)
        ? login.uris
            .map((entry) => normalizeCell(String(coerceRecord(entry).uri ?? '')))
            .filter((entry) => entry.length > 0)
        : [];
      const attachments: ParsedImportAttachment[] = [];
      for (const attachmentEntry of Array.isArray(item.attachments) ? item.attachments : []) {
        const attachment = coerceRecord(attachmentEntry);
        const fileName = sanitizeFileName(String(attachment.fileName ?? 'attachment.bin'), 'attachment.bin');
        const attachmentId = normalizeCell(String(attachment.id ?? '')) || null;
        if (!input.zipEntries) continue;
        const resolved = resolveBitwardenZipAttachmentPath({
          entries: input.zipEntries,
          itemId: itemId ?? '',
          attachmentId,
          fileName,
        });
        if (resolved.status === 'ambiguous') {
          attachments.push({
            fileName,
            contentType: inferContentTypeFromFileName(fileName),
            size: 0,
            bytes: null,
            encryptedEnvelope: null,
            sourcePath: null,
            attachmentFingerprint: null,
            errorCode: 'ambiguous_attachment_path',
          });
          continue;
        }
        if (resolved.status === 'missing') {
          attachments.push({
            fileName,
            contentType: inferContentTypeFromFileName(fileName),
            size: 0,
            bytes: null,
            encryptedEnvelope: null,
            sourcePath: null,
            attachmentFingerprint: null,
            errorCode: 'failed_attachment_missing_file',
          });
          continue;
        }
        const bytes = input.zipEntries.get(resolved.path) ?? null;
        attachments.push({
          fileName,
          contentType: inferContentTypeFromFileName(fileName),
          size: bytes?.byteLength ?? 0,
          bytes,
          encryptedEnvelope: null,
          sourcePath: resolved.path,
          attachmentFingerprint: bytes ? await sha256Base64Url(bytes) : null,
          errorCode: bytes ? null : 'failed_attachment_missing_file',
        });
      }

      candidates.push({
        sourceFormat: input.format,
        sourceRef,
        sourceItemId: itemId,
        itemType: 'login',
        title,
        notes: normalizeCell(String(item.notes ?? '')),
        content: '',
        username: normalizeCell(String(login.username ?? '')),
        password: normalizeCell(String(login.password ?? '')),
        totp: normalizeCell(String(login.totp ?? '')),
        urls,
        favoriteHint,
        folderHint,
        archivedHint: false,
        customFields,
        attachments,
        provenance: { format: input.format },
        dedupeKey: null,
        status: title ? 'valid' : 'invalid',
        reason: title ? null : 'missing_title',
        rowIndex,
        existingItemId: null,
      });
      continue;
    }

    if (type === 2) {
      candidates.push({
        sourceFormat: input.format,
        sourceRef,
        sourceItemId: itemId,
        itemType: 'secure_note',
        title: normalizeCell(String(item.name ?? '')) || 'Secure note',
        notes: '',
        content: normalizeCell(String(item.notes ?? '')),
        username: '',
        password: '',
        totp: '',
        urls: [],
        favoriteHint,
        folderHint,
        archivedHint: false,
        customFields,
        attachments: [],
        provenance: { format: input.format },
        dedupeKey: null,
        status: 'valid',
        reason: null,
        rowIndex,
        existingItemId: null,
      });
      continue;
    }

    candidates.push({
      sourceFormat: input.format,
      sourceRef,
      sourceItemId: itemId,
      itemType: 'login',
      title: normalizeCell(String(item.name ?? '')),
      notes: '',
      content: '',
      username: '',
      password: '',
      totp: '',
      urls: [],
      favoriteHint: false,
      folderHint: null,
      archivedHint: false,
      customFields: [],
      attachments: [],
      provenance: { format: input.format },
      dedupeKey: null,
      status: 'unsupported_type',
      reason: 'unsupported_type',
      rowIndex,
      existingItemId: null,
    });
  }
  return candidates;
}

function collect1PasswordItems(root: unknown): OnePasswordItemContext[] {
  const parsedRoot = coerceRecord(root);
  const accounts = Array.isArray(parsedRoot.accounts) ? parsedRoot.accounts : [];
  const collected: OnePasswordItemContext[] = [];

  for (const accountEntry of accounts) {
    const account = coerceRecord(accountEntry);
    const vaults = Array.isArray(account.vaults) ? account.vaults : [];
    for (const vaultEntry of vaults) {
      const vault = coerceRecord(vaultEntry);
      const vaultAttrs = coerceRecord(vault.attrs);
      const vaultName = normalizeCell(String(vaultAttrs.name ?? '')) || null;
      const items = Array.isArray(vault.items) ? vault.items : [];
      for (const itemEntry of items) {
        const item = coerceRecord(itemEntry);
        if (!item.overview || !item.details) continue;
        collected.push({
          item,
          vaultName,
        });
      }
    }
  }

  if (collected.length > 0) {
    return collected;
  }

  const fallback: OnePasswordItemContext[] = [];
  const queue: unknown[] = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (Array.isArray(current)) {
      current.forEach((entry) => queue.push(entry));
      continue;
    }
    if (typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    if (record.overview && record.details) {
      fallback.push({
        item: record,
        vaultName: null,
      });
    }
    Object.values(record).forEach((entry) => {
      if (entry && typeof entry === 'object') queue.push(entry);
    });
  }
  return fallback;
}

async function parse1Password1PuxImport(input: { zipEntries: Map<string, Uint8Array> }): Promise<ParsedImportCandidate[]> {
  const exportData = findZipEntry(input.zipEntries, 'export.data');
  if (!exportData) throw new Error('unsupported_import_format');
  const parsed = JSON.parse(textDecoder.decode(exportData));
  const items = collect1PasswordItems(parsed);
  const candidates: ParsedImportCandidate[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const rowIndex = index + 1;
    const context = items[index];
    const item = context?.item ?? {};
    const overview = coerceRecord(item.overview);
    const details = coerceRecord(item.details);
    const itemFile = coerceRecord(item.file);
    const categoryUuid = normalizeForKey(String(item.categoryUuid ?? ''));
    const sectionFields = parse1PasswordSectionFields(details);
    const sectionFieldLines = sectionFields.map((field) => `${field.label}: ${field.value}`);
    const tags = Array.isArray(overview.tags)
      ? overview.tags
          .map((entry) => normalizeCell(String(entry)))
          .filter((entry) => entry.length > 0)
      : [];
    const sourceItemId = normalizeCell(String(item.uuid ?? item.id ?? '')) || null;
    const sourceRef = buildSourceRef('onepassword_1pux_v1', sourceItemId, rowIndex);
    const archivedHint = normalizeForKey(String(item.state ?? '')) === 'archived';
    const favoriteHint = Number(item.favIndex ?? 0) > 0;
    const folderHint = (context?.vaultName ?? normalizeCell(String(item.vaultName ?? item.vault ?? ''))) || null;
    const documentAttributes = coerceRecord(details.documentAttributes);
    const documentId = normalizeCell(String(documentAttributes.documentId ?? ''));
    const documentFileName = normalizeCell(String(documentAttributes.fileName ?? ''));
    const filePath = normalizeCell(String(itemFile.path ?? ''));

    if (documentId || documentFileName) {
      const title = normalizeCell(String(overview.title ?? '')) || 'Imported document';
      const body = [normalizeCell(String(details.notesPlain ?? '')), sectionFieldLines.join('\n')]
        .filter((entry) => entry.length > 0)
        .join('\n\n');
      const attachments: ParsedImportAttachment[] = [];
      if (documentId && documentFileName) {
        const preferredThreeUnderscores = `files/${documentId}___${documentFileName}`;
        const preferredTwoUnderscores = `files/${documentId}__${documentFileName}`;
        const path =
          findZipEntryName(input.zipEntries, filePath) ??
          findZipEntryName(input.zipEntries, preferredThreeUnderscores) ??
          findZipEntryName(input.zipEntries, preferredTwoUnderscores) ??
          Array.from(input.zipEntries.keys()).find((key) => key.endsWith(`${documentId}__${documentFileName}`)) ??
          Array.from(input.zipEntries.keys()).find((key) => key.endsWith(`${documentId}___${documentFileName}`)) ??
          null;
        const bytes = path ? input.zipEntries.get(path) ?? null : null;
        attachments.push({
          fileName: sanitizeFileName(documentFileName, 'document.bin'),
          contentType: inferContentTypeFromFileName(documentFileName),
          size: bytes?.byteLength ?? 0,
          bytes,
          encryptedEnvelope: null,
          sourcePath: path,
          attachmentFingerprint: bytes ? await sha256Base64Url(bytes) : null,
          errorCode: bytes ? null : 'failed_attachment_missing_file',
        });
      }

      candidates.push({
        sourceFormat: 'onepassword_1pux_v1',
        sourceRef,
        sourceItemId,
        itemType: 'document',
        title,
        notes: '',
        content: body,
        username: '',
        password: '',
        totp: '',
        urls: [],
        favoriteHint,
        folderHint,
        archivedHint,
        customFields: build1PasswordCustomFields({
          sectionFields,
          tags,
          archivedHint,
        }),
        attachments,
        provenance: { format: 'onepassword_1pux_v1' },
        dedupeKey: null,
        status: 'valid',
        reason: null,
        rowIndex,
        existingItemId: null,
      });
      continue;
    }

    const loginFields = Array.isArray(details.loginFields) ? details.loginFields.map((entry) => coerceRecord(entry)) : [];
    const usernameField = loginFields.find((entry) => normalizeForKey(String(entry.designation ?? '')) === 'username');
    const passwordField = loginFields.find((entry) => normalizeForKey(String(entry.designation ?? '')) === 'password');
    const urls = Array.isArray(overview.urls)
      ? overview.urls
          .map((entry) => normalizeCell(String(coerceRecord(entry).url ?? '')))
          .filter((entry) => entry.length > 0)
      : [];
    const fallbackUrl = normalizeCell(String(overview.url ?? ''));
    if (fallbackUrl && !urls.includes(fallbackUrl)) urls.push(fallbackUrl);
    const title = normalizeCell(String(overview.title ?? '')) || extractHostTitle(urls[0] ?? '');
    const notesPlain = normalizeCell(String(details.notesPlain ?? ''));
    const hasLoginSignal =
      loginFields.length > 0 || Boolean(usernameField?.value) || Boolean(passwordField?.value) || urls.length > 0;
    const isCardCategory = ONE_PASSWORD_CARD_CATEGORY_UUIDS.has(categoryUuid);
    const isIdentityCategory = ONE_PASSWORD_IDENTITY_CATEGORY_UUIDS.has(categoryUuid);

    if (isCardCategory || (!hasLoginSignal && sectionFields.some((field) => /ccnum|card|cvv|expiry|expiration/iu.test(`${field.normalizedLabel} ${field.normalizedId}`)))) {
      const card = infer1PasswordCardPayload({ sectionFields });
      const cardSkipKeys = new Set([
        'cardholder',
        'nameoncard',
        'ccnum',
        'card number',
        'numero do cartao',
        'card type',
        'brand',
        'cvv',
        'cvc',
        'security',
        'expiry',
        'expiration',
        'monthyear',
      ]);
      if (card.itemType === 'card') {
        candidates.push({
          sourceFormat: 'onepassword_1pux_v1',
          sourceRef,
          sourceItemId,
          itemType: 'card',
          title: title || card.cardBrand || 'Imported card',
          notes: notesPlain,
          content: '',
          username: '',
          password: '',
          totp: '',
          cardholderName: card.cardholderName,
          cardBrand: card.cardBrand,
          cardNumber: card.cardNumber,
          cardExpiryMonth: card.cardExpiryMonth,
          cardExpiryYear: card.cardExpiryYear,
          cardSecurityCode: card.cardSecurityCode,
          urls: [],
          favoriteHint,
          folderHint,
          archivedHint,
          customFields: build1PasswordCustomFields({
            sectionFields,
            tags,
            skipKeys: cardSkipKeys,
            archivedHint,
          }),
          attachments: [],
          provenance: { format: 'onepassword_1pux_v1' },
          dedupeKey: null,
          status: title || card.cardNumber ? 'valid' : 'invalid',
          reason: title || card.cardNumber ? null : 'missing_title',
          rowIndex,
          existingItemId: null,
        });
        continue;
      }
    }

    if (!hasLoginSignal || isIdentityCategory) {
      const content = [notesPlain, sectionFieldLines.join('\n')]
        .filter((entry) => entry.length > 0)
        .join('\n\n');
      candidates.push({
        sourceFormat: 'onepassword_1pux_v1',
        sourceRef,
        sourceItemId,
        itemType: 'secure_note',
        title: title || 'Imported note',
        notes: '',
        content,
        username: '',
        password: '',
        totp: '',
        urls: [],
        favoriteHint,
        folderHint,
        archivedHint,
        customFields: build1PasswordCustomFields({
          sectionFields,
          tags,
          archivedHint,
        }),
        attachments: [],
        provenance: { format: 'onepassword_1pux_v1' },
        dedupeKey: null,
        status: title || content ? 'valid' : 'invalid',
        reason: title || content ? null : 'missing_title',
        rowIndex,
        existingItemId: null,
      });
      continue;
    }

    const loginSkipKeys = new Set(['username', 'password', 'one time password', 'totp', 'otp']);

    candidates.push({
      sourceFormat: 'onepassword_1pux_v1',
      sourceRef,
      sourceItemId,
      itemType: 'login',
      title,
      notes: notesPlain,
      content: '',
      username: normalizeCell(String(usernameField?.value ?? overview.subtitle ?? '')),
      password: normalizeCell(String(passwordField?.value ?? '')),
      totp: '',
      urls,
      favoriteHint,
      folderHint,
      archivedHint,
      customFields: build1PasswordCustomFields({
        sectionFields,
        tags,
        skipKeys: loginSkipKeys,
        archivedHint,
      }),
      attachments: [],
      provenance: { format: 'onepassword_1pux_v1' },
      dedupeKey: null,
      status: title ? 'valid' : 'invalid',
      reason: title ? null : 'missing_title',
      rowIndex,
      existingItemId: null,
    });
  }

  return candidates;
}

function parseVaultLiteCustomFields(payload: Record<string, unknown>): ParsedImportCustomField[] {
  const raw = Array.isArray(payload.customFields) ? payload.customFields : [];
  return raw
    .map((entry) => coerceRecord(entry))
    .map((entry) => ({
      label: normalizeCell(String(entry.label ?? entry.name ?? '')),
      value: normalizeCell(String(entry.value ?? '')),
    }))
    .filter((entry) => entry.label.length > 0);
}

function normalizeVaultLiteAttachmentEntry(entry: BackupAttachmentEntryV1): ParsedImportAttachment {
  return {
    fileName: sanitizeFileName(entry.fileName, 'attachment.bin'),
    contentType: normalizeCell(entry.contentType) || inferContentTypeFromFileName(entry.fileName),
    size: entry.size,
    bytes: null,
    encryptedEnvelope: entry.envelope,
    sourcePath: entry.uploadId,
    attachmentFingerprint: entry.envelopeSha256,
    errorCode: null,
  };
}

async function parseVaultLiteExportImport(input: {
  exportPayload: unknown;
  format: Extract<SupportedImportFormat, 'vaultlite_json_export_v1' | 'vaultlite_encrypted_backup_v1'>;
  attachmentsByItemId?: Map<string, BackupAttachmentEntryV1[]>;
}): Promise<ParsedImportCandidate[]> {
  const parsed = VaultJsonExportV1Schema.parse(input.exportPayload);
  const foldersById = new Map((parsed.uiState?.folders ?? []).map((folder) => [folder.id, folder.name]));
  const favorites = new Set(parsed.uiState?.favorites ?? []);
  const candidates: ParsedImportCandidate[] = [];

  for (let index = 0; index < parsed.vault.items.length; index += 1) {
    const item = parsed.vault.items[index];
    if (!item) continue;
    const rowIndex = index + 1;
    const sourceRef = buildSourceRef(input.format, item.itemId, rowIndex);
    const payload = coerceRecord(item.payload);
    const itemType = item.itemType;

    if (itemType !== 'login' && itemType !== 'document' && itemType !== 'card' && itemType !== 'secure_note') {
      candidates.push({
        sourceFormat: input.format,
        sourceRef,
        sourceItemId: item.itemId,
        itemType: 'login',
        title: normalizeCell(String(payload.title ?? item.itemId)),
        notes: '',
        content: '',
        username: '',
        password: '',
        totp: '',
        urls: [],
        favoriteHint: favorites.has(item.itemId),
        folderHint: null,
        archivedHint: false,
        customFields: [],
        attachments: [],
        provenance: { format: input.format },
        dedupeKey: null,
        status: 'unsupported_type',
        reason: `unsupported_type:${itemType}`,
        rowIndex,
        existingItemId: null,
      });
      continue;
    }

    const urls = Array.isArray(payload.urls)
      ? payload.urls.map((entry) => normalizeCell(String(entry))).filter((entry) => entry.length > 0)
      : [];
    const title = normalizeCell(String(payload.title ?? '')) || extractHostTitle(urls[0] ?? '');
    const folderId = parsed.uiState?.folderAssignments?.[item.itemId] ?? null;
    const folderHint = folderId ? foldersById.get(folderId) ?? null : null;
    const backupAttachments = input.attachmentsByItemId?.get(item.itemId) ?? [];

    candidates.push({
      sourceFormat: input.format,
      sourceRef,
      sourceItemId: item.itemId,
      itemType,
      title,
      notes: normalizeCell(String(payload.notes ?? '')),
      content: normalizeCell(String(payload.content ?? '')),
      username: normalizeCell(String(payload.username ?? '')),
      password: normalizeCell(String(payload.password ?? '')),
      totp: normalizeCell(String(payload.totp ?? '')),
      cardholderName: itemType === 'card' ? normalizeCell(String(payload.cardholderName ?? '')) : undefined,
      cardBrand: itemType === 'card' ? normalizeCell(String(payload.brand ?? '')) : undefined,
      cardNumber: itemType === 'card' ? normalizeCell(String(payload.number ?? '')) : undefined,
      cardExpiryMonth: itemType === 'card' ? normalizeCell(String(payload.expiryMonth ?? '')) : undefined,
      cardExpiryYear: itemType === 'card' ? normalizeCell(String(payload.expiryYear ?? '')) : undefined,
      cardSecurityCode: itemType === 'card' ? normalizeCell(String(payload.securityCode ?? '')) : undefined,
      urls,
      favoriteHint: favorites.has(item.itemId),
      folderHint,
      archivedHint: false,
      customFields: parseVaultLiteCustomFields(payload),
      attachments: backupAttachments.map((entry) => normalizeVaultLiteAttachmentEntry(entry)),
      provenance: { format: input.format },
      dedupeKey: null,
      status: title ? 'valid' : 'invalid',
      reason: title ? null : 'missing_title',
      rowIndex,
      existingItemId: null,
    });
  }

  return candidates;
}

async function parseVaultLiteEncryptedBackupImport(input: {
  parsedJson: Record<string, unknown>;
  passphrase: string | null;
}): Promise<{ exportPayload: unknown; attachmentsByItemId: Map<string, BackupAttachmentEntryV1[]> }> {
  if (!input.passphrase) {
    throw new Error('backup_passphrase_required');
  }
  const rawVersion = normalizeCell(String(input.parsedJson.version ?? ''));
  if (rawVersion && rawVersion !== 'vaultlite.backup.v1') {
    throw new Error('unsupported_backup_version');
  }
  const backupPackage = EncryptedBackupPackageV1Schema.parse(input.parsedJson);
  try {
    const decrypted = await decryptEncryptedBackupPackageV1({
      backupPackage,
      passphrase: input.passphrase,
    });
    const attachmentsByItemId = new Map<string, BackupAttachmentEntryV1[]>();
    for (const attachment of backupPackage.vault.attachments) {
      const bucket = attachmentsByItemId.get(attachment.itemId) ?? [];
      bucket.push(attachment);
      attachmentsByItemId.set(attachment.itemId, bucket);
    }
    return {
      exportPayload: decrypted,
      attachmentsByItemId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('backup_payload_integrity_mismatch')) {
      throw new Error('backup_payload_integrity_mismatch');
    }
    throw new Error('backup_decrypt_failed');
  }
}

export async function parseVaultImportFile(input: {
  file: File;
  sessionStore: SessionStore;
  vaultClient: VaultLiteVaultClient;
  backupPassphrase?: string;
}): Promise<VaultImportPreview> {
  ensureFileSize(input.file);
  const dataset = await loadDecryptedVaultDataset({
    sessionStore: input.sessionStore,
    vaultClient: input.vaultClient,
  });
  const lowerName = input.file.name.toLowerCase();

  if (lowerName.endsWith('.csv')) {
    const csvText = await input.file.text();
    const format = detectCsvFormat(parseCsvRows(csvText)[0] ?? []) as Extract<
      SupportedImportFormat,
      'vaultlite_login_csv_v1' | 'bitwarden_csv_v1'
    >;
    return finalizeCandidates(format, await parseCsvImport({ csvText, format }), dataset);
  }

  if (lowerName.endsWith('.json') || lowerName.endsWith('.vlbk')) {
    const jsonText = await input.file.text();
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const version = normalizeCell(String(parsed.version ?? ''));
    if (version === 'vaultlite.export.v1') {
      return finalizeCandidates(
        'vaultlite_json_export_v1',
        await parseVaultLiteExportImport({
          exportPayload: parsed,
          format: 'vaultlite_json_export_v1',
        }),
        dataset,
      );
    }
    if (version.startsWith('vaultlite.export.') && version !== 'vaultlite.export.v1') {
      throw new Error('unsupported_export_version');
    }
    if (version === 'vaultlite.backup.v1') {
      const backupImport = await parseVaultLiteEncryptedBackupImport({
        parsedJson: parsed,
        passphrase: normalizeCell(input.backupPassphrase),
      });
      return finalizeCandidates(
        'vaultlite_encrypted_backup_v1',
        await parseVaultLiteExportImport({
          exportPayload: backupImport.exportPayload,
          format: 'vaultlite_encrypted_backup_v1',
          attachmentsByItemId: backupImport.attachmentsByItemId,
        }),
        dataset,
      );
    }
    if (version.startsWith('vaultlite.backup.') && version !== 'vaultlite.backup.v1') {
      throw new Error('unsupported_backup_version');
    }
    if (!isBitwardenLikeJson(parsed)) throw new Error('unsupported_import_format');
    return finalizeCandidates('bitwarden_json_v1', await parseBitwardenJsonImport({
      jsonText,
      format: 'bitwarden_json_v1',
    }), dataset);
  }

  if (lowerName.endsWith('.zip') || lowerName.endsWith('.1pux')) {
    const entries = parseZipEntries(new Uint8Array(await input.file.arrayBuffer()));
    const is1Pux = Boolean(findZipEntry(entries, 'export.data')) && Boolean(findZipEntry(entries, 'export.attributes'));
    if (is1Pux || lowerName.endsWith('.1pux')) {
      return finalizeCandidates('onepassword_1pux_v1', await parse1Password1PuxImport({ zipEntries: entries }), dataset);
    }
    const jsonEntry =
      findZipEntryName(entries, 'export.json') ??
      Array.from(entries.keys()).find((key) => key.toLowerCase().endsWith('.json')) ??
      null;
    if (!jsonEntry) throw new Error('unsupported_import_format');
    const jsonBytes = entries.get(jsonEntry);
    if (!jsonBytes) throw new Error('unsupported_import_format');
    return finalizeCandidates('bitwarden_zip_v1', await parseBitwardenJsonImport({
      jsonText: textDecoder.decode(jsonBytes),
      format: 'bitwarden_zip_v1',
      zipEntries: entries,
    }), dataset);
  }

  throw new Error('unsupported_import_format');
}

function mapCandidatePayload(candidate: ParsedImportCandidate): Record<string, unknown> {
  const customFields = [...candidate.customFields];
  if (candidate.archivedHint && !customFields.some((entry) => normalizeForKey(entry.label) === 'imported archived')) {
    customFields.push({ label: 'Imported archived', value: 'true' });
  }
  if (candidate.itemType === 'login') {
    return {
      title: candidate.title,
      username: candidate.username,
      password: candidate.password,
      urls: candidate.urls,
      notes: candidate.notes,
      customFields,
    };
  }
  if (candidate.itemType === 'card') {
    return {
      title: candidate.title,
      cardholderName: candidate.cardholderName ?? '',
      brand: candidate.cardBrand ?? '',
      number: candidate.cardNumber ?? '',
      expiryMonth: candidate.cardExpiryMonth ?? '',
      expiryYear: candidate.cardExpiryYear ?? '',
      securityCode: candidate.cardSecurityCode ?? '',
      notes: candidate.notes,
      customFields,
    };
  }
  return {
    title: candidate.title,
    content: candidate.itemType === 'secure_note' ? candidate.content : candidate.content,
    customFields,
  };
}

async function uploadAttachmentsForCandidate(input: {
  candidate: ParsedImportCandidate;
  itemId: string;
  accountKey: string;
  vaultClient: VaultLiteVaultClient;
  scope: string;
}): Promise<{ created: number; failed: number }> {
  if (input.candidate.attachments.length === 0) return { created: 0, failed: 0 };

  let created = 0;
  let failed = 0;
  let cursor = 0;
  const attachments = input.candidate.attachments;

  async function worker() {
    while (cursor < attachments.length) {
      const index = cursor;
      cursor += 1;
      const attachment = attachments[index];
      if (!attachment || !attachment.attachmentFingerprint || attachment.errorCode) {
        failed += 1;
        continue;
      }
      if (attachment.size > LIMITS.maxAttachmentSize) {
        failed += 1;
        continue;
      }
      if (!attachment.bytes && !attachment.encryptedEnvelope) {
        failed += 1;
        continue;
      }

      const historyId = historyRecordId({
        scope: input.scope,
        sourceFormat: input.candidate.sourceFormat,
        sourceRef: input.candidate.sourceRef,
        sourceItemId: input.candidate.sourceItemId,
        dedupeKey: input.candidate.dedupeKey,
        attachmentFingerprint: attachment.attachmentFingerprint,
      });

      try {
        await withAttachmentRetry(async () => {
          const init = await input.vaultClient.initAttachmentUpload({
            itemId: input.itemId,
            fileName: sanitizeFileName(attachment.fileName, `${input.itemId}.bin`),
            contentType: attachment.contentType || inferContentTypeFromFileName(attachment.fileName),
            size: attachment.size,
            idempotencyKey: `import-attachment:${input.candidate.sourceRef}:${attachment.attachmentFingerprint}`,
          });
          const encryptedEnvelope = attachment.encryptedEnvelope
            ? attachment.encryptedEnvelope
            : await encryptAttachmentBlobPayload({
                accountKey: input.accountKey,
                plaintext: attachment.bytes!.buffer.slice(
                  attachment.bytes!.byteOffset,
                  attachment.bytes!.byteOffset + attachment.bytes!.byteLength,
                ) as ArrayBuffer,
                contentType: attachment.contentType || inferContentTypeFromFileName(attachment.fileName),
              });
          await withAttachmentRetry(async () =>
            input.vaultClient.uploadAttachmentContent(init.uploadId, {
              uploadToken: init.uploadToken,
              encryptedEnvelope,
            }),
          );
          await withAttachmentRetry(async () => input.vaultClient.finalizeAttachmentUpload(init.uploadId, input.itemId));
        });
        created += 1;
        await saveHistory({
          id: historyId,
          scope: input.scope,
          sourceFormat: input.candidate.sourceFormat,
          sourceRef: input.candidate.sourceRef,
          sourceItemId: input.candidate.sourceItemId,
          dedupeKey: input.candidate.dedupeKey,
          attachmentFingerprint: attachment.attachmentFingerprint,
          status: 'attached',
          createdItemId: input.itemId,
          errorCode: null,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        failed += 1;
        await saveHistory({
          id: historyId,
          scope: input.scope,
          sourceFormat: input.candidate.sourceFormat,
          sourceRef: input.candidate.sourceRef,
          sourceItemId: input.candidate.sourceItemId,
          dedupeKey: input.candidate.dedupeKey,
          attachmentFingerprint: attachment.attachmentFingerprint,
          status: 'failed',
          createdItemId: input.itemId,
          errorCode: error instanceof Error ? error.message : 'failed_attachment_upload',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(ATTACHMENTS_PER_ITEM_CONCURRENCY, attachments.length)) }, () => worker()),
  );
  return { created, failed };
}

export async function executeVaultImport(input: {
  preview: VaultImportPreview;
  sessionStore: SessionStore;
  vaultClient: VaultLiteVaultClient;
  onProgress?: (progress: {
    processed: number;
    total: number;
    created: number;
    skipped: number;
    failed: number;
    attachmentsCreated: number;
    attachmentsFailed: number;
  }) => void;
}): Promise<VaultImportExecutionResult> {
  const runtimeMetadata = await input.sessionStore.getRuntimeMetadata();
  const unlocked = input.sessionStore.getUnlockedVaultContext();
  const scope = getImportScope(runtimeMetadata.deploymentFingerprint, unlocked.username);
  const history = await loadHistory(scope);

  const validRows = input.preview.candidates.filter((candidate) => candidate.status === 'valid');
  const skippedRows = input.preview.candidates.filter((candidate) => candidate.status !== 'valid');
  const records: VaultImportExecutionRow[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let attachmentsCreated = 0;
  let attachmentsFailed = 0;
  let processed = 0;
  const total = validRows.length;
  const createdUiStateRows: Array<{ itemId: string; favorite: boolean; folder: string | null }> = [];
  const createdIconDomainEntries: Array<{ itemId: string; itemRevision: number; hosts: string[] }> = [];
  let cursor = 0;

  async function worker() {
    while (cursor < validRows.length) {
      const index = cursor;
      cursor += 1;
      const candidate = validRows[index];
      if (!candidate) continue;
      try {
        const encryptedPayload = await encryptVaultItemPayload({
          accountKey: unlocked.accountKey,
          itemType: candidate.itemType,
          payload: mapCandidatePayload(candidate),
        });
        const createdItem = await input.vaultClient.createItem({
          itemType: candidate.itemType,
          encryptedPayload,
        });
        const attachmentStats = await uploadAttachmentsForCandidate({
          candidate,
          itemId: createdItem.itemId,
          accountKey: unlocked.accountKey,
          vaultClient: input.vaultClient,
          scope,
        });
        attachmentsCreated += attachmentStats.created;
        attachmentsFailed += attachmentStats.failed;
        created += 1;
        createdUiStateRows.push({
          itemId: createdItem.itemId,
          favorite: candidate.favoriteHint,
          folder: candidate.folderHint,
        });
        if (candidate.itemType === 'login') {
          const hosts = collectIconSyncHostsFromUrls(candidate.urls);
          if (hosts.length > 0) {
            createdIconDomainEntries.push({
              itemId: createdItem.itemId,
              itemRevision: createdItem.revision,
              hosts,
            });
          }
        }
        records.push({
          rowIndex: candidate.rowIndex,
          sourceRef: candidate.sourceRef,
          status: 'created',
          itemId: createdItem.itemId,
          reason: null,
          attachmentsCreated: attachmentStats.created,
          attachmentsFailed: attachmentStats.failed,
        });
      } catch (error) {
        failed += 1;
        records.push({
          rowIndex: candidate.rowIndex,
          sourceRef: candidate.sourceRef,
          status: 'failed',
          itemId: null,
          reason: error instanceof Error ? error.message : String(error),
          attachmentsCreated: 0,
          attachmentsFailed: candidate.attachments.length,
        });
      } finally {
        processed += 1;
        input.onProgress?.({
          processed,
          total,
          created,
          skipped,
          failed,
          attachmentsCreated,
          attachmentsFailed,
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(IMPORT_CREATE_CONCURRENCY, validRows.length || 1)) }, () => worker()),
  );

  await syncImportedIconDomainsBatch({
    sessionStore: input.sessionStore,
    entries: createdIconDomainEntries,
  });

  for (const candidate of skippedRows) {
    if (candidate.status === 'possible_duplicate_requires_review') {
      skipped += 1;
      records.push({
        rowIndex: candidate.rowIndex,
        sourceRef: candidate.sourceRef,
        status: 'skipped_review_required',
        itemId: null,
        reason: candidate.reason ?? 'possible_duplicate_requires_review',
        attachmentsCreated: 0,
        attachmentsFailed: 0,
      });
      continue;
    }

    if (candidate.status === 'duplicate' && candidate.existingItemId && candidate.attachments.length > 0) {
      let retriedCreated = 0;
      let retriedFailed = 0;
      for (const attachment of candidate.attachments) {
        if (!attachment.attachmentFingerprint || (!attachment.bytes && !attachment.encryptedEnvelope)) continue;
        const key = historyRecordId({
          scope,
          sourceFormat: candidate.sourceFormat,
          sourceRef: candidate.sourceRef,
          sourceItemId: candidate.sourceItemId,
          dedupeKey: candidate.dedupeKey,
          attachmentFingerprint: attachment.attachmentFingerprint,
        });
        const previous = history.get(key);
        if (!previous || previous.status !== 'failed' || previous.createdItemId !== candidate.existingItemId) continue;
        const retried = await uploadAttachmentsForCandidate({
          candidate: { ...candidate, attachments: [attachment] },
          itemId: candidate.existingItemId,
          accountKey: unlocked.accountKey,
          vaultClient: input.vaultClient,
          scope,
        });
        retriedCreated += retried.created;
        retriedFailed += retried.failed;
      }
      if (retriedCreated > 0 || retriedFailed > 0) {
        attachmentsCreated += retriedCreated;
        attachmentsFailed += retriedFailed;
        skipped += 1;
        records.push({
          rowIndex: candidate.rowIndex,
          sourceRef: candidate.sourceRef,
          status: 'retry_missing_attachments_for_existing_item',
          itemId: candidate.existingItemId,
          reason: null,
          attachmentsCreated: retriedCreated,
          attachmentsFailed: retriedFailed,
        });
        continue;
      }
    }

    skipped += 1;
    records.push({
      rowIndex: candidate.rowIndex,
      sourceRef: candidate.sourceRef,
      status: 'skipped_duplicate',
      itemId: candidate.existingItemId,
      reason: candidate.reason ?? candidate.status,
      attachmentsCreated: 0,
      attachmentsFailed: 0,
    });
  }

  applyUiStateHints({
    username: unlocked.username,
    createdRows: createdUiStateRows,
  });

  const sorted = records.sort((left, right) => left.rowIndex - right.rowIndex);
  return {
    created,
    skipped,
    failed,
    attachmentsCreated,
    attachmentsFailed,
    records: sorted,
    report: {
      generatedAt: new Date().toISOString(),
      format: input.preview.format,
      totalRows: input.preview.totalRows,
      created,
      skipped,
      failed,
      attachmentsCreated,
      attachmentsFailed,
      rows: sorted,
    },
  };
}

export function estimateBackupPackageSize(input: { canonicalPayloadBytes: number }): number {
  const fixedPackageOverheadBytes = 8192;
  const base64urlLen = (value: number) => Math.ceil((value * 4) / 3);
  return (
    fixedPackageOverheadBytes +
    base64urlLen(input.canonicalPayloadBytes) +
    base64urlLen(16) +
    base64urlLen(32)
  );
}
