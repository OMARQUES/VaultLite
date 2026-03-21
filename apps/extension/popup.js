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
import { shouldDisableControlWhileBusy } from './popup-behavior.js';
import {
  buildPersistedPopupUiState,
  buildCredentialMonogram,
  parsePersistedPopupUiState,
  resolvePopupPhase,
  selectItemIdAfterRefresh,
  shouldUseExpandedLayout,
  toNavigableUrl,
} from './popup-view-model.js';

const elements = {
  siteContext: byId('siteContext'),
  popupHeader: byId('popupHeader'),
  statusAlert: byId('statusAlert'),
  pairingSection: byId('pairingSection'),
  pairingDescription: byId('pairingDescription'),
  unlockSection: byId('unlockSection'),
  readySection: byId('readySection'),
  serverUrlInput: byId('serverUrlInput'),
  deviceNameInput: byId('deviceNameInput'),
  unlockPasswordInput: byId('unlockPasswordInput'),
  linkPairBtn: byId('linkPairBtn'),
  unlockBtn: byId('unlockBtn'),
  openWebSettingsPairingBtn: byId('openWebSettingsPairingBtn'),
  linkRequestPanel: byId('linkRequestPanel'),
  linkRequestCode: byId('linkRequestCode'),
  linkRequestPhrase: byId('linkRequestPhrase'),
  linkRequestExpires: byId('linkRequestExpires'),
  linkRequestStatus: byId('linkRequestStatus'),
  cancelLinkPairBtn: byId('cancelLinkPairBtn'),
  openFullPageBtn: byId('openFullPageBtn'),
  searchInput: byId('searchInput'),
  suggestedChip: byId('suggestedChip'),
  credentialsList: byId('credentialsList'),
  credentialDetails: byId('credentialDetails'),
  credentialDetailsEmpty: byId('credentialDetailsEmpty'),
  credentialDetailsContent: byId('credentialDetailsContent'),
  detailMonogram: byId('detailMonogram'),
  detailFavicon: byId('detailFavicon'),
  detailType: byId('detailType'),
  detailTitle: byId('detailTitle'),
  detailPrimaryLabel: byId('detailPrimaryLabel'),
  detailPrimaryValue: byId('detailPrimaryValue'),
  detailSecondaryLabel: byId('detailSecondaryLabel'),
  detailSecondaryValue: byId('detailSecondaryValue'),
  detailTertiaryLabel: byId('detailTertiaryLabel'),
  detailTertiaryValue: byId('detailTertiaryValue'),
  detailCloseBtn: byId('detailCloseBtn'),
  detailActionPrimary: byId('detailActionPrimary'),
  detailActionSecondary: byId('detailActionSecondary'),
  detailActionTertiary: byId('detailActionTertiary'),
  lockBtn: byId('lockBtn'),
  openWebAppBtn: byId('openWebAppBtn'),
};

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
    return;
  }
  elements.linkRequestPanel.hidden = false;
  elements.linkRequestCode.textContent = activeLinkRequest.shortCode ?? '—';
  elements.linkRequestPhrase.textContent = activeLinkRequest.fingerprintPhrase ?? '—';
  elements.linkRequestExpires.textContent = formatTime(activeLinkRequest.expiresAt ?? '');
  elements.linkRequestStatus.textContent =
    activeLinkRequest.message ?? 'Waiting for approval in trusted surface settings...';
}

function setBusy(nextBusy) {
  inFlight = nextBusy;
  const controls = [
    ['linkPairBtn', elements.linkPairBtn],
    ['unlockBtn', elements.unlockBtn],
    ['openWebSettingsPairingBtn', elements.openWebSettingsPairingBtn],
    ['cancelLinkPairBtn', elements.cancelLinkPairBtn],
    ['openFullPageBtn', elements.openFullPageBtn],
    ['searchInput', elements.searchInput],
    ['detailActionPrimary', elements.detailActionPrimary],
    ['detailActionSecondary', elements.detailActionSecondary],
    ['detailActionTertiary', elements.detailActionTertiary],
    ['lockBtn', elements.lockBtn],
    ['openWebAppBtn', elements.openWebAppBtn],
  ];
  controls.forEach((control) => {
    const [controlId, controlNode] = control;
    controlNode.disabled = shouldDisableControlWhileBusy(controlId, nextBusy);
  });
}

