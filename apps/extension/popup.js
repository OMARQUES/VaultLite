import {
  byId,
  copyToClipboard,
  ensureServerOriginPermission,
  formatTime,
  hostFromUrl,
  sanitizeText,
  sendBackgroundCommand,
} from './runtime-ui.js';
import {
  buildPairingDescription,
  buildWebSettingsUrl,
  buildServerUrlSuggestion,
  buildWebVaultUrl,
} from './runtime-onboarding.js';
import { canonicalizeServerUrl, isPageUrlEligibleForFill } from './runtime-common.js';
import { describeFillResult, shouldDisableControlWhileBusy } from './popup-behavior.js';
import {
  buildPersistedPopupUiState,
  buildCredentialMonogram,
  hasSameItemOrder,
  hasSameRenderableRows,
  parsePersistedPopupUiState,
  resolveRowQuickAction,
  resolvePopupPhase,
  selectItemIdAfterRefresh,
  toggleSelectedItem,
  toNavigableUrl,
} from './popup-view-model.js';
import {
  resolveLayoutMode,
  shouldShowLockIcon,
  shouldUseExpandedPopup,
} from './popup-layout-state.js';
import { createFilterDropdown } from './popup-filter-dropdown.js';
import { buildDetailViewModel, pulseCopyIcon } from './popup-detail-actions.js';
import { createPopupAutosizer } from './popup-autosize.js';
import { importManualIconFromFile, sanitizeIconHost } from './manual-icons.js';

const elements = {
  siteContext: byId('siteContext'),
  statusAlert: byId('statusAlert'),
  pairingSection: byId('pairingSection'),
  pairingDescription: byId('pairingDescription'),
  unlockSection: byId('unlockSection'),
  unlockAccountValue: byId('unlockAccountValue'),
  unlockDeviceValue: byId('unlockDeviceValue'),
  readySection: byId('readySection'),
  serverUrlInput: byId('serverUrlInput'),
  deviceNameInput: byId('deviceNameInput'),
  unlockPasswordInput: byId('unlockPasswordInput'),
  linkPairBtn: byId('linkPairBtn'),
  unlockBtn: byId('unlockBtn'),
  linkRequestPanel: byId('linkRequestPanel'),
  linkRequestCode: byId('linkRequestCode'),
  linkRequestPhrase: byId('linkRequestPhrase'),
  linkRequestExpires: byId('linkRequestExpires'),
  linkRequestStatus: byId('linkRequestStatus'),
  pairingRecovery: byId('pairingRecovery'),
  openApprovalBtn: byId('openApprovalBtn'),
  cancelLinkPairBtn: byId('cancelLinkPairBtn'),
  newItemBtn: byId('newItemBtn'),
  searchInput: byId('searchInput'),
  searchClearBtn: byId('searchClearBtn'),
  headerReadySearch: byId('headerReadySearch'),
  filterDropdownButton: byId('filterDropdownButton'),
  filterDropdownLabel: byId('filterDropdownLabel'),
  filterDropdownIcon: byId('filterDropdownIcon'),
  filterDropdownMenu: byId('filterDropdownMenu'),
  credentialsList: byId('credentialsList'),
  credentialDetails: byId('credentialDetails'),
  credentialDetailsLoading: byId('credentialDetailsLoading'),
  credentialDetailsContent: byId('credentialDetailsContent'),
  detailMonogram: byId('detailMonogram'),
  detailIconShell: byId('detailIconShell'),
  detailFavicon: byId('detailFavicon'),
  detailIconEditBtn: byId('detailIconEditBtn'),
  detailIconFileInput: byId('detailIconFileInput'),
  detailType: byId('detailType'),
  detailTitle: byId('detailTitle'),
  detailPrimaryLabel: byId('detailPrimaryLabel'),
  detailPrimaryValue: byId('detailPrimaryValue'),
  detailSecondaryLabel: byId('detailSecondaryLabel'),
  detailSecondaryValue: byId('detailSecondaryValue'),
  detailTertiaryLabel: byId('detailTertiaryLabel'),
  detailTertiaryValue: byId('detailTertiaryValue'),
  detailActionPrimary: byId('detailActionPrimary'),
  detailActionMenu: byId('detailActionMenu'),
  detailMenuPopover: byId('detailMenuPopover'),
  detailActionIconWeb: byId('detailActionIconWeb'),
  detailPrimaryRow: byId('detailPrimaryRow'),
  detailPrimaryActionA: byId('detailPrimaryActionA'),
  detailPrimaryActionB: byId('detailPrimaryActionB'),
  detailSecondaryRow: byId('detailSecondaryRow'),
  detailSecondaryActionA: byId('detailSecondaryActionA'),
  detailSecondaryActionB: byId('detailSecondaryActionB'),
  detailTertiaryRow: byId('detailTertiaryRow'),
  detailTertiaryActionA: byId('detailTertiaryActionA'),
  detailTertiaryActionB: byId('detailTertiaryActionB'),
  lockBtn: byId('lockBtn'),
};

const detailRows = [
  {
    row: elements.detailPrimaryRow,
    label: elements.detailPrimaryLabel,
    value: elements.detailPrimaryValue,
    actionA: elements.detailPrimaryActionA,
    actionB: elements.detailPrimaryActionB,
  },
  {
    row: elements.detailSecondaryRow,
    label: elements.detailSecondaryLabel,
    value: elements.detailSecondaryValue,
    actionA: elements.detailSecondaryActionA,
    actionB: elements.detailSecondaryActionB,
  },
  {
    row: elements.detailTertiaryRow,
    label: elements.detailTertiaryLabel,
    value: elements.detailTertiaryValue,
    actionA: elements.detailTertiaryActionA,
    actionB: elements.detailTertiaryActionB,
  },
];

let currentState = null;
let currentItems = [];
let selectedItemId = null;
let activeTypeFilter = 'all';
let suggestedOnly = false;
const faviconIndexByItemId = new Map();
let inFlight = false;
let refreshTimer = null;
let searchDebounceTimer = null;
let linkPollingTimer = null;
let activeLinkRequest = null;
let popupUiStateHydrated = false;
let vaultLoading = false;
let detailLoading = false;
let listErrorMessage = '';
let currentLayoutMode = 'pairing';
let filterDropdown = null;
let showApprovalRecovery = false;
let pairingInProgress = false;
let activePageUrl = '';
let activePageEligible = false;
let fillBlockedState = null;
let popupAutosizer = null;
let pendingListScrollRestoreFramePrimary = null;
let pendingListScrollRestoreFrameSecondary = null;
const POPUP_UI_STATE_STORAGE_KEY = 'vaultlite.popup.ui.v1';
const FALLBACK_PAIRING_STATE = {
  phase: 'pairing_required',
  serverOrigin: null,
  deploymentFingerprint: null,
  username: null,
  deviceId: null,
  deviceName: null,
  sessionExpiresAt: null,
  hasTrustedState: false,
  hasTokenInMemory: false,
  lastError: null,
};

function shouldForceStateRefreshAfterError(code) {
  return (
    code === 'remote_authentication_required' ||
    code === 'local_unlock_required' ||
    code === 'pairing_required' ||
    code === 'trusted_state_reset_required'
  );
}

function clearLinkPollingTimer() {
  if (linkPollingTimer !== null) {
    window.clearTimeout(linkPollingTimer);
    linkPollingTimer = null;
  }
}

function clearLinkRequestState() {
  activeLinkRequest = null;
  showApprovalRecovery = false;
  clearLinkPollingTimer();
}

function normalizeIntervalSeconds(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return Math.max(1, input);
  }
  return 5;
}

