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
import { canonicalizeServerUrl, isPageUrlEligibleForFill, STORAGE_LOCAL_TRUSTED_KEY } from './runtime-common.js';
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
  isTrustedIdentitySoftMatch,
  resolveTrustedIdentitySignatureFromPersistedPayload,
  resolveTrustedIdentitySignatureFromState,
  resolveTrustedIdentitySignatureFromTrustedRecord,
} from './popup-snapshot-identity.js';
import {
  resolveLayoutMode,
  shouldShowLockIcon,
  shouldUseExpandedPopup,
} from './popup-layout-state.js';
import { createFilterDropdown } from './popup-filter-dropdown.js';
import { buildDetailViewModel, pulseCopyIcon } from './popup-detail-actions.js';
import { createPopupAutosizer } from './popup-autosize.js';
import { importManualIconFromFile, sanitizeIconHost } from './manual-icons.js';
import {
  createDefaultGeneratorState,
  generatePassword,
  normalizeGeneratorState,
  PASSWORD_GENERATOR_MODES,
} from './popup-password-generator.js';
import {
  addGeneratorHistoryEntry,
  filterGeneratorHistoryEntries,
  groupGeneratorHistoryByDay,
} from './popup-password-generator-history.js';

const elements = {
  siteContext: document.getElementById('siteContext'),
  statusAlert: byId('statusAlert'),
  pairingSection: byId('pairingSection'),
  pairingDescription: byId('pairingDescription'),
  unlockSection: byId('unlockSection'),
  unlockAccountValue: byId('unlockAccountValue'),
  unlockDeviceValue: byId('unlockDeviceValue'),
  unlockPasswordError: byId('unlockPasswordError'),
  readySection: byId('readySection'),
  serverUrlInput: byId('serverUrlInput'),
  deviceNameInput: byId('deviceNameInput'),
  unlockPasswordInput: byId('unlockPasswordInput'),
  unlockRevealBtn: byId('unlockRevealBtn'),
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
  passwordGeneratorBtn: byId('passwordGeneratorBtn'),
  passwordGeneratorPanel: byId('passwordGeneratorPanel'),
  passwordGeneratorCloseBtn: byId('passwordGeneratorCloseBtn'),
  passwordGeneratorCopyBtn: byId('passwordGeneratorCopyBtn'),
  passwordGeneratorRefreshBtn: byId('passwordGeneratorRefreshBtn'),
  passwordGeneratorValue: byId('passwordGeneratorValue'),
  passwordGeneratorType: byId('passwordGeneratorType'),
  passwordGeneratorRandomControls: byId('passwordGeneratorRandomControls'),
  passwordGeneratorPinControls: byId('passwordGeneratorPinControls'),
  passwordGeneratorLengthRange: byId('passwordGeneratorLengthRange'),
  passwordGeneratorLengthNumber: byId('passwordGeneratorLengthNumber'),
  passwordGeneratorNumbersToggle: byId('passwordGeneratorNumbersToggle'),
  passwordGeneratorSymbolsToggle: byId('passwordGeneratorSymbolsToggle'),
  passwordGeneratorPinRange: byId('passwordGeneratorPinRange'),
  passwordGeneratorPinNumber: byId('passwordGeneratorPinNumber'),
  passwordGeneratorHint: byId('passwordGeneratorHint'),
  passwordGeneratorHistoryBtn: byId('passwordGeneratorHistoryBtn'),
  passwordGeneratorMainView: byId('passwordGeneratorMainView'),
  passwordGeneratorHistoryView: byId('passwordGeneratorHistoryView'),
  passwordGeneratorHistoryBackBtn: byId('passwordGeneratorHistoryBackBtn'),
  passwordGeneratorHistorySearchInput: byId('passwordGeneratorHistorySearchInput'),
  passwordGeneratorHistoryList: byId('passwordGeneratorHistoryList'),
  passwordGeneratorHistoryEmpty: byId('passwordGeneratorHistoryEmpty'),
  filterDropdownButton: byId('filterDropdownButton'),
  filterDropdownLabel: byId('filterDropdownLabel'),
  filterDropdownIcon: byId('filterDropdownIcon'),
  filterDropdownMenu: byId('filterDropdownMenu'),
  sortMenuButton: byId('sortMenuButton'),
  sortMenu: byId('sortMenu'),
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
let activeSortMode = 'default';
const faviconIndexByItemId = new Map();
let inFlight = false;
let refreshTimer = null;
let searchDebounceTimer = null;
let linkPollingTimer = null;
let warmupListRefreshTimer = null;
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
let unlockPasswordRevealed = false;
let pendingListScrollRestoreFramePrimary = null;
let pendingListScrollRestoreFrameSecondary = null;
let shouldPinSelectedRowOnNextRender = false;
let lastReadyListSnapshot = [];
let lastReadyListPageSnapshot = { url: '', eligible: false };
let refreshIntervalMs = 20_000;
let transportReconnectTimer = null;
let lastStableStateSnapshot = null;
let lastStableStateSnapshotAt = 0;
let readySearchShouldAutoFocus = true;
let passwordGeneratorOpen = false;
let passwordGeneratorState = createDefaultGeneratorState();
let passwordGeneratorValue = generatePassword(passwordGeneratorState);
let passwordGeneratorCopyFeedbackTimer = null;
let passwordGeneratorHistoryOpen = false;
let passwordGeneratorHistory = [];
let passwordGeneratorHistoryLastSyncedAt = 0;
let passwordGeneratorHistorySyncInFlight = null;
const passwordGeneratorVisibleHistoryIds = new Set();
let trustedIdentitySignature = null;
const detailSecretState = {
  itemId: null,
  passwordVisible: false,
  passwordValue: '',
};
const POPUP_UI_STATE_STORAGE_KEY = 'vaultlite.popup.ui.v1';
const POPUP_LAST_STATE_STORAGE_KEY = 'vaultlite.popup.last_state.v1';
const POPUP_LAST_READY_LIST_STORAGE_KEY = 'vaultlite.popup.last_ready_list.v1';
const POPUP_STABLE_SNAPSHOT_CONFIDENCE_MS = 2 * 60 * 1000;
const PASSWORD_GENERATOR_HISTORY_STORAGE_KEY = 'vaultlite.popup.password.generator.history.v1';
const PASSWORD_GENERATOR_HISTORY_SYNCED_AT_STORAGE_KEY = 'vaultlite.popup.password.generator.history.synced_at.v1';
const PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES = 80;
const PASSWORD_GENERATOR_HISTORY_SYNC_COOLDOWN_MS = 90 * 1000;
const PASSWORD_RETRY_MESSAGE = 'Check your password and try again.';
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

function resetDetailSecretState(nextItemId = null) {
  detailSecretState.itemId = nextItemId;
  detailSecretState.passwordVisible = false;
  detailSecretState.passwordValue = '';
}

function ensureDetailSecretStateForItem(itemId) {
  if (detailSecretState.itemId !== itemId) {
    resetDetailSecretState(itemId);
  }
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
  if (currentLayoutMode !== 'ready') {
    passwordGeneratorOpen = false;
  }
  syncPasswordGeneratorPanelVisibility();
  updateSearchClearVisibility();
  popupAutosizer?.schedule();
}

function setGeneratorSwitchState(button, enabled) {
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function clearPasswordGeneratorCopyFeedbackTimer() {
  if (passwordGeneratorCopyFeedbackTimer !== null) {
    window.clearTimeout(passwordGeneratorCopyFeedbackTimer);
    passwordGeneratorCopyFeedbackTimer = null;
  }
}

function setPasswordGeneratorCopyFeedback(copied) {
  clearPasswordGeneratorCopyFeedbackTimer();
  if (copied) {
    elements.passwordGeneratorCopyBtn.textContent = 'Copied';
    elements.passwordGeneratorCopyBtn.classList.add('is-copied');
    passwordGeneratorCopyFeedbackTimer = window.setTimeout(() => {
      elements.passwordGeneratorCopyBtn.textContent = 'Copy';
      elements.passwordGeneratorCopyBtn.classList.remove('is-copied');
      passwordGeneratorCopyFeedbackTimer = null;
    }, 1200);
    return;
  }
  elements.passwordGeneratorCopyBtn.textContent = 'Copy';
  elements.passwordGeneratorCopyBtn.classList.remove('is-copied');
}

function regeneratePasswordGeneratorValue() {
  passwordGeneratorValue = generatePassword(passwordGeneratorState);
}

function getGeneratorHistoryHost(pageUrl) {
  if (typeof pageUrl !== 'string' || pageUrl.trim().length === 0) {
    return 'unknown';
  }
  return hostFromUrl(pageUrl);
}

function formatGeneratorHistoryTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function formatGeneratorHistoryDate(dayKey) {
  const parsed = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dayKey;
  }
  return parsed.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function maskGeneratorPassword(value) {
  const length = Math.max(8, Math.min(20, String(value ?? '').length || 10));
  return '•'.repeat(length);
}

async function persistPasswordGeneratorHistory() {
  if (!chrome.storage?.session) {
    return;
  }
  await chrome.storage.session.set({
    [PASSWORD_GENERATOR_HISTORY_STORAGE_KEY]: passwordGeneratorHistory,
  });
}

async function persistPasswordGeneratorHistorySyncMarker() {
  if (!chrome.storage?.session) {
    return;
  }
  await chrome.storage.session.set({
    [PASSWORD_GENERATOR_HISTORY_SYNCED_AT_STORAGE_KEY]: passwordGeneratorHistoryLastSyncedAt,
  });
}

async function loadPasswordGeneratorHistory() {
  if (!chrome.storage?.session) {
    passwordGeneratorHistory = [];
    passwordGeneratorHistoryLastSyncedAt = 0;
  } else {
    try {
      const stored = await chrome.storage.session.get([
        PASSWORD_GENERATOR_HISTORY_STORAGE_KEY,
        PASSWORD_GENERATOR_HISTORY_SYNCED_AT_STORAGE_KEY,
      ]);
      const raw = stored?.[PASSWORD_GENERATOR_HISTORY_STORAGE_KEY];
      const normalized = Array.isArray(raw) ? raw.filter(Boolean) : [];
      passwordGeneratorHistory = normalized
        .map((entry) => ({
          id: typeof entry.id === 'string' ? entry.id : '',
          createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
          password: typeof entry.password === 'string' ? entry.password : '',
          pageUrl: typeof entry.pageUrl === 'string' ? entry.pageUrl : '',
          pageHost: typeof entry.pageHost === 'string' ? entry.pageHost : 'unknown',
        }))
        .filter((entry) => entry.id && entry.password);
      const syncedAtRaw = Number(stored?.[PASSWORD_GENERATOR_HISTORY_SYNCED_AT_STORAGE_KEY]);
      passwordGeneratorHistoryLastSyncedAt = Number.isFinite(syncedAtRaw) ? Math.max(0, syncedAtRaw) : 0;
    } catch {
      passwordGeneratorHistory = [];
      passwordGeneratorHistoryLastSyncedAt = 0;
    }
  }
}

async function syncPasswordGeneratorHistoryFromRemote(options = {}) {
  const force = options?.force === true;
  if (passwordGeneratorHistorySyncInFlight) {
    await passwordGeneratorHistorySyncInFlight;
    return;
  }
  if (!force && Date.now() - passwordGeneratorHistoryLastSyncedAt < PASSWORD_GENERATOR_HISTORY_SYNC_COOLDOWN_MS) {
    return;
  }
  passwordGeneratorHistorySyncInFlight = (async () => {
    try {
      const response = await sendBackgroundCommand({
        type: 'vaultlite.list_password_generator_history',
      });
      passwordGeneratorHistoryLastSyncedAt = Date.now();
      void persistPasswordGeneratorHistorySyncMarker();
      if (response?.ok !== true) {
        return;
      }
      const remoteEntries = Array.isArray(response.entries) ? response.entries : [];
      const normalizedRemote = remoteEntries
        .map((entry) => ({
          id: typeof entry.id === 'string' ? entry.id : '',
          createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
          password: typeof entry.password === 'string' ? entry.password : '',
          pageUrl: typeof entry.pageUrl === 'string' ? entry.pageUrl : '',
          pageHost: typeof entry.pageHost === 'string' ? entry.pageHost : 'unknown',
        }))
        .filter((entry) => entry.id && entry.password);
      if (normalizedRemote.length === 0) {
        return;
      }
      passwordGeneratorHistory = normalizedRemote;
      await persistPasswordGeneratorHistory();
      if (passwordGeneratorHistoryOpen) {
        renderPasswordGeneratorHistory();
      }
    } catch {
      // Keep local fallback history when remote sync is unavailable.
    }
  })().finally(() => {
    passwordGeneratorHistorySyncInFlight = null;
  });
  await passwordGeneratorHistorySyncInFlight;
}

async function pushPasswordGeneratorHistoryEntry(password) {
  const safePassword = typeof password === 'string' ? password : '';
  if (!safePassword) {
    return;
  }
  passwordGeneratorHistory = addGeneratorHistoryEntry(
    passwordGeneratorHistory,
    {
      createdAt: Date.now(),
      password: safePassword,
      pageUrl: activePageUrl || '',
      pageHost: getGeneratorHistoryHost(activePageUrl),
    },
    PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES,
  );
  await persistPasswordGeneratorHistory();
  const newestEntry = passwordGeneratorHistory[0] ?? null;
  if (newestEntry) {
    try {
      await sendBackgroundCommand({
        type: 'vaultlite.add_password_generator_history_entry',
        entryId: newestEntry.id,
        createdAt: newestEntry.createdAt,
        password: newestEntry.password,
        pageUrl: newestEntry.pageUrl,
        pageHost: newestEntry.pageHost,
      });
    } catch {
      // Keep local fallback history when remote sync fails.
    }
  }
  if (passwordGeneratorHistoryOpen) {
    renderPasswordGeneratorHistory();
  }
}

function renderPasswordGeneratorHistory() {
  const query = elements.passwordGeneratorHistorySearchInput.value;
  const filtered = filterGeneratorHistoryEntries(passwordGeneratorHistory, query);
  const grouped = groupGeneratorHistoryByDay(filtered);
  const html = grouped
    .map((group) => {
      const entriesHtml = group.entries
        .map((entry) => {
          const isVisible = passwordGeneratorVisibleHistoryIds.has(entry.id);
          const passwordText = isVisible ? entry.password : maskGeneratorPassword(entry.password);
          const eyeIcon = isVisible ? 'visibility_off' : 'visibility';
          return `
            <article class="generator-history-entry" data-history-entry-id="${sanitizeText(entry.id)}">
              <div>
                <p class="generator-history-meta">${sanitizeText(formatGeneratorHistoryTime(entry.createdAt))} - ${sanitizeText(
                  entry.pageHost || 'unknown',
                )}</p>
                <p class="generator-history-password">${sanitizeText(passwordText)}</p>
              </div>
              <div class="generator-history-actions">
                <button
                  type="button"
                  class="icon-button generator-history-icon"
                  data-history-action="toggle-visibility"
                  data-history-entry-id="${sanitizeText(entry.id)}"
                  aria-label="Show or hide generated password"
                  title="Show or hide generated password"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">${eyeIcon}</span>
                </button>
                <button
                  type="button"
                  class="icon-button generator-history-icon"
                  data-history-action="copy"
                  data-history-entry-id="${sanitizeText(entry.id)}"
                  aria-label="Copy generated password"
                  title="Copy generated password"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">content_copy</span>
                </button>
              </div>
            </article>
          `;
        })
        .join('');
      return `
        <section>
          <p class="generator-history-day-label">${sanitizeText(formatGeneratorHistoryDate(group.dayKey))}</p>
          <div class="generator-history-day-card">${entriesHtml}</div>
        </section>
      `;
    })
    .join('');

  elements.passwordGeneratorHistoryList.innerHTML = html;
  const empty = filtered.length === 0;
  elements.passwordGeneratorHistoryEmpty.hidden = !empty;
  if (empty) {
    elements.passwordGeneratorHistoryEmpty.textContent =
      passwordGeneratorHistory.length > 0 ? 'No results for this URL search.' : 'No generated passwords yet.';
  }
}

function setPasswordGeneratorHistoryOpen(open) {
  passwordGeneratorHistoryOpen = open === true;
  elements.passwordGeneratorMainView.hidden = passwordGeneratorHistoryOpen;
  elements.passwordGeneratorHistoryView.hidden = !passwordGeneratorHistoryOpen;
  if (passwordGeneratorHistoryOpen) {
    renderPasswordGeneratorHistory();
    void syncPasswordGeneratorHistoryFromRemote();
  }
}

function renderPasswordGenerator() {
  const mode = passwordGeneratorState.mode;
  elements.passwordGeneratorType.value = mode;
  elements.passwordGeneratorLengthRange.value = String(passwordGeneratorState.randomLength);
  elements.passwordGeneratorLengthNumber.value = String(passwordGeneratorState.randomLength);
  elements.passwordGeneratorPinRange.value = String(passwordGeneratorState.pinLength);
  elements.passwordGeneratorPinNumber.value = String(passwordGeneratorState.pinLength);
  setGeneratorSwitchState(elements.passwordGeneratorNumbersToggle, passwordGeneratorState.randomIncludeNumbers);
  setGeneratorSwitchState(elements.passwordGeneratorSymbolsToggle, passwordGeneratorState.randomIncludeSymbols);
  elements.passwordGeneratorValue.value = passwordGeneratorValue;

  const randomControlsVisible = mode === PASSWORD_GENERATOR_MODES.RANDOM;
  const pinControlsVisible = mode === PASSWORD_GENERATOR_MODES.PIN;
  elements.passwordGeneratorRandomControls.hidden = !randomControlsVisible;
  elements.passwordGeneratorPinControls.hidden = !pinControlsVisible;

  if (mode === PASSWORD_GENERATOR_MODES.PIN) {
    elements.passwordGeneratorHint.textContent = 'PIN code uses digits only and is easy to type on mobile devices.';
  } else if (mode === PASSWORD_GENERATOR_MODES.RANDOM) {
    elements.passwordGeneratorHint.textContent = 'Random password follows your selected character options.';
  } else {
    elements.passwordGeneratorHint.textContent = 'Smart password balances letters, numbers, and symbols.';
  }
}

function closePasswordGeneratorPanel() {
  if (!passwordGeneratorOpen) {
    return;
  }
  passwordGeneratorOpen = false;
  setPasswordGeneratorHistoryOpen(false);
  syncPasswordGeneratorPanelVisibility();
}

function openPasswordGeneratorPanel() {
  if (currentLayoutMode !== 'ready') {
    return;
  }
  passwordGeneratorOpen = true;
  setPasswordGeneratorHistoryOpen(false);
  renderPasswordGenerator();
  setPasswordGeneratorCopyFeedback(false);
  syncPasswordGeneratorPanelVisibility();
}

function togglePasswordGeneratorPanel() {
  if (passwordGeneratorOpen) {
    closePasswordGeneratorPanel();
    return;
  }
  openPasswordGeneratorPanel();
}

function syncPasswordGeneratorPanelVisibility() {
  const showButton = currentLayoutMode === 'ready';
  elements.passwordGeneratorBtn.hidden = !showButton;
  const showPanel = showButton && passwordGeneratorOpen;
  elements.passwordGeneratorBtn.setAttribute('aria-expanded', showPanel ? 'true' : 'false');
  elements.passwordGeneratorPanel.hidden = !showPanel;
}

function updatePasswordGeneratorState(patch, shouldRegenerate = false) {
  const next = {
    ...passwordGeneratorState,
    ...patch,
  };
  passwordGeneratorState = normalizeGeneratorState(next);
  if (shouldRegenerate) {
    regeneratePasswordGeneratorValue();
    setPasswordGeneratorCopyFeedback(false);
  }
  renderPasswordGenerator();
}

function setBusy(nextBusy) {
  inFlight = nextBusy;
  const controls = [
    ['linkPairBtn', elements.linkPairBtn],
    ['unlockBtn', elements.unlockBtn],
    ['unlockRevealBtn', elements.unlockRevealBtn],
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
  if (!nextBusy) {
    if (!elements.readySection.hidden) {
      scheduleReadySearchFocus();
    } else if (shouldKeepUnlockInputFocused()) {
      scheduleUnlockPasswordFocus();
    }
  }
}

function setUnlockPasswordVisibility(revealed) {
  unlockPasswordRevealed = revealed === true;
  elements.unlockPasswordInput.type = unlockPasswordRevealed ? 'text' : 'password';
  elements.unlockRevealBtn.setAttribute('aria-pressed', unlockPasswordRevealed ? 'true' : 'false');
  elements.unlockRevealBtn.setAttribute('title', unlockPasswordRevealed ? 'Hide password' : 'Show password');
  elements.unlockRevealBtn.setAttribute('aria-label', unlockPasswordRevealed ? 'Hide password' : 'Show password');
  const icon = elements.unlockRevealBtn.querySelector('.material-symbols-rounded');
  if (icon) {
    icon.textContent = unlockPasswordRevealed ? 'visibility_off' : 'visibility';
  }
}

function clearUnlockPasswordError() {
  elements.unlockPasswordError.hidden = true;
  elements.unlockPasswordError.textContent = '';
}

function showUnlockPasswordError(message = PASSWORD_RETRY_MESSAGE) {
  elements.unlockPasswordError.textContent = message;
  elements.unlockPasswordError.hidden = false;
  popupAutosizer?.schedule();
}

function isUnlockInvalidPasswordResponse(response) {
  if (!response || typeof response !== 'object') {
    return false;
  }
  const code = typeof response.code === 'string' ? response.code.toLowerCase() : '';
  if (code === 'invalid_credentials') {
    return true;
  }
  const message = typeof response.message === 'string' ? response.message.toLowerCase() : '';
  return (
    message.includes('could not unlock this device with the provided password') ||
    message.includes('check your password and try again') ||
    message.includes("couldn't verify your credentials") ||
    message.includes('couldn’t verify your credentials')
  );
}

function shouldKeepUnlockInputFocused() {
  return !elements.unlockSection.hidden && !elements.unlockPasswordInput.disabled;
}

function focusUnlockPasswordInput() {
  if (!shouldKeepUnlockInputFocused()) {
    return;
  }
  elements.unlockPasswordInput.focus({ preventScroll: true });
  const valueLength = elements.unlockPasswordInput.value.length;
  if (typeof elements.unlockPasswordInput.setSelectionRange === 'function') {
    elements.unlockPasswordInput.setSelectionRange(valueLength, valueLength);
  }
}

function scheduleUnlockPasswordFocus() {
  window.requestAnimationFrame(() => {
    focusUnlockPasswordInput();
  });
  window.setTimeout(() => {
    focusUnlockPasswordInput();
  }, 60);
}

function scheduleReadySearchFocus() {
  if (elements.readySection.hidden || inFlight) {
    return;
  }
  window.requestAnimationFrame(() => {
    if (elements.readySection.hidden || inFlight) {
      return;
    }
    elements.searchInput.focus({ preventScroll: true });
    const valueLength = elements.searchInput.value.length;
    if (typeof elements.searchInput.setSelectionRange === 'function') {
      elements.searchInput.setSelectionRange(valueLength, valueLength);
    }
  });
}

function setAlert(kind, message) {
  void kind;
  void message;
  elements.statusAlert.hidden = true;
  elements.statusAlert.className = 'alert alert--warning';
  elements.statusAlert.textContent = '';
  popupAutosizer?.schedule();
}

function toggleSections(state) {
  const phase = resolveEffectivePopupPhase(state);
  elements.pairingSection.hidden = true;
  elements.unlockSection.hidden = true;
  elements.readySection.hidden = true;
  if (phase !== 'local_unlock_required' && !(phase === 'remote_authentication_required' && state?.hasTrustedState)) {
    clearUnlockPasswordError();
  }

  if (phase === 'remote_authentication_required' && state?.hasTrustedState) {
    elements.unlockSection.hidden = false;
    setUnlockPasswordVisibility(false);
    scheduleUnlockPasswordFocus();
    return;
  }

  if (phase === 'pairing_required' || phase === 'remote_authentication_required') {
    elements.pairingSection.hidden = false;
    return;
  }

  if (phase === 'local_unlock_required') {
    elements.unlockSection.hidden = false;
    setUnlockPasswordVisibility(false);
    scheduleUnlockPasswordFocus();
    return;
  }

  if (phase === 'ready') {
    elements.readySection.hidden = false;
    if (readySearchShouldAutoFocus) {
      scheduleReadySearchFocus();
      readySearchShouldAutoFocus = false;
    }
    return;
  }
}

function isKnownRenderablePhase(phase) {
  return (
    phase === 'pairing_required' ||
    phase === 'remote_authentication_required' ||
    phase === 'local_unlock_required' ||
    phase === 'ready'
  );
}

function resolveEffectivePopupPhase(state) {
  const phase = resolvePopupPhase(state);
  if (phase === 'pairing_required' && state?.hasTrustedState === true && !state?.lastError) {
    return 'local_unlock_required';
  }
  if (phase !== 'reconnecting_background') {
    return phase;
  }
  const fallbackPhase = state?.reconnectFallbackPhase;
  if (fallbackPhase === 'pairing_required' && state?.hasTrustedState === true) {
    return 'local_unlock_required';
  }
  if (isKnownRenderablePhase(fallbackPhase)) {
    return fallbackPhase;
  }
  if (state?.hasTrustedState === true) {
    return 'local_unlock_required';
  }
  return 'pairing_required';
}

function clearTransportReconnectTimer() {
  if (transportReconnectTimer !== null) {
    window.clearTimeout(transportReconnectTimer);
    transportReconnectTimer = null;
  }
}

function scheduleTransportReconnectRetry() {
  clearTransportReconnectTimer();
  transportReconnectTimer = window.setTimeout(() => {
    transportReconnectTimer = null;
    void refreshStateAndMaybeList({
      fetchList: true,
      showLoading: false,
    });
  }, 850);
}

function markStableSnapshotIfEligible(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return;
  }
  if (!shouldPersistPopupStateSnapshot(snapshot)) {
    return;
  }
  const phase = resolvePopupPhase(snapshot);
  if (!isKnownRenderablePhase(phase)) {
    return;
  }
  lastStableStateSnapshot = {
    ...snapshot,
  };
  lastStableStateSnapshotAt = Date.now();
}

function getStableSnapshotForReconnect() {
  if (!lastStableStateSnapshot || Date.now() - lastStableStateSnapshotAt > POPUP_STABLE_SNAPSHOT_CONFIDENCE_MS) {
    return null;
  }
  return {
    ...lastStableStateSnapshot,
  };
}

function buildReconnectingSnapshot(baseState) {
  const source = baseState && typeof baseState === 'object' ? baseState : FALLBACK_PAIRING_STATE;
  const fallbackPhase = resolvePopupPhase(source);
  const normalizedFallbackPhase =
    fallbackPhase === 'pairing_required' && source?.hasTrustedState === true
      ? 'local_unlock_required'
      : fallbackPhase;
  return {
    ...source,
    phase: 'reconnecting_background',
    reconnectFallbackPhase: isKnownRenderablePhase(normalizedFallbackPhase)
      ? normalizedFallbackPhase
      : source?.hasTrustedState
        ? 'local_unlock_required'
        : 'pairing_required',
    lastError: null,
  };
}

function showTransportReconnectState() {
  const stableSnapshot = getStableSnapshotForReconnect();
  const fallbackSnapshot =
    stableSnapshot ??
    buildReconnectingSnapshot(
      currentState && resolvePopupPhase(currentState) !== 'reconnecting_background' ? currentState : null,
    );

  renderState({
    state: buildReconnectingSnapshot(fallbackSnapshot),
    page: {
      url: activePageUrl,
      eligible: activePageEligible,
    },
    items: currentItems,
  });
  scheduleTransportReconnectRetry();
}

async function loadPersistedPopupUiState() {
  if (!chrome.storage?.session) {
    return;
  }

  try {
    const stored = await chrome.storage.session.get(POPUP_UI_STATE_STORAGE_KEY);
    const parsed = parsePersistedPopupUiState(stored?.[POPUP_UI_STATE_STORAGE_KEY]);
    selectedItemId = parsed.selectedItemId;
    shouldPinSelectedRowOnNextRender =
      typeof parsed.selectedItemId === 'string' && parsed.selectedItemId.length > 0;
    elements.searchInput.value = parsed.searchQuery;
    updateSearchClearVisibility();
    activeTypeFilter = parsed.typeFilter;
    suggestedOnly = parsed.suggestedOnly;
    activeSortMode = parsed.sortMode;
    syncSortMenuState();
  } catch {
    // Ignore storage failures and keep ephemeral popup defaults.
  }
}

async function clearPersistedFirstPaintSnapshots() {
  lastReadyListSnapshot = [];
  lastReadyListPageSnapshot = { url: '', eligible: false };
  if (!chrome.storage?.session) {
    return;
  }
  try {
    await chrome.storage.session.remove([POPUP_LAST_STATE_STORAGE_KEY, POPUP_LAST_READY_LIST_STORAGE_KEY]);
  } catch {
    // Ignore cleanup failures.
  }
}

async function loadTrustedIdentitySignatureFromLocal() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_LOCAL_TRUSTED_KEY);
    const trusted = stored?.[STORAGE_LOCAL_TRUSTED_KEY];
    trustedIdentitySignature = resolveTrustedIdentitySignatureFromTrustedRecord(trusted);
    return trusted && typeof trusted === 'object' ? trusted : null;
  } catch {
    trustedIdentitySignature = null;
    return null;
  }
}

