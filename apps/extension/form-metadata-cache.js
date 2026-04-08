export const FORM_METADATA_MAX_RECORDS_PER_ORIGIN = 50;
export const FORM_METADATA_MAX_ORIGINS = 200;

const CONFIRMED_CONFIDENCE = new Set(['submitted_confirmed', 'user_corrected']);

function cloneRecord(record) {
  return {
    ...record,
    selectorFallbacks: Array.isArray(record?.selectorFallbacks) ? [...record.selectorFallbacks] : [],
  };
}

export function canonicalizeFormMetadataOrigin(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'https:' && protocol !== 'http:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function buildFormMetadataCacheIdentity(input = {}) {
  const deploymentFingerprint =
    typeof input?.deploymentFingerprint === 'string' ? input.deploymentFingerprint.trim() : '';
  const userId = typeof input?.userId === 'string' ? input.userId.trim() : '';
  const username = typeof input?.username === 'string' ? input.username.trim() : '';
  const deviceId = typeof input?.deviceId === 'string' ? input.deviceId.trim() : '';
  if (!deploymentFingerprint && !userId && !username && !deviceId) {
    return null;
  }
  return `${deploymentFingerprint}::${userId}::${username}::${deviceId}`;
}

export function createEmptyFormMetadataCache() {
  return {
    identityKey: null,
    origins: {},
  };
}

function recordsEquivalent(left, right) {
  return (
    left.origin === right.origin &&
    left.itemId === right.itemId &&
    left.formFingerprint === right.formFingerprint &&
    left.fieldFingerprint === right.fieldFingerprint &&
    left.frameScope === right.frameScope &&
    left.fieldRole === right.fieldRole &&
    left.selectorCss === right.selectorCss &&
    JSON.stringify(left.selectorFallbacks) === JSON.stringify(right.selectorFallbacks) &&
    left.autocompleteToken === right.autocompleteToken &&
    left.inputType === right.inputType &&
    left.fieldName === right.fieldName &&
    left.fieldId === right.fieldId &&
    left.labelTextNormalized === right.labelTextNormalized &&
    left.placeholderNormalized === right.placeholderNormalized &&
    left.confidence === right.confidence &&
    left.selectorStatus === right.selectorStatus
  );
}

function normalizeRecord(record) {
  const canonicalOrigin = canonicalizeFormMetadataOrigin(record?.origin);
  if (!canonicalOrigin) {
    return null;
  }
  if (
    typeof record?.metadataId !== 'string' ||
    typeof record?.formFingerprint !== 'string' ||
    typeof record?.fieldFingerprint !== 'string' ||
    typeof record?.fieldRole !== 'string' ||
    typeof record?.selectorCss !== 'string' ||
    typeof record?.frameScope !== 'string' ||
    typeof record?.confidence !== 'string' ||
    typeof record?.selectorStatus !== 'string' ||
    record.metadataId.length === 0 ||
    record.formFingerprint.length === 0 ||
    record.fieldFingerprint.length === 0 ||
    record.fieldRole.length === 0 ||
    record.selectorCss.length === 0 ||
    record.frameScope.length === 0 ||
    record.confidence.length === 0 ||
    record.selectorStatus.length === 0
  ) {
    return null;
  }
  return {
    metadataId: record.metadataId,
    ownerUserId: typeof record?.ownerUserId === 'string' && record.ownerUserId.length > 0 ? record.ownerUserId : null,
    itemId: typeof record?.itemId === 'string' && record.itemId.length > 0 ? record.itemId : null,
    origin: canonicalOrigin,
    formFingerprint: record.formFingerprint,
    fieldFingerprint: record.fieldFingerprint,
    frameScope: record.frameScope,
    fieldRole: record.fieldRole,
    selectorCss: record.selectorCss,
    selectorFallbacks: Array.isArray(record?.selectorFallbacks)
      ? record.selectorFallbacks.filter((entry) => typeof entry === 'string' && entry.length > 0).slice(0, 5)
      : [],
    autocompleteToken:
      typeof record?.autocompleteToken === 'string' && record.autocompleteToken.length > 0
        ? record.autocompleteToken
        : null,
    inputType: typeof record?.inputType === 'string' && record.inputType.length > 0 ? record.inputType : null,
    fieldName: typeof record?.fieldName === 'string' && record.fieldName.length > 0 ? record.fieldName : null,
    fieldId: typeof record?.fieldId === 'string' && record.fieldId.length > 0 ? record.fieldId : null,
    labelTextNormalized:
      typeof record?.labelTextNormalized === 'string' && record.labelTextNormalized.length > 0
        ? record.labelTextNormalized
        : null,
    placeholderNormalized:
      typeof record?.placeholderNormalized === 'string' && record.placeholderNormalized.length > 0
        ? record.placeholderNormalized
        : null,
    confidence: record.confidence,
    selectorStatus: record.selectorStatus,
    sourceDeviceId:
      typeof record?.sourceDeviceId === 'string' && record.sourceDeviceId.length > 0 ? record.sourceDeviceId : null,
    createdAt: typeof record?.createdAt === 'string' ? record.createdAt : '',
    updatedAt: typeof record?.updatedAt === 'string' ? record.updatedAt : '',
    lastConfirmedAt:
      typeof record?.lastConfirmedAt === 'string' && record.lastConfirmedAt.length > 0
        ? record.lastConfirmedAt
        : null,
  };
}

