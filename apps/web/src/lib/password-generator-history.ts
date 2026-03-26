function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTimestamp(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Date.now();
  }
  return Math.floor(numeric);
}

export interface PasswordGeneratorHistoryEntry {
  id: string;
  createdAt: number;
  password: string;
  pageUrl: string;
  pageHost: string;
}

export interface PasswordGeneratorHistoryGroup {
  dayKey: string;
  entries: PasswordGeneratorHistoryEntry[];
}

export function addGeneratorHistoryEntry(
  entries: PasswordGeneratorHistoryEntry[],
  nextEntry: Partial<PasswordGeneratorHistoryEntry>,
  maxEntries = 60,
): PasswordGeneratorHistoryEntry[] {
  const normalizedEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const cap = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : 60;
  const candidate: PasswordGeneratorHistoryEntry = {
    id:
      normalizeString(nextEntry?.id) ||
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`),
    createdAt: normalizeTimestamp(nextEntry?.createdAt),
    password: normalizeString(nextEntry?.password),
    pageUrl: normalizeString(nextEntry?.pageUrl),
    pageHost: normalizeString(nextEntry?.pageHost),
  };

  const merged = [candidate, ...normalizedEntries].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return right.createdAt - left.createdAt;
    }
    return String(right.id).localeCompare(String(left.id));
  });

  return merged.slice(0, cap);
}

export function filterGeneratorHistoryEntries(
  entries: PasswordGeneratorHistoryEntry[],
  query: string,
): PasswordGeneratorHistoryEntry[] {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const normalizedQuery = normalizeString(query).toLowerCase();
  if (!normalizedQuery) {
    return normalizedEntries;
  }
  return normalizedEntries.filter((entry) => {
    const haystack = `${normalizeString(entry.pageHost)} ${normalizeString(entry.pageUrl)}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

function buildLocalDayKey(timestampMs: number): string {
  const date = new Date(normalizeTimestamp(timestampMs));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function groupGeneratorHistoryByDay(entries: PasswordGeneratorHistoryEntry[]): PasswordGeneratorHistoryGroup[] {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const groups: PasswordGeneratorHistoryGroup[] = [];
  const byDay = new Map<string, PasswordGeneratorHistoryGroup>();
  for (const entry of normalizedEntries) {
    const dayKey = buildLocalDayKey(entry.createdAt);
    if (!byDay.has(dayKey)) {
      const created: PasswordGeneratorHistoryGroup = { dayKey, entries: [] };
      byDay.set(dayKey, created);
      groups.push(created);
    }
    byDay.get(dayKey)?.entries.push(entry);
  }
  return groups;
}