function sanitizePersistedPopupState(rawState, expectedTrustedSignature) {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return null;
  }
  const updatedAt = Number(rawState.updatedAt);
  const withinConfidenceWindow =
    Number.isFinite(updatedAt) && Date.now() - updatedAt <= POPUP_STABLE_SNAPSHOT_CONFIDENCE_MS;
  const payloadTrustedSignature = resolveTrustedIdentitySignatureFromPersistedPayload(rawState);
  if (typeof expectedTrustedSignature === 'string' && expectedTrustedSignature.length > 0) {
    if (
      !payloadTrustedSignature ||
      (payloadTrustedSignature !== expectedTrustedSignature &&
        !isTrustedIdentitySoftMatch(payloadTrustedSignature, expectedTrustedSignature))
    ) {
      return null;
    }
  } else if (!payloadTrustedSignature || !withinConfidenceWindow) {
    return null;
  }
  const phase = resolvePopupPhase(rawState);
  if (phase === 'reconnecting_background') {
    return null;
  }
  const hasTrustedState = rawState.hasTrustedState === true;
  if (phase === 'pairing_required' && !hasTrustedState) {
    return null;
  }
  const normalizedPhase = phase === 'pairing_required' && hasTrustedState ? 'local_unlock_required' : phase;
  return {
    phase: normalizedPhase,
    serverOrigin: typeof rawState.serverOrigin === 'string' ? rawState.serverOrigin : null,
    deploymentFingerprint:
      typeof rawState.deploymentFingerprint === 'string' ? rawState.deploymentFingerprint : null,
    userId: typeof rawState.userId === 'string' ? rawState.userId : null,
    username: typeof rawState.username === 'string' ? rawState.username : null,
    deviceId: typeof rawState.deviceId === 'string' ? rawState.deviceId : null,
    deviceName: typeof rawState.deviceName === 'string' ? rawState.deviceName : null,
    sessionExpiresAt: typeof rawState.sessionExpiresAt === 'string' ? rawState.sessionExpiresAt : null,
    unlockIdleTimeoutMs: Number.isFinite(rawState.unlockIdleTimeoutMs)
      ? Number(rawState.unlockIdleTimeoutMs)
      : null,
    lockRevision: Number.isFinite(rawState.lockRevision) ? Number(rawState.lockRevision) : 0,
    lastUnlockedLockRevision: Number.isFinite(rawState.lastUnlockedLockRevision)
      ? Number(rawState.lastUnlockedLockRevision)
      : 0,
    hasTrustedState,
    hasTokenInMemory: rawState.hasTokenInMemory === true,
    lastError: typeof rawState.lastError === 'string' ? rawState.lastError : null,
  };
}

