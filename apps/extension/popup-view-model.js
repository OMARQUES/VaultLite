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

export function hasSameItemOrder(previousItems, nextItems) {
  if (!Array.isArray(previousItems) || !Array.isArray(nextItems)) {
    return false;
  }
  if (previousItems.length !== nextItems.length) {
    return false;
  }
  for (let index = 0; index < previousItems.length; index += 1) {
    if (previousItems[index]?.itemId !== nextItems[index]?.itemId) {
      return false;
    }
  }
  return previousItems.length > 0;
}

function normalizeRenderText(value) {
  return typeof value === 'string' ? value : '';
}

function quickActionSignature(item, input) {
  const quickAction = resolveRowQuickAction({
    item,
    pageEligible: input?.pageEligible === true,
    fillDisabledReason:
      typeof input?.fillDisabledReason === 'string' && input.fillDisabledReason.trim().length > 0
        ? input.fillDisabledReason.trim()
        : null,
  });
  if (!quickAction) {
    return 'none';
  }
  return `${quickAction.type}:${quickAction.disabled ? 'disabled' : 'enabled'}:${quickAction.tooltip}`;
}

export function hasSameRenderableRows(previousItems, nextItems, input) {
  if (!Array.isArray(previousItems) || !Array.isArray(nextItems)) {
    return false;
  }
  if (previousItems.length !== nextItems.length) {
    return false;
  }
  for (let index = 0; index < previousItems.length; index += 1) {
    const previous = previousItems[index] ?? null;
    const next = nextItems[index] ?? null;
    if (!previous || !next) {
      return false;
    }
    if (previous.itemId !== next.itemId) {
      return false;
    }
    if (normalizeRenderText(previous.itemType) !== normalizeRenderText(next.itemType)) {
      return false;
    }
    if (normalizeRenderText(previous.title) !== normalizeRenderText(next.title)) {
      return false;
    }
    if (normalizeRenderText(previous.subtitle) !== normalizeRenderText(next.subtitle)) {
      return false;
    }
    if (normalizeRenderText(previous.urlHostSummary) !== normalizeRenderText(next.urlHostSummary)) {
      return false;
    }
    if (normalizeRenderText(previous.firstUrl) !== normalizeRenderText(next.firstUrl)) {
      return false;
    }
    if (quickActionSignature(previous, input) !== quickActionSignature(next, input)) {
      return false;
    }
  }
  return previousItems.length > 0;
}

export function shouldUseExpandedLayout(selectedItemId) {
  return typeof selectedItemId === 'string' && selectedItemId.length > 0;
}

export function toggleSelectedItem(previousItemId, nextItemId) {
  if (typeof nextItemId !== 'string' || nextItemId.length === 0) {
    return previousItemId ?? null;
  }
  return previousItemId === nextItemId ? null : nextItemId;
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

function isSuggestedLoginForCurrentPage(item) {
  if (!item || item.itemType !== 'login') {
    return false;
  }
  const matchFlags =
    item.matchFlags && typeof item.matchFlags === 'object' && !Array.isArray(item.matchFlags)
      ? item.matchFlags
      : {};
  if (matchFlags.exactOrigin === true) {
    return true;
  }
  if (typeof matchFlags.domainScore === 'number' && Number.isFinite(matchFlags.domainScore)) {
    return matchFlags.domainScore > 0;
  }
  return false;
}

export function resolveRowQuickAction(input) {
  const item = input?.item ?? null;
  const hasNavigableUrl = Boolean(toNavigableUrl(item?.firstUrl ?? ''));
  if (!hasNavigableUrl) {
    return null;
  }
  const isSuggestedLogin = isSuggestedLoginForCurrentPage(item);
  if (!isSuggestedLogin) {
    return {
      type: 'open-url',
      disabled: false,
      tooltip: 'Open site URL',
    };
  }
  const pageEligible = input?.pageEligible === true;
  const fillDisabledReason =
    typeof input?.fillDisabledReason === 'string' && input.fillDisabledReason.trim().length > 0
      ? input.fillDisabledReason.trim()
      : null;
  if (fillDisabledReason) {
    return {
      type: 'fill',
      disabled: true,
      tooltip: fillDisabledReason,
    };
  }
  if (!pageEligible) {
    return {
      type: 'fill',
      disabled: true,
      tooltip: 'Fill unavailable on this page.',
    };
  }
  return {
    type: 'fill',
    disabled: false,
    tooltip: 'Fill credentials on this page',
  };
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