function syncLinkRequestFromState(nextState) {
  const stateLinkRequest = nextState?.linkRequest;
  if (!stateLinkRequest || typeof stateLinkRequest.requestId !== 'string') {
    if (activeLinkRequest) {
      clearLinkRequestState();
    }
    return;
  }

  const requestChanged = !activeLinkRequest || activeLinkRequest.requestId !== stateLinkRequest.requestId;
  activeLinkRequest = stateLinkRequest;
  if (requestChanged || linkPollingTimer === null) {
    scheduleLinkPolling(normalizeIntervalSeconds(stateLinkRequest.interval) * 1000);
  }
}

function renderLinkRequestPanel() {
  if (!activeLinkRequest || elements.pairingSection.hidden) {
    elements.linkRequestPanel.hidden = true;
    elements.pairingRecovery.hidden = true;
    document.body.dataset.linkRequest = 'closed';
    popupAutosizer?.schedule();
    return;
  }
  document.body.dataset.linkRequest = 'open';
  elements.linkRequestPanel.hidden = false;
  elements.linkRequestCode.textContent = activeLinkRequest.shortCode ?? '—';
  elements.linkRequestPhrase.textContent = activeLinkRequest.fingerprintPhrase ?? '—';
  elements.linkRequestExpires.textContent = formatTime(activeLinkRequest.expiresAt ?? '');
  elements.linkRequestStatus.textContent =
    activeLinkRequest.message ?? 'Waiting for approval in trusted surface settings...';
  if (pairingInProgress && !activeLinkRequest.message) {
    elements.linkRequestStatus.textContent = 'Starting trusted-device request...';
  }
  elements.pairingRecovery.hidden = !showApprovalRecovery;
  popupAutosizer?.schedule();
}

function applyLayoutState(phase) {
  currentLayoutMode = resolveLayoutMode(phase);
  document.body.dataset.layout = currentLayoutMode;
  if (currentLayoutMode !== 'pairing') {
    document.body.dataset.linkRequest = 'closed';
  }
  const expanded = shouldUseExpandedPopup(currentLayoutMode, selectedItemId);
  document.body.dataset.detail = expanded ? 'open' : 'closed';
  elements.lockBtn.hidden = !shouldShowLockIcon(currentLayoutMode);
  elements.headerReadySearch.hidden = currentLayoutMode !== 'ready';
  updateSearchClearVisibility();
  popupAutosizer?.schedule();
}

function setBusy(nextBusy) {
  inFlight = nextBusy;
  const controls = [
    ['linkPairBtn', elements.linkPairBtn],
    ['unlockBtn', elements.unlockBtn],
    ['openApprovalBtn', elements.openApprovalBtn],
    ['cancelLinkPairBtn', elements.cancelLinkPairBtn],
    ['searchInput', elements.searchInput],
    ['searchClearBtn', elements.searchClearBtn],
    ['detailActionPrimary', elements.detailActionPrimary],
    ['detailActionMenu', elements.detailActionMenu],
    ['detailActionIconWeb', elements.detailActionIconWeb],
    ['lockBtn', elements.lockBtn],
  ];
  controls.forEach((control) => {
    const [controlId, controlNode] = control;
    controlNode.disabled = shouldDisableControlWhileBusy(controlId, nextBusy);
  });
  if (filterDropdown) {
    filterDropdown.setDisabled(shouldDisableControlWhileBusy('filterDropdown', nextBusy));
  }
  const rowActionButtons = document.querySelectorAll('.row-action');
  rowActionButtons.forEach((button) => {
    button.disabled = nextBusy;
  });
}

function setAlert(kind, message) {
  if (!message) {
    elements.statusAlert.hidden = true;
    elements.statusAlert.textContent = '';
    elements.statusAlert.className = 'alert alert--warning';
    popupAutosizer?.schedule();
    return;
  }

  const tone = kind === 'danger' ? 'danger' : kind === 'success' ? 'success' : 'warning';
  elements.statusAlert.hidden = false;
  elements.statusAlert.className = `alert alert--${tone}`;
  elements.statusAlert.textContent = message;
  popupAutosizer?.schedule();
}

function toggleSections(state) {
  const phase = resolvePopupPhase(state);
  elements.pairingSection.hidden = true;
  elements.unlockSection.hidden = true;
  elements.readySection.hidden = true;

  if (phase === 'remote_authentication_required' && state?.hasTrustedState) {
    elements.unlockSection.hidden = false;
    return;
  }

  if (phase === 'pairing_required' || phase === 'remote_authentication_required') {
    elements.pairingSection.hidden = false;
    return;
  }

  if (phase === 'local_unlock_required') {
    elements.unlockSection.hidden = false;
    return;
  }

  if (phase === 'ready') {
    elements.readySection.hidden = false;
  }
}

function showTransportFailureFallback() {
  renderState({
    state: {
      ...FALLBACK_PAIRING_STATE,
      phase: 'pairing_required',
      lastError: null,
    },
    page: {},
    items: [],
  });
  elements.siteContext.textContent = 'Background unavailable';
}

async function loadPersistedPopupUiState() {
  if (!chrome.storage?.session) {
    return;
  }

  try {
    const stored = await chrome.storage.session.get(POPUP_UI_STATE_STORAGE_KEY);
    const parsed = parsePersistedPopupUiState(stored?.[POPUP_UI_STATE_STORAGE_KEY]);
    selectedItemId = parsed.selectedItemId;
    elements.searchInput.value = parsed.searchQuery;
    updateSearchClearVisibility();
    activeTypeFilter = parsed.typeFilter;
    suggestedOnly = parsed.suggestedOnly;
  } catch {
    // Ignore storage failures and keep ephemeral popup defaults.
  }
}

function persistPopupUiState() {
  if (!popupUiStateHydrated || !chrome.storage?.session) {
    return;
  }

  const payload = buildPersistedPopupUiState({
    selectedItemId,
    searchQuery: elements.searchInput.value,
    typeFilter: activeTypeFilter,
    suggestedOnly,
  });
  void chrome.storage.session.set({
    [POPUP_UI_STATE_STORAGE_KEY]: payload,
  });
}

function updateSearchClearVisibility() {
  const hasQuery = elements.searchInput.value.trim().length > 0;
  const readyLayout = currentLayoutMode === 'ready';
  elements.searchClearBtn.hidden = !(readyLayout && hasQuery);
}

async function refreshCredentialListForCurrentQuery() {
  const response = await sendBackgroundCommand({
    type: 'vaultlite.list_credentials',
    query: elements.searchInput.value,
    typeFilter: activeTypeFilter,
    suggestedOnly,
    pageUrl: activePageUrl,
  });
  if (!response.ok) {
    setAlert('warning', response.message || 'Could not refresh search results.');
    return;
  }
  renderState({
    state: currentState,
    page: response.page,
    items: response.items,
  });
}