async function loadPersistedPopupStateSnapshot(expectedTrustedSignature) {
  if (!chrome.storage?.session) {
    return null;
  }
  try {
    const stored = await chrome.storage.session.get(POPUP_LAST_STATE_STORAGE_KEY);
    const rawState = stored?.[POPUP_LAST_STATE_STORAGE_KEY] ?? null;
    const parsed = sanitizePersistedPopupState(rawState, expectedTrustedSignature);
    const hasExpectedSignature =
      typeof expectedTrustedSignature === 'string' && expectedTrustedSignature.length > 0;
    if (!parsed && rawState && hasExpectedSignature) {
      await chrome.storage.session.remove(POPUP_LAST_STATE_STORAGE_KEY).catch(() => {});
    }
    return parsed;
  } catch {
    return null;
  }
}

function sanitizePersistedReadyListSnapshot(rawState, expectedTrustedSignature) {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return null;
  }
  const updatedAt = Number(rawState.updatedAt);
  const withinConfidenceWindow =
    Number.isFinite(updatedAt) && Date.now() - updatedAt <= POPUP_STABLE_SNAPSHOT_CONFIDENCE_MS;
  const payloadTrustedSignature = resolveTrustedIdentitySignatureFromPersistedPayload(rawState);
  if (typeof expectedTrustedSignature === 'string' && expectedTrustedSignature.length > 0) {
    if (
      !payloadTrustedSignature ||
      (payloadTrustedSignature !== expectedTrustedSignature &&
        !isTrustedIdentitySoftMatch(payloadTrustedSignature, expectedTrustedSignature))
    ) {
      return null;
    }
  } else if (!payloadTrustedSignature || !withinConfidenceWindow) {
    return null;
  }
  const rawItems = Array.isArray(rawState.items) ? rawState.items : [];
  const items = rawItems
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.itemId === 'string' && entry.itemId.length > 0)
    .slice(0, 400);
  if (items.length === 0) {
    return null;
  }
  return {
    items,
    page: {
      url: typeof rawState.pageUrl === 'string' ? rawState.pageUrl : '',
      eligible: rawState.pageEligible === true,
    },
  };
}