export function normalizeFormMetadataCache(raw) {
  const empty = createEmptyFormMetadataCache();
  if (!raw || typeof raw !== 'object') {
    return empty;
  }
  const normalized = {
    identityKey: typeof raw.identityKey === 'string' && raw.identityKey.length > 0 ? raw.identityKey : null,
    origins: {},
  };
  const rawOrigins = raw.origins && typeof raw.origins === 'object' ? raw.origins : {};
  for (const [origin, entry] of Object.entries(rawOrigins)) {
    const canonicalOrigin = canonicalizeFormMetadataOrigin(origin);
    if (!canonicalOrigin || !entry || typeof entry !== 'object') {
      continue;
    }
    const records = Array.isArray(entry.records) ? entry.records.map(normalizeRecord).filter(Boolean) : [];
    normalized.origins[canonicalOrigin] = {
      syncedAt: Number.isFinite(Number(entry.syncedAt)) ? Math.max(0, Math.trunc(Number(entry.syncedAt))) : 0,
      records: sortAndPruneOriginRecords(records),
    };
  }
  return pruneOriginEntries(normalized);
}

function structuralKey(record) {
  return [
    record.origin,
    record.formFingerprint,
    record.fieldFingerprint,
    record.fieldRole,
    record.itemId ?? '',
  ].join('::');
}

function sortAndPruneOriginRecords(records) {
  return [...records]
    .sort((left, right) => {
      const statusRank = selectorStatusRank(right.selectorStatus) - selectorStatusRank(left.selectorStatus);
      if (statusRank !== 0) {
        return statusRank;
      }
      const confidenceRank = confidenceScore(right.confidence) - confidenceScore(left.confidence);
      if (confidenceRank !== 0) {
        return confidenceRank;
      }
      const confirmedDelta = String(right.lastConfirmedAt ?? '').localeCompare(String(left.lastConfirmedAt ?? ''));
      if (confirmedDelta !== 0) {
        return confirmedDelta;
      }
      const updatedDelta = String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''));
      if (updatedDelta !== 0) {
        return updatedDelta;
      }
      return String(right.metadataId).localeCompare(String(left.metadataId));
    })
    .slice(0, FORM_METADATA_MAX_RECORDS_PER_ORIGIN)
    .map(cloneRecord);
}

function pruneOriginEntries(cache) {
  const entries = Object.entries(cache.origins)
    .map(([origin, entry]) => ({
      origin,
      syncedAt: Number.isFinite(Number(entry?.syncedAt)) ? Math.max(0, Math.trunc(Number(entry.syncedAt))) : 0,
      records: Array.isArray(entry?.records) ? entry.records : [],
    }))
    .sort((left, right) => right.syncedAt - left.syncedAt);
  cache.origins = Object.fromEntries(
    entries.slice(0, FORM_METADATA_MAX_ORIGINS).map((entry) => [
      entry.origin,
      {
        syncedAt: entry.syncedAt,
        records: sortAndPruneOriginRecords(entry.records),
      },
    ]),
  );
  return cache;
}

function confidenceScore(confidence) {
  switch (confidence) {
    case 'user_corrected':
      return 3;
    case 'submitted_confirmed':
      return 2;
    case 'filled':
      return 1;
    default:
      return 0;
  }
}