function scheduleSearchRefresh(delayMs = 120) {
  if (searchDebounceTimer !== null) {
    window.clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = window.setTimeout(() => {
    void refreshCredentialListForCurrentQuery();
  }, delayMs);
}

function getSelectedCredential() {
  if (!selectedItemId) {
    return null;
  }
  return currentItems.find((item) => item.itemId === selectedItemId) ?? null;
}

function getCredentialByItemId(itemId) {
  return currentItems.find((item) => item.itemId === itemId) ?? null;
}

function selectedManualIconHost() {
  const selected = getSelectedCredential();
  if (!selected || selected.itemType !== 'login') {
    return null;
  }
  return sanitizeIconHost(selected.firstUrl ?? '');
}

function toggleSelectedItemInState(itemId) {
  selectedItemId = toggleSelectedItem(selectedItemId, itemId);
}

function currentFilterSelectionValue() {
  if (suggestedOnly) {
    return 'suggested';
  }
  return activeTypeFilter;
}

function renderFilterDropdown() {
  if (!filterDropdown) {
    return;
  }
  filterDropdown.setValue(currentFilterSelectionValue());
}

function activeFaviconUrl(item) {
  const candidates = Array.isArray(item?.faviconCandidates) ? item.faviconCandidates : [];
  if (candidates.length === 0) {
    return null;
  }
  const candidateIndex = faviconIndexByItemId.get(item.itemId) ?? 0;
  return candidates[candidateIndex] ?? null;
}

function nextFaviconCandidate(item) {
  const candidates = Array.isArray(item?.faviconCandidates) ? item.faviconCandidates : [];
  if (candidates.length === 0) {
    return null;
  }
  const currentIndex = faviconIndexByItemId.get(item.itemId) ?? 0;
  const nextIndex = currentIndex + 1;
  faviconIndexByItemId.set(item.itemId, nextIndex);
  return candidates[nextIndex] ?? null;
}

function firstFaviconCandidate(item) {
  const candidates = Array.isArray(item?.faviconCandidates) ? item.faviconCandidates : [];
  if (candidates.length === 0) {
    return '';
  }
  return typeof candidates[0] === 'string' ? candidates[0] : '';
}

function patchListFavicons(previousItems, nextItems) {
  const previousByItemId = new Map(
    (Array.isArray(previousItems) ? previousItems : [])
      .filter((item) => item && typeof item.itemId === 'string')
      .map((item) => [item.itemId, item]),
  );
  const rowsByItemId = new Map(
    Array.from(elements.credentialsList.querySelectorAll('.vault-row[data-item-id]')).map((row) => [
      row.getAttribute('data-item-id'),
      row,
    ]),
  );
  for (const item of Array.isArray(nextItems) ? nextItems : []) {
    if (!item || typeof item.itemId !== 'string') {
      continue;
    }
    const previousItem = previousByItemId.get(item.itemId) ?? null;
    const previousFirst = firstFaviconCandidate(previousItem);
    const nextFirst = firstFaviconCandidate(item);
    if (previousFirst === nextFirst) {
      continue;
    }
    faviconIndexByItemId.set(item.itemId, 0);
    const row = rowsByItemId.get(item.itemId) ?? null;
    const shell = row?.querySelector('.monogram');
    if (!(shell instanceof HTMLElement)) {
      continue;
    }
    if (!nextFirst) {
      shell.classList.remove('monogram--with-image');
      shell.textContent = buildCredentialMonogram(item.title);
      continue;
    }
    shell.classList.add('monogram--with-image');
    let image = shell.querySelector('.credential-favicon');
    if (!(image instanceof HTMLImageElement)) {
      shell.textContent = '';
      image = document.createElement('img');
      image.className = 'credential-favicon';
      image.alt = '';
      image.loading = 'lazy';
      shell.append(image);
    }
    image.dataset.itemId = item.itemId;
    image.src = nextFirst;
  }
}

function buildListLeadingVisual(item) {
  const faviconUrl = activeFaviconUrl(item);
  if (!faviconUrl) {
    return `<div class="monogram">${sanitizeText(buildCredentialMonogram(item.title))}</div>`;
  }

  return `
    <div class="monogram monogram--with-image">
      <img
        class="credential-favicon"
        data-item-id="${sanitizeText(item.itemId)}"
        src="${sanitizeText(faviconUrl)}"
        alt=""
        loading="lazy"
      />
    </div>
  `;
}

function actionIconSvg(actionId) {
  if (
    actionId === 'copy_username' ||
    actionId === 'copy_password' ||
    actionId === 'copy_url' ||
    actionId === 'copy_card_number' ||
    actionId === 'copy_card_cvv' ||
    actionId === 'copy_card_expiry' ||
    actionId === 'copy_note' ||
    actionId === 'copy_content' ||
    actionId === 'copy_title'
  ) {
    return '<svg viewBox="0 0 24 24"><path d="M9 9h10v10H9z"></path><path d="M5 15H4V5h10v1"></path></svg>';
  }
  if (actionId === 'open_url' || actionId === 'open_item_web') {
    return '<svg viewBox="0 0 24 24"><path d="M7 17l10-10"></path><path d="M10 7h7v7"></path><path d="M7 7h2"></path><path d="M7 7v2"></path></svg>';
  }
  return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.8"></circle></svg>';
}

function hideRowAction(button) {
  button.hidden = true;
  button.dataset.action = '';
  button.innerHTML = '';
  button.removeAttribute('title');
  button.removeAttribute('aria-label');
}

function showRowAction(button, action) {
  if (!action) {
    hideRowAction(button);
    return;
  }
  button.hidden = false;
  button.dataset.action = action.id;
  button.title = action.label;
  button.setAttribute('aria-label', action.label);
  button.innerHTML = actionIconSvg(action.id);
}

function configureDetailRow(nodes, rowModel) {
  if (!rowModel) {
    nodes.row.hidden = true;
    nodes.row.dataset.defaultAction = '';
    nodes.row.classList.remove('is-clickable');
    hideRowAction(nodes.actionA);
    hideRowAction(nodes.actionB);
    return;
  }

  nodes.row.hidden = false;
  nodes.label.textContent = rowModel.label;
  nodes.value.textContent = rowModel.value || '—';
  nodes.value.classList.toggle('detail-password', rowModel.password === true);

  const defaultAction = rowModel.defaultAction || '';
  nodes.row.dataset.defaultAction = defaultAction;
  nodes.row.classList.toggle('is-clickable', Boolean(defaultAction));

  showRowAction(nodes.actionA, rowModel.actions?.[0]);
  showRowAction(nodes.actionB, rowModel.actions?.[1]);
}

function closeDetailMenu() {
  elements.detailMenuPopover.hidden = true;
}

function toggleDetailMenu() {
  elements.detailMenuPopover.hidden = !elements.detailMenuPopover.hidden;
}

function renderCredentialDetails() {
  const selectedItem = getSelectedCredential();
  applyLayoutState(resolvePopupPhase(currentState));
  const disableActions = !selectedItem || inFlight;

  if (!selectedItem) {
    elements.credentialDetailsLoading.hidden = true;
    elements.credentialDetailsContent.hidden = true;
    elements.detailIconShell.classList.remove('is-editable');
    elements.detailIconEditBtn.hidden = true;
    elements.detailIconEditBtn.disabled = true;
    elements.detailActionIconWeb.disabled = true;
    elements.detailActionPrimary.disabled = true;
    elements.detailActionMenu.disabled = true;
    detailRows.forEach((nodes) => {
      configureDetailRow(nodes, null);
    });
    closeDetailMenu();
    popupAutosizer?.schedule();
    return;
  }

  elements.credentialDetailsLoading.hidden = !detailLoading;
  elements.credentialDetailsContent.hidden = detailLoading;
  if (detailLoading) {
    closeDetailMenu();
    popupAutosizer?.schedule();
    return;
  }

  const detailModel = buildDetailViewModel(selectedItem);
  const iconHost = selectedManualIconHost();
  const iconEditable = Boolean(iconHost);
  elements.detailIconShell.classList.toggle('is-editable', iconEditable);
  elements.detailIconEditBtn.hidden = !iconEditable;
  elements.detailIconEditBtn.disabled = disableActions || !iconEditable;
  elements.detailActionIconWeb.disabled = disableActions || !iconEditable;
  elements.detailMonogram.textContent = buildCredentialMonogram(selectedItem.title);
  const detailFaviconUrl = activeFaviconUrl(selectedItem);
  if (detailFaviconUrl) {
    elements.detailFavicon.hidden = false;
    elements.detailFavicon.src = detailFaviconUrl;
    elements.detailMonogram.hidden = true;
  } else {
    elements.detailFavicon.hidden = true;
    elements.detailFavicon.removeAttribute('src');
    elements.detailMonogram.hidden = false;
  }
  elements.detailType.textContent = detailModel.typeLabel;
  elements.detailTitle.textContent = detailModel.title;
  elements.detailActionPrimary.textContent = detailModel.primaryAction.label;
  elements.detailActionPrimary.dataset.action = detailModel.primaryAction.id;
  detailRows.forEach((nodes, index) => {
    configureDetailRow(nodes, detailModel.rows[index]);
  });

  elements.detailActionPrimary.disabled = disableActions;
  elements.detailActionMenu.disabled = disableActions;
  popupAutosizer?.schedule();
}

function captureListScrollAnchor() {
  const scrollTop = elements.credentialsList.scrollTop;
  const rows = Array.from(elements.credentialsList.querySelectorAll('.vault-row[data-item-id]'));
  const anchorRow =
    rows.find((row) => row.offsetTop + row.offsetHeight > scrollTop + 1) ??
    rows[rows.length - 1] ??
    null;
  const itemId = anchorRow?.getAttribute('data-item-id') ?? null;
  const offsetFromRowTop = anchorRow ? scrollTop - anchorRow.offsetTop : 0;
  return {
    scrollTop,
    itemId,
    offsetFromRowTop,
  };
}

function restoreListScrollAnchor(input) {
  if (!input || typeof input !== 'object') {
    return;
  }
  if (typeof input.itemId === 'string' && input.itemId.length > 0) {
    const anchor = Array.from(elements.credentialsList.querySelectorAll('.vault-row[data-item-id]')).find(
      (row) => row.getAttribute('data-item-id') === input.itemId,
    );
    if (anchor instanceof HTMLElement) {
      elements.credentialsList.scrollTop = Math.max(0, anchor.offsetTop + Number(input.offsetFromRowTop ?? 0));
      return;
    }
  }
  elements.credentialsList.scrollTop = Number(input.scrollTop ?? 0);
}

function cancelScheduledListScrollRestore() {
  if (pendingListScrollRestoreFramePrimary !== null) {
    window.cancelAnimationFrame(pendingListScrollRestoreFramePrimary);
    pendingListScrollRestoreFramePrimary = null;
  }
  if (pendingListScrollRestoreFrameSecondary !== null) {
    window.cancelAnimationFrame(pendingListScrollRestoreFrameSecondary);
    pendingListScrollRestoreFrameSecondary = null;
  }
}

function scheduleStableListScrollRestore(anchor) {
  cancelScheduledListScrollRestore();
  pendingListScrollRestoreFramePrimary = window.requestAnimationFrame(() => {
    pendingListScrollRestoreFramePrimary = null;
    pendingListScrollRestoreFrameSecondary = window.requestAnimationFrame(() => {
      pendingListScrollRestoreFrameSecondary = null;
      restoreListScrollAnchor(anchor);
    });
  });
}

function renderCredentialList(items) {
  const previousItems = currentItems;
  const previousSelectedItemId = selectedItemId;
  const previousAnchor = captureListScrollAnchor();
  currentItems = Array.isArray(items) ? items : [];
  selectedItemId = selectItemIdAfterRefresh(selectedItemId, currentItems);
  const preserveScroll =
    previousAnchor.scrollTop > 0 &&
    hasSameItemOrder(previousItems, currentItems) &&
    currentItems.length > 0;

  if (currentItems.length === 0) {
    cancelScheduledListScrollRestore();
    selectedItemId = null;
    if (vaultLoading) {
      elements.credentialsList.innerHTML = '<p class="empty-state">Loading vault…</p>';
      renderCredentialDetails();
      popupAutosizer?.schedule();
      return;
    }

    if (listErrorMessage) {
      elements.credentialsList.innerHTML = `
        <div class="empty-state">
          <p>${sanitizeText(listErrorMessage)}</p>
          <button type="button" data-empty-action="retry-list">Retry</button>
        </div>
      `;
      renderCredentialDetails();
      popupAutosizer?.schedule();
      return;
    }

    if (elements.searchInput.value.trim().length > 0) {
      elements.credentialsList.innerHTML = `
        <div class="empty-state">
          <p>No results for this search.</p>
          <button type="button" data-empty-action="clear-search">Clear search</button>
        </div>
      `;
      renderCredentialDetails();
      popupAutosizer?.schedule();
      return;
    }

    if (suggestedOnly) {
      elements.credentialsList.innerHTML = `
        <div class="empty-state">
          <p>No suggested items for this site.</p>
          <button type="button" data-empty-action="show-all">Show all items</button>
        </div>
      `;
      renderCredentialDetails();
      return;
    }

    elements.credentialsList.innerHTML = `
      <div class="empty-state">
        <p>No items in your vault yet.</p>
        <button type="button" data-empty-action="open-web-vault">Create in web app</button>
      </div>
    `;
    renderCredentialDetails();
    popupAutosizer?.schedule();
    return;
  }

  const fillDisabledReason =
    fillBlockedState && fillBlockedState.pageUrl === activePageUrl ? fillBlockedState.reason : null;
  const canReuseExistingRows =
    !vaultLoading &&
    !listErrorMessage &&
    previousSelectedItemId === selectedItemId &&
    hasSameRenderableRows(previousItems, currentItems, {
      pageEligible: activePageEligible,
      fillDisabledReason,
    });
  if (canReuseExistingRows) {
    patchListFavicons(previousItems, currentItems);
    if (preserveScroll) {
      scheduleStableListScrollRestore(previousAnchor);
    }
    renderCredentialDetails();
    persistPopupUiState();
    popupAutosizer?.schedule();
    return;
  }

  const rows = currentItems
    .map((item) => {
      const selectedClass = item.itemId === selectedItemId ? ' is-selected' : '';
      const quickAction = resolveRowQuickAction({
        item,
        pageEligible: activePageEligible,
        fillDisabledReason,
      });
      const rowClass = quickAction ? ' has-row-action' : '';
      let sideAction = '';
      if (quickAction?.type === 'open-url') {
        sideAction = `
          <button
            type="button"
            class="vault-row-side-hit"
            data-row-action="open-url"
            data-item-id="${sanitizeText(item.itemId)}"
            title="${sanitizeText(quickAction.tooltip)}"
            aria-label="${sanitizeText(quickAction.tooltip)}"
          >
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a14 14 0 0 1 0 18"></path><path d="M12 3a14 14 0 0 0 0 18"></path></svg>
          </button>
        `;
      } else if (quickAction?.type === 'fill') {
        const disabledAttr = quickAction.disabled ? 'disabled' : '';
        sideAction = `
          <button
            type="button"
            class="vault-row-side-hit is-fill"
            data-row-action="quick-fill"
            data-item-id="${sanitizeText(item.itemId)}"
            title="${sanitizeText(quickAction.tooltip)}"
            aria-label="${sanitizeText(quickAction.tooltip)}"
            ${disabledAttr}
          >
            Fill
          </button>
        `;
      }
      return `
        <article class="vault-row${selectedClass}${rowClass}" data-item-id="${sanitizeText(item.itemId)}" tabindex="0">
          <div class="vault-row-main-hit" data-row-action="show-details" data-item-id="${sanitizeText(item.itemId)}">
            <div class="vault-row-content">
              ${buildListLeadingVisual(item)}
              <div class="vault-row-main">
                <p class="vault-row-title">${sanitizeText(item.title || 'Untitled item')}</p>
                <p class="vault-row-sub">${sanitizeText(item.subtitle || '—')}</p>
                <p class="vault-row-sub-2">${sanitizeText(item.urlHostSummary || 'No URL')}</p>
              </div>
            </div>
          </div>
          ${sideAction}
        </article>
      `;
    })
    .join('');

  elements.credentialsList.innerHTML = rows;
  if (preserveScroll) {
    scheduleStableListScrollRestore(previousAnchor);
  } else {
    cancelScheduledListScrollRestore();
  }
  renderCredentialDetails();
  persistPopupUiState();
  popupAutosizer?.schedule();
}

function renderState(payload) {
  currentState = payload.state;
  const nextPageUrl = typeof payload.page?.url === 'string' ? payload.page.url : '';
  const nextPageEligible = payload.page?.eligible === true;
  if (nextPageUrl !== activePageUrl) {
    activePageUrl = nextPageUrl;
    fillBlockedState = null;
  }
  activePageEligible = nextPageEligible;
  const resolvedPhase = resolvePopupPhase(currentState);
  applyLayoutState(resolvedPhase);
  elements.deviceNameInput.value = currentState?.deviceName ?? 'VaultLite Extension';
  elements.unlockAccountValue.textContent = currentState?.username ?? 'Unknown account';
  elements.unlockDeviceValue.textContent = currentState?.deviceName ?? 'This device';
  if (document.activeElement !== elements.serverUrlInput) {
    elements.serverUrlInput.value = buildServerUrlSuggestion(currentState?.serverOrigin);
  }
  elements.pairingDescription.textContent = buildPairingDescription(currentState);
  syncLinkRequestFromState(currentState);
  elements.linkPairBtn.textContent = activeLinkRequest ? 'Restart trusted-device request' : 'Connect with trusted device';
  toggleSections(currentState);
  renderLinkRequestPanel();

  if (payload.page?.url) {
    elements.siteContext.textContent = `Site: ${hostFromUrl(payload.page.url)}`;
  } else {
    elements.siteContext.textContent = 'Site: unavailable';
  }

  if (currentState?.sessionExpiresAt) {
    const expiry = formatTime(currentState.sessionExpiresAt);
    elements.siteContext.textContent += ` · Session until ${expiry}`;
  }

  const shouldShowErrorBanner =
    resolvedPhase === 'ready' &&
    Boolean(currentState?.lastError) &&
    currentState?.serverOrigin !== null;
  if (shouldShowErrorBanner) {
    setAlert('warning', currentState.lastError);
  } else {
    const existingWarning = elements.statusAlert.classList.contains('alert--warning');
    if (resolvedPhase !== 'ready' && existingWarning) {
      setAlert('warning', '');
    } else if (resolvedPhase === 'ready') {
      setAlert('warning', '');
    }
  }

  if (payload.items) {
    renderCredentialList(payload.items);
  } else if (resolvedPhase !== 'ready') {
    selectedItemId = null;
    renderCredentialList([]);
  }
  renderFilterDropdown();
  renderLinkRequestPanel();
  closeDetailMenu();
  popupAutosizer?.schedule();
}

async function ensureServerOriginConfigured() {
  const rawInput = elements.serverUrlInput.value.trim();
  let canonicalServerOrigin = currentState?.serverOrigin ?? null;
  if (rawInput) {
    try {
      canonicalServerOrigin = canonicalizeServerUrl(rawInput);
    } catch {
      return {
        ok: false,
        message: 'Server URL is invalid. Use HTTPS or local loopback HTTP.',
      };
    }
  }

  if (!canonicalServerOrigin) {
    return {
      ok: false,
      message: 'Enter the server URL before connecting this extension.',
    };
  }

  // Always re-check permissions (API + derived web origin) even when URL is unchanged.
  const permission = await ensureServerOriginPermission(canonicalServerOrigin);
  if (!permission.ok) {
    return permission;
  }

  // Always send set_server_url to force background reconciliation of dynamic bridge registration.
  const response = await sendBackgroundCommand({
    type: 'vaultlite.set_server_url',
    serverUrl: canonicalServerOrigin,
  });
  if (!response.ok) {
    return {
      ok: false,
      code: response.code,
      message: response.message || 'Could not save server URL.',
    };
  }
  renderState({
    state: response.state,
    page: {},
    items: [],
  });
  return { ok: true };
}

async function refreshStateAndMaybeList(options = {}) {
  const fetchList = options?.fetchList !== false;
  const showLoading = options?.showLoading !== false && fetchList;
  if (showLoading) {
    vaultLoading = true;
    detailLoading = Boolean(selectedItemId);
    listErrorMessage = '';
    if (currentItems.length === 0) {
      renderCredentialList(currentItems);
    } else {
      renderCredentialDetails();
      popupAutosizer?.schedule();
    }
  }

  let stateResponse;
  let localPage = { url: '', eligible: false };
  try {
    stateResponse = await sendBackgroundCommand({ type: 'vaultlite.get_state', passive: true });
    const shouldForceActiveRefresh =
      stateResponse.ok &&
      (stateResponse.state?.phase === 'anonymous' ||
        stateResponse.state?.hasTrustedState === true ||
        resolvePopupPhase(stateResponse.state) !== 'pairing_required');
    if (shouldForceActiveRefresh) {
      stateResponse = await sendBackgroundCommand({ type: 'vaultlite.get_state', passive: false });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh extension state.';
    setAlert('danger', message);
    showTransportFailureFallback();
    return;
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0] ?? null;
    const activeUrl = typeof activeTab?.url === 'string' ? activeTab.url : '';
    localPage = {
      url: activeUrl,
      eligible: isPageUrlEligibleForFill(activeUrl),
    };
  } catch {
    localPage = { url: '', eligible: false };
  }
  if (!stateResponse.ok) {
    vaultLoading = false;
    detailLoading = false;
    setAlert('danger', stateResponse.message || 'Failed to refresh extension state.');
    return;
  }

  if (resolvePopupPhase(stateResponse.state) === 'ready') {
    if (!fetchList) {
      const pageChanged = localPage.url !== activePageUrl || localPage.eligible !== activePageEligible;
      renderState({
        state: stateResponse.state,
        page: localPage,
      });
      if (pageChanged && currentItems.length > 0) {
        renderCredentialList(currentItems);
      }
      return;
    }
    const listResponse = await sendBackgroundCommand({
      type: 'vaultlite.list_credentials',
      query: elements.searchInput.value,
      typeFilter: activeTypeFilter,
      suggestedOnly,
      pageUrl: localPage.url || activePageUrl,
    });

    if (!listResponse.ok) {
      if (shouldForceStateRefreshAfterError(listResponse.code)) {
        const refreshedStateResponse = await sendBackgroundCommand({
          type: 'vaultlite.get_state',
          passive: false,
        });
        vaultLoading = false;
        detailLoading = false;
        listErrorMessage = '';
        if (refreshedStateResponse.ok) {
          renderState({
            state: refreshedStateResponse.state,
            page: localPage,
            items: [],
          });
        } else {
          renderState({ state: stateResponse.state, page: {}, items: [] });
          setAlert('danger', refreshedStateResponse.message || 'Failed to refresh extension state.');
        }
        return;
      }
      vaultLoading = false;
      detailLoading = false;
      listErrorMessage = 'Could not load vault.';
      renderState({ state: stateResponse.state, page: {}, items: [] });
      setAlert('danger', listResponse.message || 'Could not load vault.');
      return;
    }

    vaultLoading = false;
    detailLoading = false;
    listErrorMessage = '';
    renderState({
      state: stateResponse.state,
      page: listResponse.page ?? localPage,
      items: listResponse.items,
    });
    return;
  }

  vaultLoading = false;
  detailLoading = false;
  renderState({
    state: stateResponse.state,
    page: localPage,
    items: [],
  });
}

async function runAction(task) {
  if (inFlight) {
    return;
  }
  setBusy(true);
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed.';
    setAlert('danger', message);
  } finally {
    setBusy(false);
  }
}