async function loadPersistedReadyListSnapshot(expectedTrustedSignature) {
  if (!chrome.storage?.session) {
    return false;
  }
  try {
    const stored = await chrome.storage.session.get(POPUP_LAST_READY_LIST_STORAGE_KEY);
    const rawState = stored?.[POPUP_LAST_READY_LIST_STORAGE_KEY] ?? null;
    const parsed = sanitizePersistedReadyListSnapshot(rawState, expectedTrustedSignature);
    const hasExpectedSignature =
      typeof expectedTrustedSignature === 'string' && expectedTrustedSignature.length > 0;
    if (!parsed) {
      if (rawState && hasExpectedSignature) {
        await chrome.storage.session.remove(POPUP_LAST_READY_LIST_STORAGE_KEY).catch(() => {});
      }
      lastReadyListSnapshot = [];
      lastReadyListPageSnapshot = { url: '', eligible: false };
      return false;
    }
    lastReadyListSnapshot = parsed.items;
    lastReadyListPageSnapshot = parsed.page;
    return true;
  } catch {
    // Ignore popup list snapshot load failures.
    return false;
  }
}

function persistReadyListSnapshot(items, page, stateSnapshot = currentState) {
  if (!chrome.storage?.session || !Array.isArray(items) || items.length === 0) {
    return;
  }
  const snapshotTrustedSignature = resolveTrustedIdentitySignatureFromState(stateSnapshot);
  if (!snapshotTrustedSignature) {
    return;
  }
  const payload = {
    items: items.slice(0, 400),
    pageUrl: typeof page?.url === 'string' ? page.url : '',
    pageEligible: page?.eligible === true,
    trustedIdentitySignature: snapshotTrustedSignature,
    updatedAt: Date.now(),
  };
  void chrome.storage.session
    .set({
      [POPUP_LAST_READY_LIST_STORAGE_KEY]: payload,
    })
    .catch(() => {});
}

function shouldPersistPopupStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return false;
  }
  const phase = resolvePopupPhase(snapshot);
  if (phase === 'reconnecting_background') {
    return false;
  }
  if (phase === 'pairing_required') {
    return false;
  }
  return true;
}

