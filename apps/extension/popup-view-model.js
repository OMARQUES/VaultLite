export function selectItemIdAfterRefresh(previousItemId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  if (previousItemId && items.some((item) => item?.itemId === previousItemId)) {
    return previousItemId;
  }

  if (previousItemId) {
    return typeof items[0]?.itemId === 'string' ? items[0].itemId : null;
  }

  return null;
}

export function buildCredentialMonogram(title) {
  const safe = String(title ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!safe) {
    return 'VL';
  }
  const parts = safe.split(' ');
  if (parts.length === 1) {
    const token = parts[0] ?? '';
    return token.slice(0, 2).toUpperCase();
  }
  return `${(parts[0] ?? '').slice(0, 1)}${(parts[1] ?? '').slice(0, 1)}`.toUpperCase();
}

export function shouldUseExpandedLayout(selectedItemId) {
  return typeof selectedItemId === 'string' && selectedItemId.length > 0;
}

export function resolvePopupPhase(state) {
  const knownPhase = state?.phase;
  if (
    knownPhase === 'pairing_required' ||
    knownPhase === 'remote_authentication_required' ||
    knownPhase === 'local_unlock_required' ||
    knownPhase === 'ready'
  ) {
    return knownPhase;
  }
  if (state?.hasTrustedState) {
    return 'local_unlock_required';
  }
  return 'pairing_required';
}

function normalizeUrlForFavicon(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return null;
  }

  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

export function buildFaviconCandidates(rawUrl) {
  const hostname = normalizeUrlForFavicon(rawUrl);
  if (!hostname) {
    return [];
  }
  return [
    `https://${hostname}/favicon.ico`,
    `https://${hostname}/apple-touch-icon.png`,
  ];
}

export function toNavigableUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return null;
  }
  try {
    const trimmed = rawUrl.trim();
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parsePersistedPopupUiState(rawState) {
  const source =
    rawState && typeof rawState === 'object' && !Array.isArray(rawState) ? rawState : {};
  const selectedItemIdRaw = source.selectedItemId;
  const searchQueryRaw = source.searchQuery;
  const typeFilterRaw = source.typeFilter;
  const suggestedOnlyRaw = source.suggestedOnly;
  const validTypeFilter =
    typeFilterRaw === 'login' || typeFilterRaw === 'card' || typeFilterRaw === 'document' || typeFilterRaw === 'secure_note'
      ? typeFilterRaw
      : 'all';

  return {
    selectedItemId:
      typeof selectedItemIdRaw === 'string' && selectedItemIdRaw.trim().length > 0
        ? selectedItemIdRaw
        : null,
    searchQuery: typeof searchQueryRaw === 'string' ? searchQueryRaw.slice(0, 256) : '',
    typeFilter: validTypeFilter,
    suggestedOnly: suggestedOnlyRaw === true,
  };
}

export function buildPersistedPopupUiState(input) {
  return parsePersistedPopupUiState(input);
}