function selectorStatusRank(status) {
  switch (status) {
    case 'active':
      return 2;
    case 'suspect':
      return 1;
    default:
      return 0;
  }
}

function queryRank(record, currentUserId) {
  if (record.selectorStatus === 'retired') {
    return -1;
  }
  if (record.selectorStatus === 'suspect') {
    return 0;
  }
  const isCurrentUser = record.ownerUserId === currentUserId;
  if (CONFIRMED_CONFIDENCE.has(record.confidence)) {
    return isCurrentUser ? 500 : 400;
  }
  if (record.confidence === 'filled') {
    return isCurrentUser ? 300 : 200;
  }
  return 100;
}

export function getCachedFormMetadataRecords(cacheInput, input = {}) {
  const cache = normalizeFormMetadataCache(cacheInput);
  const requestedOrigins = Array.from(
    new Set(
      (Array.isArray(input.origins) ? input.origins : [])
        .map((origin) => canonicalizeFormMetadataOrigin(origin))
        .filter((origin) => typeof origin === 'string' && origin.length > 0),
    ),
  );
  const currentUserId = typeof input.currentUserId === 'string' ? input.currentUserId : null;
  const itemId = typeof input.itemId === 'string' && input.itemId.length > 0 ? input.itemId : null;
  const records = [];
  for (const origin of requestedOrigins) {
    const originEntry = cache.origins[origin];
    if (!originEntry) {
      continue;
    }
    for (const record of originEntry.records) {
      if (record.selectorStatus === 'retired') {
        continue;
      }
      if (itemId && record.itemId !== null && record.itemId !== itemId) {
        continue;
      }
      records.push(cloneRecord(record));
    }
  }
  return records.sort((left, right) => {
    const scoreDelta = queryRank(right, currentUserId) - queryRank(left, currentUserId);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const confirmedDelta = String(right.lastConfirmedAt ?? '').localeCompare(String(left.lastConfirmedAt ?? ''));
    if (confirmedDelta !== 0) {
      return confirmedDelta;
    }
    const updatedDelta = String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''));
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return String(left.metadataId).localeCompare(String(right.metadataId));
  });
}

export function getStaleFormMetadataOrigins(cacheInput, input = {}) {
  const cache = normalizeFormMetadataCache(cacheInput);
  const now = Number.isFinite(Number(input.now)) ? Math.max(0, Math.trunc(Number(input.now))) : Date.now();
  const maxAgeMs = Number.isFinite(Number(input.maxAgeMs)) ? Math.max(0, Math.trunc(Number(input.maxAgeMs))) : 0;
  return Array.from(
    new Set(
      (Array.isArray(input.origins) ? input.origins : [])
        .map((origin) => canonicalizeFormMetadataOrigin(origin))
        .filter((origin) => typeof origin === 'string' && origin.length > 0),
    ),
  ).filter((origin) => {
    const entry = cache.origins[origin];
    if (!entry) {
      return true;
    }
    return now - entry.syncedAt >= maxAgeMs;
  });
}

export function applyQueriedFormMetadataRecords(cacheInput, input = {}) {
  const cache = normalizeFormMetadataCache(cacheInput);
  const next = {
    identityKey: input.identityKey ?? cache.identityKey ?? null,
    origins: { ...cache.origins },
  };
  const requestedOrigins = Array.from(
    new Set(
      (Array.isArray(input.origins) ? input.origins : [])
        .map((origin) => canonicalizeFormMetadataOrigin(origin))
        .filter((origin) => typeof origin === 'string' && origin.length > 0),
    ),
  );
  const grouped = new Map();
  for (const record of Array.isArray(input.records) ? input.records : []) {
    const normalized = normalizeRecord(record);
    if (!normalized || !requestedOrigins.includes(normalized.origin)) {
      continue;
    }
    const records = grouped.get(normalized.origin) ?? [];
    records.push(normalized);
    grouped.set(normalized.origin, records);
  }
  const syncedAt = Number.isFinite(Number(input.syncedAt)) ? Math.max(0, Math.trunc(Number(input.syncedAt))) : Date.now();
  for (const origin of requestedOrigins) {
    next.origins[origin] = {
      syncedAt,
      records: sortAndPruneOriginRecords(grouped.get(origin) ?? []),
    };
  }
  return pruneOriginEntries(next);
}