function persistPopupStateSnapshot(snapshot) {
  if (!chrome.storage?.session || !shouldPersistPopupStateSnapshot(snapshot)) {
    return;
  }
  const snapshotTrustedSignature = resolveTrustedIdentitySignatureFromState(snapshot);
  if (!snapshotTrustedSignature) {
    return;
  }
  const payload = {
    phase: resolvePopupPhase(snapshot),
    serverOrigin: typeof snapshot.serverOrigin === 'string' ? snapshot.serverOrigin : null,
    deploymentFingerprint:
      typeof snapshot.deploymentFingerprint === 'string' ? snapshot.deploymentFingerprint : null,
    userId: typeof snapshot.userId === 'string' ? snapshot.userId : null,
    username: typeof snapshot.username === 'string' ? snapshot.username : null,
    deviceId: typeof snapshot.deviceId === 'string' ? snapshot.deviceId : null,
    deviceName: typeof snapshot.deviceName === 'string' ? snapshot.deviceName : null,
    sessionExpiresAt: typeof snapshot.sessionExpiresAt === 'string' ? snapshot.sessionExpiresAt : null,
    unlockIdleTimeoutMs: Number.isFinite(snapshot.unlockIdleTimeoutMs)
      ? Number(snapshot.unlockIdleTimeoutMs)
      : null,
    lockRevision: Number.isFinite(snapshot.lockRevision) ? Number(snapshot.lockRevision) : 0,
    lastUnlockedLockRevision: Number.isFinite(snapshot.lastUnlockedLockRevision)
      ? Number(snapshot.lastUnlockedLockRevision)
      : 0,
    hasTrustedState: snapshot.hasTrustedState === true,
    hasTokenInMemory: snapshot.hasTokenInMemory === true,
    lastError: typeof snapshot.lastError === 'string' ? snapshot.lastError : null,
    trustedIdentitySignature: snapshotTrustedSignature,
    updatedAt: Date.now(),
  };
  void chrome.storage.session
    .set({
      [POPUP_LAST_STATE_STORAGE_KEY]: payload,
    })
    .catch(() => {});
}

async function buildInitialStateSnapshot(options = {}) {
  const expectedTrustedSignature =
    typeof options.expectedTrustedSignature === 'string' ? options.expectedTrustedSignature : null;
  const persisted = await loadPersistedPopupStateSnapshot(expectedTrustedSignature);
  if (persisted) {
    return persisted;
  }

  const trusted = options.trustedRecord;
  if (trusted && typeof trusted === 'object') {
    return {
      ...FALLBACK_PAIRING_STATE,
      phase: 'local_unlock_required',
      serverOrigin: typeof trusted.serverOrigin === 'string' ? trusted.serverOrigin : null,
      deploymentFingerprint: typeof trusted.deploymentFingerprint === 'string' ? trusted.deploymentFingerprint : null,
      username: typeof trusted.username === 'string' ? trusted.username : null,
      deviceId: typeof trusted.deviceId === 'string' ? trusted.deviceId : null,
      deviceName: typeof trusted.deviceName === 'string' ? trusted.deviceName : null,
      hasTrustedState: true,
    };
  }

  return { ...FALLBACK_PAIRING_STATE };
}

