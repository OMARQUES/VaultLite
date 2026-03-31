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

export function shouldRenderVaultSkeleton(input) {
  const warmupState = typeof input?.warmupState === 'string' ? input.warmupState : '';
  const warmupRunning =
    warmupState === 'running' || warmupState === 'syncing' || warmupState === 'loading_local';
  const hasReadySnapshot = input?.hasReadySnapshot === true;
  const suppressSkeleton = input?.suppressSkeleton === true;
  const vaultLoading = input?.vaultLoading === true;

  if (suppressSkeleton) {
    return false;
  }
  if (vaultLoading) {
    return true;
  }
  if (!warmupRunning) {
    return false;
  }
  return !hasReadySnapshot;
}

export function shouldUseExpandedLayout(selectedItemId) {
  return typeof selectedItemId === 'string' && selectedItemId.length > 0;
}

const POPUP_DETAIL_DRAFT_TTL_MS = 15 * 60 * 1000;

function sanitizeCustomFields(rawFields) {
  if (!Array.isArray(rawFields)) {
    return [];
  }
  return rawFields
    .map((entry) => ({
      label: typeof entry?.label === 'string' ? entry.label.slice(0, 256) : '',
      value: typeof entry?.value === 'string' ? entry.value.slice(0, 8_000) : '',
    }))
    .filter((entry) => entry.label.length > 0 || entry.value.length > 0);
}

function sanitizeDraftByItemType(rawDraft) {
  if (!rawDraft || typeof rawDraft !== 'object' || Array.isArray(rawDraft)) {
    return null;
  }
  const itemType = rawDraft.itemType;
  if (itemType === 'login') {
    return {
      itemType: 'login',
      title: typeof rawDraft.title === 'string' ? rawDraft.title.slice(0, 512) : '',
      username: typeof rawDraft.username === 'string' ? rawDraft.username.slice(0, 1_024) : '',
      password: typeof rawDraft.password === 'string' ? rawDraft.password.slice(0, 4_096) : '',
      urls: Array.isArray(rawDraft.urls)
        ? rawDraft.urls.filter((value) => typeof value === 'string').slice(0, 20).map((value) => value.slice(0, 2_048))
        : [],
      notes: typeof rawDraft.notes === 'string' ? rawDraft.notes.slice(0, 16_000) : '',
      customFields: sanitizeCustomFields(rawDraft.customFields),
    };
  }
  if (itemType === 'card') {
    return {
      itemType: 'card',
      title: typeof rawDraft.title === 'string' ? rawDraft.title.slice(0, 512) : '',
      cardholderName: typeof rawDraft.cardholderName === 'string' ? rawDraft.cardholderName.slice(0, 1_024) : '',
      brand: typeof rawDraft.brand === 'string' ? rawDraft.brand.slice(0, 256) : '',
      number: typeof rawDraft.number === 'string' ? rawDraft.number.slice(0, 256) : '',
      expiryMonth: typeof rawDraft.expiryMonth === 'string' ? rawDraft.expiryMonth.slice(0, 32) : '',
      expiryYear: typeof rawDraft.expiryYear === 'string' ? rawDraft.expiryYear.slice(0, 32) : '',
      securityCode: typeof rawDraft.securityCode === 'string' ? rawDraft.securityCode.slice(0, 64) : '',
      notes: typeof rawDraft.notes === 'string' ? rawDraft.notes.slice(0, 16_000) : '',
      customFields: sanitizeCustomFields(rawDraft.customFields),
    };
  }
  if (itemType === 'document' || itemType === 'secure_note') {
    return {
      itemType,
      title: typeof rawDraft.title === 'string' ? rawDraft.title.slice(0, 512) : '',
      content: typeof rawDraft.content === 'string' ? rawDraft.content.slice(0, 32_000) : '',
      customFields: sanitizeCustomFields(rawDraft.customFields),
    };
  }
  return null;
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
    knownPhase === 'reconnecting_background' ||
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
  if (item?.isDeleted === true) {
    return null;
  }
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
  const sortModeRaw = source.sortMode;
  const validTypeFilter =
    typeFilterRaw === 'login' ||
    typeFilterRaw === 'card' ||
    typeFilterRaw === 'document' ||
    typeFilterRaw === 'secure_note' ||
    typeFilterRaw === 'trash'
      ? typeFilterRaw
      : 'all';
  const detailPanelModeRaw = source.detailPanelMode;
  const detailPanelMode = detailPanelModeRaw === 'create' || detailPanelModeRaw === 'edit' ? detailPanelModeRaw : 'view';
  const detailDraftUpdatedAt = Number(source.detailDraftUpdatedAt);
  const detailDraftFresh =
    Number.isFinite(detailDraftUpdatedAt) && Date.now() - detailDraftUpdatedAt <= POPUP_DETAIL_DRAFT_TTL_MS;
  const detailDraft = detailDraftFresh ? sanitizeDraftByItemType(source.detailDraft) : null;
  const detailTargetItemId =
    typeof source.detailTargetItemId === 'string' && source.detailTargetItemId.trim().length > 0
      ? source.detailTargetItemId
      : null;
  const detailFolderId =
    typeof source.detailFolderId === 'string' && source.detailFolderId.trim().length > 0 ? source.detailFolderId : '';
  const effectiveDetailPanelMode =
    detailDraft && (detailPanelMode === 'create' || (detailPanelMode === 'edit' && detailTargetItemId))
      ? detailPanelMode
      : 'view';

  return {
    selectedItemId:
      typeof selectedItemIdRaw === 'string' && selectedItemIdRaw.trim().length > 0
        ? selectedItemIdRaw
        : null,
    searchQuery: typeof searchQueryRaw === 'string' ? searchQueryRaw.slice(0, 256) : '',
    typeFilter: validTypeFilter,
    suggestedOnly: suggestedOnlyRaw === true,
    sortMode:
      sortModeRaw === 'title_asc' || sortModeRaw === 'title_desc'
        ? sortModeRaw
        : 'default',
    detailPanelMode: effectiveDetailPanelMode,
    detailTargetItemId: effectiveDetailPanelMode === 'edit' ? detailTargetItemId : null,
    detailFolderId: effectiveDetailPanelMode === 'view' ? '' : detailFolderId,
    detailDraft: effectiveDetailPanelMode === 'view' ? null : detailDraft,
  };
}

export function buildPersistedPopupUiState(input) {
  const now = Date.now();
  const parsed = parsePersistedPopupUiState({
    ...(input && typeof input === 'object' ? input : {}),
    detailDraftUpdatedAt: now,
  });
  if (parsed.detailDraft) {
    return {
      ...parsed,
      detailDraftUpdatedAt: now,
    };
  }
  return parsed;
}