function setAlert(kind, message) {
  if (!message) {
    elements.statusAlert.hidden = true;
    elements.statusAlert.textContent = '';
    elements.statusAlert.className = 'alert alert--warning';
    return;
  }

  const tone = kind === 'danger' ? 'danger' : kind === 'success' ? 'success' : 'warning';
  elements.statusAlert.hidden = false;
  elements.statusAlert.className = `alert alert--${tone}`;
  elements.statusAlert.textContent = message;
}

function toggleSections(state) {
  const phase = resolvePopupPhase(state);
  elements.pairingSection.hidden = true;
  elements.unlockSection.hidden = true;
  elements.readySection.hidden = true;

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

function getSelectedCredential() {
  if (!selectedItemId) {
    return null;
  }
  return currentItems.find((item) => item.itemId === selectedItemId) ?? null;
}

function getCredentialByItemId(itemId) {
  return currentItems.find((item) => item.itemId === itemId) ?? null;
}

function renderFilterChips() {
  const chipNodes = document.querySelectorAll('[data-type-filter]');
  chipNodes.forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const nextFilter = node.dataset.typeFilter ?? 'all';
    node.classList.toggle('is-active', nextFilter === activeTypeFilter);
  });
  elements.suggestedChip.classList.toggle('is-active', suggestedOnly);
}

function itemTypeLabel(itemType) {
  if (itemType === 'login') {
    return 'Login';
  }
  if (itemType === 'card') {
    return 'Card';
  }
  if (itemType === 'document') {
    return 'Document';
  }
  if (itemType === 'secure_note') {
    return 'Secure note';
  }
  return 'Item';
}