function syncTrustedIdentitySignatureFromState(nextState) {
  const runtimeTrustedSignature = resolveTrustedIdentitySignatureFromState(nextState);
  const hasStoredSignature = typeof trustedIdentitySignature === 'string' && trustedIdentitySignature.length > 0;
  const hasTrustedState = nextState?.hasTrustedState === true;

  if (!hasTrustedState) {
    if (hasStoredSignature) {
      trustedIdentitySignature = null;
      void clearPersistedFirstPaintSnapshots();
    }
    return;
  }

  if (typeof runtimeTrustedSignature !== 'string' || runtimeTrustedSignature.length === 0) {
    // Keep existing signature on transient/incomplete snapshots.
    return;
  }

  if (!hasStoredSignature) {
    trustedIdentitySignature = runtimeTrustedSignature;
    return;
  }

  if (runtimeTrustedSignature !== trustedIdentitySignature) {
    trustedIdentitySignature = runtimeTrustedSignature;
    void clearPersistedFirstPaintSnapshots();
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
    sortMode: activeSortMode,
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

function sortCredentialItems(items) {
  if (!Array.isArray(items) || items.length <= 1) {
    return Array.isArray(items) ? items : [];
  }
  if (activeSortMode === 'title_asc') {
    return [...items].sort((left, right) => {
      const titleCompare = String(left?.title ?? '').localeCompare(String(right?.title ?? ''));
      if (titleCompare !== 0) {
        return titleCompare;
      }
      return String(left?.itemId ?? '').localeCompare(String(right?.itemId ?? ''));
    });
  }
  if (activeSortMode === 'title_desc') {
    return [...items].sort((left, right) => {
      const titleCompare = String(right?.title ?? '').localeCompare(String(left?.title ?? ''));
      if (titleCompare !== 0) {
        return titleCompare;
      }
      return String(left?.itemId ?? '').localeCompare(String(right?.itemId ?? ''));
    });
  }
  return items;
}

function syncSortMenuState() {
  const sortByTitle = activeSortMode === 'title_asc' || activeSortMode === 'title_desc';
  const orderAsc = activeSortMode === 'title_asc';
  const orderDesc = activeSortMode === 'title_desc';
  const selectableSortOptions = Array.from(elements.sortMenu.querySelectorAll('[data-sort-mode]'));
  for (const button of selectableSortOptions) {
    const selected = button.getAttribute('data-sort-mode') === 'title' && sortByTitle;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
  const orderButtons = Array.from(elements.sortMenu.querySelectorAll('[data-sort-order]'));
  for (const button of orderButtons) {
    button.disabled = !sortByTitle;
    const order = button.getAttribute('data-sort-order');
    const selected = (order === 'asc' && orderAsc) || (order === 'desc' && orderDesc);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function closeSortMenu() {
  elements.sortMenu.hidden = true;
  elements.sortMenuButton.setAttribute('aria-expanded', 'false');
}

function openSortMenu() {
  syncSortMenuState();
  elements.sortMenu.hidden = false;
  elements.sortMenuButton.setAttribute('aria-expanded', 'true');
}

function toggleSortMenu() {
  if (elements.sortMenu.hidden) {
    openSortMenu();
  } else {
    closeSortMenu();
  }
}

function applySortMode(mode) {
  activeSortMode = mode;
  syncSortMenuState();
  persistPopupUiState();
  renderCredentialList(currentItems);
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
    return '<span class="row-action-glyph material-symbols-rounded" aria-hidden="true">content_copy</span>';
  }
  if (actionId === 'toggle_password_visibility') {
    return '<span class="row-action-glyph material-symbols-rounded" aria-hidden="true">visibility</span>';
  }
  if (actionId === 'open_url') {
    return '<span class="row-action-glyph material-symbols-rounded" aria-hidden="true">language</span>';
  }
  if (actionId === 'open_item_web') {
    return '<span class="row-action-glyph material-symbols-rounded" aria-hidden="true">open_in_new</span>';
  }
  return '<span class="row-action-glyph material-symbols-rounded" aria-hidden="true">more_horiz</span>';
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
  applyLayoutState(resolveEffectivePopupPhase(currentState));
  const disableActions = !selectedItem || inFlight;

  if (!selectedItem) {
    resetDetailSecretState(null);
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

  ensureDetailSecretStateForItem(selectedItem.itemId);
  const detailModel = buildDetailViewModel(selectedItem, {
    passwordVisible: detailSecretState.passwordVisible,
    passwordValue: detailSecretState.passwordValue,
  });
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
  const offsetFromRowTop = anchorRow ? scrollTop - rowTopWithinList(anchorRow) : 0;
  return {
    scrollTop,
    itemId,
    offsetFromRowTop,
  };
}

function rowTopWithinList(row) {
  const rowRect = row.getBoundingClientRect();
  const containerRect = elements.credentialsList.getBoundingClientRect();
  return elements.credentialsList.scrollTop + (rowRect.top - containerRect.top);
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
      elements.credentialsList.scrollTop = Math.max(0, rowTopWithinList(anchor) + Number(input.offsetFromRowTop ?? 0));
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

function clearWarmupListRefreshTimer() {
  if (warmupListRefreshTimer !== null) {
    window.clearTimeout(warmupListRefreshTimer);
    warmupListRefreshTimer = null;
  }
}

function maybeScheduleWarmupListRefresh(nextState, visibleItemsCount = 0) {
  const phase = resolvePopupPhase(nextState);
  if (phase !== 'ready') {
    clearWarmupListRefreshTimer();
    return;
  }
  const warmupState = nextState?.cacheWarmupState;
  const warmupRunning =
    warmupState === 'running' || warmupState === 'syncing' || warmupState === 'loading_local';
  if (!warmupRunning || visibleItemsCount > 0) {
    clearWarmupListRefreshTimer();
    return;
  }
  if (warmupListRefreshTimer !== null) {
    return;
  }
  warmupListRefreshTimer = window.setTimeout(() => {
    warmupListRefreshTimer = null;
    void refreshStateAndMaybeList({
      showLoading: false,
    });
  }, 450);
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

function schedulePinSelectedRowToTop(itemId) {
  if (typeof itemId !== 'string' || itemId.length === 0) {
    return;
  }
  cancelScheduledListScrollRestore();
  pendingListScrollRestoreFramePrimary = window.requestAnimationFrame(() => {
    pendingListScrollRestoreFramePrimary = null;
    pendingListScrollRestoreFrameSecondary = window.requestAnimationFrame(() => {
      pendingListScrollRestoreFrameSecondary = null;
      const row = Array.from(elements.credentialsList.querySelectorAll('.vault-row[data-item-id]')).find(
        (candidate) => candidate.getAttribute('data-item-id') === itemId,
      );
      if (!(row instanceof HTMLElement)) {
        return;
      }
      row.scrollIntoView({ block: 'start', inline: 'nearest' });
      elements.credentialsList.scrollTop = Math.max(0, rowTopWithinList(row));
    });
  });
}

function patchSelectedRowState() {
  const rows = Array.from(elements.credentialsList.querySelectorAll('.vault-row[data-item-id]'));
  for (const row of rows) {
    const itemId = row.getAttribute('data-item-id');
    const isSelected = typeof itemId === 'string' && itemId.length > 0 && itemId === selectedItemId;
    row.classList.toggle('is-selected', isSelected);
  }
}

function buildVaultLoadingSkeletonMarkup(rows = 7) {
  const count = Number.isFinite(rows) ? Math.max(3, Math.min(12, Math.trunc(rows))) : 7;
  const skeletonRows = Array.from({ length: count }, () => {
    return `
      <article class="vault-skeleton-row" aria-hidden="true">
        <div class="vault-skeleton-avatar"></div>
        <div class="vault-skeleton-lines">
          <div class="vault-skeleton-line is-title"></div>
          <div class="vault-skeleton-line is-subtitle"></div>
        </div>
      </article>
    `;
  }).join('');
  return `<div class="vault-skeleton-list">${skeletonRows}</div>`;
}

function renderCredentialList(items, options = {}) {
  const preserveSelectionOnEmpty = options?.preserveSelectionOnEmpty === true;
  const previousItems = currentItems;
  const previousSelectedItemId = selectedItemId;
  const previousDomSelectedItemId =
    elements.credentialsList.querySelector('.vault-row.is-selected')?.getAttribute('data-item-id') ?? null;
  const previousAnchor = captureListScrollAnchor();
  const nextItemsRaw = Array.isArray(items) ? items : [];
  currentItems = sortCredentialItems(nextItemsRaw);
  const nextSelectedItemId = selectItemIdAfterRefresh(selectedItemId, currentItems);
  if (!(preserveSelectionOnEmpty && currentItems.length === 0 && nextSelectedItemId === null)) {
    selectedItemId = nextSelectedItemId;
  }
  const preserveScroll =
    previousAnchor.scrollTop > 0 &&
    hasSameItemOrder(previousItems, currentItems) &&
    currentItems.length > 0;
  const shouldPinSelectedRowNow =
    shouldPinSelectedRowOnNextRender &&
    typeof selectedItemId === 'string' &&
    selectedItemId.length > 0 &&
    currentItems.some((item) => item?.itemId === selectedItemId);
  if (!shouldPinSelectedRowNow && currentItems.length > 0 && selectedItemId === null) {
    shouldPinSelectedRowOnNextRender = false;
  }

  if (currentItems.length === 0) {
    cancelScheduledListScrollRestore();
    if (!preserveSelectionOnEmpty) {
      selectedItemId = null;
    }
    const warmupRunning =
      currentState?.cacheWarmupState === 'running' ||
      currentState?.cacheWarmupState === 'syncing' ||
      currentState?.cacheWarmupState === 'loading_local';
    if (vaultLoading || warmupRunning) {
      elements.credentialsList.innerHTML = buildVaultLoadingSkeletonMarkup();
      renderCredentialDetails();
      popupAutosizer?.schedule();
      return;
    }

    const warmupFailed =
      (currentState?.cacheWarmupState === 'failed' || currentState?.cacheWarmupState === 'sync_failed') &&
      typeof currentState?.cacheWarmupError === 'string' &&
      currentState.cacheWarmupError.trim().length > 0;
    if (warmupFailed && !listErrorMessage) {
      elements.credentialsList.innerHTML = `
        <div class="empty-state">
          <p>${sanitizeText(currentState.cacheWarmupError)}</p>
          <button type="button" data-empty-action="retry-list">Retry</button>
        </div>
      `;
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
    clearWarmupListRefreshTimer();
    if (previousDomSelectedItemId !== selectedItemId) {
      patchSelectedRowState();
    }
    patchListFavicons(previousItems, currentItems);
    if (shouldPinSelectedRowNow) {
      schedulePinSelectedRowToTop(selectedItemId);
      shouldPinSelectedRowOnNextRender = false;
    } else if (preserveScroll) {
      scheduleStableListScrollRestore(previousAnchor);
    }
    renderCredentialDetails();
    persistPopupUiState();
    popupAutosizer?.schedule();
    return;
  }

  const canPatchSelectionOnly =
    !vaultLoading &&
    !listErrorMessage &&
    previousSelectedItemId !== selectedItemId &&
    hasSameRenderableRows(previousItems, currentItems, {
      pageEligible: activePageEligible,
      fillDisabledReason,
    }) &&
    elements.credentialsList.querySelector('.vault-row[data-item-id]') !== null;
  if (canPatchSelectionOnly) {
    clearWarmupListRefreshTimer();
    patchSelectedRowState();
    if (shouldPinSelectedRowNow) {
      schedulePinSelectedRowToTop(selectedItemId);
      shouldPinSelectedRowOnNextRender = false;
    } else if (preserveScroll) {
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
            <span class="row-action-glyph material-symbols-rounded" aria-hidden="true">language</span>
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
              </div>
            </div>
          </div>
          ${sideAction}
        </article>
      `;
    })
    .join('');

  elements.credentialsList.innerHTML = rows;
  clearWarmupListRefreshTimer();
  if (shouldPinSelectedRowNow) {
    schedulePinSelectedRowToTop(selectedItemId);
    shouldPinSelectedRowOnNextRender = false;
  } else if (preserveScroll) {
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
  syncTrustedIdentitySignatureFromState(currentState);
  const nextPageUrl = typeof payload.page?.url === 'string' ? payload.page.url : '';
  const nextPageEligible = payload.page?.eligible === true;
  if (nextPageUrl !== activePageUrl) {
    activePageUrl = nextPageUrl;
    fillBlockedState = null;
  }
  activePageEligible = nextPageEligible;
  const resolvedPhase = resolvePopupPhase(currentState);
  const effectivePhase = resolveEffectivePopupPhase(currentState);
  if (effectivePhase !== 'ready') {
    readySearchShouldAutoFocus = true;
    clearWarmupListRefreshTimer();
  }
  applyLayoutState(effectivePhase);
  scheduleRefresh();
  elements.deviceNameInput.value = currentState?.deviceName ?? 'VaultLite Extension';
  elements.unlockAccountValue.textContent = currentState?.username ?? 'Unknown account';
  elements.unlockDeviceValue.textContent = `#${currentState?.deviceName ?? 'VaultLite Extension'}`;
  if (document.activeElement !== elements.serverUrlInput) {
    elements.serverUrlInput.value = buildServerUrlSuggestion(currentState?.serverOrigin);
  }
  const reconnectingTransport = resolvedPhase === 'reconnecting_background';
  elements.pairingDescription.textContent = reconnectingTransport
    ? 'Reconnecting extension background...'
    : buildPairingDescription(currentState);
  syncLinkRequestFromState(currentState);
  elements.serverUrlInput.disabled = reconnectingTransport || inFlight;
  elements.deviceNameInput.disabled = reconnectingTransport || inFlight;
  elements.linkPairBtn.disabled = reconnectingTransport || shouldDisableControlWhileBusy('linkPairBtn', inFlight);
  elements.openApprovalBtn.disabled =
    reconnectingTransport || shouldDisableControlWhileBusy('openApprovalBtn', inFlight);
  elements.cancelLinkPairBtn.disabled =
    reconnectingTransport || shouldDisableControlWhileBusy('cancelLinkPairBtn', inFlight);
  elements.linkPairBtn.textContent = activeLinkRequest ? 'Restart trusted-device request' : 'Connect with trusted device';
  toggleSections(currentState);
  renderLinkRequestPanel();

  if (payload.page?.url) {
    if (elements.siteContext) {
      elements.siteContext.textContent = `Site: ${hostFromUrl(payload.page.url)}`;
    }
  } else {
    if (elements.siteContext) {
      elements.siteContext.textContent = 'Site: unavailable';
    }
  }

  if (currentState?.sessionExpiresAt) {
    const expiry = formatTime(currentState.sessionExpiresAt);
    if (elements.siteContext) {
      elements.siteContext.textContent += ` · Session until ${expiry}`;
    }
  }
  if (reconnectingTransport && elements.siteContext) {
    elements.siteContext.textContent += ' · Reconnecting...';
  }

  const shouldShowErrorBanner =
    effectivePhase === 'ready' &&
    Boolean(currentState?.lastError) &&
    currentState?.serverOrigin !== null;
  if (shouldShowErrorBanner) {
    setAlert('warning', currentState.lastError);
  } else {
    const existingWarning = elements.statusAlert.classList.contains('alert--warning');
    if (effectivePhase !== 'ready' && existingWarning) {
      setAlert('warning', '');
    } else if (effectivePhase === 'ready') {
      setAlert('warning', '');
    }
  }

  if (payload.items) {
    renderCredentialList(payload.items);
    if (effectivePhase === 'ready' && Array.isArray(payload.items) && payload.items.length > 0) {
      lastReadyListSnapshot = payload.items.slice(0, 400);
      lastReadyListPageSnapshot = {
        url: typeof payload.page?.url === 'string' ? payload.page.url : activePageUrl,
        eligible: payload.page?.eligible === true,
      };
      persistReadyListSnapshot(lastReadyListSnapshot, lastReadyListPageSnapshot, currentState);
    }
  } else if (effectivePhase !== 'ready') {
    renderCredentialList([], { preserveSelectionOnEmpty: true });
  }
  if (!reconnectingTransport) {
    markStableSnapshotIfEligible(currentState);
    clearTransportReconnectTimer();
    persistPopupStateSnapshot(currentState);
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
  const prefetchedState = options?.prefetchedState ?? null;
  const forceActiveStateRefresh = options?.forceActiveStateRefresh === true;
  if (showLoading) {
    vaultLoading = true;
    detailLoading = Boolean(selectedItemId);
    listErrorMessage = '';
    if (currentItems.length === 0) {
      renderCredentialList(currentItems, { preserveSelectionOnEmpty: true });
    } else {
      renderCredentialDetails();
      popupAutosizer?.schedule();
    }
  }

  let stateResponse;
  let localPage = { url: '', eligible: false };
  const localPagePromise = (async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0] ?? null;
      const activeUrl = typeof activeTab?.url === 'string' ? activeTab.url : '';
      return {
        url: activeUrl,
        eligible: isPageUrlEligibleForFill(activeUrl),
      };
    } catch {
      return { url: '', eligible: false };
    }
  })();
  let preloadedListResponsePromise = null;
  const handleTransportFailure = (error) => {
    const errorKind = typeof error?.kind === 'string' ? error.kind : null;
    const errorCode = typeof error?.code === 'string' ? error.code : null;
    const isTransportFailure =
      errorKind === 'transport_transient' ||
      errorKind === 'transport_terminal' ||
      errorCode === 'background_timeout' ||
      errorCode === 'background_unavailable';
    if (isTransportFailure) {
      showTransportReconnectState();
      return true;
    }
    return false;
  };
  try {
    if (prefetchedState && typeof prefetchedState === 'object') {
      stateResponse = ok({
        state: prefetchedState,
      });
    } else {
      if (fetchList && !forceActiveStateRefresh) {
        localPage = await localPagePromise;
        preloadedListResponsePromise = sendBackgroundCommand({
          type: 'vaultlite.list_credentials',
          query: elements.searchInput.value,
          typeFilter: activeTypeFilter,
          suggestedOnly,
          pageUrl: localPage.url || activePageUrl,
        })
          .then((response) => ({ ok: true, response }))
          .catch((error) => ({ ok: false, error }));
      }
      stateResponse = await sendBackgroundCommand({ type: 'vaultlite.get_state', passive: true });
      if (stateResponse.ok && forceActiveStateRefresh) {
        stateResponse = await sendBackgroundCommand({ type: 'vaultlite.get_state', passive: false });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh extension state.';
    if (!handleTransportFailure(error)) {
      setAlert('danger', message);
    }
    vaultLoading = false;
    detailLoading = false;
    return;
  }
  if (localPage.url === '' && localPage.eligible === false) {
    localPage = await localPagePromise;
  }
  if (!stateResponse.ok) {
    clearWarmupListRefreshTimer();
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
      maybeScheduleWarmupListRefresh(stateResponse.state, currentItems.length);
      return;
    }
    let listResponse;
    if (preloadedListResponsePromise) {
      const preloadedResult = await preloadedListResponsePromise;
      if (!preloadedResult.ok) {
        if (!handleTransportFailure(preloadedResult.error)) {
          const message =
            preloadedResult.error instanceof Error
              ? preloadedResult.error.message
              : 'Could not load vault.';
          setAlert('danger', message);
        }
        vaultLoading = false;
        detailLoading = false;
        return;
      }
      listResponse = preloadedResult.response;
    } else {
      try {
        listResponse = await sendBackgroundCommand({
          type: 'vaultlite.list_credentials',
          query: elements.searchInput.value,
          typeFilter: activeTypeFilter,
          suggestedOnly,
          pageUrl: localPage.url || activePageUrl,
        });
      } catch (error) {
        if (!handleTransportFailure(error)) {
          const message = error instanceof Error ? error.message : 'Could not load vault.';
          setAlert('danger', message);
        }
        vaultLoading = false;
        detailLoading = false;
        return;
      }
    }

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
          maybeScheduleWarmupListRefresh(refreshedStateResponse.state, 0);
        } else {
          renderState({ state: stateResponse.state, page: {}, items: [] });
          setAlert('danger', refreshedStateResponse.message || 'Failed to refresh extension state.');
        }
        return;
      }
      clearWarmupListRefreshTimer();
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
    maybeScheduleWarmupListRefresh(
      stateResponse.state,
      Array.isArray(listResponse.items) ? listResponse.items.length : 0,
    );
    return;
  }

  clearWarmupListRefreshTimer();
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
  clearUnlockPasswordError();
  const password = elements.unlockPasswordInput.value;
  if (!password) {
    elements.unlockPasswordInput.focus();
    return;
  }

  const unlockIcon = elements.unlockBtn.querySelector('.material-symbols-rounded');
  const previousIcon = unlockIcon?.textContent ?? 'arrow_forward';
  elements.unlockBtn.dataset.loading = 'true';
  if (unlockIcon) {
    unlockIcon.textContent = 'progress_activity';
  }
  elements.unlockPasswordInput.disabled = true;
  const response = await sendBackgroundCommand({
    type: 'vaultlite.unlock_local',
    password,
  });

  if (!response.ok) {
    delete elements.unlockBtn.dataset.loading;
    if (unlockIcon) {
      unlockIcon.textContent = previousIcon;
    }
    elements.unlockPasswordInput.disabled = false;
    if (isUnlockInvalidPasswordResponse(response)) {
      showUnlockPasswordError();
    } else {
      setAlert('danger', response.message || 'Unlock failed.');
    }
    elements.unlockPasswordInput.focus({ preventScroll: true });
    if (shouldForceStateRefreshAfterError(response.code)) {
      await refreshStateAndMaybeList();
    }
    return;
  }

  elements.unlockPasswordInput.value = '';
  clearUnlockPasswordError();
  setUnlockPasswordVisibility(false);
  delete elements.unlockBtn.dataset.loading;
  if (unlockIcon) {
    unlockIcon.textContent = previousIcon;
  }
  elements.unlockPasswordInput.disabled = false;
  setAlert('success', 'Extension unlocked.');

  const unlockedState = response.state ?? null;
  if (resolvePopupPhase(unlockedState) === 'ready') {
    if ((!Array.isArray(lastReadyListSnapshot) || lastReadyListSnapshot.length === 0) && trustedIdentitySignature) {
      await loadPersistedReadyListSnapshot(trustedIdentitySignature);
    }
    const hasRenderableItems = Array.isArray(currentItems) && currentItems.length > 0;
    const fallbackItems =
      hasRenderableItems || !Array.isArray(lastReadyListSnapshot) || lastReadyListSnapshot.length === 0
        ? currentItems
        : lastReadyListSnapshot;
    const hasFallbackItems = Array.isArray(fallbackItems) && fallbackItems.length > 0;
    vaultLoading = !hasFallbackItems;
    detailLoading = false;
    listErrorMessage = '';
    renderState({
      state: unlockedState,
      page: {
        url: activePageUrl || lastReadyListPageSnapshot.url || '',
        eligible: activePageEligible || lastReadyListPageSnapshot.eligible === true,
      },
      items: hasFallbackItems ? fallbackItems : [],
    });
    maybeScheduleWarmupListRefresh(unlockedState, hasFallbackItems ? fallbackItems.length : 0);
    void refreshStateAndMaybeList({
      showLoading: false,
      prefetchedState: unlockedState,
    });
    return;
  }
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
  if (action === 'toggle_password_visibility') {
    ensureDetailSecretStateForItem(selected.itemId);
    if (detailSecretState.passwordVisible) {
      detailSecretState.passwordVisible = false;
      renderCredentialDetails();
      return;
    }
    if (!detailSecretState.passwordValue) {
      const response = await sendBackgroundCommand({
        type: 'vaultlite.get_credential_field',
        itemId: selected.itemId,
        field: 'password',
      });
      if (!response.ok) {
        setAlert('danger', response.message || 'Could not fetch credential value.');
        return;
      }
      detailSecretState.passwordValue = typeof response.value === 'string' ? response.value : '';
    }
    detailSecretState.passwordVisible = true;
    renderCredentialDetails();
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
  syncSortMenuState();
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

  elements.sortMenuButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSortMenu();
  });

  elements.sortMenu.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const modeButton = target.closest('[data-sort-mode]');
    if (modeButton instanceof HTMLButtonElement && !modeButton.disabled) {
      const mode = modeButton.getAttribute('data-sort-mode');
      if (mode === 'title') {
        const nextMode = activeSortMode === 'title_desc' ? 'title_desc' : 'title_asc';
        applySortMode(nextMode);
      }
      closeSortMenu();
      return;
    }
    const orderButton = target.closest('[data-sort-order]');
    if (orderButton instanceof HTMLButtonElement && !orderButton.disabled) {
      const order = orderButton.getAttribute('data-sort-order');
      if (order === 'asc') {
        applySortMode('title_asc');
      } else if (order === 'desc') {
        applySortMode('title_desc');
      }
      closeSortMenu();
    }
  });

  elements.linkPairBtn.addEventListener('click', () => {
    void runAction(startLinkPairing);
  });
  elements.unlockBtn.addEventListener('click', () => {
    void runAction(handleUnlock);
  });
  elements.unlockRevealBtn.addEventListener('click', () => {
    setUnlockPasswordVisibility(!unlockPasswordRevealed);
    elements.unlockPasswordInput.focus();
  });
  elements.unlockPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void runAction(handleUnlock);
    }
  });
  elements.unlockPasswordInput.addEventListener('blur', () => {
    window.setTimeout(() => {
      focusUnlockPasswordInput();
    }, 0);
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
  elements.passwordGeneratorBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    togglePasswordGeneratorPanel();
  });
  elements.passwordGeneratorCloseBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closePasswordGeneratorPanel();
  });
  elements.passwordGeneratorCopyBtn.addEventListener('click', () => {
    void (async () => {
      try {
        await pushPasswordGeneratorHistoryEntry(passwordGeneratorValue);
        await copyToClipboard(passwordGeneratorValue);
        setPasswordGeneratorCopyFeedback(true);
      } catch {
        setAlert('warning', 'Could not copy generated password.');
      }
    })();
  });
  elements.passwordGeneratorType.addEventListener('change', () => {
    updatePasswordGeneratorState({ mode: elements.passwordGeneratorType.value }, true);
  });
  elements.passwordGeneratorLengthRange.addEventListener('input', () => {
    updatePasswordGeneratorState({ randomLength: elements.passwordGeneratorLengthRange.value }, true);
  });
  elements.passwordGeneratorLengthNumber.addEventListener('change', () => {
    updatePasswordGeneratorState({ randomLength: elements.passwordGeneratorLengthNumber.value }, true);
  });
  elements.passwordGeneratorNumbersToggle.addEventListener('click', () => {
    const nextValue = !(passwordGeneratorState.randomIncludeNumbers === true);
    updatePasswordGeneratorState({ randomIncludeNumbers: nextValue }, true);
  });
  elements.passwordGeneratorSymbolsToggle.addEventListener('click', () => {
    const nextValue = !(passwordGeneratorState.randomIncludeSymbols === true);
    updatePasswordGeneratorState({ randomIncludeSymbols: nextValue }, true);
  });
  elements.passwordGeneratorPinRange.addEventListener('input', () => {
    updatePasswordGeneratorState({ pinLength: elements.passwordGeneratorPinRange.value }, true);
  });
  elements.passwordGeneratorPinNumber.addEventListener('change', () => {
    updatePasswordGeneratorState({ pinLength: elements.passwordGeneratorPinNumber.value }, true);
  });
  elements.passwordGeneratorRefreshBtn.addEventListener('click', () => {
    void (async () => {
      regeneratePasswordGeneratorValue();
      await pushPasswordGeneratorHistoryEntry(passwordGeneratorValue);
      setPasswordGeneratorCopyFeedback(false);
      renderPasswordGenerator();
    })();
  });
  elements.passwordGeneratorHistoryBtn.addEventListener('click', () => {
    setPasswordGeneratorHistoryOpen(true);
  });
  elements.passwordGeneratorHistoryBackBtn.addEventListener('click', () => {
    setPasswordGeneratorHistoryOpen(false);
  });
  elements.passwordGeneratorHistorySearchInput.addEventListener('input', () => {
    if (passwordGeneratorHistoryOpen) {
      renderPasswordGeneratorHistory();
    }
  });
  elements.passwordGeneratorHistoryList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const actionButton = target.closest('[data-history-action]');
    if (!(actionButton instanceof HTMLElement)) {
      return;
    }
    const action = actionButton.getAttribute('data-history-action');
    const entryId = actionButton.getAttribute('data-history-entry-id');
    if (!action || !entryId) {
      return;
    }
    const entry = passwordGeneratorHistory.find((candidate) => candidate.id === entryId);
    if (!entry) {
      return;
    }
    if (action === 'toggle-visibility') {
      if (passwordGeneratorVisibleHistoryIds.has(entryId)) {
        passwordGeneratorVisibleHistoryIds.delete(entryId);
      } else {
        passwordGeneratorVisibleHistoryIds.add(entryId);
      }
      renderPasswordGeneratorHistory();
      return;
    }
    if (action === 'copy') {
      void (async () => {
        try {
          await copyToClipboard(entry.password);
        } catch {
          setAlert('warning', 'Could not copy generated password.');
        }
      })();
    }
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

  window.addEventListener('focus', () => {
    if (resolveEffectivePopupPhase(currentState) === 'ready' && !inFlight) {
      scheduleReadySearchFocus();
    }
  });

  document.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (shouldKeepUnlockInputFocused()) {
      const clickedInput =
        target === elements.unlockPasswordInput ||
        (target instanceof Element && target.closest('#unlockPasswordInput') !== null);
      if (!clickedInput) {
        window.setTimeout(() => {
          focusUnlockPasswordInput();
        }, 0);
      }
    }
    if (!elements.passwordGeneratorPanel.hidden) {
      const insideGeneratorPanel = elements.passwordGeneratorPanel.contains(target);
      const insideGeneratorButton = elements.passwordGeneratorBtn.contains(target);
      if (!insideGeneratorPanel && !insideGeneratorButton) {
        closePasswordGeneratorPanel();
      }
    }
    if (!elements.detailMenuPopover.hidden) {
      const insideMenu = elements.detailMenuPopover.contains(target);
      const insideButton = elements.detailActionMenu.contains(target);
      if (!insideMenu && !insideButton) {
        closeDetailMenu();
      }
    }
    if (!elements.sortMenu.hidden) {
      const insideSortMenu = elements.sortMenu.contains(target);
      const insideSortButton = elements.sortMenuButton.contains(target);
      if (!insideSortMenu && !insideSortButton) {
        closeSortMenu();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePasswordGeneratorPanel();
      closeDetailMenu();
      filterDropdown?.close();
      closeSortMenu();
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
  const nextIntervalMs = (() => {
    const phase = resolvePopupPhase(currentState);
    const effectivePhase = resolveEffectivePopupPhase(currentState);
    if (phase === 'reconnecting_background') {
      return 1_200;
    }
    if (effectivePhase === 'local_unlock_required') {
      return 1_500;
    }
    if (effectivePhase === 'remote_authentication_required' && currentState?.hasTrustedState) {
      return 1_500;
    }
    if (effectivePhase === 'ready') {
      return 12_000;
    }
    return 20_000;
  })();
  if (refreshTimer !== null && refreshIntervalMs === nextIntervalMs) {
    return;
  }
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
  }
  refreshIntervalMs = nextIntervalMs;
  refreshTimer = window.setInterval(() => {
    void refreshStateAndMaybeList({
      fetchList: false,
      showLoading: false,
    });
  }, refreshIntervalMs);
}

