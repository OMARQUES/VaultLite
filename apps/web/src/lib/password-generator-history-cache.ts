import type { PasswordGeneratorHistoryEntry } from './password-generator-history';

const PASSWORD_GENERATOR_HISTORY_CACHE_SYNC_COOLDOWN_MS = 10 * 60 * 1000;
const PASSWORD_GENERATOR_HISTORY_CACHE_MAX_ENTRIES = 60;

let cachedEntries: PasswordGeneratorHistoryEntry[] = [];
let cacheLastSyncedAt = 0;
let syncInFlight: Promise<PasswordGeneratorHistoryEntry[] | null> | null = null;

function sortHistoryEntries(entries: PasswordGeneratorHistoryEntry[]): PasswordGeneratorHistoryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return right.createdAt - left.createdAt;
    }
    return String(right.id).localeCompare(String(left.id));
  });
}

export function getPasswordGeneratorHistoryCache(): PasswordGeneratorHistoryEntry[] {
  return [...cachedEntries];
}

export function setPasswordGeneratorHistoryCache(entries: PasswordGeneratorHistoryEntry[], syncedAt = Date.now()) {
  cachedEntries = sortHistoryEntries(Array.isArray(entries) ? entries : []).slice(0, PASSWORD_GENERATOR_HISTORY_CACHE_MAX_ENTRIES);
  if (Number.isFinite(syncedAt)) {
    cacheLastSyncedAt = Math.max(0, Math.trunc(syncedAt));
  } else {
    cacheLastSyncedAt = Date.now();
  }
}

export function markPasswordGeneratorHistoryCacheStale() {
  cacheLastSyncedAt = 0;
}

export function shouldSyncPasswordGeneratorHistoryCache(input: { force?: boolean; cooldownMs?: number } = {}): boolean {
  if (input.force === true) {
    return true;
  }
  const rawCooldownMs = typeof input.cooldownMs === 'number' ? input.cooldownMs : Number.NaN;
  const cooldownMs = Number.isFinite(rawCooldownMs)
    ? Math.max(5_000, Math.trunc(rawCooldownMs))
    : PASSWORD_GENERATOR_HISTORY_CACHE_SYNC_COOLDOWN_MS;
  return Date.now() - cacheLastSyncedAt >= cooldownMs;
}

export async function runPasswordGeneratorHistoryCacheSync(
  syncer: () => Promise<PasswordGeneratorHistoryEntry[] | null>,
  input: { force?: boolean; cooldownMs?: number; awaitCompletion?: boolean } = {},
): Promise<PasswordGeneratorHistoryEntry[] | null> {
  if (syncInFlight) {
    if (input.awaitCompletion === false) {
      return null;
    }
    return syncInFlight;
  }
  if (!shouldSyncPasswordGeneratorHistoryCache(input)) {
    return null;
  }
  syncInFlight = (async () => {
    const nextEntries = await syncer();
    if (Array.isArray(nextEntries)) {
      setPasswordGeneratorHistoryCache(nextEntries);
    }
    return nextEntries;
  })().finally(() => {
    syncInFlight = null;
  });
  if (input.awaitCompletion === false) {
    return null;
  }
  return syncInFlight;
}
