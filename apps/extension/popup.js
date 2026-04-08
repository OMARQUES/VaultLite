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
import {
  canonicalizeServerUrl,
  isPageUrlEligibleForFill,
  POPUP_LAST_READY_LIST_STORAGE_KEY,
  POPUP_LAST_STATE_STORAGE_KEY,
  STORAGE_LOCAL_TRUSTED_KEY,
} from './runtime-common.js';
import { describeFillResult, shouldDisableControlWhileBusy } from './popup-behavior.js';
import {
  buildPersistedPopupUiState,
  buildCredentialMonogram,
  filterPopupItemsLocally,
  hasSameItemOrder,
  hasSameRenderableRows,
  parsePersistedPopupUiState,
  resolveRowQuickAction,
  resolvePopupPhase,
  shouldPreserveVisibleListDuringWarmup,
  shouldRenderVaultSkeleton,
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
import { resolveAttachmentSectionState, resolveFolderSectionState } from './popup-detail-sections.js';
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
  detailMainSections: byId('detailMainSections'),
  detailPrimaryLabel: byId('detailPrimaryLabel'),
  detailPrimaryValue: byId('detailPrimaryValue'),
  detailSecondaryLabel: byId('detailSecondaryLabel'),
  detailSecondaryValue: byId('detailSecondaryValue'),
  detailTertiaryLabel: byId('detailTertiaryLabel'),
  detailTertiaryValue: byId('detailTertiaryValue'),
  detailNotesRow: byId('detailNotesRow'),
  detailNotesLabel: byId('detailNotesLabel'),
  detailNotesValue: byId('detailNotesValue'),
  detailNotesEditor: byId('detailNotesEditor'),
  detailNotesActionA: byId('detailNotesActionA'),
  detailCustomFieldsSection: byId('detailCustomFieldsSection'),
  detailCustomFieldsTitle: byId('detailCustomFieldsTitle'),
  detailCustomFieldsList: byId('detailCustomFieldsList'),
  detailCustomFieldAddBtn: byId('detailCustomFieldAddBtn'),
  detailFolderSection: byId('detailFolderSection'),
  detailFolderValue: byId('detailFolderValue'),
  detailFolderSelect: byId('detailFolderSelect'),
  detailFolderCreateBtn: byId('detailFolderCreateBtn'),
  detailAttachmentsSection: byId('detailAttachmentsSection'),
  detailAttachmentList: byId('detailAttachmentList'),
  detailAttachmentAddBtn: byId('detailAttachmentAddBtn'),
  detailAttachmentInput: byId('detailAttachmentInput'),
  detailHistorySummarySection: byId('detailHistorySummarySection'),
  detailHistorySummaryToggle: byId('detailHistorySummaryToggle'),
  detailHistorySummaryChevron: byId('detailHistorySummaryChevron'),
  detailHistorySummaryTitle: byId('detailHistorySummaryTitle'),
  detailHistorySummaryBody: byId('detailHistorySummaryBody'),
  detailHistoryNavTitle: byId('detailHistoryNavTitle'),
  detailHistoryNavBackBtn: byId('detailHistoryNavBackBtn'),
  detailHistoryNavCloseBtn: byId('detailHistoryNavCloseBtn'),
  detailActionPrimary: byId('detailActionPrimary'),
  detailActionMenu: byId('detailActionMenu'),
  detailMenuPopover: byId('detailMenuPopover'),
  detailActionEdit: byId('detailActionEdit'),
  detailActionHistory: byId('detailActionHistory'),
  detailActionDelete: byId('detailActionDelete'),
  detailPrimaryRow: byId('detailPrimaryRow'),
  detailPrimaryActionA: byId('detailPrimaryActionA'),
  detailPrimaryActionB: byId('detailPrimaryActionB'),
  detailSecondaryRow: byId('detailSecondaryRow'),
  detailSecondaryActionA: byId('detailSecondaryActionA'),
  detailSecondaryActionB: byId('detailSecondaryActionB'),
  detailTertiaryRow: byId('detailTertiaryRow'),
  detailTertiaryActionA: byId('detailTertiaryActionA'),
  detailTertiaryActionB: byId('detailTertiaryActionB'),
  detailEditCancelBtn: byId('detailEditCancelBtn'),
  detailEditSaveBtn: byId('detailEditSaveBtn'),
  detailEditError: byId('detailEditError'),
  detailHistoryPanel: byId('detailHistoryPanel'),
  detailHistoryListView: byId('detailHistoryListView'),
  detailHistoryEntryView: byId('detailHistoryEntryView'),
  detailHistoryList: byId('detailHistoryList'),
  detailHistoryEntryDetail: byId('detailHistoryEntryDetail'),
  detailHistoryEmpty: byId('detailHistoryEmpty'),
  confirmDeleteModal: byId('confirmDeleteModal'),
  confirmDeleteTitle: byId('confirmDeleteTitle'),
  confirmDeleteBody: byId('confirmDeleteBody'),
  confirmDeleteConfirmBtn: byId('confirmDeleteConfirmBtn'),
  confirmDeleteCancelBtn: byId('confirmDeleteCancelBtn'),
  createFolderModal: byId('createFolderModal'),
  createFolderNameInput: byId('createFolderNameInput'),
  createFolderError: byId('createFolderError'),
  createFolderConfirmBtn: byId('createFolderConfirmBtn'),
  createFolderCancelBtn: byId('createFolderCancelBtn'),
  copyToast: byId('copyToast'),
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
let pendingFillItemId = null;
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
let localSearchBaseItems = [];
let localSearchBaseScopeKey = '';
let refreshIntervalMs = 20_000;
let transportReconnectTimer = null;
let lastStableStateSnapshot = null;
let lastStableStateSnapshotAt = 0;
let readySearchShouldAutoFocus = true;
let detailPanelMode = 'view';
let detailEditDraft = null;
let detailCreateDraft = null;
let detailCreateFolderId = '';
let detailCreatePendingAttachments = [];
let detailEditFolderId = '';
let detailEditPendingAttachments = [];
let detailEditPasswordVisible = false;
let detailAttachmentLoading = false;
let detailAttachmentError = '';
let detailAttachmentItemId = null;
let detailAttachmentRecords = [];
let detailHistoryLoading = false;
let detailHistoryError = '';
let detailHistoryCursor = null;
let detailHistoryRecords = [];
let detailHistoryItemId = null;
let detailHistorySelectedId = null;
let detailHistoryView = 'list';
let detailHistorySummaryExpanded = false;
const detailHistoryRevealKeys = new Set();
let detailDeleteConfirmResolver = null;
let detailCreateFolderResolver = null;
let copyToastTimer = null;
let passwordGeneratorOpen = false;
let passwordGeneratorState = createDefaultGeneratorState();
let passwordGeneratorValue = generatePassword(passwordGeneratorState);
let passwordGeneratorCopyFeedbackTimer = null;
let folderStateSnapshot = {
  folders: [],
  assignments: [],
  etag: null,
};
let passwordGeneratorHistoryOpen = false;
let passwordGeneratorHistory = [];
let passwordGeneratorHistoryLastSyncedAt = 0;
let passwordGeneratorHistorySyncInFlight = null;
const passwordGeneratorVisibleHistoryIds = new Set();
let realtimeRefreshDebounceTimer = null;
const pendingRealtimeDomains = new Set();
let trustedIdentitySignature = null;
const detailSecretState = {
  itemId: null,
  passwordVisible: false,
  passwordValue: '',
};
const POPUP_UI_STATE_STORAGE_KEY = 'vaultlite.popup.ui.v1';
const POPUP_STABLE_SNAPSHOT_CONFIDENCE_MS = 2 * 60 * 1000;
const PASSWORD_GENERATOR_HISTORY_STORAGE_KEY = 'vaultlite.popup.password.generator.history.v1';
const PASSWORD_GENERATOR_HISTORY_SYNCED_AT_STORAGE_KEY = 'vaultlite.popup.password.generator.history.synced_at.v1';
const PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES = 80;
const PASSWORD_GENERATOR_HISTORY_SYNC_COOLDOWN_MS = 90 * 1000;
const BACKGROUND_REALTIME_UPDATE_MESSAGE_TYPE = 'vaultlite.background.realtime_update';
const REALTIME_POPUP_REFRESH_DEBOUNCE_MS = 250;
const REALTIME_POPUP_SIGNAL_STORAGE_KEY = 'vaultlite.realtime.popup.signal.v1';
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

function supportsPopupEditing(itemType) {
  return itemType === 'login' || itemType === 'card' || itemType === 'document' || itemType === 'secure_note';
}

function cloneCustomFieldsForEdit(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields
    .map((entry) => ({
      label: typeof entry?.label === 'string' ? entry.label : '',
      value: typeof entry?.value === 'string' ? entry.value : '',
    }))
    .filter((entry) => entry.label || entry.value);
}

function createEditDraftFromSelected(selected) {
  const payload = selected?.payload && typeof selected.payload === 'object' ? selected.payload : null;
  if (!selected || !payload || !supportsPopupEditing(selected.itemType)) {
    return null;
  }
  if (selected.itemType === 'login') {
    return {
      itemType: 'login',
      title: typeof payload.title === 'string' ? payload.title : selected.title ?? '',
      username: typeof payload.username === 'string' ? payload.username : '',
      password: typeof payload.password === 'string' ? payload.password : '',
      urls: Array.isArray(payload.urls) ? payload.urls.filter((entry) => typeof entry === 'string') : [],
      notes: typeof payload.notes === 'string' ? payload.notes : '',
      customFields: cloneCustomFieldsForEdit(payload.customFields),
    };
  }
  if (selected.itemType === 'card') {
    return {
      itemType: 'card',
      title: typeof payload.title === 'string' ? payload.title : selected.title ?? '',
      cardholderName: typeof payload.cardholderName === 'string' ? payload.cardholderName : '',
      brand: typeof payload.brand === 'string' ? payload.brand : '',
      number: typeof payload.number === 'string' ? payload.number : '',
      expiryMonth: typeof payload.expiryMonth === 'string' ? payload.expiryMonth : '',
      expiryYear: typeof payload.expiryYear === 'string' ? payload.expiryYear : '',
      securityCode: typeof payload.securityCode === 'string' ? payload.securityCode : '',
      notes: typeof payload.notes === 'string' ? payload.notes : '',
      customFields: cloneCustomFieldsForEdit(payload.customFields),
    };
  }
  if (selected.itemType === 'document') {
    return {
      itemType: 'document',
      title: typeof payload.title === 'string' ? payload.title : selected.title ?? '',
      content: typeof payload.content === 'string' ? payload.content : '',
      customFields: cloneCustomFieldsForEdit(payload.customFields),
    };
  }
  return {
    itemType: 'secure_note',
    title: typeof payload.title === 'string' ? payload.title : selected.title ?? '',
    content: typeof payload.content === 'string' ? payload.content : '',
    customFields: cloneCustomFieldsForEdit(payload.customFields),
  };
}

function createDraftForItemType(itemType = 'login') {
  if (itemType === 'card') {
    return {
      itemType: 'card',
      title: '',
      cardholderName: '',
      brand: '',
      number: '',
      expiryMonth: '',
      expiryYear: '',
      securityCode: '',
      notes: '',
      customFields: [],
    };
  }
  if (itemType === 'document') {
    return {
      itemType: 'document',
      title: '',
      content: '',
      customFields: [],
    };
  }
  if (itemType === 'secure_note') {
    return {
      itemType: 'secure_note',
      title: '',
      content: '',
      customFields: [],
    };
  }
  return {
    itemType: 'login',
    title: '',
    username: '',
    password: '',
    urls: [],
    notes: '',
    customFields: [],
  };
}

function buildCreateDraftItem() {
  if (!detailCreateDraft || !supportsPopupEditing(detailCreateDraft.itemType)) {
    return null;
  }
  return normalizePopupItemFromPayload(
    {
      itemId: '__draft__',
      itemType: detailCreateDraft.itemType,
      title: detailCreateDraft.title || 'New item',
      subtitle: 'Draft',
      searchText: detailCreateDraft.title || '',
      firstUrl:
        detailCreateDraft.itemType === 'login' && Array.isArray(detailCreateDraft.urls)
          ? detailCreateDraft.urls[0] ?? ''
          : '',
      urlHostSummary: 'Draft',
      matchFlags: {
        exactOrigin: false,
        domainScore: 0,
      },
      isDeleted: false,
    },
    detailCreateDraft,
    0,
  );
}

function getActiveDetailDraft() {
  if (detailPanelMode === 'edit') {
    return detailEditDraft;
  }
  if (detailPanelMode === 'create') {
    return detailCreateDraft;
  }
  return null;
}

function activeDetailFolderId() {
  if (detailPanelMode === 'edit') {
    return detailEditFolderId;
  }
  if (detailPanelMode === 'create') {
    return detailCreateFolderId;
  }
  return '';
}

function setActiveDetailFolderId(folderId) {
  if (detailPanelMode === 'edit') {
    detailEditFolderId = folderId;
    persistPopupUiState();
    return;
  }
  if (detailPanelMode === 'create') {
    detailCreateFolderId = folderId;
    persistPopupUiState();
  }
}

function activePendingAttachments() {
  if (detailPanelMode === 'edit') {
    return detailEditPendingAttachments;
  }
  if (detailPanelMode === 'create') {
    return detailCreatePendingAttachments;
  }
  return [];
}

function setActivePendingAttachments(entries) {
  if (detailPanelMode === 'edit') {
    detailEditPendingAttachments = entries;
    persistPopupUiState();
    return;
  }
  if (detailPanelMode === 'create') {
    detailCreatePendingAttachments = entries;
    persistPopupUiState();
  }
}

function getActiveDetailItem() {
  if (detailPanelMode === 'create') {
    return buildCreateDraftItem();
  }
  return getSelectedCredential();
}

function isEditorMode() {
  return detailPanelMode === 'edit' || detailPanelMode === 'create';
}

function formatAttachmentSize(bytes) {
  const size = Number.isFinite(Number(bytes)) ? Number(bytes) : 0;
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function queueDetailAttachmentFile(file) {
  const nextEntries = [
    ...activePendingAttachments(),
    {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`,
      file,
      fileName: file.name || 'Attachment',
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    },
  ];
  setActivePendingAttachments(nextEntries);
}

async function refreshDetailAttachments(options = {}) {
  const selected = getSelectedCredential();
  if (!selected || detailPanelMode === 'create') {
    detailAttachmentItemId = null;
    detailAttachmentRecords = [];
    detailAttachmentLoading = false;
    detailAttachmentError = '';
    return;
  }
  const itemId = selected.itemId;
  detailAttachmentItemId = itemId;
  detailAttachmentLoading = options.silent !== true;
  detailAttachmentError = '';
  renderDetailPanels();
  const response = await sendBackgroundCommand({
    type: 'vaultlite.list_item_attachments',
    itemId,
    force: options.force === true,
    awaitCompletion: options.awaitCompletion !== false,
  });
  if (detailAttachmentItemId !== itemId) {
    return;
  }
  if (!response?.ok) {
    detailAttachmentError = response?.message || 'Attachments are unavailable right now.';
    detailAttachmentLoading = false;
    renderDetailPanels();
    return;
  }
  detailAttachmentRecords = Array.isArray(response.uploads) ? response.uploads : [];
  detailAttachmentLoading = false;
  renderDetailPanels();
}

function escapeAttribute(value) {
  return sanitizeText(String(value ?? ''));
}

function normalizeInlineEditableText(node) {
  if (!(node instanceof HTMLElement)) {
    return '';
  }
  return (node.textContent || '').replace(/\s+/g, ' ').trim();
}

function historyChangeTypeLabel(changeType) {
  if (changeType === 'create') {
    return 'Created';
  }
  if (changeType === 'delete') {
    return 'Deleted';
  }
  if (changeType === 'restore') {
    return 'Restored';
  }
  return 'Updated';
}

function normalizeHistoryDiffLabel(path) {
  if (typeof path !== 'string' || path.trim().length === 0) {
    return 'Field';
  }
  if (path.startsWith('customFields')) {
    return 'Custom field';
  }
  if (path === 'urls') {
    return 'URLs';
  }
  if (path === 'securityCode') {
    return 'Security code';
  }
  if (path === 'expiryMonth') {
    return 'Expiry month';
  }
  if (path === 'expiryYear') {
    return 'Expiry year';
  }
  if (path === 'cardholderName') {
    return 'Cardholder name';
  }
  return path.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

function parseHistoryValueByField(fieldPath, rawValue) {
  if (typeof rawValue !== 'string' || rawValue.length === 0) {
    return '';
  }
  if (fieldPath === 'urls') {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry) => typeof entry === 'string').join('\n');
      }
    } catch {
      // keep raw when payload is not JSON array.
    }
  }
  return rawValue;
}

function parseCustomFieldsHistoryValue(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => ({
        label: typeof entry?.label === 'string' ? entry.label.trim() : '',
        value: typeof entry?.value === 'string' ? entry.value : '',
      }))
      .filter((entry) => entry.label.length > 0 || entry.value.length > 0);
  } catch {
    return [];
  }
}

function buildHistoryDiffValueHtml(fieldPath, rawValue, visible) {
  if (!visible) {
    return `<p class="detail-value">••••••</p>`;
  }

  if (fieldPath === 'customFields') {
    const customFields = parseCustomFieldsHistoryValue(rawValue);
    if (!customFields.length) {
      return `<p class="detail-history-empty-value">—</p>`;
    }
    return customFields
      .map(
        (entry) => `
          <div class="detail-history-value-row">
            <p class="detail-label">${sanitizeText(entry.label || 'Field')}</p>
            <p class="detail-value">${sanitizeText(entry.value || '—')}</p>
          </div>
        `,
      )
      .join('');
  }

  if (fieldPath === 'urls') {
    const parsedValue = parseHistoryValueByField(fieldPath, rawValue);
    if (typeof parsedValue !== 'string' || parsedValue.trim().length === 0) {
      return `<p class="detail-history-empty-value">—</p>`;
    }
    return parsedValue
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map(
        (line) => `
          <div class="detail-history-value-row">
            <p class="detail-value">${sanitizeText(line)}</p>
          </div>
        `,
      )
      .join('');
  }

  const parsedValue = parseHistoryValueByField(fieldPath, rawValue);
  const normalized = typeof parsedValue === 'string' ? parsedValue : '';
  if (normalized.trim().length === 0) {
    return `<p class="detail-history-empty-value">—</p>`;
  }
  return `<p class="detail-value">${sanitizeText(normalized)}</p>`;
}

function summarizeHistoryRecord(record) {
  const entries = Array.isArray(record?.diffEntries) ? record.diffEntries : [];
  if (!entries.length) {
    if (record?.changeType === 'create') {
      return 'Item created';
    }
    if (record?.changeType === 'delete') {
      return 'Item moved to trash';
    }
    if (record?.changeType === 'restore') {
      return 'Item restored';
    }
    return 'Updated';
  }
  const labels = [];
  for (const entry of entries) {
    const normalized = normalizeHistoryDiffLabel(entry?.fieldPath ?? '');
    if (!labels.includes(normalized)) {
      labels.push(normalized);
    }
  }
  const shown = labels.slice(0, 3);
  const suffix = labels.length > shown.length ? ` +${labels.length - shown.length}` : '';
  return `Changed: ${shown.join(', ')}${suffix}`;
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
  const expanded = shouldUseExpandedPopup(currentLayoutMode, selectedItemId, detailPanelMode);
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
    ['detailHistoryNavBackBtn', elements.detailHistoryNavBackBtn],
    ['detailHistoryNavCloseBtn', elements.detailHistoryNavCloseBtn],
    ['detailActionEdit', elements.detailActionEdit],
    ['detailActionHistory', elements.detailActionHistory],
    ['detailActionDelete', elements.detailActionDelete],
    ['confirmDeleteConfirmBtn', elements.confirmDeleteConfirmBtn],
    ['confirmDeleteCancelBtn', elements.confirmDeleteCancelBtn],
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
    if (resolveEffectivePopupPhase(currentState) === 'ready') {
      renderCredentialDetails();
    }
    if (!elements.readySection.hidden) {
      scheduleReadySearchFocus();
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
  const normalizedKind =
    kind === 'success' || kind === 'danger' || kind === 'warning' ? kind : 'warning';
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  elements.statusAlert.hidden = normalizedMessage.length === 0;
  elements.statusAlert.className = `alert alert--${normalizedKind}`;
  elements.statusAlert.textContent = normalizedMessage;
  popupAutosizer?.schedule();
}

function toggleSections(state) {
  const phase = resolveEffectivePopupPhase(state);
  const unlockWasVisible = !elements.unlockSection.hidden;
  const shouldShowUnlock =
    phase === 'local_unlock_required' ||
    (phase === 'remote_authentication_required' && state?.hasTrustedState);
  const shouldShowPairing =
    phase === 'pairing_required' || (phase === 'remote_authentication_required' && !state?.hasTrustedState);
  const shouldShowReady = phase === 'ready';
  if (elements.pairingSection.hidden === shouldShowPairing) {
    elements.pairingSection.hidden = !shouldShowPairing;
  }
  if (elements.unlockSection.hidden === shouldShowUnlock) {
    elements.unlockSection.hidden = !shouldShowUnlock;
  }
  if (elements.readySection.hidden === shouldShowReady) {
    elements.readySection.hidden = !shouldShowReady;
  }
  if (phase !== 'local_unlock_required' && !(phase === 'remote_authentication_required' && state?.hasTrustedState)) {
    clearUnlockPasswordError();
  }

  if (phase === 'remote_authentication_required' && state?.hasTrustedState) {
    if (!unlockWasVisible) {
      setUnlockPasswordVisibility(false);
      scheduleUnlockPasswordFocus();
    }
    return;
  }

  if (phase === 'pairing_required' || phase === 'remote_authentication_required') {
    return;
  }

  if (phase === 'local_unlock_required') {
    if (!unlockWasVisible) {
      setUnlockPasswordVisibility(false);
      scheduleUnlockPasswordFocus();
    }
    return;
  }

  if (phase === 'ready') {
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
  if (phase !== 'reconnecting_background') {
    return phase;
  }
  const fallbackPhase = state?.reconnectFallbackPhase;
  if (isKnownRenderablePhase(fallbackPhase)) {
    return fallbackPhase;
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
  return {
    ...source,
    phase: 'reconnecting_background',
    reconnectFallbackPhase: isKnownRenderablePhase(fallbackPhase) ? fallbackPhase : 'pairing_required',
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
    detailPanelMode = parsed.detailPanelMode;
    detailCreateDraft = parsed.detailPanelMode === 'create' ? parsed.detailDraft : null;
    detailEditDraft = parsed.detailPanelMode === 'edit' ? parsed.detailDraft : null;
    detailCreateFolderId = parsed.detailPanelMode === 'create' ? parsed.detailFolderId : '';
    detailEditFolderId = parsed.detailPanelMode === 'edit' ? parsed.detailFolderId : '';
    if (parsed.detailPanelMode === 'edit' && parsed.detailTargetItemId) {
      selectedItemId = parsed.detailTargetItemId;
      shouldPinSelectedRowOnNextRender = true;
    }
    syncSortMenuState();
  } catch {
    // Ignore storage failures and keep ephemeral popup defaults.
  }
}

async function clearPersistedFirstPaintSnapshots() {
  lastReadyListSnapshot = [];
  lastReadyListPageSnapshot = { url: '', eligible: false };
  setLocalSearchBaseItems([]);
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

function sanitizePersistedPopupState(rawState, expectedTrustedSignature, expectedServerOrigin = null) {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return null;
  }
  const hasExpectedTrustedSignature =
    typeof expectedTrustedSignature === 'string' && expectedTrustedSignature.length > 0;
  if (!hasExpectedTrustedSignature) {
    return null;
  }
  const updatedAt = Number(rawState.updatedAt);
  const withinConfidenceWindow =
    Number.isFinite(updatedAt) && Date.now() - updatedAt <= POPUP_STABLE_SNAPSHOT_CONFIDENCE_MS;
  const payloadTrustedSignature = resolveTrustedIdentitySignatureFromPersistedPayload(rawState);
  if (
    !payloadTrustedSignature ||
    (payloadTrustedSignature !== expectedTrustedSignature &&
      !isTrustedIdentitySoftMatch(payloadTrustedSignature, expectedTrustedSignature))
  ) {
    return null;
  }
  const payloadServerOrigin =
    typeof rawState.serverOrigin === 'string' && rawState.serverOrigin.trim().length > 0
      ? rawState.serverOrigin.trim()
      : null;
  if (
    expectedServerOrigin &&
    payloadServerOrigin &&
    payloadServerOrigin !== expectedServerOrigin.trim()
  ) {
    return null;
  }
  if (!withinConfidenceWindow) {
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
  return {
    phase,
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

async function loadPersistedPopupStateSnapshot(expectedTrustedSignature, expectedServerOrigin = null) {
  if (!chrome.storage?.session) {
    return null;
  }
  try {
    const stored = await chrome.storage.session.get(POPUP_LAST_STATE_STORAGE_KEY);
    const rawState = stored?.[POPUP_LAST_STATE_STORAGE_KEY] ?? null;
    const parsed = sanitizePersistedPopupState(rawState, expectedTrustedSignature, expectedServerOrigin);
    const hasExpectedSignature = typeof expectedTrustedSignature === 'string' && expectedTrustedSignature.length > 0;
    if (!parsed && rawState && hasExpectedSignature) {
      await chrome.storage.session.remove(POPUP_LAST_STATE_STORAGE_KEY).catch(() => {});
    }
    return parsed;
  } catch {
    return null;
  }
}

function sanitizePersistedReadyListSnapshot(rawState, expectedTrustedSignature, expectedServerOrigin = null) {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return null;
  }
  const hasExpectedTrustedSignature =
    typeof expectedTrustedSignature === 'string' && expectedTrustedSignature.length > 0;
  if (!hasExpectedTrustedSignature) {
    return null;
  }
  const updatedAt = Number(rawState.updatedAt);
  const withinConfidenceWindow =
    Number.isFinite(updatedAt) && Date.now() - updatedAt <= POPUP_STABLE_SNAPSHOT_CONFIDENCE_MS;
  const payloadTrustedSignature = resolveTrustedIdentitySignatureFromPersistedPayload(rawState);
  if (
    !payloadTrustedSignature ||
    (payloadTrustedSignature !== expectedTrustedSignature &&
      !isTrustedIdentitySoftMatch(payloadTrustedSignature, expectedTrustedSignature))
  ) {
    return null;
  }
  const payloadServerOrigin =
    typeof rawState.serverOrigin === 'string' && rawState.serverOrigin.trim().length > 0
      ? rawState.serverOrigin.trim()
      : null;
  if (
    typeof expectedServerOrigin === 'string' &&
    expectedServerOrigin.trim().length > 0 &&
    payloadServerOrigin &&
    payloadServerOrigin !== expectedServerOrigin.trim()
  ) {
    return null;
  }
  if (!withinConfidenceWindow) {
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

async function loadPersistedReadyListSnapshot(expectedTrustedSignature, expectedServerOrigin = null) {
  if (!chrome.storage?.session) {
    return false;
  }
  try {
    const stored = await chrome.storage.session.get(POPUP_LAST_READY_LIST_STORAGE_KEY);
    const rawState = stored?.[POPUP_LAST_READY_LIST_STORAGE_KEY] ?? null;
    const parsed = sanitizePersistedReadyListSnapshot(
      rawState,
      expectedTrustedSignature,
      expectedServerOrigin,
    );
    const hasExpectedSignature = typeof expectedTrustedSignature === 'string' && expectedTrustedSignature.length > 0;
    if (!parsed) {
      if (rawState && hasExpectedSignature) {
        await chrome.storage.session.remove(POPUP_LAST_READY_LIST_STORAGE_KEY).catch(() => {});
      }
      lastReadyListSnapshot = [];
      lastReadyListPageSnapshot = { url: '', eligible: false };
      setLocalSearchBaseItems([]);
      return false;
    }
    lastReadyListSnapshot = parsed.items;
    lastReadyListPageSnapshot = parsed.page;
    if (elements.searchInput.value.trim().length === 0) {
      setLocalSearchBaseItems(parsed.items, {
        scopeKey: JSON.stringify({
          pageUrl: parsed.page.url,
          typeFilter: activeTypeFilter,
          suggestedOnly,
        }),
      });
    }
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
    serverOrigin: typeof stateSnapshot?.serverOrigin === 'string' ? stateSnapshot.serverOrigin : null,
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
  const expectedServerOrigin =
    typeof options.trustedRecord?.serverOrigin === 'string' ? options.trustedRecord.serverOrigin : null;
  const persisted = await loadPersistedPopupStateSnapshot(expectedTrustedSignature, expectedServerOrigin);
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

  const draft = isEditorMode() ? readDetailDraftFromDom() ?? getActiveDetailDraft() : null;
  if (detailPanelMode === 'create') {
    detailCreateDraft = draft;
  } else if (detailPanelMode === 'edit') {
    detailEditDraft = draft;
  }

  const detailItem = getActiveDetailItem();
  const activeDetailDraft = detailPanelMode === 'create' ? detailCreateDraft : detailPanelMode === 'edit' ? detailEditDraft : null;

  const payload = buildPersistedPopupUiState({
    selectedItemId,
    searchQuery: elements.searchInput.value,
    typeFilter: activeTypeFilter,
    suggestedOnly,
    sortMode: activeSortMode,
    detailPanelMode,
    detailTargetItemId: detailPanelMode === 'edit' ? detailItem?.itemId ?? selectedItemId : null,
    detailFolderId: activeDetailFolderId(),
    detailDraft: activeDetailDraft,
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

function buildCurrentListScopeKey() {
  return JSON.stringify({
    pageUrl: activePageUrl,
    typeFilter: activeTypeFilter,
    suggestedOnly,
  });
}

function setLocalSearchBaseItems(items, options = {}) {
  const scopeKey = typeof options.scopeKey === 'string' ? options.scopeKey : buildCurrentListScopeKey();
  localSearchBaseItems = Array.isArray(items) ? items.slice() : [];
  localSearchBaseScopeKey = scopeKey;
}

function resolveLocalSearchBaseItems() {
  const scopeKey = buildCurrentListScopeKey();
  if (localSearchBaseScopeKey === scopeKey && Array.isArray(localSearchBaseItems) && localSearchBaseItems.length > 0) {
    return localSearchBaseItems;
  }
  if (Array.isArray(currentItems) && currentItems.length > 0) {
    return currentItems;
  }
  if (Array.isArray(lastReadyListSnapshot) && lastReadyListSnapshot.length > 0) {
    return filterPopupItemsLocally({
      items: lastReadyListSnapshot,
      query: '',
      typeFilter: activeTypeFilter,
      suggestedOnly,
    });
  }
  return Array.isArray(currentItems) ? currentItems : [];
}

function applyLocalCredentialListForCurrentQuery() {
  const sourceItems = resolveLocalSearchBaseItems();
  const nextItems = filterPopupItemsLocally({
    items: sourceItems,
    query: elements.searchInput.value,
    typeFilter: activeTypeFilter,
    suggestedOnly,
  });
  renderCredentialList(nextItems, { preserveSelectionOnEmpty: true });
}

function updateFolderStateSnapshotFromResponse(response) {
  if (!response || typeof response !== 'object') {
    return;
  }
  folderStateSnapshot = {
    folders: Array.isArray(response.folders) ? response.folders : [],
    assignments: Array.isArray(response.assignments) ? response.assignments : [],
    etag: typeof response.etag === 'string' ? response.etag : null,
  };
}

async function requestPopupSnapshot(options = {}) {
  return sendBackgroundCommand({
    type: 'vaultlite.get_popup_snapshot',
    query: options.query ?? elements.searchInput.value,
    typeFilter: options.typeFilter ?? activeTypeFilter,
    suggestedOnly: options.suggestedOnly ?? suggestedOnly,
    pageUrl: typeof options.pageUrl === 'string' ? options.pageUrl : activePageUrl,
    selectedItemId:
      typeof options.selectedItemId === 'string'
        ? options.selectedItemId
        : typeof selectedItemId === 'string'
          ? selectedItemId
          : '',
  });
}

function schedulePopupReconcile(domains, options = {}) {
  if (resolveEffectivePopupPhase(currentState) !== 'ready') {
    return;
  }
  const domainList = Array.isArray(domains) ? domains.filter((entry) => typeof entry === 'string' && entry.length > 0) : [];
  if (domainList.length === 0) {
    return;
  }
  void sendBackgroundCommand({
    type: 'vaultlite.schedule_popup_reconcile',
    domains: domainList,
    selectedItemId:
      typeof options.selectedItemId === 'string'
        ? options.selectedItemId
        : typeof selectedItemId === 'string'
          ? selectedItemId
          : '',
  }).catch(() => {
    // Best effort only.
  });
}

function schedulePopupReconcileAfterFirstPaint(domains, options = {}) {
  const enqueue = () => {
    window.setTimeout(() => {
      schedulePopupReconcile(domains, options);
    }, 0);
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      enqueue();
    });
    return;
  }
  enqueue();
}

async function refreshCredentialListForCurrentQuery() {
  const visibleItemsBeforeRefresh = Array.isArray(currentItems) ? currentItems.slice() : [];
  const response = await requestPopupSnapshot();
  if (!response.ok) {
    setAlert('warning', response.message || 'Could not refresh search results.');
    return;
  }
  updateFolderStateSnapshotFromResponse(response);
  if (
    shouldPreserveVisibleListDuringWarmup({
      cacheWarmupState: response.state?.cacheWarmupState ?? currentState?.cacheWarmupState,
      incomingItems: response.items,
      visibleItems: visibleItemsBeforeRefresh,
    })
  ) {
    maybeScheduleWarmupListRefresh(response.state ?? currentState, 0);
    return;
  }
  renderState({
    state: response.state ?? currentState,
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

function scheduleRealtimePopupRefresh(domains) {
  if (!Array.isArray(domains)) {
    return;
  }
  for (const domain of domains) {
    if (typeof domain === 'string' && domain.length > 0) {
      pendingRealtimeDomains.add(domain);
    }
  }
  if (pendingRealtimeDomains.size === 0) {
    return;
  }
  if (realtimeRefreshDebounceTimer !== null) {
    return;
  }
  realtimeRefreshDebounceTimer = window.setTimeout(() => {
    realtimeRefreshDebounceTimer = null;
    const domainsToApply = Array.from(pendingRealtimeDomains);
    pendingRealtimeDomains.clear();
    if (domainsToApply.includes('password_history')) {
      void syncPasswordGeneratorHistoryFromRemote({ force: true });
    }
    if (domainsToApply.includes('attachments') && resolvePopupPhase(currentState) === 'ready') {
      void refreshDetailAttachments({
        force: true,
        silent: detailPanelMode !== 'view' && detailPanelMode !== 'edit',
      });
    }
    const shouldRefreshList = domainsToApply.some(
      (domain) =>
        domain === 'vault' ||
        domain === 'icons_manual' ||
        domain === 'icons_state' ||
        domain === 'folders' ||
        domain === 'popup_state',
    );
    const shouldRefreshHistory = domainsToApply.includes('vault_history');
    if (shouldRefreshHistory && resolvePopupPhase(currentState) === 'ready') {
      void refreshSelectedItemHistory({
        force: true,
        silent: detailPanelMode !== 'history',
      });
    }
    if (!shouldRefreshList || resolvePopupPhase(currentState) !== 'ready') {
      return;
    }
    void refreshStateAndMaybeList({
      fetchList: true,
      showLoading: false,
      scheduleReconcile: false,
    });
  }, REALTIME_POPUP_REFRESH_DEBOUNCE_MS);
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

function enforceClientTypeFilter(items) {
  const source = Array.isArray(items) ? items : [];
  if (activeTypeFilter === 'trash') {
    return source.filter((item) => item?.isDeleted === true);
  }
  if (activeTypeFilter !== 'all') {
    return source.filter((item) => item?.isDeleted !== true && item?.itemType === activeTypeFilter);
  }
  return source.filter((item) => item?.isDeleted !== true);
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
  const rowActions = Array.isArray(rowModel.actions) ? rowModel.actions : [];
  const passwordToggleAction =
    rowModel.password === true
      ? rowActions.find((action) => action && action.id === 'toggle_password_visibility') ?? null
      : null;
  const visibleActions = passwordToggleAction
    ? rowActions.filter((action) => action && action.id !== 'toggle_password_visibility')
    : rowActions;
  if (passwordToggleAction) {
    const toggleLabel =
      typeof passwordToggleAction.label === 'string' && passwordToggleAction.label.trim().length > 0
        ? passwordToggleAction.label
        : 'Show password';
    const toggleIcon = toggleLabel.toLowerCase().includes('hide') ? 'visibility_off' : 'visibility';
    nodes.value.innerHTML = `
      <span class="detail-password-text">${sanitizeText(rowModel.value || '—')}</span>
      <button
        type="button"
        class="detail-password-inline-toggle row-action"
        data-inline-row-action="${sanitizeText(passwordToggleAction.id)}"
        aria-label="${sanitizeText(toggleLabel)}"
        title="${sanitizeText(toggleLabel)}"
      >
        <span class="material-symbols-rounded row-action-glyph" aria-hidden="true">${sanitizeText(toggleIcon)}</span>
      </button>
    `;
  } else {
    nodes.value.textContent = rowModel.value || '—';
  }
  nodes.value.classList.toggle('detail-password', rowModel.password === true);

  if (isEditorMode()) {
    nodes.row.dataset.defaultAction = '';
    nodes.row.classList.remove('is-clickable');
    hideRowAction(nodes.actionA);
    hideRowAction(nodes.actionB);
    return;
  }

  const defaultAction = rowModel.defaultAction || '';
  nodes.row.dataset.defaultAction = defaultAction;
  nodes.row.classList.toggle('is-clickable', Boolean(defaultAction));

  showRowAction(nodes.actionA, visibleActions[0]);
  showRowAction(nodes.actionB, visibleActions[1]);
}

function setDetailEditError(message) {
  const normalized = typeof message === 'string' ? message.trim() : '';
  if (!normalized) {
    elements.detailEditError.hidden = true;
    elements.detailEditError.textContent = '';
    return;
  }
  elements.detailEditError.hidden = false;
  elements.detailEditError.textContent = normalized;
}

function resolveHistorySourceLabel(record) {
  if (typeof record?.sourceDeviceName === 'string' && record.sourceDeviceName.trim().length > 0) {
    return record.sourceDeviceName;
  }
  if (typeof record?.sourceDeviceId === 'string' && record.sourceDeviceId.trim().length > 0) {
    return record.sourceDeviceId;
  }
  return 'Unknown device';
}

function ensureHistorySelection() {
  if (!Array.isArray(detailHistoryRecords) || detailHistoryRecords.length === 0) {
    detailHistorySelectedId = null;
    return;
  }
  if (!detailHistorySelectedId) {
    detailHistorySelectedId = detailHistoryRecords[0].historyId;
    return;
  }
  if (!detailHistoryRecords.some((record) => record.historyId === detailHistorySelectedId)) {
    detailHistorySelectedId = detailHistoryRecords[0].historyId;
  }
}

function renderInlineEditorsForRows(selectedItem) {
  const activeDraft = getActiveDetailDraft();
  if (!isEditorMode() || !activeDraft || !selectedItem) {
    return;
  }

  if (selectedItem.itemType === 'login') {
    elements.detailPrimaryValue.classList.remove('detail-password');
    elements.detailPrimaryValue.innerHTML = `
      <input data-edit-field="username" class="detail-row-editor" type="text" value="${escapeAttribute(activeDraft.username)}" />
    `;
    elements.detailSecondaryValue.classList.remove('detail-password');
    const passwordEditorType = detailEditPasswordVisible ? 'text' : 'password';
    const passwordToggleLabel = detailEditPasswordVisible ? 'Hide password' : 'Show password';
    const passwordToggleGlyph = detailEditPasswordVisible ? 'visibility_off' : 'visibility';
    elements.detailSecondaryValue.innerHTML = `
      <div class="detail-password-editor-shell">
        <input data-edit-field="password" class="detail-row-editor" type="${passwordEditorType}" value="${escapeAttribute(activeDraft.password)}" />
        <button
          type="button"
          class="detail-password-inline-toggle row-action"
          data-edit-password-toggle="true"
          aria-label="${passwordToggleLabel}"
          title="${passwordToggleLabel}"
        >
          <span class="material-symbols-rounded row-action-glyph" aria-hidden="true">${passwordToggleGlyph}</span>
        </button>
      </div>
    `;
    elements.detailTertiaryValue.classList.remove('detail-password');
    elements.detailTertiaryValue.innerHTML = `
      <textarea data-edit-field="urls" class="detail-row-editor detail-row-editor--textarea">${escapeAttribute(activeDraft.urls.join('\n'))}</textarea>
    `;
    return;
  }

  if (selectedItem.itemType === 'card') {
    elements.detailPrimaryValue.classList.remove('detail-password');
    elements.detailPrimaryValue.innerHTML = `
      <input data-edit-field="number" class="detail-row-editor" type="text" value="${escapeAttribute(activeDraft.number)}" />
    `;
    elements.detailSecondaryValue.classList.remove('detail-password');
    elements.detailSecondaryValue.innerHTML = `
      <input data-edit-field="securityCode" class="detail-row-editor" type="text" value="${escapeAttribute(activeDraft.securityCode)}" />
    `;
    elements.detailTertiaryValue.classList.remove('detail-password');
    elements.detailTertiaryValue.innerHTML = `
      <div class="detail-row-editor-split">
        <input data-edit-field="expiryMonth" class="detail-row-editor" type="text" value="${escapeAttribute(activeDraft.expiryMonth)}" placeholder="MM" />
        <input data-edit-field="expiryYear" class="detail-row-editor" type="text" value="${escapeAttribute(activeDraft.expiryYear)}" placeholder="YYYY" />
      </div>
    `;
    return;
  }

  if (selectedItem.itemType === 'document' || selectedItem.itemType === 'secure_note') {
    elements.detailSecondaryValue.classList.remove('detail-password');
    elements.detailSecondaryValue.innerHTML = `
      <textarea data-edit-field="content" class="detail-row-editor detail-row-editor--textarea">${escapeAttribute(activeDraft.content)}</textarea>
    `;
  }
}

function resolveNotesValueForSelected(selectedItem) {
  const payload = selectedItem?.payload && typeof selectedItem.payload === 'object' ? selectedItem.payload : null;
  if (!payload) {
    return { label: 'Notes', value: '', editField: 'notes' };
  }
  if (selectedItem.itemType === 'document' || selectedItem.itemType === 'secure_note') {
    return {
      label: 'Content',
      value: typeof payload.content === 'string' ? payload.content : '',
      editField: 'content',
    };
  }
  return {
    label: 'Notes',
    value: typeof payload.notes === 'string' ? payload.notes : '',
    editField: 'notes',
  };
}

function renderNotesSection(selectedItem) {
  if (!selectedItem) {
    elements.detailNotesRow.hidden = true;
    return;
  }
  const activeDraft = getActiveDetailDraft();
  const isEditMode = isEditorMode() && !!activeDraft;
  const notesState = resolveNotesValueForSelected(selectedItem);
  elements.detailNotesRow.hidden = false;
  elements.detailNotesLabel.textContent = notesState.label;
  if (isEditMode) {
    elements.detailNotesRow.dataset.defaultAction = '';
    elements.detailNotesRow.classList.remove('is-clickable');
    const draftValue =
      selectedItem.itemType === 'document' || selectedItem.itemType === 'secure_note'
        ? activeDraft?.content ?? ''
        : activeDraft?.notes ?? '';
    elements.detailNotesValue.hidden = true;
    elements.detailNotesEditor.hidden = false;
    elements.detailNotesEditor.setAttribute('data-edit-field', notesState.editField);
    elements.detailNotesEditor.value = draftValue;
    hideRowAction(elements.detailNotesActionA);
    return;
  }
  elements.detailNotesValue.hidden = false;
  elements.detailNotesEditor.hidden = true;
  elements.detailNotesEditor.removeAttribute('data-edit-field');
  elements.detailNotesValue.textContent = notesState.value || '—';
  const copyActionId =
    selectedItem.itemType === 'document' || selectedItem.itemType === 'secure_note' ? 'copy_content' : 'copy_note';
  if (notesState.value && notesState.value.trim().length > 0) {
    elements.detailNotesRow.dataset.defaultAction = copyActionId;
    elements.detailNotesRow.classList.add('is-clickable');
    showRowAction(elements.detailNotesActionA, {
      id: copyActionId,
      label: `Copy ${notesState.label.toLowerCase()}`,
    });
  } else {
    elements.detailNotesRow.dataset.defaultAction = '';
    elements.detailNotesRow.classList.remove('is-clickable');
    hideRowAction(elements.detailNotesActionA);
  }
}

function renderCustomFieldsSection(selectedItem) {
  if (!selectedItem) {
    elements.detailCustomFieldsSection.hidden = true;
    elements.detailCustomFieldsList.innerHTML = '';
    elements.detailCustomFieldAddBtn.hidden = true;
    elements.detailCustomFieldsTitle.hidden = true;
    return;
  }
  const activeDraft = getActiveDetailDraft();
  const isEditMode = isEditorMode() && !!activeDraft;
  const fields = isEditMode
    ? Array.isArray(activeDraft?.customFields)
      ? activeDraft.customFields
      : []
    : cloneCustomFieldsForEdit(selectedItem.payload?.customFields);
  const payload = selectedItem.payload && typeof selectedItem.payload === 'object' ? selectedItem.payload : {};
  const extraRows = [];
  const renderReadonlyNativeRow = (label, value) => `
    <section class="detail-custom-field-native">
      <div class="detail-row">
        <div class="detail-row-content">
          <p class="detail-label">${sanitizeText(label)}</p>
          <p class="detail-value">${sanitizeText(value || '—')}</p>
        </div>
      </div>
    </section>
  `;
  if (selectedItem.itemType === 'card') {
    if (isEditMode) {
      extraRows.push(`
        <div class="detail-custom-field-row">
          <div class="detail-custom-field-row-head">
            <p class="detail-custom-field-label">Cardholder name</p>
          </div>
          <input
            data-edit-field="cardholderName"
            class="detail-row-editor"
            type="text"
            value="${escapeAttribute(activeDraft.cardholderName ?? '')}"
          />
        </div>
      `);
      extraRows.push(`
        <div class="detail-custom-field-row">
          <div class="detail-custom-field-row-head">
            <p class="detail-custom-field-label">Brand</p>
          </div>
          <input
            data-edit-field="brand"
            class="detail-row-editor"
            type="text"
            value="${escapeAttribute(activeDraft.brand ?? '')}"
          />
        </div>
      `);
    } else {
      extraRows.push(renderReadonlyNativeRow('Cardholder name', payload.cardholderName || '—'));
      extraRows.push(renderReadonlyNativeRow('Brand', payload.brand || '—'));
    }
  }
  elements.detailCustomFieldsTitle.hidden = !isEditMode;
  elements.detailCustomFieldAddBtn.hidden = !isEditMode;
  elements.detailCustomFieldsSection.hidden = !isEditMode && fields.length === 0 && extraRows.length === 0;
  if (!isEditMode && fields.length === 0 && extraRows.length === 0) {
    elements.detailCustomFieldsList.innerHTML = '';
    return;
  }
  if (isEditMode) {
    const customRowsHtml =
      fields
        .map(
          (entry, index) => `
            <div class="detail-custom-field-row" data-custom-field-row="${index}">
              <div class="detail-custom-field-row-head">
                <p
                  data-custom-field-label-inline="${index}"
                  class="detail-custom-field-inline-label"
                  contenteditable="true"
                  spellcheck="false"
                  role="textbox"
                  aria-label="Custom field label"
                  data-placeholder="Field label"
                >${escapeAttribute(entry.label)}</p>
                <button type="button" class="btn-secondary" data-custom-field-remove="${index}">Remove</button>
              </div>
              <textarea
                data-custom-field-value="${index}"
                class="detail-row-editor detail-row-editor--textarea"
                placeholder="Value"
              >${escapeAttribute(entry.value)}</textarea>
            </div>
          `,
        )
        .join('');
    elements.detailCustomFieldsList.innerHTML =
      `${extraRows.join('')}${customRowsHtml || '<p class="empty-state">No custom fields yet.</p>'}`;
    return;
  }
  const customRows = fields
    .map(
      (entry) => `
        <section class="detail-custom-field-native">
          <div class="detail-row">
            <div class="detail-row-content">
              <p class="detail-label">${sanitizeText(entry.label || 'Field')}</p>
              <p class="detail-value">${sanitizeText(entry.value || '—')}</p>
            </div>
          </div>
        </section>
      `,
    )
    .join('');
  elements.detailCustomFieldsList.innerHTML = `${extraRows.join('')}${customRows}`;
}

function renderFolderSection() {
  const sectionState = resolveFolderSectionState({
    detailPanelMode,
    itemId: getSelectedCredential()?.itemId ?? '',
    draftFolderId: activeDetailFolderId(),
    folders: folderStateSnapshot.folders,
    assignments: folderStateSnapshot.assignments,
  });
  elements.detailFolderSection.hidden = !sectionState.visible;
  if (!sectionState.visible) {
    return;
  }
  elements.detailFolderValue.hidden = sectionState.editable;
  elements.detailFolderSelect.hidden = !sectionState.editable;
  elements.detailFolderCreateBtn.hidden = !sectionState.canCreateFolder;
  elements.detailFolderValue.textContent = sectionState.selectedFolderName;
  if (!sectionState.editable) {
    return;
  }
  const options = [
    '<option value="">No folder</option>',
    ...folderStateSnapshot.folders.map(
      (folder) =>
        `<option value="${escapeAttribute(folder.folderId)}">${sanitizeText(folder.name)}</option>`,
    ),
  ];
  elements.detailFolderSelect.innerHTML = options.join('');
  elements.detailFolderSelect.value = sectionState.selectedFolderId || '';
}

function renderAttachmentsSection() {
  const sectionState = resolveAttachmentSectionState({
    detailPanelMode,
    existingAttachments: detailPanelMode === 'create' ? [] : detailAttachmentRecords,
    pendingAttachments: activePendingAttachments(),
  });
  elements.detailAttachmentsSection.hidden = !sectionState.visible;
  if (!sectionState.visible) {
    return;
  }
  elements.detailAttachmentAddBtn.hidden = !sectionState.canAddAttachments;
  if (detailAttachmentLoading) {
    elements.detailAttachmentList.innerHTML = '<p class="empty-state">Loading attachments...</p>';
    return;
  }
  if (detailAttachmentError) {
    elements.detailAttachmentList.innerHTML = `<p class="empty-state">${sanitizeText(detailAttachmentError)}</p>`;
    return;
  }
  if (sectionState.rows.length === 0) {
    elements.detailAttachmentList.innerHTML = '<p class="empty-state">No attachments yet.</p>';
    return;
  }
  elements.detailAttachmentList.innerHTML = sectionState.rows
    .map(
      (entry) => `
        <div class="detail-attachment-row" ${entry.removable ? `data-create-attachment-id="${escapeAttribute(entry.id)}"` : ''}>
          <div class="detail-attachment-meta">
            <p class="detail-attachment-name">${sanitizeText(entry.fileName)}</p>
            <p class="detail-attachment-subtitle">${sanitizeText(entry.subtitle)}</p>
          </div>
          ${entry.removable ? `<button type="button" class="btn-secondary" data-create-attachment-remove="${escapeAttribute(entry.id)}">Remove</button>` : ''}
        </div>
      `,
    )
    .join('');
}

function renderDetailHistorySummary(selectedItem) {
  if (!selectedItem || detailPanelMode === 'history' || detailPanelMode === 'create' || detailPanelMode === 'edit') {
    elements.detailHistorySummarySection.hidden = true;
    elements.detailHistorySummarySection.classList.remove('is-expanded');
    return;
  }
  elements.detailHistorySummarySection.hidden = false;
  if (detailHistoryLoading && detailHistoryRecords.length === 0) {
    elements.detailHistorySummaryTitle.textContent = 'Loading history...';
    elements.detailHistorySummaryBody.hidden = true;
    elements.detailHistorySummarySection.classList.remove('is-expanded');
    elements.detailHistorySummaryChevron.textContent = 'chevron_right';
    return;
  }
  const latest = detailHistoryRecords[0] ?? null;
  if (!latest) {
    elements.detailHistorySummaryTitle.textContent = 'No history entries yet.';
    elements.detailHistorySummaryBody.hidden = true;
    elements.detailHistorySummarySection.classList.remove('is-expanded');
    elements.detailHistorySummaryChevron.textContent = 'chevron_right';
    return;
  }
  elements.detailHistorySummaryTitle.textContent = `Last edited ${formatTime(latest.createdAt)}`;
  if (!detailHistorySummaryExpanded) {
    elements.detailHistorySummaryBody.hidden = true;
    elements.detailHistorySummarySection.classList.remove('is-expanded');
    elements.detailHistorySummaryChevron.textContent = 'chevron_right';
    return;
  }
  elements.detailHistorySummaryChevron.textContent = 'expand_more';
  elements.detailHistorySummaryBody.hidden = false;
  elements.detailHistorySummarySection.classList.add('is-expanded');
  elements.detailHistorySummaryBody.innerHTML = `
    <p>${sanitizeText(historyChangeTypeLabel(latest.changeType))} ${sanitizeText(formatTime(latest.createdAt))}</p>
    <p>${sanitizeText(resolveHistorySourceLabel(latest))}</p>
  `;
}

function renderDetailHistoryPanel() {
  const showPanel = detailPanelMode === 'history';
  elements.detailHistoryPanel.hidden = !showPanel;
  if (!showPanel) {
    elements.detailHistoryListView.hidden = false;
    elements.detailHistoryEntryView.hidden = true;
    elements.detailHistoryList.innerHTML = '';
    elements.detailHistoryEntryDetail.innerHTML = '';
    elements.detailHistoryEmpty.hidden = true;
    return;
  }
  const showEntryView = detailHistoryView === 'entry';
  elements.detailHistoryListView.hidden = showEntryView;
  elements.detailHistoryEntryView.hidden = !showEntryView;
  if (detailHistoryLoading) {
    if (showEntryView) {
      elements.detailHistoryEntryDetail.innerHTML = '<p class="empty-state">Loading history...</p>';
    } else {
      elements.detailHistoryList.innerHTML = '<p class="empty-state">Loading history...</p>';
    }
    elements.detailHistoryEmpty.hidden = true;
    return;
  }
  if (detailHistoryError) {
    if (showEntryView) {
      elements.detailHistoryEntryDetail.innerHTML = `<p class="empty-state">${sanitizeText(detailHistoryError)}</p>`;
    } else {
      elements.detailHistoryList.innerHTML = `<p class="empty-state">${sanitizeText(detailHistoryError)}</p>`;
    }
    elements.detailHistoryEmpty.hidden = true;
    return;
  }
  if (!Array.isArray(detailHistoryRecords) || detailHistoryRecords.length === 0) {
    elements.detailHistoryList.innerHTML = '';
    elements.detailHistoryEntryDetail.innerHTML = '';
    elements.detailHistoryEmpty.hidden = showEntryView;
    return;
  }
  ensureHistorySelection();
  elements.detailHistoryEmpty.hidden = true;

  const selectedRecord =
    detailHistoryRecords.find((record) => record.historyId === detailHistorySelectedId) ?? detailHistoryRecords[0];
  if (!showEntryView) {
    const timelineHtml = detailHistoryRecords
      .map((record) => {
        const isActive = record.historyId === detailHistorySelectedId;
        const summary = summarizeHistoryRecord(record);
        return `
          <button
            type="button"
            class="detail-history-timeline-item ${isActive ? 'is-active' : ''}"
            data-history-select="${sanitizeText(record.historyId)}"
          >
            <p class="detail-history-timeline-item-title">${sanitizeText(historyChangeTypeLabel(record?.changeType ?? 'update'))}</p>
            <p class="detail-history-timeline-item-meta">${sanitizeText(formatTime(record?.createdAt ?? ''))}</p>
            <p class="detail-history-timeline-item-meta">${sanitizeText(resolveHistorySourceLabel(record))}</p>
            <p class="detail-history-timeline-item-hint">${sanitizeText(summary)}</p>
          </button>
        `;
      })
      .join('');
    elements.detailHistoryList.innerHTML = timelineHtml;
    elements.detailHistoryEntryDetail.innerHTML = '';
    return;
  }

  const selectedDiffEntries = Array.isArray(selectedRecord?.diffEntries) ? selectedRecord.diffEntries : [];
  const diffHtml = selectedDiffEntries
    .map((entry) => {
      const fieldPath = typeof entry?.fieldPath === 'string' ? entry.fieldPath : 'field';
      const isPasswordField = fieldPath === 'password';
      const revealKey = `${selectedRecord.historyId}:${entry.fieldPath}`;
      const visible = !isPasswordField || detailHistoryRevealKeys.has(revealKey);
      const beforeHtml = buildHistoryDiffValueHtml(fieldPath, typeof entry?.before === 'string' ? entry.before : '', visible);
      const afterHtml = buildHistoryDiffValueHtml(fieldPath, typeof entry?.after === 'string' ? entry.after : '', visible);
      return `
        <div class="detail-history-field-block">
          <p class="detail-history-field-title">${sanitizeText(normalizeHistoryDiffLabel(fieldPath))}</p>
          <div class="detail-history-compare-grid">
            <section class="detail-history-compare-side">
              <div class="detail-row">
                <div class="detail-row-content">
                  <p class="detail-label">Before</p>
                  <div class="detail-history-value-stack">${beforeHtml}</div>
                </div>
              </div>
            </section>
            <section class="detail-history-compare-side">
              <div class="detail-row">
                <div class="detail-row-content">
                  <p class="detail-label">After</p>
                  <div class="detail-history-value-stack">${afterHtml}</div>
                </div>
              </div>
            </section>
          </div>
          ${isPasswordField ? `<button type="button" class="btn-secondary detail-history-reveal" data-history-reveal="${sanitizeText(revealKey)}">${visible ? 'Hide' : 'Reveal'}</button>` : ''}
        </div>
      `;
    })
    .join('');

  elements.detailHistoryList.innerHTML = '';
  elements.detailHistoryEntryDetail.innerHTML = `
    <div class="detail-history-entry-head">
      <p class="detail-history-entry-title">${sanitizeText(historyChangeTypeLabel(selectedRecord?.changeType ?? 'update'))}</p>
      <p class="detail-history-entry-meta">${sanitizeText(formatTime(selectedRecord?.createdAt ?? ''))} • ${sanitizeText(resolveHistorySourceLabel(selectedRecord))}</p>
    </div>
    <div class="detail-history-diff">${diffHtml || '<p class="detail-history-entry-meta">No field diffs recorded.</p>'}</div>
  `;
}

function renderDetailPanels() {
  const selected = getActiveDetailItem();
  const activeDraft = getActiveDetailDraft();
  const isEditMode = detailPanelMode === 'edit' && !!detailEditDraft;
  const isCreateMode = detailPanelMode === 'create' && !!detailCreateDraft;
  const isEditorActive = (isEditMode || isCreateMode) && !!activeDraft;
  const isHistoryMode = detailPanelMode === 'history';
  const isHistoryEntryMode = isHistoryMode && detailHistoryView === 'entry';
  elements.detailMainSections.hidden = isHistoryMode || !selected;
  elements.detailActionPrimary.hidden = isEditorActive || isHistoryMode;
  elements.detailActionMenu.hidden = isEditorActive || isHistoryMode;
  elements.detailEditCancelBtn.hidden = !isEditorActive;
  elements.detailEditSaveBtn.hidden = !isEditorActive;
  elements.detailHistoryNavTitle.hidden = !isHistoryMode;
  elements.detailHistoryNavBackBtn.hidden = !isHistoryEntryMode;
  elements.detailHistoryNavCloseBtn.hidden = !isHistoryMode;
  elements.detailHistoryNavTitle.textContent = 'History';
  elements.detailHistoryNavBackBtn.disabled = false;
  elements.credentialDetailsContent.classList.toggle('vault-detail-history', isHistoryMode);
  if (isHistoryMode) {
    elements.detailIconShell.classList.remove('is-editable');
    elements.detailIconEditBtn.hidden = true;
    elements.detailIconEditBtn.disabled = true;
  }
  elements.detailTitle.contentEditable = isEditorActive ? 'true' : 'false';
  elements.detailTitle.classList.toggle('is-inline-editing', isEditorActive);
  elements.detailTitle.dataset.placeholder = 'Item title';
  if (!isEditorActive) {
    setDetailEditError('');
  }
  if (isEditorActive && selected && activeDraft) {
    if (normalizeInlineEditableText(elements.detailTitle).length === 0) {
      elements.detailTitle.textContent = activeDraft.title;
    }
    renderInlineEditorsForRows(selected);
  }
  if (isHistoryMode) {
    elements.detailNotesRow.hidden = true;
    elements.detailCustomFieldsSection.hidden = true;
    elements.detailFolderSection.hidden = true;
    elements.detailAttachmentsSection.hidden = true;
  } else {
    renderNotesSection(selected);
    renderCustomFieldsSection(selected);
    renderFolderSection();
    renderAttachmentsSection();
  }
  renderDetailHistorySummary(isCreateMode ? null : selected);
  renderDetailHistoryPanel();
}

function clearDetailTransientPanels(options = {}) {
  const preserveDeleteConfirmation = options?.preserveDeleteConfirmation === true;
  if (!preserveDeleteConfirmation && !elements.confirmDeleteModal.hidden) {
    resolveDeleteConfirmation(false);
  }
  detailPanelMode = 'view';
  detailEditDraft = null;
  detailCreateDraft = null;
  detailCreateFolderId = '';
  detailCreatePendingAttachments = [];
  detailEditFolderId = '';
  detailEditPendingAttachments = [];
  detailEditPasswordVisible = false;
  detailAttachmentLoading = false;
  detailAttachmentError = '';
  detailAttachmentItemId = null;
  detailAttachmentRecords = [];
  detailHistoryLoading = false;
  detailHistoryError = '';
  detailHistoryCursor = null;
  detailHistoryRecords = [];
  detailHistoryItemId = null;
  detailHistorySelectedId = null;
  detailHistoryView = 'list';
  detailHistorySummaryExpanded = false;
  detailHistoryRevealKeys.clear();
  elements.detailTitle.contentEditable = 'false';
  elements.detailTitle.classList.remove('is-inline-editing');
  renderDetailPanels();
  persistPopupUiState();
}

function syncDetailPanelStateForSelected() {
  if (detailPanelMode === 'create') {
    renderDetailPanels();
    return;
  }
  const selected = getSelectedCredential();
  if (!selected) {
    clearDetailTransientPanels({
      preserveDeleteConfirmation: true,
    });
    return;
  }
  if (detailPanelMode === 'edit') {
    detailEditDraft = createEditDraftFromSelected(selected);
    if (!detailEditDraft) {
      detailPanelMode = 'view';
    } else {
      detailEditFolderId =
        folderStateSnapshot.assignments.find((entry) => entry?.itemId === selected.itemId)?.folderId ?? '';
    }
  }
  if (detailHistoryItemId !== selected.itemId) {
    detailHistoryItemId = selected.itemId;
    detailHistoryLoading = false;
    detailHistoryError = '';
    detailHistoryCursor = null;
    detailHistoryRecords = [];
    detailHistorySelectedId = null;
    detailHistoryView = 'list';
    detailHistorySummaryExpanded = false;
    detailHistoryRevealKeys.clear();
    void refreshSelectedItemHistory({ force: false, silent: true, awaitCompletion: false });
  }
  if (folderStateSnapshot.folders.length === 0 && folderStateSnapshot.assignments.length === 0) {
    void refreshFolderState({ awaitCompletion: false });
  }
  if (detailAttachmentItemId !== selected.itemId) {
    void refreshDetailAttachments({
      force: false,
      silent: true,
      awaitCompletion: false,
    });
  }
  renderDetailPanels();
}

function closeDetailMenu() {
  elements.detailMenuPopover.hidden = true;
}

function toggleDetailMenu() {
  elements.detailMenuPopover.hidden = !elements.detailMenuPopover.hidden;
}

function resolveDeleteConfirmation(result) {
  if (typeof detailDeleteConfirmResolver !== 'function') {
    return;
  }
  const resolver = detailDeleteConfirmResolver;
  detailDeleteConfirmResolver = null;
  elements.confirmDeleteModal.hidden = true;
  resolver(result === true);
}

function openDeleteConfirmationDialog(itemTitle) {
  if (typeof detailDeleteConfirmResolver === 'function') {
    resolveDeleteConfirmation(false);
  }
  const normalizedTitle =
    typeof itemTitle === 'string' && itemTitle.trim().length > 0 ? itemTitle.trim() : 'this item';
  elements.confirmDeleteTitle.textContent = `Delete “${normalizedTitle}”?`;
  elements.confirmDeleteBody.textContent =
    'This item will be moved to Trash immediately. You can restore deleted items for a limited time.';
  elements.confirmDeleteModal.hidden = false;
  elements.confirmDeleteConfirmBtn.focus();
  return new Promise((resolve) => {
    detailDeleteConfirmResolver = resolve;
  });
}

function resolveCreateFolderDialog(result) {
  if (typeof detailCreateFolderResolver !== 'function') {
    return;
  }
  const resolver = detailCreateFolderResolver;
  detailCreateFolderResolver = null;
  elements.createFolderModal.hidden = true;
  resolver(result);
}

function setCreateFolderError(message) {
  const normalized = typeof message === 'string' ? message.trim() : '';
  elements.createFolderError.hidden = normalized.length === 0;
  elements.createFolderError.textContent = normalized;
}

function openCreateFolderDialog() {
  if (typeof detailCreateFolderResolver === 'function') {
    resolveCreateFolderDialog(null);
  }
  elements.createFolderNameInput.value = '';
  setCreateFolderError('');
  elements.createFolderConfirmBtn.disabled = true;
  elements.createFolderModal.hidden = false;
  window.setTimeout(() => {
    elements.createFolderNameInput.focus();
  }, 0);
  return new Promise((resolve) => {
    detailCreateFolderResolver = resolve;
  });
}

function renderCredentialDetails() {
  const selectedItem = getSelectedCredential();
  const displayItem = getActiveDetailItem();
  const createModeActive = detailPanelMode === 'create' && !!detailCreateDraft;
  applyLayoutState(resolveEffectivePopupPhase(currentState));
  const disableActions = (!displayItem && !createModeActive) || inFlight;

  if (!displayItem) {
    resetDetailSecretState(null);
    clearDetailTransientPanels({
      preserveDeleteConfirmation: true,
    });
    elements.credentialDetailsLoading.hidden = true;
    elements.credentialDetailsContent.hidden = true;
    elements.detailIconShell.classList.remove('is-editable');
    elements.detailIconEditBtn.hidden = true;
    elements.detailIconEditBtn.disabled = true;
    elements.detailActionEdit.disabled = true;
    elements.detailActionHistory.disabled = true;
    elements.detailActionDelete.disabled = true;
    elements.detailActionPrimary.disabled = true;
    elements.detailActionPrimary.hidden = false;
    elements.detailActionMenu.disabled = true;
    elements.detailActionMenu.hidden = false;
    elements.detailEditCancelBtn.hidden = true;
    elements.detailEditSaveBtn.hidden = true;
    elements.detailTitle.contentEditable = 'false';
    elements.detailTitle.classList.remove('is-inline-editing');
    elements.detailMainSections.hidden = true;
    detailRows.forEach((nodes) => {
      configureDetailRow(nodes, null);
    });
    closeDetailMenu();
    popupAutosizer?.schedule();
    return;
  }

  elements.credentialDetailsLoading.hidden = createModeActive || !detailLoading;
  elements.credentialDetailsContent.hidden = !createModeActive && detailLoading;
  if (detailLoading && !createModeActive) {
    closeDetailMenu();
    clearDetailTransientPanels({
      preserveDeleteConfirmation: true,
    });
    elements.detailTitle.contentEditable = 'false';
    elements.detailTitle.classList.remove('is-inline-editing');
    elements.detailMainSections.hidden = true;
    popupAutosizer?.schedule();
    return;
  }

  ensureDetailSecretStateForItem(displayItem.itemId);
  const isDeletedItem = displayItem.isDeleted === true;
  const detailModel = buildDetailViewModel(displayItem, {
    passwordVisible: detailSecretState.passwordVisible,
    passwordValue: detailSecretState.passwordValue,
  });
  const iconHost = createModeActive ? '' : selectedManualIconHost();
  const iconEditable = !createModeActive && Boolean(iconHost);
  elements.detailIconShell.classList.toggle('is-editable', iconEditable);
  elements.detailIconEditBtn.hidden = !iconEditable;
  elements.detailIconEditBtn.disabled = disableActions || !iconEditable;
  elements.detailActionEdit.disabled = disableActions || isDeletedItem || !supportsPopupEditing(displayItem.itemType);
  elements.detailActionHistory.disabled = disableActions;
  elements.detailActionDelete.disabled = disableActions || isDeletedItem;
  elements.detailMonogram.textContent = buildCredentialMonogram(displayItem.title);
  const detailFaviconUrl = createModeActive ? '' : activeFaviconUrl(displayItem);
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
  if (createModeActive) {
    renderDetailPanels();
  } else {
    syncDetailPanelStateForSelected();
  }
  popupAutosizer?.schedule();
}

function resolveCopyToastMessage(field) {
  if (field === 'username') {
    return 'Copied username';
  }
  if (field === 'password') {
    return 'Copied password';
  }
  if (field === 'url') {
    return 'Copied URL';
  }
  if (field === 'card_number') {
    return 'Copied card number';
  }
  if (field === 'card_cvv') {
    return 'Copied security code';
  }
  if (field === 'card_expiry') {
    return 'Copied expiry';
  }
  if (field === 'content') {
    return 'Copied content';
  }
  if (field === 'title') {
    return 'Copied title';
  }
  return 'Copied';
}

function showCopyToast(message) {
  const text = typeof message === 'string' && message.trim().length > 0 ? message.trim() : 'Copied';
  elements.copyToast.textContent = text;
  elements.copyToast.hidden = false;
  if (copyToastTimer !== null) {
    window.clearTimeout(copyToastTimer);
  }
  copyToastTimer = window.setTimeout(() => {
    elements.copyToast.hidden = true;
    copyToastTimer = null;
  }, 1200);
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
      scheduleReconcile: true,
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
  const trashScopeActive = activeTypeFilter === 'trash';
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
    const hasReadySnapshot =
      (Array.isArray(lastReadyListSnapshot) && lastReadyListSnapshot.length > 0) ||
      (Array.isArray(previousItems) && previousItems.length > 0);
    if (
      shouldRenderVaultSkeleton({
        vaultLoading,
        warmupState: currentState?.cacheWarmupState,
        hasReadySnapshot,
      })
    ) {
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

    if (trashScopeActive) {
      elements.credentialsList.innerHTML = `
        <div class="empty-state">
          <p>No deleted items.</p>
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
      if (item?.isDeleted === true) {
        sideAction = `
          <button
            type="button"
            class="vault-row-side-hit is-restore"
            data-row-action="restore-item"
            data-item-id="${sanitizeText(item.itemId)}"
            title="Restore item"
            aria-label="Restore item"
          >
            Restore
          </button>
        `;
      } else if (quickAction?.type === 'open-url') {
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
        const disabledAttr = quickAction.disabled || pendingFillItemId === item.itemId ? 'disabled' : '';
        const tooltip =
          pendingFillItemId === item.itemId ? 'Filling credentials...' : quickAction.tooltip;
        sideAction = `
          <button
            type="button"
            class="vault-row-side-hit is-fill"
            data-row-action="quick-fill"
            data-item-id="${sanitizeText(item.itemId)}"
            title="${sanitizeText(tooltip)}"
            aria-label="${sanitizeText(tooltip)}"
            ${disabledAttr}
          >
            Fill
          </button>
        `;
      }
      const resolvedRowClass =
        sideAction && !rowClass.includes('has-row-action') ? `${rowClass} has-row-action` : rowClass;
      return `
        <article class="vault-row${selectedClass}${resolvedRowClass}" data-item-id="${sanitizeText(item.itemId)}" tabindex="0">
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

  const filteredItems = Array.isArray(payload.items) ? enforceClientTypeFilter(payload.items) : null;
  if (filteredItems) {
    renderCredentialList(filteredItems);
    if (effectivePhase === 'ready' && elements.searchInput.value.trim().length === 0) {
      setLocalSearchBaseItems(filteredItems, {
        scopeKey: JSON.stringify({
          pageUrl: typeof payload.page?.url === 'string' ? payload.page.url : activePageUrl,
          typeFilter: activeTypeFilter,
          suggestedOnly,
        }),
      });
    }
    if (effectivePhase === 'ready' && filteredItems.length > 0) {
      lastReadyListSnapshot = filteredItems.slice(0, 400);
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
  const scheduleReconcileAfterRender = options?.scheduleReconcile !== false;
  const hasFallbackItems =
    (Array.isArray(currentItems) && currentItems.length > 0) ||
    (Array.isArray(lastReadyListSnapshot) && lastReadyListSnapshot.length > 0);
  if (showLoading) {
    vaultLoading = !hasFallbackItems;
    detailLoading = Boolean(selectedItemId);
    listErrorMessage = '';
    if (currentItems.length === 0) {
      if (Array.isArray(lastReadyListSnapshot) && lastReadyListSnapshot.length > 0) {
        renderCredentialList(lastReadyListSnapshot, { preserveSelectionOnEmpty: true });
      } else {
        renderCredentialList(currentItems, { preserveSelectionOnEmpty: true });
      }
    } else {
      renderCredentialDetails();
      popupAutosizer?.schedule();
    }
  }
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

  let snapshotResponse;
  try {
    snapshotResponse = await requestPopupSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh extension state.';
    if (!handleTransportFailure(error)) {
      setAlert('danger', message);
    }
    vaultLoading = false;
    detailLoading = false;
    return;
  }
  if (!snapshotResponse.ok) {
    clearWarmupListRefreshTimer();
    vaultLoading = false;
    detailLoading = false;
    setAlert('danger', snapshotResponse.message || 'Failed to refresh extension state.');
    return;
  }
  updateFolderStateSnapshotFromResponse(snapshotResponse);
  const stateSnapshot = snapshotResponse.state ?? currentState;
  const pageSnapshot = snapshotResponse.page ?? {};
  if (resolvePopupPhase(stateSnapshot) === 'ready') {
    vaultLoading = false;
    detailLoading = false;
    listErrorMessage = '';
    if (
      fetchList &&
      shouldPreserveVisibleListDuringWarmup({
        cacheWarmupState: stateSnapshot?.cacheWarmupState,
        incomingItems: snapshotResponse.items,
        visibleItems: currentItems,
      })
    ) {
      renderState({
        state: stateSnapshot,
        page: pageSnapshot,
      });
      maybeScheduleWarmupListRefresh(stateSnapshot, 0);
      if (scheduleReconcileAfterRender) {
        schedulePopupReconcile(['session', 'vault', 'folders', 'icons']);
      }
      return;
    }
    renderState({
      state: stateSnapshot,
      page: pageSnapshot,
      items: fetchList ? snapshotResponse.items : undefined,
    });
    maybeScheduleWarmupListRefresh(
      stateSnapshot,
      fetchList && Array.isArray(snapshotResponse.items) ? snapshotResponse.items.length : currentItems.length,
    );
    if (scheduleReconcileAfterRender) {
      schedulePopupReconcile(['session', 'vault', 'folders', 'icons']);
    }
    return;
  }

  clearWarmupListRefreshTimer();
  vaultLoading = false;
  detailLoading = false;
  renderState({
    state: stateSnapshot,
    page: pageSnapshot,
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
  if (elements.unlockBtn.dataset.loading === 'true') {
    return;
  }
  clearUnlockPasswordError();
  const password = elements.unlockPasswordInput.value;
  if (!password) {
    elements.unlockPasswordInput.focus();
    return;
  }

  const unlockIcon = elements.unlockBtn.querySelector('.material-symbols-rounded');
  const previousIcon = unlockIcon?.textContent ?? 'arrow_forward';
  elements.unlockBtn.dataset.loading = 'true';
  elements.unlockBtn.disabled = true;
  if (unlockIcon) {
    unlockIcon.textContent = 'progress_activity';
  }
  elements.unlockPasswordInput.disabled = true;
  let response;
  try {
    response = await sendBackgroundCommand({
      type: 'vaultlite.unlock_local',
      password,
      pageUrl: activePageUrl,
    });
  } catch (error) {
    delete elements.unlockBtn.dataset.loading;
    elements.unlockBtn.disabled = false;
    if (unlockIcon) {
      unlockIcon.textContent = previousIcon;
    }
    elements.unlockPasswordInput.disabled = false;
    setAlert('danger', error instanceof Error ? error.message : 'Unlock failed.');
    elements.unlockPasswordInput.focus({ preventScroll: true });
    return;
  }

  if (!response.ok) {
    delete elements.unlockBtn.dataset.loading;
    elements.unlockBtn.disabled = false;
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
  elements.unlockBtn.disabled = false;
  if (unlockIcon) {
    unlockIcon.textContent = previousIcon;
  }
  elements.unlockPasswordInput.disabled = false;
  setAlert('success', 'Extension unlocked.');

  const unlockedState = response.state ?? null;
  if (resolvePopupPhase(unlockedState) === 'ready') {
    const unlockTrustedSignature =
      resolveTrustedIdentitySignatureFromState(unlockedState) ?? trustedIdentitySignature;
    if (unlockTrustedSignature) {
      trustedIdentitySignature = unlockTrustedSignature;
    }
    if (
      (!Array.isArray(lastReadyListSnapshot) || lastReadyListSnapshot.length === 0) &&
      unlockTrustedSignature
    ) {
      await loadPersistedReadyListSnapshot(
        unlockTrustedSignature,
        typeof unlockedState?.serverOrigin === 'string' ? unlockedState.serverOrigin : null,
      );
    }
    updateFolderStateSnapshotFromResponse(response);
    const fallbackUnlockItems =
      Array.isArray(lastReadyListSnapshot) && lastReadyListSnapshot.length > 0
        ? lastReadyListSnapshot
        : Array.isArray(currentItems) && currentItems.length > 0
          ? currentItems
          : [];
    const unlockItems =
      Array.isArray(response.items) && response.items.length > 0 ? response.items : fallbackUnlockItems;
    const unlockPage = response.page ?? {
      url: activePageUrl || lastReadyListPageSnapshot.url || '',
      eligible: activePageEligible || lastReadyListPageSnapshot.eligible === true,
    };
    const hasRenderableItems = unlockItems.length > 0;
    vaultLoading = !hasRenderableItems;
    detailLoading = false;
    listErrorMessage = '';
    renderState({
      state: unlockedState,
      page: unlockPage,
      items: unlockItems,
    });
    maybeScheduleWarmupListRefresh(unlockedState, unlockItems.length);
    schedulePopupReconcileAfterFirstPaint(['session', 'vault', 'folders', 'icons']);
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
  if (pendingFillItemId === itemId) {
    return;
  }
  pendingFillItemId = itemId;
  renderCredentialList(currentItems, { preserveSelectionOnEmpty: true });
  const response = await sendBackgroundCommand({
    type: 'vaultlite.fill_credential',
    itemId,
  });
  pendingFillItemId = null;
  renderCredentialList(currentItems, { preserveSelectionOnEmpty: true });
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
    showCopyToast(resolveCopyToastMessage(field));
  } catch {
    setAlert('danger', 'Clipboard write failed on this browser context.');
  }
}

async function copyRawValue(rawValue, sourceButton = null, message = 'Copied') {
  if (!rawValue) {
    setAlert('warning', 'No value available to copy.');
    return;
  }
  try {
    await copyToClipboard(rawValue);
    if (sourceButton) {
      pulseCopyIcon(sourceButton);
    }
    showCopyToast(message);
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

function normalizePopupItemFromPayload(baseItem, payload, revision) {
  const itemType = baseItem?.itemType ?? 'login';
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  let subtitle = '—';
  let firstUrl = '';
  let urlHostSummary = baseItem?.urlHostSummary ?? 'No URL';
  let searchText = baseItem?.searchText ?? baseItem?.title ?? '';

  if (itemType === 'login') {
    subtitle = typeof safePayload.username === 'string' && safePayload.username ? safePayload.username : '—';
    const urls = Array.isArray(safePayload.urls) ? safePayload.urls.filter((entry) => typeof entry === 'string') : [];
    firstUrl = urls[0] ?? '';
    if (firstUrl) {
      try {
        urlHostSummary = new URL(firstUrl).hostname;
      } catch {
        urlHostSummary = baseItem?.urlHostSummary ?? 'No URL';
      }
    } else {
      urlHostSummary = 'No URL';
    }
    searchText = `${safePayload.title ?? ''} ${safePayload.username ?? ''}`.trim();
  } else if (itemType === 'card') {
    const numberRaw = typeof safePayload.number === 'string' ? safePayload.number : '';
    subtitle = numberRaw ? numberRaw : '••••';
    urlHostSummary = 'card';
    searchText = `${safePayload.title ?? ''} ${safePayload.cardholderName ?? ''}`.trim();
  } else if (itemType === 'document' || itemType === 'secure_note') {
    const content = typeof safePayload.content === 'string' ? safePayload.content : '';
    subtitle = content ? content.slice(0, 80) : '—';
    urlHostSummary = itemType;
    searchText = `${safePayload.title ?? ''} ${content}`.trim();
  }

  return {
    ...baseItem,
    revision,
    title: typeof safePayload.title === 'string' ? safePayload.title : baseItem?.title ?? 'Untitled item',
    subtitle,
    searchText,
    firstUrl,
    urlHostSummary,
    payload: safePayload,
  };
}

function readDetailDraftFromDom() {
  const selected = getActiveDetailItem();
  const activeDraft = getActiveDetailDraft();
  if (!selected || !activeDraft || !supportsPopupEditing(selected.itemType)) {
    return null;
  }
  const titleValue = normalizeInlineEditableText(elements.detailTitle) || activeDraft.title;
  const customFields = Array.from(elements.detailCustomFieldsList.querySelectorAll('[data-custom-field-row]'))
    .map((row) => {
      const index = Number(row.getAttribute('data-custom-field-row'));
      if (!Number.isFinite(index)) {
        return null;
      }
      const labelInput = row.querySelector(`[data-custom-field-label-inline="${index}"]`);
      const valueInput = row.querySelector(`[data-custom-field-value="${index}"]`);
      const label = labelInput instanceof HTMLElement ? normalizeInlineEditableText(labelInput) : '';
      const value = valueInput instanceof HTMLTextAreaElement ? valueInput.value : '';
      return {
        label,
        value,
      };
    })
    .filter((entry) => entry && (entry.label.trim().length > 0 || entry.value.trim().length > 0));
  const readField = (field) => {
    const element = elements.credentialDetailsContent.querySelector(`[data-edit-field=\"${field}\"]`);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }
    return '';
  };
  if (selected.itemType === 'login') {
    const urlsRaw = readField('urls')
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return {
      itemType: 'login',
      title: titleValue.trim(),
      username: readField('username').trim(),
      password: readField('password'),
      urls: urlsRaw,
      notes: readField('notes'),
      customFields,
    };
  }
  if (selected.itemType === 'card') {
    return {
      itemType: 'card',
      title: titleValue.trim(),
      cardholderName: readField('cardholderName').trim(),
      brand: readField('brand').trim(),
      number: readField('number').trim(),
      expiryMonth: readField('expiryMonth').trim(),
      expiryYear: readField('expiryYear').trim(),
      securityCode: readField('securityCode').trim(),
      notes: readField('notes'),
      customFields,
    };
  }
  return {
    itemType: selected.itemType,
    title: titleValue.trim(),
    content: readField('content'),
    customFields,
  };
}

function validateDetailEditDraft(draft) {
  if (!draft || !supportsPopupEditing(draft.itemType)) {
    return 'Invalid item payload.';
  }
  if (typeof draft.title !== 'string' || draft.title.trim().length === 0) {
    return 'Title is required.';
  }
  if (draft.itemType === 'login') {
    if (!draft.username || draft.username.trim().length === 0) {
      return 'Username is required for login items.';
    }
    if (!draft.password || draft.password.length === 0) {
      return 'Password is required for login items.';
    }
  }
  if (draft.itemType === 'card') {
    if (!draft.number || draft.number.trim().length === 0) {
      return 'Card number is required.';
    }
  }
  return null;
}

async function refreshSelectedItemHistory(options = {}) {
  const selected = getSelectedCredential();
  if (!selected) {
    detailHistoryRecords = [];
    detailHistoryCursor = null;
    detailHistoryError = '';
    detailHistoryLoading = false;
    renderDetailPanels();
    return;
  }
  const forceRefresh = options.force === true;
  const silentRefresh = options.silent === true;
  if (
    !forceRefresh &&
    detailHistoryItemId === selected.itemId &&
    Array.isArray(detailHistoryRecords) &&
    detailHistoryRecords.length > 0
  ) {
    renderDetailPanels();
    return;
  }
  detailHistoryLoading = !silentRefresh;
  detailHistoryItemId = selected.itemId;
  detailHistoryError = '';
  renderDetailPanels();
  const response = await sendBackgroundCommand({
    type: 'vaultlite.list_item_history',
    itemId: selected.itemId,
    force: forceRefresh,
    limit: 40,
    awaitCompletion: options.awaitCompletion !== false,
  });
  detailHistoryLoading = false;
  if (!response?.ok) {
    detailHistoryError = response?.message || 'Could not load item history.';
    renderDetailPanels();
    return;
  }
  detailHistoryError = '';
  detailHistoryRecords = Array.isArray(response.records) ? response.records : [];
  detailHistoryCursor = typeof response.nextCursor === 'string' ? response.nextCursor : null;
  detailHistorySelectedId = detailHistoryRecords[0]?.historyId ?? null;
  renderDetailPanels();
}

async function refreshFolderState(options = {}) {
  const response = await sendBackgroundCommand({
    type: 'vaultlite.list_folders_state',
    force: options.force === true,
    revalidate: options.revalidate === true,
    awaitCompletion: options.awaitCompletion !== false,
  });
  if (!response?.ok) {
    return;
  }
  folderStateSnapshot = {
    folders: Array.isArray(response.folders) ? response.folders : [],
    assignments: Array.isArray(response.assignments) ? response.assignments : [],
    etag: typeof response.etag === 'string' ? response.etag : null,
  };
  if (detailPanelMode === 'create' || detailPanelMode === 'edit' || Boolean(getSelectedCredential())) {
    renderDetailPanels();
  }
}

async function createFolderFromDetailEditor() {
  const requestedName = await openCreateFolderDialog();
  if (typeof requestedName !== 'string') {
    return;
  }
  const trimmedName = requestedName.trim();
  if (!trimmedName) {
    return;
  }
  elements.createFolderConfirmBtn.disabled = true;
  const response = await sendBackgroundCommand({
    type: 'vaultlite.upsert_folder',
    name: trimmedName,
  });
  if (!response?.ok) {
    setCreateFolderError(response?.message || 'Could not create folder right now.');
    elements.createFolderConfirmBtn.disabled = false;
    return;
  }
  folderStateSnapshot = {
    folders: Array.isArray(response.folders) ? response.folders : [],
    assignments: Array.isArray(response.assignments) ? response.assignments : [],
    etag: typeof response.etag === 'string' ? response.etag : folderStateSnapshot.etag,
  };
  if (typeof response.folderId === 'string' && response.folderId.length > 0) {
    setActiveDetailFolderId(response.folderId);
  }
  resolveCreateFolderDialog(trimmedName);
  renderDetailPanels();
}

function openDetailCreatePanel(itemType = 'login') {
  detailCreateDraft = createDraftForItemType(itemType);
  detailCreateFolderId = '';
  detailCreatePendingAttachments = [];
  detailEditDraft = null;
  detailEditFolderId = '';
  detailEditPendingAttachments = [];
  detailEditPasswordVisible = false;
  detailAttachmentItemId = null;
  detailAttachmentRecords = [];
  detailAttachmentLoading = false;
  detailAttachmentError = '';
  detailPanelMode = 'create';
  setDetailEditError('');
  closeDetailMenu();
  elements.detailTitle.textContent = detailCreateDraft.title || 'New item';
  void refreshFolderState({ revalidate: true, awaitCompletion: false });
  renderCredentialDetails();
  persistPopupUiState();
}

function openDetailEditPanel() {
  const selected = getSelectedCredential();
  detailEditDraft = createEditDraftFromSelected(selected);
  if (!detailEditDraft) {
    setAlert('warning', 'This item is not ready for editing yet. Try again after sync.');
    return;
  }
  detailPanelMode = 'edit';
  detailEditFolderId =
    folderStateSnapshot.assignments.find((entry) => entry?.itemId === selected?.itemId)?.folderId ?? '';
  detailEditPendingAttachments = [];
  detailEditPasswordVisible = false;
  setDetailEditError('');
  closeDetailMenu();
  elements.detailTitle.textContent = detailEditDraft.title;
  void refreshFolderState({ revalidate: true });
  void refreshDetailAttachments({
    force: false,
    silent: true,
  });
  renderCredentialDetails();
  persistPopupUiState();
}

async function saveDetailCreate() {
  const draft = readDetailDraftFromDom();
  const validationError = validateDetailEditDraft(draft);
  if (validationError) {
    setDetailEditError(validationError);
    return;
  }
  const attachments = [];
  for (const entry of detailCreatePendingAttachments) {
    attachments.push({
      fileName: entry.fileName,
      contentType: entry.contentType,
      size: entry.size,
      buffer: await entry.file.arrayBuffer(),
    });
  }
  const response = await sendBackgroundCommand({
    type: 'vaultlite.create_item',
    itemType: draft.itemType,
    payload: draft,
    folderId: detailCreateFolderId || null,
    attachments,
  });
  if (!response?.ok) {
    setDetailEditError(response?.message || 'Could not create item right now.');
    return;
  }

  const createdItem = response?.item && typeof response.item === 'object' ? response.item : draft;
  const createdRevision =
    Number.isFinite(response?.item?.revision) && response.item.revision > 0 ? Math.trunc(response.item.revision) : 1;
  const normalizedCreatedItem = normalizePopupItemFromPayload(
    {
      itemId: response.item.itemId,
      itemType: draft.itemType,
      title: createdItem.title,
      subtitle: '',
      searchText: createdItem.title || '',
      firstUrl: Array.isArray(createdItem.urls) ? createdItem.urls[0] ?? '' : '',
      urlHostSummary: 'No URL',
      matchFlags: {
        exactOrigin: false,
        domainScore: 0,
      },
      isDeleted: false,
    },
    createdItem,
    createdRevision,
  );
  currentItems = [normalizedCreatedItem, ...currentItems];
  selectedItemId = normalizedCreatedItem.itemId;
  detailPanelMode = 'view';
  detailCreateDraft = null;
  detailCreateFolderId = '';
  detailCreatePendingAttachments = [];
  renderCredentialList(currentItems);
  persistPopupUiState();
  const attachmentFailures = Array.isArray(response.attachmentFailures) ? response.attachmentFailures : [];
  if (attachmentFailures.length > 0) {
    setAlert('warning', 'Item created, but one or more attachments failed to upload.');
  } else {
    setAlert('success', 'Item created.');
  }
  void refreshStateAndMaybeList({
    showLoading: false,
  });
}

async function openDetailHistoryPanel(options = {}) {
  detailPanelMode = 'history';
  detailHistoryView = 'list';
  closeDetailMenu();
  renderCredentialDetails();
  await refreshSelectedItemHistory({
    force: options.force === true,
  });
}

async function saveDetailEdits() {
  if (detailPanelMode === 'create') {
    await saveDetailCreate();
    return;
  }
  const selected = getSelectedCredential();
  if (!selected) {
    return;
  }
  const draft = readDetailDraftFromDom();
  const validationError = validateDetailEditDraft(draft);
  if (validationError) {
    setDetailEditError(validationError);
    return;
  }
  setDetailEditError('');
  const attachments = [];
  for (const entry of detailEditPendingAttachments) {
    attachments.push({
      fileName: entry.fileName,
      contentType: entry.contentType,
      size: entry.size,
      buffer: await entry.file.arrayBuffer(),
    });
  }
  const response = await sendBackgroundCommand({
    type: 'vaultlite.update_item',
    itemId: selected.itemId,
    itemType: draft.itemType,
    expectedRevision: Number.isFinite(selected.revision) ? Math.trunc(selected.revision) : 0,
    payload: draft,
    folderId: detailEditFolderId || null,
    attachments,
  });
  if (!response?.ok) {
    setDetailEditError(response?.message || 'Could not save item changes.');
    if (response?.code === 'revision_conflict' || response?.code === 'item_deleted_conflict') {
      void refreshStateAndMaybeList({
        showLoading: false,
      });
    }
    return;
  }

  const updatedPayload = response?.item && typeof response.item === 'object' ? response.item : draft;
  const nextRevision =
    Number.isFinite(response?.item?.revision) && response.item.revision > 0
      ? Math.trunc(response.item.revision)
      : Number.isFinite(selected.revision)
        ? Math.trunc(selected.revision) + 1
        : 1;
  currentItems = currentItems.map((entry) =>
    entry.itemId === selected.itemId ? normalizePopupItemFromPayload(entry, updatedPayload, nextRevision) : entry,
  );
  detailPanelMode = 'view';
  detailEditDraft = null;
  detailEditFolderId = '';
  detailEditPendingAttachments = [];
  detailEditPasswordVisible = false;
  renderCredentialList(currentItems);
  persistPopupUiState();
  const attachmentFailures = Array.isArray(response.attachmentFailures) ? response.attachmentFailures : [];
  void refreshSelectedItemHistory({ force: true, silent: true });
  void refreshFolderState();
  void refreshDetailAttachments({
    force: true,
    silent: true,
  });
  setAlert(
    attachmentFailures.length > 0 ? 'warning' : 'success',
    attachmentFailures.length > 0 ? 'Item updated, but one or more attachments failed to upload.' : 'Item updated.',
  );
}

async function handleDetailAction(action, sourceButton = null, overrideSelected = null) {
  const selected = overrideSelected ?? getSelectedCredential();
  if (!selected) {
    return;
  }

  if (action === 'open_edit') {
    if (selected.isDeleted === true) {
      setAlert('warning', 'Deleted items cannot be edited.');
      return;
    }
    openDetailEditPanel();
    return;
  }
  if (action === 'open_history') {
    await openDetailHistoryPanel();
    return;
  }
  if (action === 'delete_item') {
    if (selected.isDeleted === true) {
      setAlert('warning', 'Item is already in Trash.');
      return;
    }
    const confirmed = await openDeleteConfirmationDialog(selected.title || 'this item');
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      const response = await sendBackgroundCommand({
        type: 'vaultlite.delete_item',
        itemId: selected.itemId,
      });
      if (!response?.ok) {
        setAlert('danger', response?.message || 'Could not delete item right now.');
        if (response?.code === 'not_found') {
          await refreshStateAndMaybeList({ showLoading: false });
        }
        return;
      }
      setAlert('success', 'Item moved to Trash.');
      detailPanelMode = 'view';
      detailEditDraft = null;
      detailEditPasswordVisible = false;
      await refreshStateAndMaybeList({ showLoading: false });
    } finally {
      setBusy(false);
    }
    return;
  }

  if (action === 'restore_item') {
    setBusy(true);
    try {
      const response = await sendBackgroundCommand({
        type: 'vaultlite.restore_item',
        itemId: selected.itemId,
      });
      if (!response?.ok) {
        setAlert('danger', response?.message || 'Could not restore item right now.');
        if (response?.code === 'not_found') {
          await refreshStateAndMaybeList({ showLoading: false });
        }
        return;
      }
      setAlert('success', 'Item restored.');
      detailPanelMode = 'view';
      detailEditDraft = null;
      detailEditPasswordVisible = false;
      await refreshStateAndMaybeList({ showLoading: false });
    } finally {
      setBusy(false);
    }
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
    await copyRawValue(selected.firstUrl || selected.urlHostSummary || '', sourceButton, 'Copied URL');
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
      applyLocalCredentialListForCurrentQuery();
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
    void handleUnlock();
  });
  elements.unlockRevealBtn.addEventListener('click', () => {
    setUnlockPasswordVisibility(!unlockPasswordRevealed);
    elements.unlockPasswordInput.focus();
  });
  elements.unlockPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleUnlock();
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
    void lockExtension();
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
        showCopyToast('Copied password');
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
          showCopyToast('Copied password');
        } catch {
          setAlert('warning', 'Could not copy generated password.');
        }
      })();
    }
  });
  elements.newItemBtn.addEventListener('click', () => {
    openDetailCreatePanel('login');
  });

  elements.searchInput.addEventListener('input', () => {
    persistPopupUiState();
    updateSearchClearVisibility();
    applyLocalCredentialListForCurrentQuery();
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
    applyLocalCredentialListForCurrentQuery();
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
        void openCredentialUrl(actionItemId, { closePopup: true });
        return;
      }
      if (action === 'quick-fill') {
        event.preventDefault();
        event.stopPropagation();
        if (actionButton instanceof HTMLElement) {
          actionButton.blur();
        }
        void triggerFill(actionItemId);
        return;
      }
      if (action === 'restore-item') {
        event.preventDefault();
        event.stopPropagation();
        if (actionButton instanceof HTMLElement) {
          actionButton.blur();
        }
        const targetItem = getCredentialByItemId(actionItemId);
        void runAction(async () => handleDetailAction('restore_item', actionButton, targetItem));
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
        void openCredentialUrl(itemId, { closePopup: true });
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
      applyLocalCredentialListForCurrentQuery();
      scheduleSearchRefresh(0);
      return;
    }
    if (action === 'show-all') {
      suggestedOnly = false;
      persistPopupUiState();
      applyLocalCredentialListForCurrentQuery();
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

  elements.detailActionEdit.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeDetailMenu();
    openDetailEditPanel();
  });

  elements.detailActionHistory.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeDetailMenu();
    void runAction(async () => {
      await openDetailHistoryPanel();
    });
  });

  elements.detailActionDelete.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeDetailMenu();
    void handleDetailAction('delete_item');
  });

  elements.confirmDeleteConfirmBtn.addEventListener('click', () => {
    resolveDeleteConfirmation(true);
  });

  elements.confirmDeleteCancelBtn.addEventListener('click', () => {
    resolveDeleteConfirmation(false);
  });

  elements.confirmDeleteModal.addEventListener('mousedown', (event) => {
    if (event.target === elements.confirmDeleteModal) {
      resolveDeleteConfirmation(false);
    }
  });

  elements.detailEditCancelBtn.addEventListener('click', () => {
    clearDetailTransientPanels();
    renderCredentialDetails();
  });

  elements.detailEditSaveBtn.addEventListener('click', () => {
    void runAction(async () => {
      await saveDetailEdits();
    });
  });

  elements.detailFolderSelect.addEventListener('change', () => {
    if (!isEditorMode()) {
      return;
    }
    setActiveDetailFolderId(elements.detailFolderSelect.value || '');
  });

  elements.detailFolderCreateBtn.addEventListener('click', () => {
    if (!isEditorMode()) {
      return;
    }
    void createFolderFromDetailEditor();
  });

  elements.detailAttachmentAddBtn.addEventListener('click', () => {
    if (!isEditorMode()) {
      return;
    }
    elements.detailAttachmentInput.click();
  });

  elements.detailAttachmentInput.addEventListener('change', (event) => {
    if (!isEditorMode()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const file = target.files?.[0];
    if (!file) {
      return;
    }
    queueDetailAttachmentFile(file);
    target.value = '';
    renderDetailPanels();
  });

  elements.detailTitle.addEventListener('keydown', (event) => {
    if (!isEditorMode()) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  });

  elements.detailTitle.addEventListener('blur', () => {
    if (!isEditorMode()) {
      return;
    }
    const normalized = normalizeInlineEditableText(elements.detailTitle);
    elements.detailTitle.textContent = normalized;
    persistPopupUiState();
  });

  elements.credentialDetailsContent.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !isEditorMode()) {
      return;
    }
    if (target === elements.searchInput) {
      return;
    }
    const draft = readDetailDraftFromDom();
    if (!draft) {
      return;
    }
    if (detailPanelMode === 'create') {
      detailCreateDraft = draft;
    } else {
      detailEditDraft = draft;
    }
    persistPopupUiState();
  });

  elements.credentialDetailsContent.addEventListener(
    'blur',
    () => {
      if (!isEditorMode()) {
        return;
      }
      const draft = readDetailDraftFromDom();
      if (!draft) {
        return;
      }
      if (detailPanelMode === 'create') {
        detailCreateDraft = draft;
      } else {
        detailEditDraft = draft;
      }
      persistPopupUiState();
    },
    true,
  );

  elements.detailHistoryNavBackBtn.addEventListener('click', () => {
    if (detailPanelMode === 'history' && detailHistoryView === 'entry') {
      detailHistoryView = 'list';
      renderCredentialDetails();
      return;
    }
  });

  elements.detailHistoryNavCloseBtn.addEventListener('click', () => {
    detailPanelMode = 'view';
    detailHistoryView = 'list';
    renderCredentialDetails();
  });

  elements.detailHistorySummaryToggle.addEventListener('click', () => {
    if (!detailHistoryRecords.length) {
      void runAction(async () => {
        await openDetailHistoryPanel({ force: true });
      });
      return;
    }
    detailHistorySummaryExpanded = !detailHistorySummaryExpanded;
    renderDetailPanels();
  });

  elements.detailCustomFieldAddBtn.addEventListener('click', () => {
    const activeDraft = getActiveDetailDraft();
    if (!activeDraft || !isEditorMode()) {
      return;
    }
    const draft = readDetailDraftFromDom();
    if (draft) {
      if (detailPanelMode === 'create') {
        detailCreateDraft = draft;
      } else {
        detailEditDraft = draft;
      }
    }
    const targetDraft = getActiveDetailDraft();
    targetDraft.customFields = Array.isArray(targetDraft.customFields) ? targetDraft.customFields : [];
    targetDraft.customFields.push({ label: '', value: '' });
    renderDetailPanels();
  });

  elements.detailCustomFieldsList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const removeButton = target.closest('[data-custom-field-remove]');
    if (!(removeButton instanceof HTMLElement)) {
      return;
    }
    if (!isEditorMode() || !getActiveDetailDraft()) {
      return;
    }
    const indexRaw = removeButton.getAttribute('data-custom-field-remove');
    const index = Number(indexRaw);
    if (!Number.isFinite(index) || index < 0) {
      return;
    }
    const draft = readDetailDraftFromDom();
    if (!draft) {
      return;
    }
    draft.customFields = Array.isArray(draft.customFields) ? draft.customFields : [];
    draft.customFields.splice(index, 1);
    if (detailPanelMode === 'create') {
      detailCreateDraft = draft;
    } else {
      detailEditDraft = draft;
    }
    renderDetailPanels();
  });

  elements.detailCustomFieldsList.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!target.hasAttribute('data-custom-field-label-inline')) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      target.blur();
    }
  });

  elements.detailCustomFieldsList.addEventListener('blur', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!target.hasAttribute('data-custom-field-label-inline')) {
      return;
    }
    target.textContent = normalizeInlineEditableText(target);
  }, true);

  elements.detailAttachmentList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !isEditorMode()) {
      return;
    }
    const removeButton = target.closest('[data-create-attachment-remove]');
    if (!(removeButton instanceof HTMLElement)) {
      return;
    }
    const attachmentId = removeButton.getAttribute('data-create-attachment-remove');
    if (!attachmentId) {
      return;
    }
    setActivePendingAttachments(activePendingAttachments().filter((entry) => entry.id !== attachmentId));
    renderDetailPanels();
  });

  elements.createFolderNameInput.addEventListener('input', () => {
    setCreateFolderError('');
    elements.createFolderConfirmBtn.disabled = elements.createFolderNameInput.value.trim().length === 0;
  });

  elements.createFolderNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && elements.createFolderNameInput.value.trim().length > 0) {
      event.preventDefault();
      resolveCreateFolderDialog(elements.createFolderNameInput.value);
    }
  });

  elements.createFolderConfirmBtn.addEventListener('click', () => {
    resolveCreateFolderDialog(elements.createFolderNameInput.value);
  });

  elements.createFolderCancelBtn.addEventListener('click', () => {
    resolveCreateFolderDialog(null);
  });

  elements.createFolderModal.addEventListener('mousedown', (event) => {
    if (event.target === elements.createFolderModal) {
      resolveCreateFolderDialog(null);
    }
  });

  elements.detailHistoryList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const selectButton = target.closest('[data-history-select]');
    if (selectButton instanceof HTMLElement) {
      const historyId = selectButton.getAttribute('data-history-select');
      if (historyId) {
        detailHistorySelectedId = historyId;
        detailHistoryView = 'entry';
        renderCredentialDetails();
      }
      return;
    }
  });

  elements.detailHistoryEntryDetail.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const revealButton = target.closest('[data-history-reveal]');
    if (!(revealButton instanceof HTMLElement)) {
      return;
    }
    const revealKey = revealButton.getAttribute('data-history-reveal');
    if (!revealKey) {
      return;
    }
    if (detailHistoryRevealKeys.has(revealKey)) {
      detailHistoryRevealKeys.delete(revealKey);
    } else {
      detailHistoryRevealKeys.add(revealKey);
    }
    renderDetailPanels();
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
      schedulePopupReconcile(['session', 'vault', 'folders', 'icons']);
    }
  });

  document.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
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
      if (!elements.createFolderModal.hidden) {
        event.preventDefault();
        resolveCreateFolderDialog(null);
        return;
      }
      if (!elements.confirmDeleteModal.hidden) {
        event.preventDefault();
        resolveDeleteConfirmation(false);
        return;
      }
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

  elements.detailNotesRow.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest('button')) {
      return;
    }
    const defaultAction = elements.detailNotesRow.dataset.defaultAction;
    if (!defaultAction) {
      return;
    }
    void runAction(async () => handleDetailAction(defaultAction));
  });

  elements.detailNotesActionA.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const action = elements.detailNotesActionA.dataset.action;
    if (!action) {
      return;
    }
    void runAction(async () => handleDetailAction(action, elements.detailNotesActionA));
  });

  elements.credentialDetailsContent.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const inlineRowActionButton = target.closest('[data-inline-row-action]');
    if (inlineRowActionButton instanceof HTMLElement) {
      const action = inlineRowActionButton.getAttribute('data-inline-row-action');
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void runAction(async () => handleDetailAction(action, inlineRowActionButton));
      return;
    }
    const toggleButton = target.closest('[data-edit-password-toggle]');
    if (!(toggleButton instanceof HTMLElement)) {
      return;
    }
    if (!isEditorMode()) {
      return;
    }
    const selected = getActiveDetailItem();
    if (!selected || selected.itemType !== 'login') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const draft = readDetailDraftFromDom();
    if (draft) {
      if (detailPanelMode === 'create') {
        detailCreateDraft = draft;
      } else {
        detailEditDraft = draft;
      }
    }
    detailEditPasswordVisible = !detailEditPasswordVisible;
    renderDetailPanels();
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
      return 5_000;
    }
    if (effectivePhase === 'remote_authentication_required' && currentState?.hasTrustedState) {
      return 5_000;
    }
    if (effectivePhase === 'ready') {
      return 5 * 60 * 1000;
    }
    return 20 * 60 * 1000;
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
      scheduleReconcile: true,
    });
  }, refreshIntervalMs);
}

if (chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type !== BACKGROUND_REALTIME_UPDATE_MESSAGE_TYPE) {
      return;
    }
    scheduleRealtimePopupRefresh(message.domains);
  });
}

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!changes || typeof changes !== 'object') {
      return;
    }
    if (areaName !== 'session' && areaName !== 'local') {
      return;
    }
    const signalChange = changes[REALTIME_POPUP_SIGNAL_STORAGE_KEY];
    const signalValue = signalChange?.newValue;
    const domains = Array.isArray(signalValue?.domains) ? signalValue.domains : null;
    if (!domains || domains.length === 0) {
      return;
    }
    scheduleRealtimePopupRefresh(domains);
  });
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
  await loadPersistedReadyListSnapshot(
    trustedIdentitySignature,
    typeof trustedRecord?.serverOrigin === 'string' ? trustedRecord.serverOrigin : null,
  );
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
  await refreshStateAndMaybeList({
    scheduleReconcile: false,
  });
  if (resolveEffectivePopupPhase(currentState) === 'ready') {
    schedulePopupReconcileAfterFirstPaint(['session', 'vault', 'folders', 'icons']);
  }
  scheduleRefresh();
})();