wireEvents();
setUnlockPasswordVisibility(false);
popupAutosizer = createPopupAutosizer({
  shell: document.querySelector('.popup-shell'),
  body: document.body,
  preservedScrollNode: elements.credentialsList,
  maxHeight: 600,
});
void (async () => {
  await loadPersistedPopupUiState();
  const trustedRecord = await loadTrustedIdentitySignatureFromLocal();
  await loadPersistedReadyListSnapshot(trustedIdentitySignature);
  popupUiStateHydrated = true;
  const initialState = await buildInitialStateSnapshot({
    expectedTrustedSignature: trustedIdentitySignature,
    trustedRecord,
  });
  const initialPhase = resolvePopupPhase(initialState);
  const startupState =
    initialState?.hasTrustedState === true && initialPhase === 'pairing_required'
      ? buildReconnectingSnapshot(initialState)
      : initialState;
  const startupItems =
    resolvePopupPhase(startupState) === 'ready' && Array.isArray(lastReadyListSnapshot) && lastReadyListSnapshot.length > 0
      ? lastReadyListSnapshot
      : [];
  const startupPage =
    startupItems.length > 0
      ? {
          url: lastReadyListPageSnapshot.url,
          eligible: lastReadyListPageSnapshot.eligible === true,
        }
      : {};
  renderState({
    state: startupState,
    page: startupPage,
    items: startupItems,
  });
  await loadPasswordGeneratorHistory();
  await refreshStateAndMaybeList();
  scheduleRefresh();
})();