export function upsertFormMetadataRecordInCache(cacheInput, record, input = {}) {
  const cache = normalizeFormMetadataCache(cacheInput);
  const normalized = normalizeRecord(record);
  if (!normalized) {
    return cache;
  }
  const next = {
    identityKey: input.identityKey ?? cache.identityKey ?? null,
    origins: { ...cache.origins },
  };
  const existingOrigin = next.origins[normalized.origin] ?? { syncedAt: 0, records: [] };
  const filtered = existingOrigin.records.filter((candidate) => structuralKey(candidate) !== structuralKey(normalized));
  filtered.push(normalized);
  next.origins[normalized.origin] = {
    syncedAt: Number.isFinite(Number(input.syncedAt))
      ? Math.max(0, Math.trunc(Number(input.syncedAt)))
      : Math.max(0, existingOrigin.syncedAt),
    records: sortAndPruneOriginRecords(filtered),
  };
  return pruneOriginEntries(next);
}

export function findCachedFormMetadataRecord(cacheInput, input = {}) {
  const cache = normalizeFormMetadataCache(cacheInput);
  const canonicalOrigin = canonicalizeFormMetadataOrigin(input.origin);
  if (!canonicalOrigin) {
    return null;
  }
  const normalizedItemId =
    typeof input.itemId === 'string' && input.itemId.trim().length > 0 ? input.itemId.trim() : null;
  const originEntry = cache.origins[canonicalOrigin];
  if (!originEntry) {
    return null;
  }
  const match = originEntry.records.find(
    (record) =>
      record.formFingerprint === input.formFingerprint &&
      record.fieldFingerprint === input.fieldFingerprint &&
      record.fieldRole === input.fieldRole &&
      record.itemId === normalizedItemId,
  );
  return match ? cloneRecord(match) : null;
}

export function shouldUpsertFormMetadataRecord(cacheInput, recordInput) {
  const candidate = normalizeRecord(recordInput);
  if (!candidate) {
    return false;
  }
  const existing = findCachedFormMetadataRecord(cacheInput, candidate);
  if (!existing) {
    return true;
  }
  const existingConfidence = confidenceScore(existing.confidence);
  const candidateConfidence = confidenceScore(candidate.confidence);
  if (candidate.selectorStatus !== existing.selectorStatus) {
    return true;
  }
  if (candidateConfidence < existingConfidence) {
    return false;
  }
  if (candidateConfidence === existingConfidence && recordsEquivalent(existing, candidate)) {
    return false;
  }
  return true;
}

export function markCachedFormMetadataRecordSuspect(cacheInput, input = {}) {
  const cache = normalizeFormMetadataCache(cacheInput);
  const canonicalOrigin = canonicalizeFormMetadataOrigin(input.origin);
  if (!canonicalOrigin) {
    return { found: false, cache };
  }
  const originEntry = cache.origins[canonicalOrigin];
  if (!originEntry) {
    return { found: false, cache };
  }
  const normalizedItemId =
    typeof input.itemId === 'string' && input.itemId.trim().length > 0 ? input.itemId.trim() : null;
  const target = originEntry.records.find(
    (record) =>
      record.formFingerprint === input.formFingerprint &&
      record.fieldFingerprint === input.fieldFingerprint &&
      record.fieldRole === input.fieldRole &&
      record.itemId === normalizedItemId,
  );
  if (!target) {
    return { found: false, cache };
  }
  const nextRecord = {
    ...target,
    selectorStatus: 'suspect',
    updatedAt: typeof input.updatedAt === 'string' && input.updatedAt.length > 0 ? input.updatedAt : target.updatedAt,
    sourceDeviceId:
      typeof input.sourceDeviceId === 'string' && input.sourceDeviceId.length > 0
        ? input.sourceDeviceId
        : target.sourceDeviceId,
  };
  return {
    found: true,
    record: nextRecord,
    cache: upsertFormMetadataRecordInCache(cache, nextRecord, {
      identityKey: input.identityKey ?? cache.identityKey ?? null,
      syncedAt: Number.isFinite(Number(input.syncedAt)) ? input.syncedAt : originEntry.syncedAt,
    }),
  };
}