function scheduleLinkPolling(delayMs) {
  clearLinkPollingTimer();
  linkPollingTimer = window.setTimeout(() => {
    void runAction(pollLinkPairingStatus);
  }, delayMs);
}

async function pollLinkPairingStatus() {
  if (!activeLinkRequest?.requestId) {
    pairingInProgress = false;
    return;
  }
  const response = await sendBackgroundCommand({
    type: 'vaultlite.poll_link_pairing',
    requestId: activeLinkRequest.requestId,
  });
  if (!response.ok) {
    clearLinkRequestState();
    pairingInProgress = false;
    renderLinkRequestPanel();
    setAlert('danger', response.message || 'Trusted-device connection failed.');
    await refreshStateAndMaybeList();
    return;
  }

  if (response.completed) {
    clearLinkRequestState();
    pairingInProgress = false;
    showApprovalRecovery = false;
    setAlert('warning', '');
    await refreshStateAndMaybeList();
    return;
  }

  if (response.linkRequest) {
    activeLinkRequest = response.linkRequest;
    pairingInProgress = true;
    renderLinkRequestPanel();
    scheduleLinkPolling(normalizeIntervalSeconds(response.linkRequest.interval) * 1000);
  } else {
    renderLinkRequestPanel();
  }

  if (response.terminal) {
    clearLinkRequestState();
    pairingInProgress = false;
    showApprovalRecovery = false;
    renderLinkRequestPanel();
    setAlert('warning', response.message || 'Trusted-device request finished.');
    await refreshStateAndMaybeList();
  }
}