function activeFaviconUrl(item) {
  const candidates = Array.isArray(item?.faviconCandidates) ? item.faviconCandidates : [];
  if (candidates.length === 0) {
    return null;
  }
  const candidateIndex = faviconIndexByItemId.get(item.itemId) ?? 0;
  return candidates[candidateIndex] ?? null;
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

function renderCredentialDetails() {
  const selectedItem = getSelectedCredential();
  const useExpandedLayout = shouldUseExpandedLayout(selectedItemId);
  document.body.classList.toggle('popup-expanded', useExpandedLayout);
  const disableActions =
    !selectedItem ||
    shouldDisableControlWhileBusy('detailActionPrimary', inFlight) ||
    shouldDisableControlWhileBusy('detailActionSecondary', inFlight) ||
    shouldDisableControlWhileBusy('detailActionTertiary', inFlight);

  if (!selectedItem) {
    elements.credentialDetailsEmpty.hidden = false;
    elements.credentialDetailsContent.hidden = true;
    elements.detailActionPrimary.disabled = disableActions;
    elements.detailActionSecondary.disabled = disableActions;
    elements.detailActionTertiary.disabled = disableActions;
    return;
  }

  elements.credentialDetailsEmpty.hidden = true;
  elements.credentialDetailsContent.hidden = false;
  elements.detailMonogram.textContent = buildCredentialMonogram(selectedItem.title);
  const detailFaviconUrl = activeFaviconUrl(selectedItem);
  if (detailFaviconUrl) {
    elements.detailFavicon.hidden = false;
    elements.detailFavicon.src = detailFaviconUrl;
    elements.detailMonogram.classList.add('is-hidden');
  } else {
    elements.detailFavicon.hidden = true;
    elements.detailFavicon.removeAttribute('src');
    elements.detailMonogram.classList.remove('is-hidden');
  }
  elements.detailType.textContent = itemTypeLabel(selectedItem.itemType);
  elements.detailTitle.textContent = selectedItem.title || 'Untitled item';

  const loginLayout = selectedItem.itemType === 'login';
  const cardLayout = selectedItem.itemType === 'card';
  const noteLayout = selectedItem.itemType === 'secure_note' || selectedItem.itemType === 'document';

  if (loginLayout) {
    elements.detailPrimaryLabel.textContent = 'Username';
    elements.detailPrimaryValue.textContent = selectedItem.subtitle || '—';
    elements.detailSecondaryLabel.textContent = 'Password';
    elements.detailSecondaryValue.textContent = '••••••••••••';
    elements.detailTertiaryLabel.textContent = 'URL';
    elements.detailTertiaryValue.textContent = selectedItem.firstUrl || selectedItem.urlHostSummary || 'No URL';
    elements.detailActionPrimary.textContent = 'Fill';
    elements.detailActionSecondary.textContent = 'Copy username';
    elements.detailActionTertiary.textContent = 'Copy password';
  } else if (cardLayout) {
    elements.detailPrimaryLabel.textContent = 'Card';
    elements.detailPrimaryValue.textContent = selectedItem.subtitle || '••••';
    elements.detailSecondaryLabel.textContent = 'Security code';
    elements.detailSecondaryValue.textContent = '•••';
    elements.detailTertiaryLabel.textContent = 'Type';
    elements.detailTertiaryValue.textContent = 'Card';
    elements.detailActionPrimary.textContent = 'Copy number';
    elements.detailActionSecondary.textContent = 'Copy CVV';
    elements.detailActionTertiary.textContent = 'Copy expiry';
  } else if (noteLayout) {
    elements.detailPrimaryLabel.textContent = 'Preview';
    elements.detailPrimaryValue.textContent = selectedItem.subtitle || '—';
    elements.detailSecondaryLabel.textContent = 'Type';
    elements.detailSecondaryValue.textContent = itemTypeLabel(selectedItem.itemType);
    elements.detailTertiaryLabel.textContent = 'Open';
    elements.detailTertiaryValue.textContent = 'Use Open in web app for full details.';
    elements.detailActionPrimary.textContent = 'Open in web';
    elements.detailActionSecondary.textContent = 'Copy title';
    elements.detailActionTertiary.textContent =
      selectedItem.itemType === 'document' ? 'Copy content' : 'Copy note';
  } else {
    elements.detailPrimaryLabel.textContent = 'Value';
    elements.detailPrimaryValue.textContent = selectedItem.subtitle || '—';
    elements.detailSecondaryLabel.textContent = 'Type';
    elements.detailSecondaryValue.textContent = itemTypeLabel(selectedItem.itemType);
    elements.detailTertiaryLabel.textContent = 'Info';
    elements.detailTertiaryValue.textContent = selectedItem.urlHostSummary || '—';
    elements.detailActionPrimary.textContent = 'Open in web';
    elements.detailActionSecondary.textContent = 'Copy title';
    elements.detailActionTertiary.textContent = 'Copy';
  }

  elements.detailActionPrimary.disabled = disableActions;
  elements.detailActionSecondary.disabled = disableActions;
  elements.detailActionTertiary.disabled = disableActions;
}

function renderCredentialList(items) {
  currentItems = Array.isArray(items) ? items : [];
  selectedItemId = selectItemIdAfterRefresh(selectedItemId, currentItems);

  if (currentItems.length === 0) {
    selectedItemId = null;
    elements.credentialsList.innerHTML = '<p class="empty-state">No credentials found for current filters.</p>';
    renderCredentialDetails();
    return;
  }

  const rows = currentItems
    .map((item) => {
      const selectedClass = item.itemId === selectedItemId ? ' is-selected' : '';
      const goUrl = toNavigableUrl(item.firstUrl);
      const goDisabledAttr = goUrl ? '' : 'disabled';
      return `
        <article class="vault-row${selectedClass}" data-item-id="${sanitizeText(item.itemId)}">
          <div class="vault-row-content">
            ${buildListLeadingVisual(item)}
            <div class="vault-row-main">
              <p class="vault-row-title">${sanitizeText(item.title || 'Untitled item')}</p>
              <p class="vault-row-sub">${sanitizeText(item.subtitle || '—')}</p>
              <p class="vault-row-sub-2">${sanitizeText(item.urlHostSummary || 'No URL')}</p>
            </div>
          </div>
          <div class="vault-row-overlay">
            <div class="vault-row-actions">
              <button type="button" data-row-action="open-url" data-item-id="${sanitizeText(item.itemId)}" ${goDisabledAttr}>Go</button>
              <button type="button" data-row-action="show-details" data-item-id="${sanitizeText(item.itemId)}">Details</button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  elements.credentialsList.innerHTML = rows;
  renderCredentialDetails();
  persistPopupUiState();
}

function renderState(payload) {
  currentState = payload.state;
  const resolvedPhase = resolvePopupPhase(currentState);
  document.body.classList.toggle('ready-mode', resolvedPhase === 'ready');
  if (elements.popupHeader) {
    elements.popupHeader.hidden = resolvedPhase === 'ready';
  }
  elements.deviceNameInput.value = currentState?.deviceName ?? 'VaultLite Extension';
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

  const shouldShowErrorBanner = Boolean(currentState?.lastError) && currentState?.serverOrigin !== null;
  if (shouldShowErrorBanner) {
    setAlert('warning', currentState.lastError);
  } else {
    setAlert('warning', '');
  }

  if (payload.items) {
    renderCredentialList(payload.items);
  } else if (resolvedPhase !== 'ready') {
    selectedItemId = null;
    renderCredentialList([]);
    document.body.classList.remove('popup-expanded');
  }
  renderFilterChips();
  renderLinkRequestPanel();
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

async function refreshStateAndMaybeList() {
  let stateResponse;
  let localPage = { url: '', eligible: false };
  try {
    stateResponse = await sendBackgroundCommand({ type: 'vaultlite.get_state', passive: true });
    if (stateResponse.ok && stateResponse.state?.phase === 'anonymous') {
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
    setAlert('danger', stateResponse.message || 'Failed to refresh extension state.');
    return;
  }

  if (resolvePopupPhase(stateResponse.state) === 'ready') {
    const listResponse = await sendBackgroundCommand({
      type: 'vaultlite.list_credentials',
      query: elements.searchInput.value,
      typeFilter: activeTypeFilter,
      suggestedOnly,
    });

    if (!listResponse.ok) {
      renderState({ state: stateResponse.state, page: {}, items: [] });
      setAlert('danger', listResponse.message || 'Failed to load credentials.');
      return;
    }

    renderState({
      state: stateResponse.state,
      page: listResponse.page ?? localPage,
      items: listResponse.items,
    });
    return;
  }

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
    return;
  }
  const response = await sendBackgroundCommand({
    type: 'vaultlite.poll_link_pairing',
    requestId: activeLinkRequest.requestId,
  });
  if (!response.ok) {
    clearLinkRequestState();
    renderLinkRequestPanel();
    setAlert('danger', response.message || 'Trusted-device connection failed.');
    await refreshStateAndMaybeList();
    return;
  }

  if (response.completed) {
    clearLinkRequestState();
    setAlert('success', response.message || 'Extension connected. Unlock this device to continue.');
    await refreshStateAndMaybeList();
    return;
  }

  if (response.linkRequest) {
    activeLinkRequest = response.linkRequest;
    renderLinkRequestPanel();
    scheduleLinkPolling(normalizeIntervalSeconds(response.linkRequest.interval) * 1000);
  } else {
    renderLinkRequestPanel();
  }

  if (response.terminal) {
    clearLinkRequestState();
    renderLinkRequestPanel();
    setAlert('warning', response.message || 'Trusted-device request finished.');
    await refreshStateAndMaybeList();
  }
}

async function startLinkPairing() {
  const serverSetup = await ensureServerOriginConfigured();
  if (!serverSetup.ok) {
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
    setAlert('danger', response.message || 'Could not start trusted-device connection.');
    if (shouldForceStateRefreshAfterError(response.code)) {
      await refreshStateAndMaybeList();
    }
    return;
  }

  if (!response.linkRequest) {
    setAlert('danger', 'Trusted-device connection returned an invalid response.');
    return;
  }

  activeLinkRequest = response.linkRequest;
  renderLinkRequestPanel();
  setAlert('warning', response.linkRequest.message || 'Approve this request in trusted surface settings.');
  scheduleLinkPolling(normalizeIntervalSeconds(response.linkRequest.interval) * 1000);
  await openWebSettings({ autoFromLinkPair: true });
}

async function cancelLinkPairing() {
  clearLinkRequestState();
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

  const response = await sendBackgroundCommand({
    type: 'vaultlite.unlock_local',
    password,
  });

  if (!response.ok) {
    setAlert('danger', response.message || 'Unlock failed.');
    if (shouldForceStateRefreshAfterError(response.code)) {
      await refreshStateAndMaybeList();
    }
    return;
  }

  elements.unlockPasswordInput.value = '';
  setAlert('success', 'Extension unlocked.');
  await refreshStateAndMaybeList();
}

async function openWebSettings(options = {}) {
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
  const webSettingsUrl = buildWebSettingsUrl(serverOrigin);
  if (!webSettingsUrl) {
    setAlert('warning', 'Could not resolve web app URL from server URL.');
    return;
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
          return;
        }
      }
    } catch {
      // Fall through and open web settings tab.
    }
  }

  void chrome.tabs.create({ url: targetUrl });
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
  setAlert('success', 'Extension locked.');
  await refreshStateAndMaybeList();
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

  const result = response.result;
  if (result === 'filled') {
    setAlert('success', 'Filled username and password.');
    return;
  }
  if (result === 'credential_not_allowed_for_site') {
    setAlert('warning', 'Credential not allowed for this site.');
    return;
  }
  if (result === 'page_changed_try_again') {
    setAlert('warning', 'Page changed during fill. Try again.');
    return;
  }
  if (result === 'unsupported_form') {
    setAlert('warning', 'Manual fill unavailable for this form.');
    return;
  }
  if (result === 'no_eligible_fields') {
    setAlert('warning', 'No supported fields found on this page.');
    return;
  }
  setAlert('warning', 'Manual fill unavailable on this page.');
}

async function copyField(itemId, field) {
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
    if (field === 'password' || field === 'card_cvv') {
      setAlert('success', 'Secret copied.');
    } else if (field === 'card_number') {
      setAlert('success', 'Card number copied.');
    } else if (field === 'card_expiry') {
      setAlert('success', 'Expiry copied.');
    } else if (field === 'content') {
      setAlert('success', 'Content copied.');
    } else if (field === 'title') {
      setAlert('success', 'Title copied.');
    } else {
      setAlert('success', 'Value copied.');
    }
  } catch {
    setAlert('danger', 'Clipboard write failed on this browser context.');
  }
}

async function openCredentialUrl(itemId) {
  const selected = getCredentialByItemId(itemId);
  const candidateUrl = toNavigableUrl(selected?.firstUrl ?? '');
  if (!candidateUrl) {
    setAlert('warning', 'This credential has no valid URL.');
    return;
  }
  await chrome.tabs.create({ url: candidateUrl });
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

async function handleDetailAction(slot) {
  const selected = getSelectedCredential();
  if (!selected) {
    return;
  }

  if (slot === 'primary') {
    if (selected.itemType === 'login') {
      await triggerFill(selected.itemId);
      return;
    }
    if (selected.itemType === 'card') {
      await copyField(selected.itemId, 'card_number');
      return;
    }
    await openItemInWeb(selected.itemId);
    return;
  }

  if (slot === 'secondary') {
    if (selected.itemType === 'login') {
      await copyField(selected.itemId, 'username');
      return;
    }
    if (selected.itemType === 'card') {
      await copyField(selected.itemId, 'card_cvv');
      return;
    }
    await copyField(selected.itemId, 'title');
    return;
  }

  if (selected.itemType === 'login') {
    await copyField(selected.itemId, 'password');
    return;
  }
  if (selected.itemType === 'card') {
    await copyField(selected.itemId, 'card_expiry');
    return;
  }
  await copyField(selected.itemId, 'content');
}

function wireEvents() {
  elements.linkPairBtn.addEventListener('click', () => {
    void runAction(startLinkPairing);
  });
  elements.unlockBtn.addEventListener('click', () => {
    void runAction(handleUnlock);
  });
  elements.openWebSettingsPairingBtn.addEventListener('click', () => {
    void openWebSettings();
  });
  elements.cancelLinkPairBtn.addEventListener('click', () => {
    void runAction(cancelLinkPairing);
  });
  elements.openWebAppBtn.addEventListener('click', openWebApp);
  elements.lockBtn.addEventListener('click', () => {
    void runAction(lockExtension);
  });
  elements.openFullPageBtn.addEventListener('click', () => {
    void runAction(async () => {
      await sendBackgroundCommand({ type: 'vaultlite.open_full_page_auth' });
      window.close();
    });
  });

  elements.searchInput.addEventListener('input', () => {
    persistPopupUiState();
    if (searchDebounceTimer !== null) {
      window.clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = window.setTimeout(() => {
      void (async () => {
        const response = await sendBackgroundCommand({
          type: 'vaultlite.list_credentials',
          query: elements.searchInput.value,
          typeFilter: activeTypeFilter,
          suggestedOnly,
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
      })();
    }, 120);
  });

  document.querySelectorAll('[data-type-filter]').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    node.addEventListener('click', () => {
      const nextFilter = node.dataset.typeFilter ?? 'all';
      activeTypeFilter = nextFilter;
      selectedItemId = null;
      persistPopupUiState();
      void refreshStateAndMaybeList();
    });
  });

  elements.suggestedChip.addEventListener('click', () => {
    suggestedOnly = !suggestedOnly;
    selectedItemId = null;
    persistPopupUiState();
    void refreshStateAndMaybeList();
  });

  elements.credentialsList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionButton = target.closest('[data-row-action]');
    const action = actionButton?.getAttribute('data-row-action');
    const actionItemId = actionButton?.getAttribute('data-item-id');
    if (action && actionItemId) {
      if (action === 'open-url') {
        void runAction(async () => openCredentialUrl(actionItemId));
        return;
      }
      if (action === 'show-details') {
        selectedItemId = actionItemId;
        renderCredentialList(currentItems);
        return;
      }
    }

    const row = target.closest('.vault-row');
    const itemId = row?.getAttribute('data-item-id');
    if (!itemId) {
      return;
    }
    selectedItemId = itemId;
    renderCredentialList(currentItems);
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
      const currentIndex = faviconIndexByItemId.get(itemId) ?? 0;
      faviconIndexByItemId.set(itemId, currentIndex + 1);
      renderCredentialList(currentItems);
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
      const currentIndex = faviconIndexByItemId.get(selected.itemId) ?? 0;
      faviconIndexByItemId.set(selected.itemId, currentIndex + 1);
      renderCredentialList(currentItems);
    },
    true,
  );

  elements.detailCloseBtn.addEventListener('click', () => {
    selectedItemId = null;
    renderCredentialList(currentItems);
  });

  elements.detailActionPrimary.addEventListener('click', () => {
    void runAction(async () => handleDetailAction('primary'));
  });

  elements.detailActionSecondary.addEventListener('click', () => {
    void runAction(async () => handleDetailAction('secondary'));
  });

  elements.detailActionTertiary.addEventListener('click', () => {
    void runAction(async () => handleDetailAction('tertiary'));
  });
}

function scheduleRefresh() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
  }
  refreshTimer = window.setInterval(() => {
    void refreshStateAndMaybeList();
  }, 20_000);
}

wireEvents();
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