async function startLinkPairing() {
  showApprovalRecovery = false;
  pairingInProgress = true;
  const previousLabel = elements.linkPairBtn.textContent;
  elements.linkPairBtn.textContent = 'Connecting...';
  try {
    const serverSetup = await ensureServerOriginConfigured();
    if (!serverSetup.ok) {
      pairingInProgress = false;
      setAlert('danger', serverSetup.message || 'Could not configure server URL.');
      return;
    }

    clearLinkRequestState();
    renderLinkRequestPanel();

    const response = await sendBackgroundCommand({
      type: 'vaultlite.start_link_pairing',
      deviceNameHint: elements.deviceNameInput.value,
    });
    if (!response.ok) {
      pairingInProgress = false;
      setAlert('danger', response.message || 'Could not start trusted-device connection.');
      if (shouldForceStateRefreshAfterError(response.code)) {
        await refreshStateAndMaybeList();
      }
      return;
    }

    if (!response.linkRequest) {
      pairingInProgress = false;
      setAlert('danger', 'Trusted-device connection returned an invalid response.');
      return;
    }

    activeLinkRequest = response.linkRequest;
    renderLinkRequestPanel();
    setAlert('warning', response.linkRequest.message || 'Approve this request in trusted surface settings.');
    scheduleLinkPolling(normalizeIntervalSeconds(response.linkRequest.interval) * 1000);
    const openResult = await openWebSettings({ autoFromLinkPair: true, silentOnError: true });
    if (!openResult?.ok) {
      showApprovalRecovery = true;
      renderLinkRequestPanel();
      setAlert('warning', 'Could not open approval page automatically. Use Open approval page.');
    }
    pairingInProgress = false;
  } finally {
    elements.linkPairBtn.textContent = previousLabel;
  }
}

async function cancelLinkPairing() {
  clearLinkRequestState();
  showApprovalRecovery = false;
  pairingInProgress = false;
  renderLinkRequestPanel();
  await sendBackgroundCommand({
    type: 'vaultlite.cancel_link_pairing',
  });
  setAlert('warning', 'Trusted-device request cancelled.');
}

async function handleUnlock() {
  const password = elements.unlockPasswordInput.value;
  if (!password) {
    setAlert('warning', 'Enter your account password to unlock this device.');
    return;
  }

  const previousLabel = elements.unlockBtn.textContent;
  elements.unlockBtn.textContent = 'Unlocking...';
  elements.unlockPasswordInput.disabled = true;
  const response = await sendBackgroundCommand({
    type: 'vaultlite.unlock_local',
    password,
  });

  if (!response.ok) {
    elements.unlockBtn.textContent = previousLabel;
    elements.unlockPasswordInput.disabled = false;
    setAlert('danger', response.message || 'Unlock failed.');
    if (shouldForceStateRefreshAfterError(response.code)) {
      await refreshStateAndMaybeList();
    }
    return;
  }

  elements.unlockPasswordInput.value = '';
  elements.unlockBtn.textContent = previousLabel;
  elements.unlockPasswordInput.disabled = false;
  setAlert('success', 'Extension unlocked.');
  await refreshStateAndMaybeList();
}

async function openWebSettings(options = {}) {
  const silent = options?.silentOnError === true;
  const candidate = elements.serverUrlInput.value?.trim();
  let serverOrigin = currentState?.serverOrigin ?? null;
  if (!serverOrigin && candidate) {
    try {
      serverOrigin = canonicalizeServerUrl(candidate);
    } catch {
      if (!silent) {
        setAlert('warning', 'Set a valid server URL first.');
      }
      return { ok: false, reason: 'invalid_server_url' };
    }
  }
  if (!serverOrigin) {
    if (!silent) {
      setAlert('warning', 'Configure server URL first.');
    }
    return { ok: false, reason: 'missing_server_url' };
  }
  const webSettingsUrl = buildWebSettingsUrl(serverOrigin);
  if (!webSettingsUrl) {
    if (!silent) {
      setAlert('warning', 'Could not resolve web app URL from server URL.');
    }
    return { ok: false, reason: 'invalid_web_settings_url' };
  }
  const parsed = new URL(webSettingsUrl);
  if (activeLinkRequest?.shortCode) {
    parsed.searchParams.set('requestCode', activeLinkRequest.shortCode);
  }
  const targetUrl = parsed.toString();

  if (options?.autoFromLinkPair === true) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTabUrl = typeof tabs[0]?.url === 'string' ? tabs[0].url : '';
      if (activeTabUrl) {
        const activeUrl = new URL(activeTabUrl);
        const targetParsed = new URL(targetUrl);
        const activeCode = activeUrl.searchParams.get('requestCode') ?? '';
        const targetCode = targetParsed.searchParams.get('requestCode') ?? '';
        const alreadyOnTarget =
          activeUrl.origin === targetParsed.origin &&
          activeUrl.pathname === targetParsed.pathname &&
          activeCode === targetCode;
        if (alreadyOnTarget) {
          return { ok: true, alreadyOnTarget: true };
        }
      }
    } catch {
      // Fall through and open web settings tab.
    }
  }
  try {
    await Promise.race([
      chrome.tabs.create({ url: targetUrl }),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error('approval_open_timeout')), 2000);
      }),
    ]);
    return { ok: true };
  } catch {
    if (!silent) {
      setAlert('warning', 'Could not open approval page automatically.');
    }
    return { ok: false, reason: 'approval_open_failed' };
  }
}

async function openManualIconInWebSettings(host) {
  const safeHost = sanitizeIconHost(host ?? '');
  if (!safeHost) {
    setAlert('warning', 'This login has no valid URL host for manual icon.');
    return { ok: false, reason: 'invalid_icon_host' };
  }
  const candidate = elements.serverUrlInput.value?.trim();
  let serverOrigin = currentState?.serverOrigin ?? null;
  if (!serverOrigin && candidate) {
    try {
      serverOrigin = canonicalizeServerUrl(candidate);
    } catch {
      setAlert('warning', 'Set a valid server URL first.');
      return { ok: false, reason: 'invalid_server_url' };
    }
  }
  if (!serverOrigin) {
    setAlert('warning', 'Configure server URL first.');
    return { ok: false, reason: 'missing_server_url' };
  }
  const webSettingsUrl = buildWebSettingsUrl(serverOrigin);
  if (!webSettingsUrl) {
    setAlert('warning', 'Could not resolve web app URL from server URL.');
    return { ok: false, reason: 'invalid_web_settings_url' };
  }
  try {
    const parsed = new URL(webSettingsUrl);
    parsed.pathname = '/settings/advanced';
    parsed.searchParams.set('manualIconHost', safeHost);
    await chrome.tabs.create({ url: parsed.toString() });
    return { ok: true };
  } catch {
    setAlert('warning', 'Could not open web settings for icon editing.');
    return { ok: false, reason: 'open_settings_failed' };
  }
}

function openWebApp() {
  const candidate = elements.serverUrlInput.value?.trim();
  let serverOrigin = currentState?.serverOrigin ?? null;
  if (!serverOrigin && candidate) {
    try {
      serverOrigin = canonicalizeServerUrl(candidate);
    } catch {
      setAlert('warning', 'Set a valid server URL first.');
      return;
    }
  }
  if (!serverOrigin) {
    setAlert('warning', 'Configure server URL first.');
    return;
  }
  const webVaultUrl = buildWebVaultUrl(serverOrigin);
  if (!webVaultUrl) {
    setAlert('warning', 'Could not resolve web app URL from server URL.');
    return;
  }
  void chrome.tabs.create({ url: webVaultUrl });
}

async function lockExtension() {
  const response = await sendBackgroundCommand({ type: 'vaultlite.lock' });
  if (!response.ok) {
    setAlert('danger', response.message || 'Could not lock extension.');
    return;
  }
  window.close();
}

async function triggerFill(itemId) {
  const response = await sendBackgroundCommand({
    type: 'vaultlite.fill_credential',
    itemId,
  });
  if (!response.ok) {
    setAlert('danger', response.message || 'Manual fill failed.');
    return;
  }

  const outcome = describeFillResult(response.result);
  if (outcome.disableFillReason) {
    fillBlockedState = {
      pageUrl: activePageUrl,
      reason: outcome.disableFillReason,
    };
    renderCredentialList(currentItems);
    return;
  }
  if (fillBlockedState && fillBlockedState.pageUrl === activePageUrl) {
    fillBlockedState = null;
    renderCredentialList(currentItems);
  }
  if (outcome.alert) {
    setAlert(outcome.alert.level, outcome.alert.message);
  }
}

async function copyField(itemId, field, sourceButton = null) {
  const response = await sendBackgroundCommand({
    type: 'vaultlite.get_credential_field',
    itemId,
    field,
  });
  if (!response.ok) {
    setAlert('danger', response.message || 'Could not fetch credential value.');
    return;
  }

  try {
    await copyToClipboard(response.value || '');
    if (sourceButton) {
      pulseCopyIcon(sourceButton);
    }
  } catch {
    setAlert('danger', 'Clipboard write failed on this browser context.');
  }
}

async function copyRawValue(rawValue, sourceButton = null) {
  if (!rawValue) {
    setAlert('warning', 'No value available to copy.');
    return;
  }
  try {
    await copyToClipboard(rawValue);
    if (sourceButton) {
      pulseCopyIcon(sourceButton);
    }
  } catch {
    setAlert('danger', 'Clipboard write failed on this browser context.');
  }
}

async function openCredentialUrl(itemId, options = {}) {
  const selected = getCredentialByItemId(itemId);
  const candidateUrl = toNavigableUrl(selected?.firstUrl ?? '');
  if (!candidateUrl) {
    setAlert('warning', 'This credential has no valid URL.');
    return;
  }
  await chrome.tabs.create({ url: candidateUrl, active: true });
  if (options.closePopup) {
    window.close();
  }
}

function buildWebItemUrl(itemId) {
  const candidate = elements.serverUrlInput.value?.trim();
  let serverOrigin = currentState?.serverOrigin ?? null;
  if (!serverOrigin && candidate) {
    try {
      serverOrigin = canonicalizeServerUrl(candidate);
    } catch {
      serverOrigin = null;
    }
  }
  if (!serverOrigin) {
    return null;
  }
  const webVaultUrl = buildWebVaultUrl(serverOrigin);
  if (!webVaultUrl) {
    return null;
  }
  const parsed = new URL(webVaultUrl);
  parsed.pathname = `/vault/item/${encodeURIComponent(itemId)}`;
  return parsed.toString();
}

async function openItemInWeb(itemId) {
  const url = buildWebItemUrl(itemId);
  if (!url) {
    setAlert('warning', 'Could not resolve web app URL.');
    return;
  }
  await chrome.tabs.create({ url });
}

function clearDetailIconFileInput() {
  elements.detailIconFileInput.value = '';
}

async function updateManualIconFromFile(file) {
  const host = selectedManualIconHost();
  if (!host) {
    throw new Error('This login has no valid URL host for icon editing.');
  }
  const dataUrl = await importManualIconFromFile(file);
  const response = await sendBackgroundCommand({
    type: 'vaultlite.set_manual_icon',
    host,
    dataUrl,
    source: 'file',
  });
  if (!response.ok) {
    throw new Error(response.message || 'Could not save manual icon.');
  }
  const syncStatus = response.syncStatus === 'queued' ? 'queued' : 'synced';
  if (syncStatus === 'queued') {
    setAlert('warning', `Icon updated locally for ${host}. Syncing to server in background...`);
  } else {
    setAlert('success', `Icon updated for ${host}.`);
  }
  await refreshStateAndMaybeList({
    showLoading: false,
  });
}

async function handleDetailAction(action, sourceButton = null) {
  const selected = getSelectedCredential();
  if (!selected) {
    return;
  }

  if (action === 'fill') {
    if (selected.itemType === 'login') {
      await triggerFill(selected.itemId);
      return;
    }
    if (selected.itemType === 'card') {
      await copyField(selected.itemId, 'card_number', sourceButton);
      return;
    }
    await openItemInWeb(selected.itemId);
    return;
  }

  if (action === 'copy_username') {
    await copyField(selected.itemId, 'username', sourceButton);
    return;
  }
  if (action === 'copy_password') {
    await copyField(selected.itemId, 'password', sourceButton);
    return;
  }
  if (action === 'copy_url') {
    await copyRawValue(selected.firstUrl || selected.urlHostSummary || '', sourceButton);
    return;
  }
  if (action === 'open_url') {
    await openCredentialUrl(selected.itemId);
    return;
  }
  if (action === 'copy_card_number') {
    await copyField(selected.itemId, 'card_number', sourceButton);
    return;
  }
  if (action === 'copy_card_cvv') {
    await copyField(selected.itemId, 'card_cvv', sourceButton);
    return;
  }
  if (action === 'copy_card_expiry') {
    await copyField(selected.itemId, 'card_expiry', sourceButton);
    return;
  }
  if (action === 'copy_note' || action === 'copy_content') {
    await copyField(selected.itemId, 'content', sourceButton);
    return;
  }
  if (action === 'copy_title') {
    await copyField(selected.itemId, 'title', sourceButton);
    return;
  }
  if (action === 'open_item_web') {
    await openItemInWeb(selected.itemId);
    return;
  }
}

function wireEvents() {
  filterDropdown = createFilterDropdown({
    button: elements.filterDropdownButton,
    label: elements.filterDropdownLabel,
    icon: elements.filterDropdownIcon,
    menu: elements.filterDropdownMenu,
    onChange: (nextValue) => {
      if (nextValue === 'suggested') {
        activeTypeFilter = 'all';
        suggestedOnly = true;
      } else {
        activeTypeFilter = nextValue;
        suggestedOnly = false;
      }
      selectedItemId = null;
      persistPopupUiState();
      void refreshStateAndMaybeList();
    },
  });

  elements.linkPairBtn.addEventListener('click', () => {
    void runAction(startLinkPairing);
  });
  elements.unlockBtn.addEventListener('click', () => {
    void runAction(handleUnlock);
  });
  elements.unlockPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void runAction(handleUnlock);
    }
  });
  elements.openApprovalBtn.addEventListener('click', () => {
    void runAction(async () => {
      const openResult = await openWebSettings({ autoFromLinkPair: false, silentOnError: false });
      if (openResult?.ok) {
        showApprovalRecovery = false;
        renderLinkRequestPanel();
      }
    });
  });
  elements.cancelLinkPairBtn.addEventListener('click', () => {
    void runAction(cancelLinkPairing);
  });
  elements.lockBtn.addEventListener('click', () => {
    void runAction(lockExtension);
  });
  elements.newItemBtn.addEventListener('click', () => {
    setAlert('warning', 'New item creation is coming soon.');
  });

  elements.searchInput.addEventListener('input', () => {
    persistPopupUiState();
    updateSearchClearVisibility();
    scheduleSearchRefresh(120);
  });

  elements.searchClearBtn.addEventListener('click', () => {
    if (elements.searchInput.value.length === 0) {
      return;
    }
    elements.searchInput.value = '';
    elements.searchInput.focus();
    persistPopupUiState();
    updateSearchClearVisibility();
    scheduleSearchRefresh(0);
  });

  elements.credentialsList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const actionButton = target.closest('[data-row-action]');
    const action = actionButton?.getAttribute('data-row-action');
    const actionItemId = actionButton?.getAttribute('data-item-id');
    if (action && actionItemId) {
      if (action === 'open-url') {
        event.preventDefault();
        event.stopPropagation();
        if (actionButton instanceof HTMLElement) {
          actionButton.blur();
        }
        void runAction(async () => openCredentialUrl(actionItemId, { closePopup: true }));
        return;
      }
      if (action === 'quick-fill') {
        event.preventDefault();
        event.stopPropagation();
        if (actionButton instanceof HTMLElement) {
          actionButton.blur();
        }
        void runAction(async () => triggerFill(actionItemId));
        return;
      }
      if (action === 'show-details') {
        toggleSelectedItemInState(actionItemId);
        renderCredentialList(currentItems);
        return;
      }
    }

    const row = target.closest('.vault-row');
    const itemId = row?.getAttribute('data-item-id');
    if (!itemId) {
      return;
    }
    toggleSelectedItemInState(itemId);
    renderCredentialList(currentItems);
  });

  elements.credentialsList.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const row = target.closest('.vault-row');
    if (!row) {
      return;
    }
    const itemId = row.getAttribute('data-item-id');
    if (!itemId) {
      return;
    }
    if (event.key === 'Enter' && event.ctrlKey) {
      const item = getCredentialByItemId(itemId);
      const hasUrl = Boolean(toNavigableUrl(item?.firstUrl ?? ''));
      if (hasUrl) {
        event.preventDefault();
        void runAction(async () => openCredentialUrl(itemId, { closePopup: true }));
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      toggleSelectedItemInState(itemId);
      renderCredentialList(currentItems);
    }
  });

  elements.credentialsList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const actionButton = target.closest('[data-empty-action]');
    const action = actionButton?.getAttribute('data-empty-action');
    if (!action) {
      return;
    }
    if (action === 'clear-search') {
      elements.searchInput.value = '';
      persistPopupUiState();
      updateSearchClearVisibility();
      void refreshStateAndMaybeList();
      return;
    }
    if (action === 'show-all') {
      suggestedOnly = false;
      persistPopupUiState();
      void refreshStateAndMaybeList();
      return;
    }
    if (action === 'open-web-vault') {
      openWebApp();
      return;
    }
    if (action === 'retry-list') {
      void refreshStateAndMaybeList();
    }
  });

  elements.credentialsList.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement) || !target.classList.contains('credential-favicon')) {
        return;
      }
      const itemId = target.dataset.itemId;
      if (!itemId) {
        return;
      }
      const item = getCredentialByItemId(itemId);
      const nextCandidate = nextFaviconCandidate(item);
      if (nextCandidate) {
        target.src = nextCandidate;
        return;
      }
      const shell = target.closest('.monogram');
      if (shell instanceof HTMLElement) {
        shell.classList.remove('monogram--with-image');
        shell.textContent = buildCredentialMonogram(item?.title ?? '');
      }
      if (selectedItemId === itemId) {
        renderCredentialDetails();
      }
    },
    true,
  );

  elements.detailFavicon.addEventListener(
    'error',
    () => {
      const selected = getSelectedCredential();
      if (!selected) {
        return;
      }
      const nextCandidate = nextFaviconCandidate(selected);
      if (nextCandidate) {
        elements.detailFavicon.src = nextCandidate;
        return;
      }
      elements.detailFavicon.hidden = true;
      elements.detailFavicon.removeAttribute('src');
      elements.detailMonogram.hidden = false;
    },
    true,
  );

  elements.detailActionPrimary.addEventListener('click', () => {
    const action = elements.detailActionPrimary.dataset.action;
    if (!action) {
      return;
    }
    void runAction(async () => handleDetailAction(action, elements.detailActionPrimary));
  });

  elements.detailActionMenu.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleDetailMenu();
  });

  elements.detailActionIconWeb.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const host = selectedManualIconHost();
    if (!host) {
      setAlert('warning', 'This login has no valid URL host for icon editing.');
      closeDetailMenu();
      return;
    }
    closeDetailMenu();
    void runAction(async () => {
      await openManualIconInWebSettings(host);
    });
  });

  elements.detailIconEditBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (inFlight) {
      return;
    }
    elements.detailIconEditBtn.blur();
    elements.detailIconFileInput.click();
    window.setTimeout(() => {
      elements.detailIconEditBtn.blur();
    }, 0);
  });

  elements.detailIconFileInput.addEventListener('change', () => {
    const file = elements.detailIconFileInput.files?.[0] ?? null;
    if (!file) {
      return;
    }
    void runAction(async () => {
      try {
        await updateManualIconFromFile(file);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not import icon file.';
        setAlert('warning', message);
        const lowered = message.toLowerCase();
        const shouldOfferSettingsFallback =
          lowered.includes('background') ||
          lowered.includes('timeout') ||
          lowered.includes('could not save manual icon');
        const host = selectedManualIconHost();
        if (host && shouldOfferSettingsFallback) {
          const shouldOpenSettings = window.confirm(
            `Could not update icon in the popup.\nOpen web settings to edit icon for ${host}?`,
          );
          if (shouldOpenSettings) {
            await openManualIconInWebSettings(host);
          }
        }
      } finally {
        clearDetailIconFileInput();
      }
    });
  });

  document.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!elements.detailMenuPopover.hidden) {
      const insideMenu = elements.detailMenuPopover.contains(target);
      const insideButton = elements.detailActionMenu.contains(target);
      if (!insideMenu && !insideButton) {
        closeDetailMenu();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDetailMenu();
      filterDropdown?.close();
    }
  });

  detailRows.forEach((rowNodes) => {
    rowNodes.row.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('button')) {
        return;
      }
      const defaultAction = rowNodes.row.dataset.defaultAction;
      if (!defaultAction) {
        return;
      }
      void runAction(async () => handleDetailAction(defaultAction));
    });

    [rowNodes.actionA, rowNodes.actionB].forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = button.dataset.action;
        if (!action) {
          return;
        }
        void runAction(async () => handleDetailAction(action, button));
      });
    });
  });
}

function scheduleRefresh() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
  }
  refreshTimer = window.setInterval(() => {
    void refreshStateAndMaybeList({
      fetchList: false,
      showLoading: false,
    });
  }, 20_000);
}

wireEvents();
popupAutosizer = createPopupAutosizer({
  shell: document.querySelector('.popup-shell'),
  body: document.body,
  preservedScrollNode: elements.credentialsList,
  maxHeight: 600,
});
renderState({
  state: { ...FALLBACK_PAIRING_STATE },
  page: {},
  items: [],
});
void (async () => {
  await loadPersistedPopupUiState();
  popupUiStateHydrated = true;
  await refreshStateAndMaybeList();
  scheduleRefresh();
})();
