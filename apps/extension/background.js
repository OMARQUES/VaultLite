import {
  STORAGE_LOCAL_CONFIG_KEY,
  STORAGE_LOCAL_TRUSTED_KEY,
  STORAGE_SESSION_KEY,
  canonicalizeServerUrl,
  deriveWebOriginFromServerOrigin,
  isAllowedSettingsPath,
  isAllowedAuthPath,
  isAllowedUnlockPath,
  isCredentialAllowedForSite,
  isPageUrlEligibleForFill,
  matchesQuery,
  nowIso,
  resolveSenderContext,
  scoreDomainMatch,
  contextHasCapability,
} from './runtime-common.js';
import { createExtensionApiClient } from './runtime-api.js';
import {
  MANUAL_ICON_STORAGE_KEY,
  removeManualIconRecord,
  sanitizeIconHost,
  upsertManualIconRecord,
  validateManualIconDataUrl,
} from './manual-icons.js';
import {
  calibrateLocalUnlockKdfProfile,
  createLocalUnlockEnvelope,
  decryptLocalUnlockEnvelope,
  decryptVaultItemPayload,
  encryptVaultItemPayload,
  normalizeLocalUnlockKdfProfile,
  normalizeVaultItemPayload,
} from './runtime-crypto.js';
import { diagnoseCredentialCache } from './credential-cache-diagnostics.js';
import { buildFaviconCandidates } from './favicon-candidates.js';
import {
  clearExtensionProjectionCache,
  clearExtensionVaultCache,
  loadExtensionProjectionCache,
  loadExtensionVaultCache,
  saveExtensionProjectionCache,
  saveExtensionVaultCache,
} from './local-vault-cache.js';

const CREDENTIAL_CACHE_TTL_MS = 60_000;
const RESTORE_THROTTLE_MS = 15_000;
const DEFAULT_DEVICE_NAME = 'VaultLite Extension';
const MEMORY_IDLE_LOCK_DEFAULT_MS = 5 * 60 * 1000;
const MEMORY_IDLE_LOCK_MIN_MS = 30 * 1000;
const MEMORY_IDLE_LOCK_MAX_MS = 24 * 60 * 60 * 1000;
const AUTO_PAIR_BRIDGE_SCRIPT_ID = 'vaultlite-auto-pair-bridge-v1';
const EXTENSION_LINK_FALLBACK_INTERVAL_SECONDS = 5;
const EXTENSION_LINK_MAX_INTERVAL_SECONDS = 30;
const EXTENSION_LINK_MIN_INTERVAL_SECONDS = 1;
const STORAGE_LINK_PAIRING_SESSION_KEY = 'vaultlite.link_pairing_session.v1';
const STORAGE_SESSION_LIST_CACHE_KEY = 'vaultlite.session_list_cache.v1';
const STORAGE_ICON_DOMAIN_REGISTRATION_KEY = 'vaultlite.icon_domain_registration.v1';
const ICON_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const ICON_DISCOVERY_RETRY_MS = 15 * 60 * 1000;
const ICON_RESOLVE_MISS_RETRY_MS = 15 * 60 * 1000;
const ICON_HYDRATION_START_COOLDOWN_MS = 5 * 60 * 1000;
const ICON_STATE_HYDRATION_START_COOLDOWN_MS = 10_000;
const ICONS_STATE_RETRY_COOLDOWN_MS = 10_000;
const ICONS_STATE_QUERY_DOMAINS_MAX = 500;
const ICON_DOMAIN_SYNC_CONCURRENCY = 6;
const ICON_DOMAIN_SYNC_BATCH_SIZE = 120;
const MANUAL_ICON_HYDRATE_COOLDOWN_MS = 5 * 60 * 1000;
const ICON_CACHE_STORAGE_KEY = 'vaultlite.icon_cache.v1';
const ICON_CACHE_PERSIST_DEBOUNCE_MS = 1_000;
const ICON_CACHE_MAX_ENTRIES = 160;
const ICON_CACHE_MAX_DATA_URL_LENGTH = 128 * 1024;
const ICON_DOMAIN_REGISTRATION_MAX_ENTRIES = 20_000;
const ICON_DOMAIN_REGISTRATION_PERSIST_DEBOUNCE_MS = 750;
const STORAGE_UNLOCK_CONTEXT_KEY = 'vaultlite.unlocked_context.v1';
const STORAGE_RUNTIME_STATE_KEY = 'vaultlite.runtime_state.v1';
const UNLOCK_GRANT_RETRY_COOLDOWN_MS = 10_000;
const UNLOCK_GRANT_APPROVAL_COOLDOWN_MS = 2_000;
const UNLOCK_GRANT_APPROVAL_ALARM_NAME = 'vaultlite.unlock_grant_approval.v1';
const UNLOCK_GRANT_APPROVAL_ALARM_PERIOD_MINUTES = 0.5;
const UNLOCK_GRANT_DEFAULT_INTERVAL_SECONDS = 5;
const UNLOCK_GRANT_TTL_SECONDS = 120;
const UNLOCK_GRANT_STATUS_SLOWDOWN_SECONDS = 5;
const MANUAL_ICON_SYNC_QUEUE_STORAGE_KEY = 'vaultlite.manual_icon_sync_queue.v1';
const PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES = 200;
const LOCAL_VAULT_CACHE_DEPLOYMENT_FINGERPRINT_FALLBACK = 'unknown';
const REALTIME_CONNECT_INITIAL_JITTER_MAX_MS = 750;
const REALTIME_RECONNECT_BASE_DELAY_MS = 500;
const REALTIME_RECONNECT_MAX_DELAY_MS = 15_000;
const REALTIME_RECONNECT_STABLE_RESET_MS = 60_000;
const REALTIME_ACK_BATCH_SIZE = 20;
const REALTIME_ACK_MAX_INTERVAL_MS = 1_000;
const REALTIME_HEARTBEAT_IDLE_MS = 25_000;
const REALTIME_HEARTBEAT_TIMEOUT_MS = 10_000;
const REALTIME_KEEPALIVE_INTERVAL_MS = 20_000;
const REALTIME_METADATA_REFRESH_INTERVAL_MS = 5 * 60_000;
const REALTIME_POPUP_NOTIFY_DEBOUNCE_MS = 150;
const REALTIME_POPUP_SIGNAL_STORAGE_KEY = 'vaultlite.realtime.popup.signal.v1';
const REALTIME_ICONS_RESYNC_DEBOUNCE_MS = 1_500;
const REALTIME_ICONS_RESYNC_COOLDOWN_MS = 10_000;
const REALTIME_CURSOR_PERSIST_DEBOUNCE_MS = 2_000;
const ICON_DOMAIN_SYNC_BACKOFF_BASE_MS = 3_000;
const ICON_DOMAIN_SYNC_BACKOFF_MAX_MS = 60_000;

const state = {
  phase: 'anonymous',
  serverOrigin: null,
  deploymentFingerprint: null,
  userId: null,
  username: null,
  deviceId: null,
  deviceName: null,
  sessionExpiresAt: null,
  unlockIdleTimeoutMs: MEMORY_IDLE_LOCK_DEFAULT_MS,
  lockRevision: 0,
  hasTrustedState: false,
  lastError: null,
};

let trustedState = null;
let sessionToken = null;
let unlockedContext = null;
let manualIconMap = {};
let manualIconSyncQueue = {};
let credentialsCache = {
  loadedAt: 0,
  credentials: [],
};
let sessionListProjectionCache = {
  cacheKey: null,
  loadedAt: 0,
  items: [],
};
let bridgeUnavailable = false;
const projectionCacheDiagnostics = {
  idbHitCount: 0,
  idbLoadFailureCount: 0,
  idbPersistFailureCount: 0,
  idbClearFailureCount: 0,
  idbOpenFailureCount: 0,
  idbDecryptFailureCount: 0,
  sessionFallbackHitCount: 0,
  sessionLoadFailureCount: 0,
  sessionPersistFailureCount: 0,
  quotaExceededCount: 0,
  lastFailureCode: null,
  lastFailureAt: null,
  projectionHitCount: 0,
  localCacheHitCount: 0,
  networkSyncCount: 0,
  lastProjectionLoadMs: null,
  lastLocalCacheLoadMs: null,
  lastFirstItemRenderMs: null,
  lastListSource: null,
  lastEmptyListReasonCode: null,
  lastNetworkSyncStartedAt: null,
  lastNetworkSyncFinishedAt: null,
};
let cacheWarmupState = 'idle';
let cacheWarmupInFlight = null;
let cacheWarmupError = null;
let localCacheLoadInFlight = null;
const canonicalIconCacheByDomain = new Map();
const iconDiscoverLastAttemptByDomain = new Map();
const iconResolveMissByDomain = new Map();
let iconHydrationInFlight = null;
let lastIconHydrationStartedAt = 0;
let lastIconsStateFailureAt = 0;
let iconsStateEtag = null;
let manualIconsEtag = null;
let lastManualIconHydratedAt = 0;
let manualIconHydrationInFlight = null;
let iconCachePersistTimer = null;
let iconCachePersistInFlight = null;
let iconCacheDirty = false;
let lastRestoreAttemptAt = 0;
let idleLockTimer = null;
let restoreInFlightPromise = null;
let unlockGrantApproveInFlight = null;
let unlockGrantConsumeInFlight = null;
let lastUnlockGrantAttemptAt = 0;
let lastUnlockGrantApproveAttemptAt = 0;
let recoverRetryState = {
  attempts: 0,
  nextAttemptAt: 0,
  lastCode: null,
};
let lastUnlockedLockRevision = 0;
let lastEmptyCacheRetryAt = 0;
let linkPairingSession = null;
let manualIconSyncQueueProcessInFlight = null;
let runtimeInitializationPromise = null;
let runtimeInitialized = false;
let lastCredentialCacheSource = 'none';
const iconDomainRegistrationByItemId = new Map();
let iconDomainRegistrationPersistTimer = null;
let iconDomainRegistrationPersistInFlight = null;
let lastIconDomainBatchFallbackLogAt = 0;
let iconDomainSyncBackoffUntil = 0;
let iconDomainSyncBackoffAttempt = 0;
let realtimeMetadataLoadedAt = 0;
const realtimeRuntime = {
  enabled: false,
  wsBaseUrl: null,
  iconsAssetBaseUrl: null,
  authLeaseSeconds: 600,
  heartbeatIntervalMs: 25_000,
  flags: null,
};
const realtimeConnection = {
  socket: null,
  reconnectTimer: null,
  ackTimer: null,
  heartbeatTimer: null,
  heartbeatTimeout: null,
  keepaliveTimer: null,
  cursor: 0,
  pendingAckSeq: 0,
  ackBatchCount: 0,
  reconnectAttempt: 0,
  connecting: false,
  intentionallyClosed: false,
  lastConnectedAt: 0,
  lastReceivedAt: 0,
};
let realtimePopupNotifyTimer = null;
const realtimePopupNotifyDomains = new Set();
let realtimeIconsResyncTimer = null;
let realtimeIconsResyncInFlight = null;
let realtimeIconsResyncQueued = false;
let realtimeIconsResyncIncludeManual = false;
let lastRealtimeIconsResyncAt = 0;
const realtimeIconsResyncDomains = new Set();
let realtimeCursorPersistTimer = null;

function sessionStorageArea() {
  if (!chrome.storage || !chrome.storage.session) {
    return null;
  }
  return chrome.storage.session;
}

function extensionOrigin() {
  return chrome.runtime.getURL('/').replace(/\/+$/u, '');
}

function iconDomainRegistrationCacheKey() {
  const username =
    typeof state.username === 'string' && state.username.length > 0
      ? state.username
      : typeof trustedState?.username === 'string' && trustedState.username.length > 0
        ? trustedState.username
        : null;
  const deviceId =
    typeof state.deviceId === 'string' && state.deviceId.length > 0
      ? state.deviceId
      : typeof trustedState?.deviceId === 'string' && trustedState.deviceId.length > 0
        ? trustedState.deviceId
        : null;
  const deploymentFingerprint =
    typeof state.deploymentFingerprint === 'string' && state.deploymentFingerprint.length > 0
      ? state.deploymentFingerprint
      : typeof trustedState?.deploymentFingerprint === 'string' && trustedState.deploymentFingerprint.length > 0
        ? trustedState.deploymentFingerprint
        : null;
  if (!username || !deviceId || !deploymentFingerprint) {
    return null;
  }
  return `${deploymentFingerprint}:${username}:${deviceId}`;
}

async function persistIconDomainRegistrationCacheBestEffort() {
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  const cacheKey = iconDomainRegistrationCacheKey();
  if (!cacheKey || iconDomainRegistrationByItemId.size === 0) {
    try {
      await sessionStorage.remove(STORAGE_ICON_DOMAIN_REGISTRATION_KEY);
    } catch {
      // Best effort only.
    }
    return;
  }
  const entries = {};
  let written = 0;
  for (const [itemId, signature] of iconDomainRegistrationByItemId.entries()) {
    if (written >= ICON_DOMAIN_REGISTRATION_MAX_ENTRIES) {
      break;
    }
    if (typeof itemId !== 'string' || itemId.length === 0) {
      continue;
    }
    if (typeof signature !== 'string' || signature.length === 0 || signature.length > 1024) {
      continue;
    }
    entries[itemId] = signature;
    written += 1;
  }
  try {
    await sessionStorage.set({
      [STORAGE_ICON_DOMAIN_REGISTRATION_KEY]: {
        cacheKey,
        entries,
        updatedAt: nowIso(),
      },
    });
  } catch {
    // Best effort only.
  }
}

function scheduleIconDomainRegistrationCachePersist() {
  if (iconDomainRegistrationPersistTimer !== null) {
    return;
  }
  iconDomainRegistrationPersistTimer = setTimeout(() => {
    iconDomainRegistrationPersistTimer = null;
    if (iconDomainRegistrationPersistInFlight) {
      return;
    }
    iconDomainRegistrationPersistInFlight = persistIconDomainRegistrationCacheBestEffort().finally(() => {
      iconDomainRegistrationPersistInFlight = null;
    });
  }, ICON_DOMAIN_REGISTRATION_PERSIST_DEBOUNCE_MS);
}

async function clearPersistedIconDomainRegistrationCacheBestEffort() {
  if (iconDomainRegistrationPersistTimer !== null) {
    clearTimeout(iconDomainRegistrationPersistTimer);
    iconDomainRegistrationPersistTimer = null;
  }
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  try {
    await sessionStorage.remove(STORAGE_ICON_DOMAIN_REGISTRATION_KEY);
  } catch {
    // Best effort only.
  }
}

function toBase64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function randomBase64Url(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function localUnlockPayloadFromTrustedState(accountKey = null) {
  if (!trustedState) {
    return null;
  }
  const resolvedAccountKey =
    typeof accountKey === 'string' && accountKey.length >= 20
      ? accountKey
      : typeof unlockedContext?.accountKey === 'string' && unlockedContext.accountKey.length >= 20
        ? unlockedContext.accountKey
        : null;
  if (!resolvedAccountKey) {
    return null;
  }
  return {
    accountKey: resolvedAccountKey,
    encryptedAccountBundle: trustedState.encryptedAccountBundle,
    accountKeyWrapped: trustedState.accountKeyWrapped,
  };
}

function sameLocalUnlockKdfProfile(leftProfile, rightProfile) {
  if (!leftProfile || !rightProfile) {
    return false;
  }
  const leftTagLength = Number.isFinite(leftProfile.tagLength)
    ? Math.trunc(Number(leftProfile.tagLength))
    : Number.isFinite(leftProfile.dkLen)
      ? Math.trunc(Number(leftProfile.dkLen))
      : 32;
  const rightTagLength = Number.isFinite(rightProfile.tagLength)
    ? Math.trunc(Number(rightProfile.tagLength))
    : Number.isFinite(rightProfile.dkLen)
      ? Math.trunc(Number(rightProfile.dkLen))
      : 32;
  return (
    leftProfile.memory === rightProfile.memory &&
    leftProfile.passes === rightProfile.passes &&
    leftProfile.parallelism === rightProfile.parallelism &&
    leftTagLength === rightTagLength
  );
}

async function maybeUpgradeLocalUnlockEnvelopeProfile(password) {
  if (!trustedState || typeof password !== 'string' || password.length === 0) {
    return;
  }
  const payload = localUnlockPayloadFromTrustedState();
  if (!payload) {
    return;
  }
  const currentProfile = normalizeLocalUnlockKdfProfile(
    trustedState.localUnlockKdfProfile ?? trustedState.localUnlockEnvelope?.kdfProfile ?? null,
  );
  let calibratedProfile = currentProfile;
  try {
    calibratedProfile = normalizeLocalUnlockKdfProfile(await calibrateLocalUnlockKdfProfile());
  } catch {
    calibratedProfile = currentProfile;
  }
  const shouldRewriteEnvelope =
    !sameLocalUnlockKdfProfile(currentProfile, calibratedProfile) ||
    !trustedState.localUnlockEnvelope?.kdfProfile;
  if (!shouldRewriteEnvelope) {
    return;
  }
  try {
    const upgradedEnvelope = await createLocalUnlockEnvelope({
      password,
      authSalt: trustedState.authSalt,
      payload,
      kdfProfile: calibratedProfile,
    });
    trustedState = {
      ...trustedState,
      localUnlockEnvelope: upgradedEnvelope,
      localUnlockKdfProfile: calibratedProfile,
      updatedAt: nowIso(),
    };
    await persistTrusted(trustedState);
  } catch {
    // Best effort only.
  }
}

function normalizeLinkInterval(value) {
  if (!Number.isFinite(value)) {
    return EXTENSION_LINK_FALLBACK_INTERVAL_SECONDS;
  }
  const parsed = Math.trunc(value);
  if (parsed < EXTENSION_LINK_MIN_INTERVAL_SECONDS) {
    return EXTENSION_LINK_MIN_INTERVAL_SECONDS;
  }
  if (parsed > EXTENSION_LINK_MAX_INTERVAL_SECONDS) {
    return EXTENSION_LINK_MAX_INTERVAL_SECONDS;
  }
  return parsed;
}

function normalizeUnlockIdleTimeoutMs(value) {
  if (!Number.isFinite(value)) {
    return MEMORY_IDLE_LOCK_DEFAULT_MS;
  }
  const parsed = Math.trunc(value);
  if (parsed < MEMORY_IDLE_LOCK_MIN_MS) {
    return MEMORY_IDLE_LOCK_MIN_MS;
  }
  if (parsed > MEMORY_IDLE_LOCK_MAX_MS) {
    return MEMORY_IDLE_LOCK_MAX_MS;
  }
  return parsed;
}

function normalizeLockRevision(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const parsed = Math.trunc(value);
  return parsed < 0 ? 0 : parsed;
}

function normalizeRuntimeTimestamp(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const parsed = Math.trunc(value);
  return parsed > 0 ? parsed : 0;
}

function normalizeRecoverRetryState(value) {
  if (!isRecord(value)) {
    return {
      attempts: 0,
      nextAttemptAt: 0,
      lastCode: null,
    };
  }
  const attempts = Number.isFinite(value.attempts) ? Math.max(0, Math.trunc(value.attempts)) : 0;
  const nextAttemptAt = Number.isFinite(value.nextAttemptAt) ? Math.max(0, Math.trunc(value.nextAttemptAt)) : 0;
  const lastCode = typeof value.lastCode === 'string' ? value.lastCode : null;
  return {
    attempts,
    nextAttemptAt,
    lastCode,
  };
}

function nextRecoverRetryDelayMs(attempt) {
  const safeAttempt = Math.max(1, attempt);
  const capped = Math.min(6, safeAttempt);
  return Math.min(5 * 60 * 1000, 1_500 * 2 ** (capped - 1));
}

function classifyRecoverFailure(error) {
  const described = describeError(error, 'recover_failed');
  const status = Number.isFinite(error?.status) ? error.status : null;
  const transientCodes = new Set([
    'request_timeout',
    'rate_limited',
    'request_failed_429',
    'request_failed_500',
    'request_failed_502',
    'request_failed_503',
    'request_failed_504',
    'server_connection_failed',
  ]);
  const terminalCodes = new Set([
    'no_linked_surface',
    'device_revoked',
    'recover_key_invalid',
    'context_mismatch',
  ]);

  if (terminalCodes.has(described.code)) {
    return { kind: 'terminal', ...described };
  }
  if (transientCodes.has(described.code)) {
    return { kind: 'transient', ...described };
  }
  if (status !== null && status >= 500) {
    return { kind: 'transient', ...described };
  }
  if (status === 429) {
    return { kind: 'transient', ...described };
  }
  if (described.code === 'unauthorized' || described.code === 'request_failed_401') {
    return { kind: 'terminal', ...described };
  }
  return { kind: 'transient', ...described };
}

function clearLinkPairingSession() {
  linkPairingSession = null;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidLinkPairingSessionStorageShape(entry) {
  if (!isRecord(entry)) {
    return false;
  }
  if (
    typeof entry.requestId !== 'string' ||
    typeof entry.shortCode !== 'string' ||
    typeof entry.fingerprintPhrase !== 'string' ||
    typeof entry.expiresAt !== 'string' ||
    typeof entry.clientNonce !== 'string' ||
    typeof entry.deploymentFingerprint !== 'string' ||
    typeof entry.serverOrigin !== 'string' ||
    typeof entry.privateKeyJwk !== 'object' ||
    entry.privateKeyJwk === null
  ) {
    return false;
  }
  return true;
}

async function persistLinkPairingSession() {
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  if (!linkPairingSession?.privateKey) {
    await sessionStorage.remove(STORAGE_LINK_PAIRING_SESSION_KEY);
    return;
  }
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', linkPairingSession.privateKey);
  await sessionStorage.set({
    [STORAGE_LINK_PAIRING_SESSION_KEY]: {
      requestId: linkPairingSession.requestId,
      shortCode: linkPairingSession.shortCode,
      fingerprintPhrase: linkPairingSession.fingerprintPhrase,
      expiresAt: linkPairingSession.expiresAt,
      interval: normalizeLinkInterval(linkPairingSession.interval),
      lastStatus: linkPairingSession.lastStatus ?? 'authorization_pending',
      clientNonce: linkPairingSession.clientNonce,
      deploymentFingerprint: linkPairingSession.deploymentFingerprint,
      serverOrigin: linkPairingSession.serverOrigin,
      privateKeyJwk,
    },
  });
}

async function clearPersistedLinkPairingSession() {
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  await sessionStorage.remove(STORAGE_LINK_PAIRING_SESSION_KEY);
}

async function clearLinkPairingSessionPersisted() {
  clearLinkPairingSession();
  await clearPersistedLinkPairingSession();
}

function linkPairingStatusMessage(status) {
  switch (status) {
    case 'approved':
      return 'Request approved. Finalizing secure connection...';
    case 'rejected':
      return 'Connection request was rejected from trusted surface.';
    case 'expired':
      return 'Connection request expired. Start again.';
    case 'consumed':
      return 'Connection request already consumed. Start again.';
    case 'denied':
      return 'Requester proof was denied.';
    case 'slow_down':
      return 'Too many status checks. Slowing down polling.';
    case 'authorization_pending':
    default:
      return 'Waiting for approval in trusted surface settings...';
  }
}

function buildLinkSignaturePayload(input) {
  return new TextEncoder().encode(
    [
      'vaultlite-extension-link-v1',
      input.action,
      input.requestId,
      input.nonce,
      input.clientNonce,
      input.serverOrigin,
      input.deploymentFingerprint,
    ].join('|'),
  );
}

async function signLinkProof(input) {
  if (!linkPairingSession?.privateKey) {
    throw new Error('link_request_not_found');
  }
  const nonce = randomBase64Url(16);
  const payload = buildLinkSignaturePayload({
    action: input.action,
    requestId: linkPairingSession.requestId,
    nonce,
    clientNonce: linkPairingSession.clientNonce,
    serverOrigin: linkPairingSession.serverOrigin,
    deploymentFingerprint: linkPairingSession.deploymentFingerprint,
  });
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    linkPairingSession.privateKey,
    payload,
  );
  return {
    nonce,
    signature: toBase64Url(new Uint8Array(signature)),
  };
}

function buildUnlockGrantSignaturePayload(input) {
  return new TextEncoder().encode(
    [
      'vaultlite-unlock-grant-v1',
      input.action,
      input.requestId,
      input.nonce,
      input.clientNonce,
      input.serverOrigin,
      input.deploymentFingerprint,
    ].join('|'),
  );
}

async function signUnlockGrantProof(input) {
  const payload = buildUnlockGrantSignaturePayload(input);
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    input.privateKey,
    payload,
  );
  return {
    nonce: input.nonce,
    signature: toBase64Url(new Uint8Array(signature)),
  };
}

function ok(data = {}) {
  return { ok: true, ...data };
}

function fail(code, message) {
  return {
    ok: false,
    code,
    message,
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function applyRealtimeRuntimeMetadata(metadata) {
  const realtime = metadata?.realtime;
  const flags = realtime && typeof realtime === 'object' ? realtime.flags : null;
  const wsFlagEnabled =
    !flags || typeof flags.realtime_ws_v1 !== 'boolean' ? true : flags.realtime_ws_v1 === true;
  const applyFlagEnabled =
    !flags || typeof flags.realtime_apply_extension_v1 !== 'boolean'
      ? true
      : flags.realtime_apply_extension_v1 === true;
  realtimeRuntime.enabled = Boolean(realtime?.enabled) && wsFlagEnabled && applyFlagEnabled;
  realtimeRuntime.wsBaseUrl = typeof realtime?.wsBaseUrl === 'string' ? realtime.wsBaseUrl : null;
  const explicitIconsAssetBaseUrl =
    typeof metadata?.iconsAssetBaseUrl === 'string' && metadata.iconsAssetBaseUrl.length > 0
      ? metadata.iconsAssetBaseUrl
      : null;
  let metadataServerOrigin = null;
  try {
    metadataServerOrigin = canonicalizeServerUrl(String(metadata?.serverUrl ?? ''));
  } catch {
    metadataServerOrigin = null;
  }
  realtimeRuntime.iconsAssetBaseUrl = explicitIconsAssetBaseUrl || metadataServerOrigin || state.serverOrigin || null;
  realtimeRuntime.authLeaseSeconds = Number.isFinite(realtime?.authLeaseSeconds)
    ? Math.max(60, Math.trunc(realtime.authLeaseSeconds))
    : 600;
  realtimeRuntime.heartbeatIntervalMs = Number.isFinite(realtime?.heartbeatIntervalMs)
    ? Math.max(5_000, Math.trunc(realtime.heartbeatIntervalMs))
    : 25_000;
  realtimeRuntime.flags = flags && typeof flags === 'object' ? { ...flags } : null;
}

async function ensureRealtimeRuntimeMetadata(apiClient, options = {}) {
  const force = options?.force === true;
  const now = Date.now();
  if (!force && realtimeMetadataLoadedAt > 0 && now - realtimeMetadataLoadedAt < REALTIME_METADATA_REFRESH_INTERVAL_MS) {
    return;
  }
  if (!apiClient) {
    return;
  }
  try {
    const metadata = await apiClient.getRuntimeMetadata();
    applyRealtimeRuntimeMetadata(metadata);
    if (typeof metadata?.deploymentFingerprint === 'string' && metadata.deploymentFingerprint.length > 0) {
      state.deploymentFingerprint = metadata.deploymentFingerprint;
    }
    realtimeMetadataLoadedAt = Date.now();
  } catch {
    if (force) {
      realtimeRuntime.enabled = false;
    }
  }
}

function shouldRunRealtimeSocket() {
  return Boolean(
    realtimeRuntime.enabled &&
      state.phase === 'ready' &&
      state.serverOrigin &&
      sessionToken &&
      trustedState &&
      hasValidUnlockedContext(),
  );
}

function clearRealtimeReconnectTimer() {
  if (realtimeConnection.reconnectTimer !== null) {
    clearTimeout(realtimeConnection.reconnectTimer);
    realtimeConnection.reconnectTimer = null;
  }
}

function clearRealtimeAckTimer() {
  if (realtimeConnection.ackTimer !== null) {
    clearTimeout(realtimeConnection.ackTimer);
    realtimeConnection.ackTimer = null;
  }
}

function clearRealtimeHeartbeatTimers() {
  if (realtimeConnection.heartbeatTimer !== null) {
    clearInterval(realtimeConnection.heartbeatTimer);
    realtimeConnection.heartbeatTimer = null;
  }
  if (realtimeConnection.heartbeatTimeout !== null) {
    clearTimeout(realtimeConnection.heartbeatTimeout);
    realtimeConnection.heartbeatTimeout = null;
  }
  if (realtimeConnection.keepaliveTimer !== null) {
    clearInterval(realtimeConnection.keepaliveTimer);
    realtimeConnection.keepaliveTimer = null;
  }
}

function closeRealtimeSocket(code = 1000, reason = 'client_stop', markIntentional = true) {
  const socket = realtimeConnection.socket;
  if (!socket) {
    return;
  }
  realtimeConnection.intentionallyClosed = markIntentional;
  try {
    socket.close(code, reason);
  } catch {
    // Best effort close only.
  } finally {
    realtimeConnection.socket = null;
  }
}

function clearRealtimeCursorPersistTimer() {
  if (realtimeCursorPersistTimer !== null) {
    clearTimeout(realtimeCursorPersistTimer);
    realtimeCursorPersistTimer = null;
  }
}

function scheduleRealtimeCursorPersist() {
  if (realtimeCursorPersistTimer !== null) {
    return;
  }
  realtimeCursorPersistTimer = setTimeout(() => {
    realtimeCursorPersistTimer = null;
    void persistRuntimeState();
  }, REALTIME_CURSOR_PERSIST_DEBOUNCE_MS);
}

function flushRealtimeAck() {
  const socket = realtimeConnection.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN || realtimeConnection.pendingAckSeq <= 0) {
    return;
  }
  try {
    socket.send(
      JSON.stringify({
        type: 'ack',
        seq: realtimeConnection.pendingAckSeq,
      }),
    );
    realtimeConnection.ackBatchCount = 0;
    clearRealtimeAckTimer();
  } catch {
    // Best effort only.
  }
}

function scheduleRealtimeAck() {
  if (realtimeConnection.ackBatchCount >= REALTIME_ACK_BATCH_SIZE) {
    flushRealtimeAck();
    return;
  }
  if (realtimeConnection.ackTimer !== null) {
    return;
  }
  realtimeConnection.ackTimer = setTimeout(() => {
    realtimeConnection.ackTimer = null;
    flushRealtimeAck();
  }, REALTIME_ACK_MAX_INTERVAL_MS);
}

function scheduleRealtimeReconnect(initial = false) {
  if (!shouldRunRealtimeSocket()) {
    return;
  }
  clearRealtimeReconnectTimer();
  const delayMs = initial
    ? Math.round(Math.random() * REALTIME_CONNECT_INITIAL_JITTER_MAX_MS)
    : Math.round(
        Math.random() *
          Math.min(
            REALTIME_RECONNECT_BASE_DELAY_MS * 2 ** realtimeConnection.reconnectAttempt,
            REALTIME_RECONNECT_MAX_DELAY_MS,
          ),
      );
  realtimeConnection.reconnectTimer = setTimeout(() => {
    realtimeConnection.reconnectTimer = null;
    void connectRealtimeSocket();
  }, Math.max(0, delayMs));
}

function schedulePopupRealtimeNotification(domains) {
  if (!Array.isArray(domains)) {
    return;
  }
  for (const domain of domains) {
    if (typeof domain === 'string' && domain.length > 0) {
      realtimePopupNotifyDomains.add(domain);
    }
  }
  if (realtimePopupNotifyDomains.size === 0) {
    return;
  }
  if (realtimePopupNotifyTimer !== null) {
    return;
  }
  realtimePopupNotifyTimer = setTimeout(() => {
    realtimePopupNotifyTimer = null;
    const nextDomains = Array.from(realtimePopupNotifyDomains);
    realtimePopupNotifyDomains.clear();
    if (nextDomains.length === 0) {
      return;
    }
    const signalPayload = {
      domains: nextDomains,
      emittedAt: nowIso(),
      nonce: randomBase64Url(12),
    };
    const signalArea = sessionStorageArea() ?? chrome.storage?.local ?? null;
    if (signalArea?.set) {
      void signalArea
        .set({
          [REALTIME_POPUP_SIGNAL_STORAGE_KEY]: signalPayload,
        })
        .catch(() => {
          // Best effort signal only.
        });
    }
    if (!chrome.runtime?.sendMessage) {
      return;
    }
    try {
      const sendPromise = chrome.runtime.sendMessage({
        type: 'vaultlite.background.realtime_update',
        domains: nextDomains,
        emittedAt: signalPayload.emittedAt,
      });
      if (sendPromise && typeof sendPromise.catch === 'function') {
        sendPromise.catch(() => {
          // Popup may not be open; ignore.
        });
      }
    } catch {
      // Popup receiver is best effort only.
    }
  }, REALTIME_POPUP_NOTIFY_DEBOUNCE_MS);
}

async function refreshIconCacheFromRealtimeSignal() {
  return refreshIconCacheFromRealtimeDomains([]);
}

async function refreshIconCacheFromRealtimeDomains(domains) {
  const activeTab = await fetchActiveTab();
  const activePageUrl = activeTab?.tabUrl ?? '';
  const explicitDomains = Array.isArray(domains)
    ? Array.from(
        new Set(
          domains
            .map((domain) => normalizeIconDomainForApi(domain))
            .filter((domain) => Boolean(domain)),
        ),
      )
    : [];

  if (explicitDomains.length > 0) {
    await hydrateCanonicalIconsForDomains(explicitDomains, []);
    return;
  }

  const projectedItems =
    credentialsCache.credentials.length > 0
      ? projectCredentialsForPage(activePageUrl)
      : projectCredentialsFromSessionCacheForPage(activePageUrl);
  const projectedDomains = collectProjectedDomains(projectedItems);
  if (projectedDomains.length === 0) {
    return;
  }
  await hydrateCanonicalIconsForDomains(projectedDomains, projectedItems);
}

function isLocalRealtimeEventSource(sourceDeviceId) {
  return (
    typeof sourceDeviceId === 'string' &&
    sourceDeviceId.length > 0 &&
    typeof state.deviceId === 'string' &&
    state.deviceId.length > 0 &&
    sourceDeviceId === state.deviceId
  );
}

function queueRealtimeIconsResync(input = {}) {
  if (Array.isArray(input.domains)) {
    for (const domain of input.domains) {
      const normalized = normalizeIconDomainForApi(domain);
      if (normalized) {
        realtimeIconsResyncDomains.add(normalized);
      }
    }
  }
  if (input.includeManual === true) {
    realtimeIconsResyncIncludeManual = true;
  }
  if (realtimeIconsResyncTimer !== null) {
    return;
  }
  realtimeIconsResyncTimer = setTimeout(() => {
    realtimeIconsResyncTimer = null;
    void runRealtimeIconsResync();
  }, REALTIME_ICONS_RESYNC_DEBOUNCE_MS);
}

async function runRealtimeIconsResync() {
  if (realtimeIconsResyncInFlight) {
    realtimeIconsResyncQueued = true;
    return;
  }
  const elapsedMs = Date.now() - lastRealtimeIconsResyncAt;
  if (elapsedMs < REALTIME_ICONS_RESYNC_COOLDOWN_MS) {
    const waitMs = Math.max(1, REALTIME_ICONS_RESYNC_COOLDOWN_MS - elapsedMs);
    if (realtimeIconsResyncTimer === null) {
      realtimeIconsResyncTimer = setTimeout(() => {
        realtimeIconsResyncTimer = null;
        void runRealtimeIconsResync();
      }, waitMs);
    }
    return;
  }

  const domains = Array.from(realtimeIconsResyncDomains);
  realtimeIconsResyncDomains.clear();
  const includeManual = realtimeIconsResyncIncludeManual;
  realtimeIconsResyncIncludeManual = false;
  lastRealtimeIconsResyncAt = Date.now();

  realtimeIconsResyncInFlight = (async () => {
    if (includeManual) {
      await hydrateManualIconsFromServerBestEffort();
    }
    await refreshIconCacheFromRealtimeDomains(domains);
    const popupDomains = ['icons_state'];
    if (includeManual) {
      popupDomains.push('icons_manual');
    }
    schedulePopupRealtimeNotification(popupDomains);
  })()
    .catch(() => {
      // Best effort only.
    })
    .finally(() => {
      realtimeIconsResyncInFlight = null;
      if (realtimeIconsResyncQueued || realtimeIconsResyncDomains.size > 0 || realtimeIconsResyncIncludeManual) {
        realtimeIconsResyncQueued = false;
        queueRealtimeIconsResync();
      }
    });
  await realtimeIconsResyncInFlight;
}

function refreshFromRealtimeDomains(domains) {
  if (!Array.isArray(domains)) {
    return;
  }
  if (domains.includes('vault')) {
    void refreshCredentialCache({
      force: true,
      awaitCompletion: true,
    })
      .then((result) => {
        if (result?.ok) {
          schedulePopupRealtimeNotification(['vault']);
        }
      })
      .catch(() => {});
  }
  if (domains.includes('icons_manual')) {
    queueRealtimeIconsResync({
      includeManual: true,
    });
  }
  if (domains.includes('icons_state')) {
    queueRealtimeIconsResync();
  }
}

function handleRealtimeServerEvent(eventEnvelope) {
  if (!eventEnvelope || typeof eventEnvelope !== 'object') {
    return;
  }
  if (isLocalRealtimeEventSource(eventEnvelope.sourceDeviceId)) {
    return;
  }
  const topic = typeof eventEnvelope.topic === 'string' ? eventEnvelope.topic : '';
  if (!topic) {
    return;
  }
  if (topic.startsWith('vault.item.')) {
    void refreshCredentialCache({
      force: true,
      awaitCompletion: true,
    })
      .then((result) => {
        if (result?.ok) {
          schedulePopupRealtimeNotification(['vault']);
        }
      })
      .catch(() => {});
    return;
  }
  if (topic.startsWith('icons.')) {
    const payloadDomains = [];
    const eventPayload = eventEnvelope.payload;
    if (eventPayload && typeof eventPayload === 'object') {
      if (typeof eventPayload.domain === 'string') {
        payloadDomains.push(eventPayload.domain);
      }
      if (Array.isArray(eventPayload.domains)) {
        payloadDomains.push(...eventPayload.domains);
      }
    }
    queueRealtimeIconsResync({
      domains: payloadDomains,
      includeManual: topic.startsWith('icons.manual.'),
    });
    return;
  }
  if (topic.startsWith('password_history.') || topic.startsWith('vault.attachment.')) {
    // Advisory in extension V1; existing APIs refresh lazily from popup actions.
  }
}

function startRealtimeHeartbeat() {
  clearRealtimeHeartbeatTimers();
  realtimeConnection.heartbeatTimer = setInterval(() => {
    const socket = realtimeConnection.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (Date.now() - realtimeConnection.lastReceivedAt < REALTIME_HEARTBEAT_IDLE_MS) {
      return;
    }
    try {
      socket.send(
        JSON.stringify({
          type: 'ping',
          ts: Date.now(),
        }),
      );
    } catch {
      return;
    }
    if (realtimeConnection.heartbeatTimeout !== null) {
      clearTimeout(realtimeConnection.heartbeatTimeout);
    }
    realtimeConnection.heartbeatTimeout = setTimeout(() => {
      realtimeConnection.heartbeatTimeout = null;
      if (realtimeConnection.socket && realtimeConnection.socket.readyState === WebSocket.OPEN) {
        closeRealtimeSocket(1011, 'heartbeat_timeout', false);
      }
    }, REALTIME_HEARTBEAT_TIMEOUT_MS);
  }, 5_000);
  realtimeConnection.keepaliveTimer = setInterval(() => {
    const socket = realtimeConnection.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(
        JSON.stringify({
          type: 'ping',
          ts: Date.now(),
        }),
      );
    } catch {
      // Ignore keepalive failures.
    }
  }, REALTIME_KEEPALIVE_INTERVAL_MS);
}

async function handleRealtimeCloseCode(code) {
  if (code === 4405) {
    await restoreSessionInternal(true);
    if (shouldRunRealtimeSocket()) {
      realtimeConnection.reconnectAttempt = 0;
      scheduleRealtimeReconnect(true);
    }
    return;
  }
  if (code === 4401 || code === 4402 || code === 4403 || code === 4404 || code === 4406) {
    await restoreSessionInternal(true);
    return;
  }
  realtimeConnection.reconnectAttempt += 1;
  scheduleRealtimeReconnect(false);
}

async function connectRealtimeSocket() {
  if (typeof WebSocket === 'undefined') {
    return;
  }
  if (realtimeConnection.connecting || realtimeConnection.socket || !shouldRunRealtimeSocket()) {
    return;
  }
  const apiClient = currentApiClient();
  if (!apiClient || !sessionToken) {
    return;
  }
  realtimeConnection.connecting = true;
  try {
    const tokenOutput = await apiClient.getRealtimeConnectToken({
      bearerToken: sessionToken,
      cursor: realtimeConnection.cursor,
    });
    if (!shouldRunRealtimeSocket()) {
      return;
    }
    const wsUrl = new URL(String(tokenOutput.wsUrl));
    wsUrl.searchParams.set('token', String(tokenOutput.connectToken));
    wsUrl.searchParams.set('cursor', String(realtimeConnection.cursor));
    const socket = new WebSocket(wsUrl.toString());
    realtimeConnection.socket = socket;
    socket.onopen = () => {
      realtimeConnection.lastConnectedAt = Date.now();
      realtimeConnection.lastReceivedAt = Date.now();
      realtimeConnection.reconnectAttempt = 0;
      startRealtimeHeartbeat();
    };
    socket.onmessage = (event) => {
      realtimeConnection.lastReceivedAt = Date.now();
      if (realtimeConnection.heartbeatTimeout !== null) {
        clearTimeout(realtimeConnection.heartbeatTimeout);
        realtimeConnection.heartbeatTimeout = null;
      }
      let parsed;
      try {
        parsed = JSON.parse(String(event?.data ?? '{}'));
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
        return;
      }
      if (parsed.type === 'hello') {
        if (Number.isFinite(parsed.cursor)) {
          realtimeConnection.cursor = Math.max(realtimeConnection.cursor, Math.trunc(parsed.cursor));
          scheduleRealtimeCursorPersist();
        }
        return;
      }
      if (parsed.type === 'pong') {
        return;
      }
      if (parsed.type === 'event' && parsed.event && Number.isFinite(parsed.event.seq)) {
        const seq = Math.max(0, Math.trunc(parsed.event.seq));
        realtimeConnection.cursor = Math.max(realtimeConnection.cursor, seq);
        realtimeConnection.pendingAckSeq = Math.max(realtimeConnection.pendingAckSeq, seq);
        realtimeConnection.ackBatchCount += 1;
        scheduleRealtimeAck();
        scheduleRealtimeCursorPersist();
        handleRealtimeServerEvent(parsed.event);
        return;
      }
      if (parsed.type === 'resync_required') {
        refreshFromRealtimeDomains(parsed.domains);
        return;
      }
      if (parsed.type === 'invalidated') {
        const codeByMessage = {
          session_revoked: 4401,
          lifecycle_not_active: 4402,
          trusted_state_invalid: 4403,
          lock_revision_advanced: 4404,
          auth_lease_expired_revalidate: 4405,
          deployment_fingerprint_mismatch: 4406,
        };
        const mappedCode =
          typeof parsed.code === 'string' && Number.isFinite(codeByMessage[parsed.code])
            ? codeByMessage[parsed.code]
            : 1000;
        closeRealtimeSocket(mappedCode, typeof parsed.message === 'string' ? parsed.message : 'invalidated', false);
      }
    };
    socket.onclose = (event) => {
      const closedSocket = realtimeConnection.socket;
      realtimeConnection.socket = null;
      clearRealtimeHeartbeatTimers();
      clearRealtimeAckTimer();
      if (closedSocket !== socket) {
        return;
      }
      if (realtimeConnection.intentionallyClosed) {
        realtimeConnection.intentionallyClosed = false;
        return;
      }
      if (Date.now() - realtimeConnection.lastConnectedAt >= REALTIME_RECONNECT_STABLE_RESET_MS) {
        realtimeConnection.reconnectAttempt = 0;
      }
      void handleRealtimeCloseCode(event.code);
    };
    socket.onerror = () => {
      // Let onclose drive reconnect decisions.
    };
  } catch (error) {
    const described = describeError(error, 'realtime_connect_failed');
    if (
      described.code === 'request_failed_401' ||
      described.code === 'request_failed_403' ||
      described.code === 'unauthorized'
    ) {
      await restoreSessionInternal(true);
      return;
    }
    realtimeConnection.reconnectAttempt += 1;
    scheduleRealtimeReconnect(false);
  } finally {
    realtimeConnection.connecting = false;
  }
}

function stopRealtimeSocket() {
  clearRealtimeReconnectTimer();
  clearRealtimeHeartbeatTimers();
  clearRealtimeAckTimer();
  flushRealtimeAck();
  realtimeConnection.ackBatchCount = 0;
  realtimeConnection.pendingAckSeq = 0;
  realtimeConnection.reconnectAttempt = 0;
  realtimeConnection.connecting = false;
  closeRealtimeSocket(1000, 'client_stop', true);
  clearRealtimeCursorPersistTimer();
  void persistRuntimeState();
}

function updateRealtimeLifecycle() {
  if (!shouldRunRealtimeSocket()) {
    stopRealtimeSocket();
    return;
  }
  if (realtimeConnection.socket || realtimeConnection.connecting || realtimeConnection.reconnectTimer !== null) {
    return;
  }
  scheduleRealtimeReconnect(true);
}

function setPhase(phase, errorMessage = null) {
  const previousPhase = state.phase;
  state.phase = phase;
  state.lastError = errorMessage;
  if (previousPhase !== phase) {
    if (phase === 'ready') {
      lastUnlockGrantApproveAttemptAt = 0;
      void maybeAutoApproveUnlockGrants({ source: 'phase-ready' });
    } else if (
      cacheWarmupState === 'running' ||
      cacheWarmupState === 'syncing' ||
      cacheWarmupState === 'loading_local'
    ) {
      cacheWarmupState = 'idle';
      cacheWarmupError = null;
    }
    void reconcileUnlockGrantApprovalAlarm();
  }
  updateRealtimeLifecycle();
}

function hasValidUnlockedContext() {
  return Boolean(
    unlockedContext &&
      typeof unlockedContext.accountKey === 'string' &&
      Number.isFinite(unlockedContext.unlockedUntil) &&
      unlockedContext.unlockedUntil > Date.now(),
  );
}

function shouldRunUnlockGrantApprovalScheduler() {
  return false;
}

async function reconcileUnlockGrantApprovalAlarm() {
  if (!chrome.alarms?.get || !chrome.alarms?.create || !chrome.alarms?.clear) {
    return;
  }
  try {
    if (!shouldRunUnlockGrantApprovalScheduler()) {
      await chrome.alarms.clear(UNLOCK_GRANT_APPROVAL_ALARM_NAME);
      return;
    }
    const existing = await chrome.alarms.get(UNLOCK_GRANT_APPROVAL_ALARM_NAME);
    if (!existing) {
      chrome.alarms.create(UNLOCK_GRANT_APPROVAL_ALARM_NAME, {
        periodInMinutes: UNLOCK_GRANT_APPROVAL_ALARM_PERIOD_MINUTES,
        delayInMinutes: UNLOCK_GRANT_APPROVAL_ALARM_PERIOD_MINUTES,
      });
    }
  } catch {
    // Best effort only.
  }
}

function clearSensitiveMemory() {
  unlockedContext = null;
  void clearPersistedUnlockedContext();
  clearLinkPairingSession();
  void clearPersistedLinkPairingSession();
  // Keep session list projection across local lock/unlock for fast first paint.
  // Projection is cleared only when trusted state is revoked/reset.
  credentialsCache = {
    loadedAt: 0,
    credentials: [],
  };
  lastCredentialCacheSource = 'none';
  cacheWarmupState = 'idle';
  cacheWarmupError = null;
  cacheWarmupInFlight = null;
  localCacheLoadInFlight = null;
  lastEmptyCacheRetryAt = 0;
  iconsStateEtag = null;
  manualIconsEtag = null;
  if (idleLockTimer !== null) {
    clearTimeout(idleLockTimer);
    idleLockTimer = null;
  }
}

function armIdleLockTimer() {
  if (state.phase !== 'ready') {
    return;
  }
  if (idleLockTimer !== null) {
    clearTimeout(idleLockTimer);
  }
  const delayMs = Math.max(
    1_000,
    Math.min(
      state.unlockIdleTimeoutMs,
      Math.max(
        1_000,
        Number.isFinite(unlockedContext?.unlockedUntil)
          ? unlockedContext.unlockedUntil - Date.now()
          : state.unlockIdleTimeoutMs,
      ),
    ),
  );
  idleLockTimer = setTimeout(() => {
    void lockInternal();
  }, delayMs);
}

async function persistUnlockedContext() {
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  if (!unlockedContext || typeof unlockedContext.accountKey !== 'string') {
    await sessionStorage.remove(STORAGE_UNLOCK_CONTEXT_KEY);
    return;
  }
  await sessionStorage.set({
    [STORAGE_UNLOCK_CONTEXT_KEY]: {
      accountKey: unlockedContext.accountKey,
      unlockedAt: unlockedContext.unlockedAt,
      unlockedUntil: unlockedContext.unlockedUntil,
      updatedAt: nowIso(),
    },
  });
}

async function clearPersistedUnlockedContext() {
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  await sessionStorage.remove(STORAGE_UNLOCK_CONTEXT_KEY);
}

async function persistRuntimeState() {
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  await sessionStorage.set({
    [STORAGE_RUNTIME_STATE_KEY]: {
      lockRevision: normalizeLockRevision(state.lockRevision),
      lastUnlockedLockRevision: normalizeLockRevision(lastUnlockedLockRevision),
      recoverRetryState: normalizeRecoverRetryState(recoverRetryState),
      lastIconHydrationStartedAt: normalizeRuntimeTimestamp(lastIconHydrationStartedAt),
      lastManualIconHydratedAt: normalizeRuntimeTimestamp(lastManualIconHydratedAt),
      realtimeCursor: normalizeRuntimeTimestamp(realtimeConnection.cursor),
      updatedAt: nowIso(),
    },
  });
}

function setRecoverRetryState(nextState) {
  recoverRetryState = normalizeRecoverRetryState(nextState);
  void persistRuntimeState();
}

function setLastUnlockedLockRevision(nextValue) {
  lastUnlockedLockRevision = normalizeLockRevision(nextValue);
  void persistRuntimeState();
}

function touchUnlockedContext() {
  if (state.phase !== 'ready' || !unlockedContext) {
    return;
  }
  const now = Date.now();
  unlockedContext.unlockedAt = now;
  unlockedContext.unlockedUntil = now + state.unlockIdleTimeoutMs;
  void persistUnlockedContext();
  armIdleLockTimer();
}

async function persistConfig(config) {
  await chrome.storage.local.set({
    [STORAGE_LOCAL_CONFIG_KEY]: config,
  });
}

async function persistTrusted(nextTrustedState) {
  await chrome.storage.local.set({
    [STORAGE_LOCAL_TRUSTED_KEY]: nextTrustedState,
  });
}

async function clearTrusted() {
  await chrome.storage.local.remove(STORAGE_LOCAL_TRUSTED_KEY);
}

async function persistSessionToken() {
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  if (!sessionToken) {
    await sessionStorage.remove(STORAGE_SESSION_KEY);
    return;
  }
  await sessionStorage.set({
    [STORAGE_SESSION_KEY]: {
      token: sessionToken,
      sessionExpiresAt: state.sessionExpiresAt,
      updatedAt: nowIso(),
    },
  });
}

async function clearExtensionSessionToken() {
  const hadSessionToken = Boolean(sessionToken);
  sessionToken = null;
  state.sessionExpiresAt = null;
  iconsStateEtag = null;
  manualIconsEtag = null;
  realtimeConnection.cursor = 0;
  clearRealtimeCursorPersistTimer();
  iconDomainRegistrationByItemId.clear();
  await clearPersistedIconDomainRegistrationCacheBestEffort();
  if (!hadSessionToken) {
    void persistRuntimeState();
    updateRealtimeLifecycle();
    return;
  }
  await persistSessionToken();
  await persistRuntimeState();
  await reconcileUnlockGrantApprovalAlarm();
  updateRealtimeLifecycle();
}

async function clearTrustedStateForReconnect(reasonMessage) {
  const cacheIdentity = {
    username: state.username,
    deviceId: state.deviceId,
    deploymentFingerprint: state.deploymentFingerprint,
  };
  trustedState = null;
  state.hasTrustedState = false;
  state.userId = null;
  state.username = null;
  state.deviceId = null;
  state.deviceName = null;
  state.deploymentFingerprint = null;
  state.lockRevision = 0;
  lastUnlockedLockRevision = 0;
  await clearTrusted();
  await clearExtensionSessionToken();
  setRecoverRetryState({
    attempts: 0,
    nextAttemptAt: 0,
    lastCode: null,
  });
  await clearCredentialCacheForIdentityBestEffort(cacheIdentity);
  await clearPersistedSessionListProjectionCacheBestEffort();
  clearSensitiveMemory();
  setPhase('pairing_required', reasonMessage);
}

function currentApiClient() {
  if (!state.serverOrigin) {
    return null;
  }
  return createExtensionApiClient(state.serverOrigin);
}

function mapKnownErrorToMessage(errorCode) {
  switch (errorCode) {
    case 'pairing_code_invalid':
      return 'Trusted-device request is invalid.';
    case 'pairing_code_expired':
      return 'Trusted-device request expired. Start a new request from the extension popup.';
    case 'pairing_code_already_used':
      return 'Trusted-device request was already consumed. Start a new request.';
    case 'pairing_context_mismatch':
      return 'Pairing context mismatch. Confirm extension server URL.';
    case 'pairing_rate_limited':
      return 'Too many attempts. Wait and try again.';
    case 'server_origin_not_allowed':
      return 'Server URL is not allowed for this extension.';
    case 'server_origin_permission_required':
      return 'Grant server origin permission in popup/options and try again.';
    case 'unsupported_local_unlock_version':
      return 'Trusted state version is not supported. Reset and pair this extension again.';
    case 'argon2_runtime_unavailable':
      return 'Extension crypto runtime is unavailable in this browser context. Reload the extension and try again.';
    case 'argon2_memory_budget_exceeded':
      return 'This browser could not allocate enough memory for secure unlock. Close heavy tabs/apps and try again.';
    case 'trusted_state_invalid_auth_salt':
      return 'Trusted local state is invalid. Reconnect this extension from web settings.';
    case 'request_timeout':
      return 'VaultLite server timed out. Check server URL and API availability.';
    case 'no_linked_surface':
      return 'Trusted link not found on server. Reconnect this extension from web settings.';
    case 'device_revoked':
      return 'This trusted device was revoked. Reconnect extension from web settings.';
    case 'recover_key_invalid':
      return 'Trusted recovery key is no longer valid. Reconnect this extension.';
    case 'server_connection_failed':
      return 'Could not connect to VaultLite server. Verify URL and local API status.';
    case 'server_origin_mismatch':
      return 'Server URL does not match runtime metadata. Verify your API/Web environment.';
    default:
      return null;
  }
}

function describeError(error, fallbackCode = 'unexpected_error') {
  const errorCode =
    typeof error?.code === 'string'
      ? error.code
      : typeof error?.message === 'string'
        ? error.message
        : fallbackCode;
  const mappedMessage = mapKnownErrorToMessage(errorCode);
  return {
    code: errorCode,
    message: mappedMessage ?? 'Operation failed. Try again.',
  };
}

function isCredentialDecryptFailure(error) {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'OperationError' || error.name === 'DataError';
  }
  const message = typeof error?.message === 'string' ? error.message : '';
  return message === 'OperationError' || message === 'DataError';
}

function withSessionIdentity(input) {
  state.userId = input.user?.userId ?? state.userId;
  state.username = input.user?.username ?? state.username;
  state.deviceId = input.device?.deviceId ?? state.deviceId;
  state.deviceName = input.device?.deviceName ?? state.deviceName;
  state.sessionExpiresAt = input.sessionExpiresAt ?? state.sessionExpiresAt;
  if (Number.isFinite(input.lockRevision)) {
    state.lockRevision = normalizeLockRevision(input.lockRevision);
    void persistRuntimeState();
  }
  if (Number.isFinite(input.unlockIdleTimeoutMs)) {
    state.unlockIdleTimeoutMs = normalizeUnlockIdleTimeoutMs(input.unlockIdleTimeoutMs);
  }
}

function snapshotForUi() {
  const linkRequest = linkPairingSession
    ? {
        requestId: linkPairingSession.requestId,
        shortCode: linkPairingSession.shortCode,
        fingerprintPhrase: linkPairingSession.fingerprintPhrase,
        expiresAt: linkPairingSession.expiresAt,
        interval: normalizeLinkInterval(linkPairingSession.interval),
        status: linkPairingSession.lastStatus ?? 'authorization_pending',
        message: linkPairingStatusMessage(linkPairingSession.lastStatus ?? 'authorization_pending'),
      }
    : null;
  return {
    phase: state.phase,
    serverOrigin: state.serverOrigin,
    deploymentFingerprint: state.deploymentFingerprint,
    userId: state.userId,
    username: state.username,
    deviceId: state.deviceId,
    deviceName: state.deviceName,
    sessionExpiresAt: state.sessionExpiresAt,
    unlockIdleTimeoutMs: state.unlockIdleTimeoutMs,
    lockRevision: normalizeLockRevision(state.lockRevision),
    lastUnlockedLockRevision: normalizeLockRevision(lastUnlockedLockRevision),
    hasTrustedState: state.hasTrustedState,
    hasTokenInMemory: Boolean(sessionToken),
    lastError: state.lastError,
    cacheWarmupState,
    cacheWarmupError,
    listSource: projectionCacheDiagnostics.lastListSource,
    bridgeUnavailable,
    linkRequest,
  };
}

function isCredentialCacheFresh() {
  return Date.now() - credentialsCache.loadedAt < CREDENTIAL_CACHE_TTL_MS;
}

function isSessionNearExpiry(minRemainingMs = 60_000) {
  if (!sessionToken) {
    return true;
  }
  const expiresAtMs = typeof state.sessionExpiresAt === 'string' ? Date.parse(state.sessionExpiresAt) : NaN;
  if (!Number.isFinite(expiresAtMs)) {
    return true;
  }
  return expiresAtMs - Date.now() <= Math.max(1_000, Math.trunc(minRemainingMs));
}

function shouldRefreshSessionAfterUnlock(previousPhase) {
  if (previousPhase === 'remote_authentication_required') {
    return true;
  }
  return isSessionNearExpiry(60_000);
}

function extensionCacheIdentity() {
  if (!state.username || !state.deviceId || !unlockedContext?.accountKey) {
    return null;
  }
  return {
    username: state.username,
    deviceId: state.deviceId,
    deploymentFingerprint: state.deploymentFingerprint ?? LOCAL_VAULT_CACHE_DEPLOYMENT_FINGERPRINT_FALLBACK,
    accountKey: unlockedContext.accountKey,
  };
}

function extensionProjectionCacheKey(input) {
  if (!input?.username || !input?.deviceId) {
    return null;
  }
  return `${input.username}:${input.deviceId}:${input.deploymentFingerprint}`;
}

function recordProjectionCacheDiagnostic(code) {
  if (typeof code !== 'string' || code.length === 0) {
    return;
  }
  projectionCacheDiagnostics.lastFailureCode = code;
  projectionCacheDiagnostics.lastFailureAt = nowIso();
  if (code === 'idb_open_failed') {
    projectionCacheDiagnostics.idbOpenFailureCount += 1;
  } else if (code === 'idb_decrypt_failed') {
    projectionCacheDiagnostics.idbDecryptFailureCount += 1;
  } else if (code === 'idb_load_failed') {
    projectionCacheDiagnostics.idbLoadFailureCount += 1;
  } else if (code === 'idb_persist_failed') {
    projectionCacheDiagnostics.idbPersistFailureCount += 1;
  } else if (code === 'idb_clear_failed') {
    projectionCacheDiagnostics.idbClearFailureCount += 1;
  } else if (code === 'session_load_failed') {
    projectionCacheDiagnostics.sessionLoadFailureCount += 1;
  } else if (code === 'session_persist_failed') {
    projectionCacheDiagnostics.sessionPersistFailureCount += 1;
  } else if (code === 'quota_exceeded') {
    projectionCacheDiagnostics.quotaExceededCount += 1;
  }
}

function classifyProjectionCacheErrorCode(error, fallbackCode) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  if (message.includes('quota') || message.includes('quotaexceeded')) {
    return 'quota_exceeded';
  }
  if (message.includes('indexeddb') || message.includes('idb')) {
    if (message.includes('open')) {
      return 'idb_open_failed';
    }
    if (message.includes('decrypt') || message.includes('operationerror')) {
      return 'idb_decrypt_failed';
    }
  }
  return fallbackCode;
}

function projectCredentialForListCache(credential) {
  const candidateUrls =
    credential?.itemType === 'login' && Array.isArray(credential.urls) ? credential.urls : [];
  const firstUrl = candidateUrls.length > 0 ? candidateUrls[0] : '';
  let urlHostSummary = credential?.itemType === 'login' ? 'No URL' : credential?.itemType ?? '—';
  for (const rawUrl of candidateUrls) {
    try {
      const host = new URL(rawUrl).hostname;
      if (host) {
        urlHostSummary = host;
        break;
      }
    } catch {
      // Ignore malformed URL in cache projection.
    }
  }
  return {
    itemId: credential?.itemId ?? '',
    itemType: credential?.itemType ?? 'login',
    title: credential?.title ?? 'Untitled item',
    subtitle: buildItemSubtitle(credential ?? {}),
    searchText: buildItemSearchText(credential ?? {}),
    firstUrl,
    urls: candidateUrls,
    urlHostSummary,
  };
}

function hydrateSessionListProjectionCacheFromCredentials() {
  const identity = extensionCacheIdentity();
  if (!identity || !Array.isArray(credentialsCache.credentials)) {
    return false;
  }
  const cacheKey = extensionProjectionCacheKey(identity);
  if (!cacheKey) {
    return false;
  }
  const nextItems = credentialsCache.credentials
    .map((entry) => projectCredentialForListCache(entry))
    .filter((entry) => typeof entry.itemId === 'string' && entry.itemId.length > 0);
  sessionListProjectionCache = {
    cacheKey,
    loadedAt: Date.now(),
    items: nextItems,
  };
  return true;
}

async function persistSessionListProjectionCacheBestEffort() {
  const identity = extensionCacheIdentity();
  const sessionStorage = sessionStorageArea();
  const payload =
    sessionListProjectionCache &&
    typeof sessionListProjectionCache.cacheKey === 'string' &&
    sessionListProjectionCache.cacheKey.length > 0 &&
    Array.isArray(sessionListProjectionCache.items)
      ? {
          cacheKey: sessionListProjectionCache.cacheKey,
          loadedAt: Number.isFinite(sessionListProjectionCache.loadedAt)
            ? Math.trunc(sessionListProjectionCache.loadedAt)
            : Date.now(),
          items: sessionListProjectionCache.items,
        }
      : null;

  if (identity && payload) {
    try {
      await saveExtensionProjectionCache({
        username: identity.username,
        deviceId: identity.deviceId,
        deploymentFingerprint: identity.deploymentFingerprint,
        accountKey: identity.accountKey,
        loadedAt: payload.loadedAt,
        items: payload.items,
      });
    } catch (error) {
      recordProjectionCacheDiagnostic(classifyProjectionCacheErrorCode(error, 'idb_persist_failed'));
    }
  }

  if (!sessionStorage) {
    return;
  }
  try {
    if (!payload) {
      await sessionStorage.remove(STORAGE_SESSION_LIST_CACHE_KEY);
      return;
    }
    await sessionStorage.set({
      [STORAGE_SESSION_LIST_CACHE_KEY]: payload,
    });
  } catch (error) {
    recordProjectionCacheDiagnostic(classifyProjectionCacheErrorCode(error, 'session_persist_failed'));
  }
}

async function loadSessionListProjectionCacheBestEffort() {
  const loadStartedAt = Date.now();
  const identity = extensionCacheIdentity();
  if (!identity) {
    projectionCacheDiagnostics.lastProjectionLoadMs = Date.now() - loadStartedAt;
    return false;
  }
  const expectedCacheKey = extensionProjectionCacheKey(identity);
  if (!expectedCacheKey) {
    projectionCacheDiagnostics.lastProjectionLoadMs = Date.now() - loadStartedAt;
    return false;
  }
  if (
    sessionListProjectionCache.cacheKey === expectedCacheKey &&
    Array.isArray(sessionListProjectionCache.items) &&
    sessionListProjectionCache.items.length > 0
  ) {
    projectionCacheDiagnostics.projectionHitCount += 1;
    projectionCacheDiagnostics.lastProjectionLoadMs = Date.now() - loadStartedAt;
    return true;
  }

  try {
    const persistedProjection = await loadExtensionProjectionCache({
      username: identity.username,
      deviceId: identity.deviceId,
      deploymentFingerprint: identity.deploymentFingerprint,
      accountKey: identity.accountKey,
    });
    if (persistedProjection && Array.isArray(persistedProjection.items) && persistedProjection.items.length > 0) {
      sessionListProjectionCache = {
        cacheKey: expectedCacheKey,
        loadedAt: Number.isFinite(Number(persistedProjection.loadedAt))
          ? Math.trunc(Number(persistedProjection.loadedAt))
          : Date.now(),
        items: persistedProjection.items,
      };
      projectionCacheDiagnostics.idbHitCount += 1;
      projectionCacheDiagnostics.projectionHitCount += 1;
      projectionCacheDiagnostics.lastProjectionLoadMs = Date.now() - loadStartedAt;
      return true;
    }
  } catch (error) {
    recordProjectionCacheDiagnostic(classifyProjectionCacheErrorCode(error, 'idb_load_failed'));
  }

  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return false;
  }
  try {
    const stored = await sessionStorage.get(STORAGE_SESSION_LIST_CACHE_KEY);
    const raw = stored?.[STORAGE_SESSION_LIST_CACHE_KEY] ?? null;
    if (!raw || typeof raw !== 'object') {
      return false;
    }
    if (raw.cacheKey !== expectedCacheKey || !Array.isArray(raw.items)) {
      return false;
    }
    const normalizedItems = raw.items
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const itemId = typeof entry.itemId === 'string' ? entry.itemId : '';
        if (!itemId) {
          return null;
        }
        const itemType = typeof entry.itemType === 'string' ? entry.itemType : 'login';
        const title = typeof entry.title === 'string' ? entry.title : 'Untitled item';
        const subtitle = typeof entry.subtitle === 'string' ? entry.subtitle : '—';
        const searchText = typeof entry.searchText === 'string' ? entry.searchText : title;
        const firstUrl = typeof entry.firstUrl === 'string' ? entry.firstUrl : '';
        const urls = Array.isArray(entry.urls)
          ? entry.urls.filter((value) => typeof value === 'string' && value.trim().length > 0)
          : [];
        const urlHostSummary = typeof entry.urlHostSummary === 'string' ? entry.urlHostSummary : 'No URL';
        return {
          itemId,
          itemType,
          title,
          subtitle,
          searchText,
          firstUrl,
          urls,
          urlHostSummary,
        };
      })
      .filter((entry) => Boolean(entry));
    if (normalizedItems.length === 0) {
      return false;
    }
    sessionListProjectionCache = {
      cacheKey: expectedCacheKey,
      loadedAt: Number.isFinite(Number(raw.loadedAt)) ? Math.trunc(Number(raw.loadedAt)) : Date.now(),
      items: normalizedItems,
    };
    projectionCacheDiagnostics.sessionFallbackHitCount += 1;
    projectionCacheDiagnostics.projectionHitCount += 1;
    void saveExtensionProjectionCache({
      username: identity.username,
      deviceId: identity.deviceId,
      deploymentFingerprint: identity.deploymentFingerprint,
      accountKey: identity.accountKey,
      loadedAt: sessionListProjectionCache.loadedAt,
      items: sessionListProjectionCache.items,
    }).catch((error) => {
      recordProjectionCacheDiagnostic(classifyProjectionCacheErrorCode(error, 'idb_persist_failed'));
    });
    projectionCacheDiagnostics.lastProjectionLoadMs = Date.now() - loadStartedAt;
    return true;
  } catch (error) {
    recordProjectionCacheDiagnostic(classifyProjectionCacheErrorCode(error, 'session_load_failed'));
    projectionCacheDiagnostics.lastProjectionLoadMs = Date.now() - loadStartedAt;
    return false;
  }
}

function clearSessionListProjectionCacheInMemory() {
  sessionListProjectionCache = {
    cacheKey: null,
    loadedAt: 0,
    items: [],
  };
}

async function clearPersistedSessionListProjectionCacheBestEffort() {
  clearSessionListProjectionCacheInMemory();
  const trustedIdentity = trustedState
    ? {
        username: trustedState.username,
        deviceId: trustedState.deviceId,
        deploymentFingerprint:
          trustedState.deploymentFingerprint ?? LOCAL_VAULT_CACHE_DEPLOYMENT_FINGERPRINT_FALLBACK,
      }
    : null;
  if (trustedIdentity?.username && trustedIdentity?.deviceId) {
    try {
      await clearExtensionProjectionCache({
        username: trustedIdentity.username,
        deviceId: trustedIdentity.deviceId,
        deploymentFingerprint: trustedIdentity.deploymentFingerprint,
      });
    } catch (error) {
      recordProjectionCacheDiagnostic(classifyProjectionCacheErrorCode(error, 'idb_clear_failed'));
    }
  }
  const sessionStorage = sessionStorageArea();
  if (!sessionStorage) {
    return;
  }
  try {
    await sessionStorage.remove(STORAGE_SESSION_LIST_CACHE_KEY);
  } catch (error) {
    recordProjectionCacheDiagnostic(classifyProjectionCacheErrorCode(error, 'session_persist_failed'));
  }
}

function projectionCacheDiagnosticsSnapshot() {
  return {
    ...projectionCacheDiagnostics,
    cacheKey: sessionListProjectionCache.cacheKey,
    itemCount: Array.isArray(sessionListProjectionCache.items) ? sessionListProjectionCache.items.length : 0,
    loadedAt: sessionListProjectionCache.loadedAt,
    credentialCacheItemCount: Array.isArray(credentialsCache.credentials) ? credentialsCache.credentials.length : 0,
    credentialCacheLoadedAt: credentialsCache.loadedAt,
    lastCredentialCacheSource,
  };
}

async function loadCredentialCacheFromLocalBestEffort() {
  if (localCacheLoadInFlight) {
    return localCacheLoadInFlight;
  }
  const loadStartedAt = Date.now();
  const identity = extensionCacheIdentity();
  if (!identity) {
    projectionCacheDiagnostics.lastLocalCacheLoadMs = Date.now() - loadStartedAt;
    return false;
  }
  localCacheLoadInFlight = (async () => {
    try {
      cacheWarmupState = 'loading_local';
      const cached = await loadExtensionVaultCache(identity);
      if (!cached) {
        cacheWarmupState = 'idle';
        projectionCacheDiagnostics.lastLocalCacheLoadMs = Date.now() - loadStartedAt;
        return false;
      }
      credentialsCache = {
        loadedAt: Date.now(),
        credentials: Array.isArray(cached.credentials) ? cached.credentials : [],
      };
      lastCredentialCacheSource = 'vault_local';
      hydrateSessionListProjectionCacheFromCredentials();
      void persistSessionListProjectionCacheBestEffort();
      cacheWarmupError = null;
      cacheWarmupState = 'ready_local';
      projectionCacheDiagnostics.localCacheHitCount += 1;
      projectionCacheDiagnostics.lastLocalCacheLoadMs = Date.now() - loadStartedAt;
      return true;
    } catch {
      try {
        await clearExtensionVaultCache({
          username: identity.username,
          deviceId: identity.deviceId,
          deploymentFingerprint: identity.deploymentFingerprint,
        });
      } catch {
        // Best effort cleanup only.
      }
      cacheWarmupState = 'idle';
      projectionCacheDiagnostics.lastLocalCacheLoadMs = Date.now() - loadStartedAt;
      return false;
    }
  })().finally(() => {
    localCacheLoadInFlight = null;
  });
  return localCacheLoadInFlight;
}

async function persistCredentialCacheToLocalBestEffort(snapshotToken = null) {
  const identity = extensionCacheIdentity();
  if (!identity) {
    return;
  }
  hydrateSessionListProjectionCacheFromCredentials();
  void persistSessionListProjectionCacheBestEffort();
  try {
    await saveExtensionVaultCache({
      username: identity.username,
      deviceId: identity.deviceId,
      deploymentFingerprint: identity.deploymentFingerprint,
      accountKey: identity.accountKey,
      snapshotToken,
      credentials: credentialsCache.credentials,
    });
  } catch {
    // Best effort only.
  }
}

async function clearCredentialCacheForIdentityBestEffort(input = {}) {
  const username = typeof input.username === 'string' && input.username ? input.username : state.username;
  const deviceId = typeof input.deviceId === 'string' && input.deviceId ? input.deviceId : state.deviceId;
  const deploymentFingerprint =
    (typeof input.deploymentFingerprint === 'string' && input.deploymentFingerprint) ||
    state.deploymentFingerprint ||
    LOCAL_VAULT_CACHE_DEPLOYMENT_FINGERPRINT_FALLBACK;
  if (!username || !deviceId) {
    return;
  }
  try {
    await clearExtensionVaultCache({
      username,
      deviceId,
      deploymentFingerprint,
    });
  } catch {
    // Best effort only.
  }
  try {
    await clearExtensionProjectionCache({
      username,
      deviceId,
      deploymentFingerprint,
    });
  } catch (error) {
    recordProjectionCacheDiagnostic(classifyProjectionCacheErrorCode(error, 'idb_clear_failed'));
  }
}

function rejectWithCapabilityIfNeeded(context, capability) {
  if (!contextHasCapability(context, capability)) {
    return fail('permission_denied', 'This action is not allowed in this extension context.');
  }
  return null;
}

async function loadPersistedState() {
  const localState = await chrome.storage.local.get([
    STORAGE_LOCAL_CONFIG_KEY,
    STORAGE_LOCAL_TRUSTED_KEY,
    MANUAL_ICON_STORAGE_KEY,
    MANUAL_ICON_SYNC_QUEUE_STORAGE_KEY,
  ]);
  const sessionStorage = sessionStorageArea();
  let sessionState = {};
  if (sessionStorage) {
    try {
      sessionState = await sessionStorage.get([
        STORAGE_SESSION_KEY,
        STORAGE_LINK_PAIRING_SESSION_KEY,
        STORAGE_UNLOCK_CONTEXT_KEY,
        STORAGE_RUNTIME_STATE_KEY,
        STORAGE_SESSION_LIST_CACHE_KEY,
        STORAGE_ICON_DOMAIN_REGISTRATION_KEY,
      ]);
    } catch {
      sessionState = {};
    }
  }

  const config = localState?.[STORAGE_LOCAL_CONFIG_KEY] ?? null;
  const trusted = localState?.[STORAGE_LOCAL_TRUSTED_KEY] ?? null;
  const rawManualIcons = localState?.[MANUAL_ICON_STORAGE_KEY] ?? {};
  const rawManualIconSyncQueue = localState?.[MANUAL_ICON_SYNC_QUEUE_STORAGE_KEY] ?? {};
  const sessionEntry = sessionState?.[STORAGE_SESSION_KEY] ?? null;
  const linkPairingEntry = sessionState?.[STORAGE_LINK_PAIRING_SESSION_KEY] ?? null;
  const unlockContextEntry = sessionState?.[STORAGE_UNLOCK_CONTEXT_KEY] ?? null;
  const runtimeStateEntry = sessionState?.[STORAGE_RUNTIME_STATE_KEY] ?? null;
  const sessionListProjectionEntry = sessionState?.[STORAGE_SESSION_LIST_CACHE_KEY] ?? null;
  const iconDomainRegistrationEntry = sessionState?.[STORAGE_ICON_DOMAIN_REGISTRATION_KEY] ?? null;

  state.serverOrigin = config?.serverOrigin ?? null;
  state.deploymentFingerprint = trusted?.deploymentFingerprint ?? config?.deploymentFingerprint ?? null;
  if (trusted && typeof trusted === 'object') {
    const normalizedProfile = normalizeLocalUnlockKdfProfile(
      trusted.localUnlockKdfProfile ?? trusted.localUnlockEnvelope?.kdfProfile ?? null,
    );
    trustedState = {
      ...trusted,
      localUnlockEnvelope: trusted.localUnlockEnvelope
        ? {
            ...trusted.localUnlockEnvelope,
            kdfProfile: normalizedProfile,
          }
        : trusted.localUnlockEnvelope,
      localUnlockKdfProfile: normalizedProfile,
    };
  } else {
    trustedState = trusted;
  }
  state.hasTrustedState = Boolean(trustedState);
  sessionToken = typeof sessionEntry?.token === 'string' ? sessionEntry.token : null;
  if (typeof sessionEntry?.sessionExpiresAt === 'string') {
    state.sessionExpiresAt = sessionEntry.sessionExpiresAt;
  }
  unlockedContext = null;
  if (
    unlockContextEntry &&
    typeof unlockContextEntry === 'object' &&
    typeof unlockContextEntry.accountKey === 'string' &&
    typeof unlockContextEntry.unlockedAt === 'number' &&
    typeof unlockContextEntry.unlockedUntil === 'number' &&
    unlockContextEntry.unlockedUntil > Date.now()
  ) {
    unlockedContext = {
      accountKey: unlockContextEntry.accountKey,
      unlockedAt: unlockContextEntry.unlockedAt,
      unlockedUntil: unlockContextEntry.unlockedUntil,
    };
  }
  state.lockRevision = normalizeLockRevision(runtimeStateEntry?.lockRevision);
  lastUnlockedLockRevision = normalizeLockRevision(runtimeStateEntry?.lastUnlockedLockRevision);
  recoverRetryState = normalizeRecoverRetryState(runtimeStateEntry?.recoverRetryState);
  lastIconHydrationStartedAt = normalizeRuntimeTimestamp(runtimeStateEntry?.lastIconHydrationStartedAt);
  lastManualIconHydratedAt = normalizeRuntimeTimestamp(runtimeStateEntry?.lastManualIconHydratedAt);
  realtimeConnection.cursor = normalizeRuntimeTimestamp(runtimeStateEntry?.realtimeCursor);
  if (
    sessionListProjectionEntry &&
    typeof sessionListProjectionEntry === 'object' &&
    typeof sessionListProjectionEntry.cacheKey === 'string' &&
    Array.isArray(sessionListProjectionEntry.items)
  ) {
    sessionListProjectionCache = {
      cacheKey: sessionListProjectionEntry.cacheKey,
      loadedAt: Number.isFinite(Number(sessionListProjectionEntry.loadedAt))
        ? Math.trunc(Number(sessionListProjectionEntry.loadedAt))
        : 0,
      items: sessionListProjectionEntry.items,
    };
  } else {
    clearSessionListProjectionCacheInMemory();
  }

  iconDomainRegistrationByItemId.clear();
  const expectedIconRegistrationCacheKey = iconDomainRegistrationCacheKey();
  if (
    expectedIconRegistrationCacheKey &&
    iconDomainRegistrationEntry &&
    typeof iconDomainRegistrationEntry === 'object' &&
    iconDomainRegistrationEntry.cacheKey === expectedIconRegistrationCacheKey &&
    iconDomainRegistrationEntry.entries &&
    typeof iconDomainRegistrationEntry.entries === 'object'
  ) {
    let loaded = 0;
    for (const [itemId, signature] of Object.entries(iconDomainRegistrationEntry.entries)) {
      if (loaded >= ICON_DOMAIN_REGISTRATION_MAX_ENTRIES) {
        break;
      }
      if (typeof itemId !== 'string' || itemId.length === 0) {
        continue;
      }
      if (typeof signature !== 'string' || signature.length === 0 || signature.length > 1024) {
        continue;
      }
      iconDomainRegistrationByItemId.set(itemId, signature);
      loaded += 1;
    }
  }

  linkPairingSession = null;
  if (isValidLinkPairingSessionStorageShape(linkPairingEntry)) {
    const expiresAtMs = Date.parse(linkPairingEntry.expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()) {
      try {
        const importedPrivateKey = await crypto.subtle.importKey(
          'jwk',
          linkPairingEntry.privateKeyJwk,
          {
            name: 'ECDSA',
            namedCurve: 'P-256',
          },
          false,
          ['sign'],
        );
        linkPairingSession = {
          requestId: linkPairingEntry.requestId,
          shortCode: linkPairingEntry.shortCode,
          fingerprintPhrase: linkPairingEntry.fingerprintPhrase,
          expiresAt: linkPairingEntry.expiresAt,
          interval: normalizeLinkInterval(linkPairingEntry.interval),
          lastStatus:
            typeof linkPairingEntry.lastStatus === 'string'
              ? linkPairingEntry.lastStatus
              : 'authorization_pending',
          clientNonce: linkPairingEntry.clientNonce,
          deploymentFingerprint: linkPairingEntry.deploymentFingerprint,
          serverOrigin: linkPairingEntry.serverOrigin,
          privateKey: importedPrivateKey,
        };
      } catch {
        await clearPersistedLinkPairingSession();
      }
    } else {
      await clearPersistedLinkPairingSession();
    }
  }

  if (trustedState) {
    state.username = trustedState.username;
    state.deviceId = trustedState.deviceId;
    state.deviceName = trustedState.deviceName;
  }

  manualIconMap = {};
  if (rawManualIcons && typeof rawManualIcons === 'object') {
    for (const [host, record] of Object.entries(rawManualIcons)) {
      const safeHost = sanitizeIconHost(host);
      if (!safeHost || !record || typeof record !== 'object') {
        continue;
      }
      if (!validateManualIconDataUrl(record.dataUrl ?? '')) {
        continue;
      }
      manualIconMap[safeHost] = record.dataUrl;
    }
  }

  manualIconSyncQueue = {};
  if (rawManualIconSyncQueue && typeof rawManualIconSyncQueue === 'object') {
    for (const [host, entry] of Object.entries(rawManualIconSyncQueue)) {
      const normalized = normalizeManualIconQueueEntry(host, entry);
      if (!normalized) {
        continue;
      }
      if (normalized.action === 'remove') {
        manualIconSyncQueue[normalized.host] = {
          action: 'remove',
          queuedAt: normalized.queuedAt,
        };
        continue;
      }
      manualIconSyncQueue[normalized.host] = {
        action: 'upsert',
        dataUrl: normalized.dataUrl,
        source: normalized.source,
        queuedAt: normalized.queuedAt,
      };
    }
  }
  await persistRuntimeState();
}

async function resetTrustedStateInternal() {
  const cacheIdentity = {
    username: state.username,
    deviceId: state.deviceId,
    deploymentFingerprint: state.deploymentFingerprint,
  };
  trustedState = null;
  state.hasTrustedState = false;
  await clearExtensionSessionToken();
  state.userId = null;
  state.username = null;
  state.deviceId = null;
  state.deviceName = null;
  state.deploymentFingerprint = null;
  state.lockRevision = 0;
  lastUnlockedLockRevision = 0;
  setRecoverRetryState({
    attempts: 0,
    nextAttemptAt: 0,
    lastCode: null,
  });
  await clearCredentialCacheForIdentityBestEffort(cacheIdentity);
  await clearPersistedSessionListProjectionCacheBestEffort();
  clearSensitiveMemory();
  await clearTrusted();
  try {
    await reconcileAutoPairBridgeScript();
  } catch {
    // Fail closed without blocking trusted-state reset.
  }
}

async function ensureServerHostPermission(serverOrigin) {
  if (!chrome.permissions?.contains) {
    return true;
  }

  const originPattern = permissionPatternForOrigin(serverOrigin);
  if (!originPattern) {
    return false;
  }
  try {
    return await chrome.permissions.contains({
      origins: [originPattern],
    });
  } catch {
    return false;
  }
}

function permissionPatternForOrigin(origin) {
  if (typeof origin !== 'string' || origin.trim().length === 0) {
    return null;
  }
  try {
    const parsed = new URL(origin);
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return null;
  }
}

function originPatternForRegistration(origin) {
  const normalized = permissionPatternForOrigin(origin);
  if (!normalized) {
    return null;
  }
  return normalized;
}

async function revokeOriginPermissions(origins) {
  if (!chrome.permissions?.remove) {
    return;
  }
  const patterns = Array.from(
    new Set(
      (Array.isArray(origins) ? origins : [])
        .map((origin) => permissionPatternForOrigin(origin))
        .filter((entry) => typeof entry === 'string' && entry.length > 0),
    ),
  );
  if (patterns.length === 0) {
    return;
  }
  try {
    await chrome.permissions.remove({
      origins: patterns,
    });
  } catch {
    // Best effort only.
  }
}

async function injectBridgeIntoActiveSettingsTab(expectedWebOrigin) {
  if (!expectedWebOrigin) {
    return;
  }
  if (!chrome.tabs?.query || !chrome.scripting?.executeScript) {
    return;
  }

  let activeTabs;
  try {
    activeTabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
  } catch {
    return;
  }

  const activeTab = activeTabs[0] ?? null;
  if (!activeTab || typeof activeTab.id !== 'number') {
    return;
  }
  if (!isAllowedSettingsSenderUrl(activeTab.url, expectedWebOrigin)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: {
        tabId: activeTab.id,
        allFrames: false,
      },
      files: ['bridge-content-script.js'],
      world: 'ISOLATED',
    });
  } catch {
    // Best effort only; registered content script still handles future navigations.
  }
}

async function reconcileAutoPairBridgeScript() {
  if (
    !chrome.scripting?.getRegisteredContentScripts ||
    !chrome.scripting?.registerContentScripts ||
    !chrome.scripting?.unregisterContentScripts
  ) {
    return;
  }

  const expectedWebOrigin = deriveWebOriginFromServerOrigin(state.serverOrigin);
  const hasExpectedWebOrigin = Boolean(expectedWebOrigin);
  const hasWebPermission = hasExpectedWebOrigin
    ? await ensureServerHostPermission(expectedWebOrigin)
    : false;
  const shouldRegister = hasExpectedWebOrigin && hasWebPermission;

  const registeredScripts = await chrome.scripting.getRegisteredContentScripts({
    ids: [AUTO_PAIR_BRIDGE_SCRIPT_ID],
  });
  if (registeredScripts.length > 0) {
    await chrome.scripting.unregisterContentScripts({
      ids: [AUTO_PAIR_BRIDGE_SCRIPT_ID],
    });
  }

  if (!shouldRegister || !expectedWebOrigin) {
    return;
  }

  const matchPattern = originPatternForRegistration(expectedWebOrigin);
  if (!matchPattern) {
    return;
  }

  await chrome.scripting.registerContentScripts([
    {
      id: AUTO_PAIR_BRIDGE_SCRIPT_ID,
      matches: [matchPattern],
      js: ['bridge-content-script.js'],
      runAt: 'document_start',
      allFrames: false,
      matchOriginAsFallback: false,
      persistAcrossSessions: false,
      world: 'ISOLATED',
    },
  ]);

  await injectBridgeIntoActiveSettingsTab(expectedWebOrigin);
}

function isAllowedSettingsSenderUrl(rawUrl, expectedOrigin) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.origin !== expectedOrigin) {
    return false;
  }
  return isAllowedSettingsPath({
    pathname: parsed.pathname,
    search: parsed.search,
  });
}

function isAllowedUnlockSenderUrl(rawUrl, expectedOrigin) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.origin !== expectedOrigin) {
    return false;
  }
  return isAllowedUnlockPath({
    pathname: parsed.pathname,
    search: parsed.search,
  });
}

function isAllowedAuthSenderUrl(rawUrl, expectedOrigin) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.origin !== expectedOrigin) {
    return false;
  }
  return isAllowedAuthPath({
    pathname: parsed.pathname,
    search: parsed.search,
  });
}

function validateBridgeSender(sender, routeScope) {
  if (!sender || sender.id !== chrome.runtime.id) {
    return fail('permission_denied', 'Bridge sender is not trusted.');
  }
  const expectedWebOrigin = deriveWebOriginFromServerOrigin(state.serverOrigin);
  if (!expectedWebOrigin) {
    return fail('server_origin_not_allowed', 'Configure server URL first in extension settings.');
  }
  if (sender.origin !== expectedWebOrigin) {
    return fail('permission_denied', 'Bridge origin is not allowed.');
  }
  if (sender.frameId !== 0) {
    return fail('permission_denied', 'Bridge requests are allowed only from the top-level frame.');
  }
  const isAllowed = (() => {
    if (routeScope === 'unlock') {
      return isAllowedUnlockSenderUrl(sender.url, expectedWebOrigin);
    }
    if (routeScope === 'auth_or_unlock') {
      return (
        isAllowedUnlockSenderUrl(sender.url, expectedWebOrigin) ||
        isAllowedAuthSenderUrl(sender.url, expectedWebOrigin)
      );
    }
    return isAllowedSettingsSenderUrl(sender.url, expectedWebOrigin);
  })();
  if (!isAllowed) {
    return fail('permission_denied', `Bridge URL is not allowed for ${routeScope}.`);
  }
  if (
    typeof sender.documentLifecycle === 'string' &&
    sender.documentLifecycle.toLowerCase() !== 'active'
  ) {
    return fail('permission_denied', 'Bridge document is not active.');
  }
  return null;
}

async function pingBridgeInternal(sender) {
  if (!state.serverOrigin) {
    return fail('server_origin_not_allowed', 'Configure server URL first in extension settings.');
  }

  const senderValidation = validateBridgeSender(sender, 'settings');
  if (senderValidation) {
    return senderValidation;
  }

  const expectedWebOrigin = deriveWebOriginFromServerOrigin(state.serverOrigin);
  if (!expectedWebOrigin) {
    return fail('server_origin_not_allowed', 'Configure server URL first in extension settings.');
  }

  const permissionGranted = await ensureServerHostPermission(expectedWebOrigin);
  if (!permissionGranted) {
    return fail(
      'server_origin_permission_required',
      'Grant web origin permission in extension settings before auto connect.',
    );
  }

  return ok();
}

async function setServerUrlInternal(rawServerUrl) {
  const canonicalServerOrigin = canonicalizeServerUrl(rawServerUrl);
  const previousServerOrigin = state.serverOrigin;
  const expectedWebOrigin = deriveWebOriginFromServerOrigin(canonicalServerOrigin);
  if (trustedState && trustedState.serverOrigin !== canonicalServerOrigin) {
    return fail(
      'trusted_state_reset_required',
      'Changing server URL requires resetting trusted extension state first.',
    );
  }

  const permissionTargets = [canonicalServerOrigin];
  if (expectedWebOrigin && expectedWebOrigin !== canonicalServerOrigin) {
    permissionTargets.push(expectedWebOrigin);
  }
  const permissionChecks = await Promise.all(permissionTargets.map((origin) => ensureServerHostPermission(origin)));
  if (permissionChecks.some((entry) => !entry)) {
    return fail(
      'server_origin_permission_required',
      'Grant permission for this server origin in popup/options before saving.',
    );
  }

  const apiClient = createExtensionApiClient(canonicalServerOrigin);
  let metadata;
  try {
    metadata = await apiClient.getRuntimeMetadata();
  } catch (error) {
    const described = describeError(error, 'server_connection_failed');
    return fail(described.code, described.message);
  }

  let metadataServerOrigin = null;
  try {
    metadataServerOrigin = canonicalizeServerUrl(metadata?.serverUrl ?? '');
  } catch {
    metadataServerOrigin = null;
  }
  if (!metadataServerOrigin || metadataServerOrigin !== canonicalServerOrigin) {
    return fail('server_origin_mismatch', 'Server URL does not match runtime metadata.');
  }

  state.serverOrigin = canonicalServerOrigin;
  if (previousServerOrigin && previousServerOrigin !== canonicalServerOrigin) {
    await clearLinkPairingSessionPersisted();
    const previousWebOrigin = deriveWebOriginFromServerOrigin(previousServerOrigin);
    await revokeOriginPermissions([previousServerOrigin, previousWebOrigin]);
  }
  state.deploymentFingerprint = metadata?.deploymentFingerprint ?? state.deploymentFingerprint;
  applyRealtimeRuntimeMetadata(metadata);
  realtimeMetadataLoadedAt = Date.now();
  if (!trustedState) {
    await clearExtensionSessionToken();
  }
  await persistConfig({
    serverOrigin: canonicalServerOrigin,
    deploymentFingerprint: state.deploymentFingerprint,
    updatedAt: nowIso(),
  });

  if (!trustedState) {
    setPhase('pairing_required', null);
  }

  try {
    await reconcileAutoPairBridgeScript();
    bridgeUnavailable = false;
  } catch {
    bridgeUnavailable = true;
    return fail('bridge_registration_failed', 'Could not configure extension auto connect bridge.');
  }

  return ok({ state: snapshotForUi() });
}

async function restoreSessionInternal(force = false) {
  if (restoreInFlightPromise) {
    await restoreInFlightPromise;
    return;
  }
  if (!force && state.phase === 'ready' && hasValidUnlockedContext()) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    if (!isSessionNearExpiry(90_000)) {
      return;
    }
  }
  if (!force && state.phase === 'local_unlock_required' && !isSessionNearExpiry(90_000)) {
    return;
  }

  if (state.serverOrigin) {
    const permissionGranted = await ensureServerHostPermission(state.serverOrigin);
    if (!permissionGranted) {
      clearSensitiveMemory();
      setPhase('pairing_required', 'Grant permission for this server origin in extension settings.');
      return;
    }
  }

  const recoverExtensionSessionInternal = async (apiClient) => {
    if (!trustedState?.deviceId || !trustedState?.sessionRecoverKey) {
      return {
        recovered: false,
        kind: 'terminal',
        code: 'recover_key_invalid',
        message: 'Trusted recover key is unavailable.',
      };
    }
    try {
      const recovered = await apiClient.recoverExtensionSession({
        deviceId: trustedState.deviceId,
        sessionRecoverKey: trustedState.sessionRecoverKey,
      });
      if (!recovered?.extensionSessionToken) {
        return {
          recovered: false,
          kind: 'transient',
          code: 'recover_failed',
          message: 'Recover endpoint did not return a session token.',
        };
      }
      sessionToken = recovered.extensionSessionToken;
      withSessionIdentity(recovered);
      await persistSessionToken();
      setRecoverRetryState({
        attempts: 0,
        nextAttemptAt: 0,
        lastCode: null,
      });
      return {
        recovered: true,
        kind: 'success',
      };
    } catch (error) {
      const classified = classifyRecoverFailure(error);
      return {
        recovered: false,
        ...classified,
      };
    }
  };

  restoreInFlightPromise = (async () => {
    if (!state.serverOrigin) {
      setPhase('pairing_required', null);
      return;
    }
    const now = Date.now();
    if (!force && now - lastRestoreAttemptAt < RESTORE_THROTTLE_MS) {
      return;
    }
    lastRestoreAttemptAt = now;

    const apiClient = currentApiClient();
    if (!apiClient) {
      return;
    }
    await ensureRealtimeRuntimeMetadata(apiClient, { force: false });

    if (!sessionToken && trustedState) {
      if (!force && Date.now() < recoverRetryState.nextAttemptAt) {
        setPhase(
          'remote_authentication_required',
          'Session temporarily unavailable. Retrying automatically.',
        );
        return;
      }
      const recoverResult = await recoverExtensionSessionInternal(apiClient);
      if (!recoverResult.recovered) {
        if (recoverResult.kind === 'terminal') {
          await clearTrustedStateForReconnect(
            'Trusted link is no longer valid. Reconnect this extension from web settings.',
          );
          return;
        }
        const nextAttempts = Math.max(1, recoverRetryState.attempts + 1);
        const delayMs = nextRecoverRetryDelayMs(nextAttempts);
        setRecoverRetryState({
          attempts: nextAttempts,
          nextAttemptAt: Date.now() + delayMs,
          lastCode: recoverResult.code ?? 'recover_failed',
        });
        setPhase(
          'remote_authentication_required',
          'Session temporarily unavailable. Retrying automatically.',
        );
        return;
      }
      setRecoverRetryState({
        attempts: 0,
        nextAttemptAt: 0,
        lastCode: null,
      });
    } else if (!sessionToken) {
      if (linkPairingSession) {
        setPhase(
          'pairing_required',
          linkPairingStatusMessage(linkPairingSession.lastStatus ?? 'authorization_pending'),
        );
      } else {
        setPhase('pairing_required', 'Connect this extension from web settings.');
      }
      return;
    }

    try {
      let restoreOutput = await apiClient.restoreSession(sessionToken);
      if (restoreOutput.extensionSessionToken) {
        sessionToken = restoreOutput.extensionSessionToken;
        await persistSessionToken();
      }

      withSessionIdentity(restoreOutput);
      await persistSessionToken();

      if (
        (restoreOutput.sessionState !== 'local_unlock_required' ||
          !restoreOutput.user ||
          !restoreOutput.device) &&
        trustedState
      ) {
        await clearExtensionSessionToken();
        const recovered = await recoverExtensionSessionInternal(apiClient);
        if (recovered.recovered) {
          setRecoverRetryState({
            attempts: 0,
            nextAttemptAt: 0,
            lastCode: null,
          });
          restoreOutput = await apiClient.restoreSession(sessionToken);
          if (restoreOutput.extensionSessionToken) {
            sessionToken = restoreOutput.extensionSessionToken;
            await persistSessionToken();
          }
          withSessionIdentity(restoreOutput);
          await persistSessionToken();
        } else if (recovered.kind === 'terminal') {
          await clearTrustedStateForReconnect(
            'Trusted link is no longer valid. Reconnect this extension from web settings.',
          );
          return;
        } else {
          const nextAttempts = Math.max(1, recoverRetryState.attempts + 1);
          const delayMs = nextRecoverRetryDelayMs(nextAttempts);
          setRecoverRetryState({
            attempts: nextAttempts,
            nextAttemptAt: Date.now() + delayMs,
            lastCode: recovered.code ?? 'recover_failed',
          });
          setPhase(
            'remote_authentication_required',
            'Session temporarily unavailable. Retrying automatically.',
          );
          return;
        }
      }

      await hydrateManualIconsFromServerBestEffort();

      if (
        restoreOutput.sessionState !== 'local_unlock_required' ||
        !restoreOutput.user ||
        !restoreOutput.device
      ) {
        if (trustedState) {
          await clearTrustedStateForReconnect(
            'Trusted link is no longer valid. Reconnect this extension from web settings.',
          );
          return;
        }
        clearSensitiveMemory();
        setPhase('pairing_required', 'Connect this extension from web settings.');
        return;
      }

      if (!trustedState) {
        await clearTrustedStateForReconnect(
          'Trusted state missing. Start a new trusted-device request to reconnect.',
        );
        return;
      }

      if (
        trustedState.username !== restoreOutput.user.username ||
        trustedState.deviceId !== restoreOutput.device.deviceId ||
        trustedState.serverOrigin !== state.serverOrigin
      ) {
        await clearTrustedStateForReconnect(
          'Session does not match this trusted device. Start a new trusted-device request to reconnect.',
        );
        return;
      }

      if (hasValidUnlockedContext()) {
        setPhase('ready', null);
        touchUnlockedContext();
        void loadCredentialCacheFromLocalBestEffort();
        void maybeAutoApproveUnlockGrants({ source: 'phase-ready' });
      } else {
        unlockedContext = null;
        void clearPersistedUnlockedContext();
        setPhase('local_unlock_required', null);
        void tryAutoUnlockViaGrantInternal();
      }
    } catch (error) {
      const described = describeError(error, 'restore_failed');
      if (described.code === 'unauthorized' || described.code === 'request_failed_401') {
        await clearExtensionSessionToken();
        const recovered = await recoverExtensionSessionInternal(apiClient);
        if (recovered.recovered) {
          setRecoverRetryState({
            attempts: 0,
            nextAttemptAt: 0,
            lastCode: null,
          });
          if (hasValidUnlockedContext()) {
            setPhase('ready', null);
            touchUnlockedContext();
            void loadCredentialCacheFromLocalBestEffort();
            void maybeAutoApproveUnlockGrants({ source: 'phase-ready' });
          } else {
            setPhase('local_unlock_required', null);
            void tryAutoUnlockViaGrantInternal();
          }
          return;
        }
        if (recovered.kind === 'terminal') {
          await clearTrustedStateForReconnect(
            'Trusted link is no longer valid. Reconnect this extension from web settings.',
          );
          return;
        }
        const nextAttempts = Math.max(1, recoverRetryState.attempts + 1);
        const delayMs = nextRecoverRetryDelayMs(nextAttempts);
        setRecoverRetryState({
          attempts: nextAttempts,
          nextAttemptAt: Date.now() + delayMs,
          lastCode: recovered.code ?? 'recover_failed',
        });
        setPhase(
          'remote_authentication_required',
          'Session temporarily unavailable. Retrying automatically.',
        );
        return;
      }
      clearSensitiveMemory();
      setPhase('remote_authentication_required', described.message);
    }
  })();

  try {
    await restoreInFlightPromise;
  } finally {
    await reconcileUnlockGrantApprovalAlarm();
    restoreInFlightPromise = null;
  }
}

async function ensureReadyState(options = {}) {
  if (state.phase !== 'ready' || !sessionToken || !unlockedContext?.accountKey) {
    if (options?.allowOffline === true && state.phase === 'ready' && unlockedContext?.accountKey) {
      touchUnlockedContext();
      return null;
    }
    return fail('local_unlock_required', 'Unlock this extension first.');
  }
  if (options?.allowOffline === true) {
    touchUnlockedContext();
    return null;
  }
  await restoreSessionInternal(true);
  if (state.phase !== 'ready' || !sessionToken || !unlockedContext?.accountKey) {
    if (options?.allowOffline === true && state.phase === 'ready' && unlockedContext?.accountKey) {
      touchUnlockedContext();
      return null;
    }
    return fail('remote_authentication_required', state.lastError ?? 'Session expired.');
  }
  touchUnlockedContext();
  return null;
}

async function maybeAutoApproveUnlockGrants(input = {}) {
  void input;
  return null;
}

async function tryAutoUnlockViaGrantInternal() {
  return false;
}

/* Legacy cross-surface grant flow retained only for backward compatibility
   during transition; intentionally disabled by early returns above. */
async function maybeAutoApproveUnlockGrantsLegacy(input = {}) {
  if (unlockGrantApproveInFlight) {
    return unlockGrantApproveInFlight;
  }
  if (!shouldRunUnlockGrantApprovalScheduler() || !sessionToken) {
    return null;
  }
  const requestId = isSafeUnlockGrantRequestId(input?.requestId) ? input.requestId : null;
  const now = Date.now();
  if (now - lastUnlockGrantApproveAttemptAt < UNLOCK_GRANT_APPROVAL_COOLDOWN_MS) {
    return null;
  }
  lastUnlockGrantApproveAttemptAt = now;
  const apiClient = currentApiClient();
  if (!apiClient) {
    return null;
  }
  unlockGrantApproveInFlight = (async () => {
    try {
      const pending = await apiClient.listPendingUnlockGrants({
        bearerToken: sessionToken,
      });
      const requests = (Array.isArray(pending?.requests) ? pending.requests : [])
        .filter(
          (entry) =>
            entry?.status === 'pending' &&
            isSafeUnlockGrantRequestId(entry?.requestId) &&
            entry?.requesterSurface === 'web',
        )
        .sort((left, right) => {
          const leftCreated = Number.isFinite(Date.parse(left.createdAt)) ? Date.parse(left.createdAt) : 0;
          const rightCreated = Number.isFinite(Date.parse(right.createdAt))
            ? Date.parse(right.createdAt)
            : 0;
          if (rightCreated !== leftCreated) {
            return rightCreated - leftCreated;
          }
          return right.requestId.localeCompare(left.requestId);
        });

      const targetRequest = requestId
        ? requests.find((entry) => entry.requestId === requestId) ?? null
        : requests[0] ?? null;

      if (!targetRequest) {
        return;
      }
      try {
        await apiClient.approveUnlockGrant({
          bearerToken: sessionToken,
          requestId: targetRequest.requestId,
          approvalNonce: randomBase64Url(16),
          unlockAccountKey: unlockedContext?.accountKey ?? undefined,
        });
      } catch {
        // Keep best-effort approval behavior to avoid blocking extension flow.
      }
    } catch {
      // Best effort only.
    }
  })();
  try {
    await unlockGrantApproveInFlight;
  } finally {
    unlockGrantApproveInFlight = null;
  }
  return null;
}

async function tryAutoUnlockViaGrantInternalLegacy() {
  if (unlockGrantConsumeInFlight) {
    return unlockGrantConsumeInFlight;
  }
  if (
    state.phase !== 'local_unlock_required' ||
    !trustedState ||
    !sessionToken ||
    !state.serverOrigin
  ) {
    return false;
  }
  const now = Date.now();
  if (now - lastUnlockGrantAttemptAt < UNLOCK_GRANT_RETRY_COOLDOWN_MS) {
    return false;
  }
  lastUnlockGrantAttemptAt = now;
  const apiClient = currentApiClient();
  if (!apiClient) {
    return false;
  }

  unlockGrantConsumeInFlight = (async () => {
    try {
      const deploymentFingerprint = await resolveDeploymentFingerprint(apiClient);
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true,
        ['sign', 'verify'],
      );
      const publicSpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
      const requestPublicKey = toBase64Url(new Uint8Array(publicSpki));
      const clientNonce = randomBase64Url(16);

      const request = await apiClient.requestUnlockGrant({
        bearerToken: sessionToken,
        deploymentFingerprint,
        targetSurface: 'web',
        requestPublicKey,
        clientNonce,
      });

      const requestId = typeof request?.requestId === 'string' ? request.requestId : '';
      const serverOrigin =
        typeof request?.serverOrigin === 'string' && request.serverOrigin.length > 0
          ? request.serverOrigin
          : state.serverOrigin;
      let intervalSeconds = normalizeLinkInterval(request?.interval ?? UNLOCK_GRANT_DEFAULT_INTERVAL_SECONDS);
      const expiresAtMs = Date.parse(request?.expiresAt ?? '');
      const deadline = Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + UNLOCK_GRANT_TTL_SECONDS * 1_000;

      while (Date.now() < deadline) {
        try {
          const statusNonce = randomBase64Url(16);
          const statusProof = await signUnlockGrantProof({
            action: 'status',
            requestId,
            nonce: statusNonce,
            clientNonce,
            serverOrigin,
            deploymentFingerprint,
            privateKey: keyPair.privateKey,
          });
          const status = await apiClient.getUnlockGrantStatus({
            requestId,
            requestProof: statusProof,
          });
          const statusCode = typeof status?.status === 'string' ? status.status : 'denied';
          if (statusCode === 'authorization_pending' || statusCode === 'slow_down') {
            intervalSeconds = normalizeLinkInterval(status?.interval ?? intervalSeconds + 1);
            await delay(intervalSeconds * 1_000);
            continue;
          }
          if (statusCode === 'approved') {
            const consumeNonce = randomBase64Url(16);
            const consumeProof = await signUnlockGrantProof({
              action: 'consume',
              requestId,
              nonce: consumeNonce,
              clientNonce,
              serverOrigin,
              deploymentFingerprint,
              privateKey: keyPair.privateKey,
            });
            const consumed = await apiClient.consumeUnlockGrant({
              requestId,
              requestProof: consumeProof,
              consumeNonce: randomBase64Url(16),
            });
            if (consumed?.extensionSessionToken) {
              sessionToken = consumed.extensionSessionToken;
              await persistSessionToken();
            }
            withSessionIdentity(consumed ?? {});
            if (typeof consumed?.unlockAccountKey === 'string' && consumed.unlockAccountKey.length >= 20) {
              const unlockedAt = Date.now();
              unlockedContext = {
                accountKey: consumed.unlockAccountKey,
                unlockedAt,
                unlockedUntil: unlockedAt + state.unlockIdleTimeoutMs,
              };
              await persistUnlockedContext();
              setPhase('ready', null);
              setLastUnlockedLockRevision(state.lockRevision);
              armIdleLockTimer();
              void loadCredentialCacheFromLocalBestEffort();
              return true;
            }
            return false;
          }
          return false;
        } catch (error) {
          const described = describeError(error, 'unlock_grant_failed');
          if (described.code === 'slow_down') {
            const nextInterval = Number.isFinite(error?.interval)
              ? Number(error.interval)
              : intervalSeconds + UNLOCK_GRANT_STATUS_SLOWDOWN_SECONDS;
            intervalSeconds = normalizeLinkInterval(nextInterval);
            await delay(intervalSeconds * 1_000);
            continue;
          }
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  })();

  try {
    return await unlockGrantConsumeInFlight;
  } finally {
    unlockGrantConsumeInFlight = null;
  }
}

async function fetchActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0] ?? null;
  if (!tab || typeof tab.id !== 'number') {
    return null;
  }
  const tabUrl = typeof tab.url === 'string' ? tab.url : '';
  return {
    tabId: tab.id,
    tabUrl,
    windowId: tab.windowId,
  };
}

async function getPageContextInternal() {
  const activeTab = await fetchActiveTab();
  const activePageUrl = activeTab?.tabUrl ?? '';
  return ok({
    page: {
      url: activePageUrl,
      eligible: isPageUrlEligibleForFill(activePageUrl),
    },
  });
}

const SUPPORTED_ITEM_TYPES = new Set(['login', 'card', 'document', 'secure_note']);
const VALID_TYPE_FILTERS = new Set(['all', 'login', 'card', 'document', 'secure_note']);

function normalizeVaultEntry(entry, decryptedPayload) {
  const itemType = entry.item.itemType;
  const payload = normalizeVaultItemPayload(itemType, decryptedPayload);
  return {
    itemId: entry.item.itemId,
    itemType,
    revision: entry.item.revision,
    ...payload,
  };
}

async function decryptSnapshotEntriesInChunks(entries, accountKey, options = {}) {
  const CHUNK_SIZE = 20;
  const MAX_CONCURRENCY = 4;
  const decrypted = [];
  let loginEntriesSeen = 0;
  let decryptFailures = 0;
  for (let offset = 0; offset < entries.length; offset += CHUNK_SIZE) {
    const chunk = entries.slice(offset, offset + CHUNK_SIZE);
    for (let index = 0; index < chunk.length; index += MAX_CONCURRENCY) {
      const lane = chunk.slice(index, index + MAX_CONCURRENCY);
      const laneResults = await Promise.all(
        lane.map(async (entry) => {
          if (entry.item.itemType === 'login') {
            loginEntriesSeen += 1;
          }
          try {
            const payload = await decryptVaultItemPayload({
              accountKey,
              encryptedPayload: entry.item.encryptedPayload,
            });
            return normalizeVaultEntry(entry, payload);
          } catch {
            if (entry.item.itemType === 'login') {
              decryptFailures += 1;
            }
            return null;
          }
        }),
      );
      for (const entry of laneResults) {
        if (entry) {
          decrypted.push(entry);
        }
      }
    }
    credentialsCache = {
      loadedAt: credentialsCache.loadedAt,
      credentials: [...decrypted],
    };
    if (typeof options.onChunk === 'function') {
      try {
        await options.onChunk(decrypted);
      } catch {
        // Best effort hook only.
      }
    }
    await delay(0);
  }
  return {
    decrypted,
    loginEntriesSeen,
    decryptFailures,
  };
}

async function performCredentialCacheWarmup(options = {}) {
  const force = options?.force === true;
  const preferLocalCache = options?.preferLocalCache === true;
  if (!force && isCredentialCacheFresh()) {
    cacheWarmupState = 'completed';
    cacheWarmupError = null;
    return ok();
  }

  if (!force && preferLocalCache && localCacheLoadInFlight) {
    cacheWarmupState = 'loading_local';
    cacheWarmupError = null;
    return ok();
  }

  const apiClient = currentApiClient();
  if (!apiClient || !sessionToken) {
    const localLoaded = await loadCredentialCacheFromLocalBestEffort();
    if (localLoaded || credentialsCache.credentials.length > 0) {
      cacheWarmupState = 'ready_local';
      cacheWarmupError = null;
      return ok();
    }
    cacheWarmupState = 'sync_failed';
    cacheWarmupError = 'Vault unavailable in offline mode.';
    return fail('remote_authentication_required', cacheWarmupError);
  }

  cacheWarmupState = 'syncing';
  cacheWarmupError = null;
  projectionCacheDiagnostics.lastNetworkSyncStartedAt = nowIso();

  try {
    const allEntries = [];
    let snapshotToken;
    let cursor;
    while (true) {
      if (state.phase !== 'ready' || !sessionToken || !unlockedContext?.accountKey) {
        cacheWarmupState = 'idle';
        projectionCacheDiagnostics.lastNetworkSyncFinishedAt = nowIso();
        return ok();
      }
      const page = await apiClient.fetchSnapshot({
        bearerToken: sessionToken,
        snapshotToken,
        cursor,
        pageSize: 100,
      });
      if (!snapshotToken) {
        snapshotToken = page.snapshotToken;
      }
      const filtered = page.entries.filter(
        (entry) => entry.entryType === 'item' && SUPPORTED_ITEM_TYPES.has(entry.item.itemType),
      );
      allEntries.push(...filtered);
      cursor = page.nextCursor;
      if (!cursor) {
        break;
      }
    }

    const { decrypted, loginEntriesSeen, decryptFailures } = await decryptSnapshotEntriesInChunks(
      allEntries,
      unlockedContext.accountKey,
      {
        onChunk: async () => {
          await persistCredentialCacheToLocalBestEffort(snapshotToken ?? null);
        },
      },
    );
    const diagnostic = diagnoseCredentialCache({
      loginEntriesSeen,
      decryptedEntries: decrypted.length,
      decryptFailures,
    });
    if (diagnostic) {
      cacheWarmupState = 'sync_failed';
      cacheWarmupError = diagnostic.message;
      if (credentialsCache.credentials.length > 0) {
        return ok();
      }
      return fail(diagnostic.code, diagnostic.message);
    }

    credentialsCache = {
      loadedAt: Date.now(),
      credentials: decrypted,
    };
    lastCredentialCacheSource = 'network';
    projectionCacheDiagnostics.networkSyncCount += 1;
    projectionCacheDiagnostics.lastNetworkSyncFinishedAt = nowIso();
    await persistCredentialCacheToLocalBestEffort(snapshotToken ?? null);
    cacheWarmupState = 'completed';
    cacheWarmupError = null;
    return ok();
  } catch (error) {
    const described = describeError(error, 'snapshot_failed');
    projectionCacheDiagnostics.lastNetworkSyncFinishedAt = nowIso();
    if (
      described.code === 'unauthorized' ||
      described.code === 'request_failed_401' ||
      described.code === 'request_failed_403'
    ) {
      await clearExtensionSessionToken();
      clearSensitiveMemory();
      await restoreSessionInternal(true);
      if (!trustedState || state.phase === 'pairing_required') {
        cacheWarmupState = 'sync_failed';
        cacheWarmupError = state.lastError ?? 'Connect extension through trusted surface settings.';
        return fail('pairing_required', cacheWarmupError);
      }
      if (state.phase === 'local_unlock_required') {
        cacheWarmupState = 'sync_failed';
        cacheWarmupError = state.lastError ?? 'Unlock this extension first.';
        return fail('local_unlock_required', cacheWarmupError);
      }
      if (state.phase === 'remote_authentication_required') {
        cacheWarmupState = 'sync_failed';
        cacheWarmupError = state.lastError ?? 'Session expired.';
        return fail('remote_authentication_required', cacheWarmupError);
      }
      cacheWarmupState = 'sync_failed';
      cacheWarmupError = described.message;
      return fail('remote_authentication_required', described.message);
    }
    cacheWarmupState = 'sync_failed';
    cacheWarmupError = described.message;
    if (credentialsCache.credentials.length > 0) {
      return ok();
    }
    return fail(described.code, described.message);
  }
}

function shouldWaitForWarmup(options = {}) {
  if (options?.awaitCompletion === false) {
    return false;
  }
  return true;
}

async function refreshCredentialCache(options = {}) {
  const readyError = await ensureReadyState({ allowOffline: true });
  if (readyError) {
    return readyError;
  }

  if (cacheWarmupInFlight) {
    if (!shouldWaitForWarmup(options)) {
      return ok();
    }
    return cacheWarmupInFlight;
  }

  cacheWarmupInFlight = performCredentialCacheWarmup(options).finally(() => {
    cacheWarmupInFlight = null;
  });

  if (!shouldWaitForWarmup(options)) {
    return ok();
  }
  return cacheWarmupInFlight;
}

function projectCredentialForPopup(credential, pageUrl) {
  const candidateUrls = credential.itemType === 'login' && Array.isArray(credential.urls) ? credential.urls : [];
  const exactOrigin = credential.itemType === 'login' ? isCredentialAllowedForSite(pageUrl, candidateUrls) : false;
  const domainScore = credential.itemType === 'login' ? scoreDomainMatch(pageUrl, candidateUrls) : 0;
  const firstUrl = candidateUrls.length > 0 ? candidateUrls[0] : '';
  let urlHostSummary = credential.itemType === 'login' ? 'No URL' : credential.itemType;
  let manualIconDataUrl = null;
  for (const rawUrl of candidateUrls) {
    try {
      const host = new URL(rawUrl).hostname;
      urlHostSummary = host;
      const safeHost = sanitizeIconHost(host);
      if (safeHost && manualIconMap[safeHost]) {
        manualIconDataUrl = manualIconMap[safeHost];
      }
      break;
    } catch {
      // Ignore malformed URL and keep searching.
    }
  }

  return {
    itemId: credential.itemId,
    itemType: credential.itemType,
    title: credential.title,
    subtitle: buildItemSubtitle(credential),
    searchText: buildItemSearchText(credential),
    firstUrl,
    faviconCandidates: [
      ...(manualIconDataUrl ? [manualIconDataUrl] : []),
      ...buildFaviconCandidates(firstUrl),
    ],
    urlHostSummary,
    matchFlags: {
      exactOrigin,
      domainScore,
    },
  };
}

function buildItemSubtitle(credential) {
  if (credential.itemType === 'login') {
    return credential.username || '—';
  }
  if (credential.itemType === 'card') {
    return credential.numberMasked || '••••';
  }
  if (credential.itemType === 'document') {
    return truncateText(credential.content, 80);
  }
  if (credential.itemType === 'secure_note') {
    return truncateText(credential.content, 80);
  }
  return '—';
}

function buildItemSearchText(credential) {
  if (typeof credential.searchText === 'string' && credential.searchText.trim().length > 0) {
    return credential.searchText;
  }
  return `${credential.title ?? ''}`;
}

function truncateText(value, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '—';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}

function normalizeIconDomainForApi(rawDomain) {
  const safeDomain = sanitizeIconHost(String(rawDomain ?? ''));
  if (!safeDomain) {
    return null;
  }
  return /^[a-z0-9.-]{1,255}$/u.test(safeDomain) ? safeDomain : null;
}

function normalizeIconDomainFromUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    return normalizeIconDomainForApi(parsed.hostname);
  } catch {
    return null;
  }
}

function iconDomainAliases(domain) {
  const safeDomain = sanitizeIconHost(String(domain ?? ''));
  if (!safeDomain) {
    return [];
  }
  return [safeDomain];
}

function validateAutomaticIconDataUrl(value) {
  if (typeof value !== 'string' || value.length < 24 || value.length > 2_000_000) {
    return false;
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/u.exec(value);
  if (!match) {
    return false;
  }
  const mimeType = String(match[1] ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();
  return Boolean(mimeType) && mimeType.startsWith('image/');
}

function clearIconCachePersistTimer() {
  if (iconCachePersistTimer !== null) {
    clearTimeout(iconCachePersistTimer);
    iconCachePersistTimer = null;
  }
}

function normalizePersistedIconCacheEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const safeDomain = sanitizeIconHost(String(entry.domain ?? ''));
  const dataUrl = String(entry.dataUrl ?? '');
  if (!safeDomain || !validateAutomaticIconDataUrl(dataUrl)) {
    return null;
  }
  if (dataUrl.length > ICON_CACHE_MAX_DATA_URL_LENGTH) {
    return null;
  }
  const cachedAtRaw = Number(entry.cachedAt ?? 0);
  const cachedAt = Number.isFinite(cachedAtRaw) ? Math.max(0, Math.trunc(cachedAtRaw)) : 0;
  if (!cachedAt || Date.now() - cachedAt > ICON_CACHE_TTL_MS) {
    return null;
  }
  return {
    domain: safeDomain,
    dataUrl,
    sourceUrl: typeof entry.sourceUrl === 'string' ? entry.sourceUrl : null,
    objectClass:
      entry.objectClass === 'manual_private' || entry.objectClass === 'automatic_public'
        ? entry.objectClass
        : null,
    objectId:
      typeof entry.objectId === 'string' && entry.objectId.trim().length > 0 ? entry.objectId.trim() : null,
    objectSha256:
      typeof entry.objectSha256 === 'string' && /^[a-f0-9]{64}$/u.test(entry.objectSha256.trim().toLowerCase())
        ? entry.objectSha256.trim().toLowerCase()
        : null,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : nowIso(),
    cachedAt,
  };
}

function trimIconCacheEntries(entries) {
  const normalized = entries
    .map((entry) => normalizePersistedIconCacheEntry(entry))
    .filter((entry) => Boolean(entry));
  normalized.sort((left, right) => right.cachedAt - left.cachedAt);
  return normalized.slice(0, ICON_CACHE_MAX_ENTRIES);
}

async function persistCanonicalIconCacheToStorage() {
  if (!chrome.storage?.local || !iconCacheDirty) {
    return;
  }
  if (iconCachePersistInFlight) {
    await iconCachePersistInFlight;
    return;
  }
  const entries = trimIconCacheEntries(Array.from(canonicalIconCacheByDomain.values()));
  iconCachePersistInFlight = chrome.storage.local
    .set({
      [ICON_CACHE_STORAGE_KEY]: {
        schemaVersion: 1,
        savedAt: Date.now(),
        entries,
      },
    })
    .catch(() => {
      // Best effort only.
    })
    .finally(() => {
      iconCachePersistInFlight = null;
    });
  iconCacheDirty = false;
  await iconCachePersistInFlight;
}

function scheduleCanonicalIconCachePersist() {
  iconCacheDirty = true;
  if (iconCachePersistTimer !== null) {
    return;
  }
  iconCachePersistTimer = setTimeout(() => {
    iconCachePersistTimer = null;
    void persistCanonicalIconCacheToStorage();
  }, ICON_CACHE_PERSIST_DEBOUNCE_MS);
}

async function hydrateCanonicalIconCacheFromStorage() {
  if (!chrome.storage?.local) {
    return;
  }
  try {
    const stored = await chrome.storage.local.get(ICON_CACHE_STORAGE_KEY);
    const payload = stored?.[ICON_CACHE_STORAGE_KEY];
    const rawEntries = Array.isArray(payload?.entries) ? payload.entries : [];
    const entries = trimIconCacheEntries(rawEntries);
    canonicalIconCacheByDomain.clear();
    for (const entry of entries) {
      canonicalIconCacheByDomain.set(entry.domain, entry);
    }
    if (entries.length !== rawEntries.length) {
      scheduleCanonicalIconCachePersist();
    }
  } catch {
    // Ignore local icon cache hydration failures.
  }
}

function iconCacheEntryForDomain(domain) {
  const aliases = iconDomainAliases(domain);
  for (const alias of aliases) {
    const entry = canonicalIconCacheByDomain.get(alias);
    if (!entry) {
      continue;
    }
    if (Date.now() - entry.cachedAt > ICON_CACHE_TTL_MS) {
      canonicalIconCacheByDomain.delete(alias);
      scheduleCanonicalIconCachePersist();
      continue;
    }
    return entry;
  }
  return null;
}

function cacheResolvedIcons(icons) {
  if (!Array.isArray(icons)) {
    return;
  }
  const now = Date.now();
  let changed = false;
  for (const icon of icons) {
    if (!icon || typeof icon !== 'object') {
      continue;
    }
    const safeDomain = sanitizeIconHost(String(icon.domain ?? ''));
    const dataUrl = String(icon.dataUrl ?? '');
    if (!safeDomain || !validateAutomaticIconDataUrl(dataUrl)) {
      continue;
    }
    const cacheEntry = {
      domain: safeDomain,
      dataUrl,
      sourceUrl: typeof icon.sourceUrl === 'string' ? icon.sourceUrl : null,
      objectClass: null,
      objectId: null,
      objectSha256: null,
      updatedAt: typeof icon.updatedAt === 'string' ? icon.updatedAt : nowIso(),
      cachedAt: now,
    };
    const previous = canonicalIconCacheByDomain.get(safeDomain);
    const sameEntry =
      previous &&
      previous.dataUrl === cacheEntry.dataUrl &&
      previous.sourceUrl === cacheEntry.sourceUrl &&
      previous.objectClass === cacheEntry.objectClass &&
      previous.objectId === cacheEntry.objectId &&
      previous.objectSha256 === cacheEntry.objectSha256 &&
      previous.updatedAt === cacheEntry.updatedAt;
    canonicalIconCacheByDomain.set(safeDomain, cacheEntry);
    if (!sameEntry) {
      changed = true;
    }
    iconResolveMissByDomain.delete(safeDomain);
  }
  if (changed) {
    scheduleCanonicalIconCachePersist();
  }
}

function isIconsStateSyncEnabled() {
  return realtimeRuntime?.flags?.icons_state_sync_v1 === true;
}

function iconObjectCacheKeyFromStateRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }
  if (record.objectClass === 'automatic_public' && typeof record.objectSha256 === 'string') {
    const sha = record.objectSha256.trim().toLowerCase();
    return /^[a-f0-9]{64}$/u.test(sha) ? `a:${sha}` : null;
  }
  if (record.objectClass === 'manual_private' && typeof record.objectId === 'string') {
    const objectId = record.objectId.trim();
    return objectId.length > 0 ? `m:${objectId}` : null;
  }
  return null;
}

function iconObjectUrlFromStateRecord(record, manualTicketByObjectId) {
  const baseUrl = realtimeRuntime.iconsAssetBaseUrl || state.serverOrigin;
  if (!baseUrl) {
    return null;
  }
  if (record.objectClass === 'automatic_public' && typeof record.objectSha256 === 'string') {
    const sha = record.objectSha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(sha)) {
      return null;
    }
    return `${baseUrl.replace(/\/+$/u, '')}/icons/a/${sha}`;
  }
  if (record.objectClass === 'manual_private' && typeof record.objectId === 'string') {
    const objectId = record.objectId.trim();
    if (!objectId) {
      return null;
    }
    const ticket = manualTicketByObjectId.get(objectId);
    if (!ticket) {
      return null;
    }
    return `${baseUrl.replace(/\/+$/u, '')}/icons/m/${objectId}?ticket=${encodeURIComponent(ticket)}`;
  }
  return null;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchIconObjectDataUrl(objectUrl) {
  try {
    const response = await fetch(objectUrl, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const contentTypeHeader = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const contentType = contentTypeHeader.startsWith('image/') ? contentTypeHeader : 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength <= 0) {
      return null;
    }
    const base64 = bytesToBase64(new Uint8Array(arrayBuffer));
    const dataUrl = `data:${contentType};base64,${base64}`;
    return validateAutomaticIconDataUrl(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  }
}

function collectIconHostsFromCredential(credential) {
  if (!credential || credential.itemType !== 'login' || !Array.isArray(credential.urls)) {
    return [];
  }
  const hosts = new Set();
  for (const rawUrl of credential.urls) {
    const safeHost = normalizeIconDomainFromUrl(rawUrl);
    if (safeHost) {
      hosts.add(safeHost);
    }
  }
  return Array.from(hosts).sort((left, right) => left.localeCompare(right));
}

async function runWithConcurrency(tasks, concurrency) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return;
  }
  const safeConcurrency = Math.max(1, Math.min(Math.trunc(concurrency) || 1, tasks.length));
  const workers = Array.from({ length: safeConcurrency }, async (_, workerIndex) => {
    for (let index = workerIndex; index < tasks.length; index += safeConcurrency) {
      await tasks[index]();
    }
  });
  await Promise.allSettled(workers);
}

function shouldFallbackToLegacyIconsState(error) {
  const code = String(error?.code ?? '');
  const message =
    typeof error?.message === 'string'
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return code === 'feature_disabled' || code === 'request_failed_404' || message.includes('request_failed_404');
}

function isIconDomainSyncPayloadError(error) {
  const status = Number(error?.status ?? 0);
  const code = String(error?.code ?? '');
  const message = typeof error?.message === 'string' ? error.message : '';
  return (
    status === 400 ||
    status === 413 ||
    code === 'request_body_too_large' ||
    code === 'invalid_input' ||
    message.includes('request_body_too_large')
  );
}

function shouldBackoffIconDomainSync(error) {
  const status = Number(error?.status ?? 0);
  const code = String(error?.code ?? '');
  if (status === 429 || status >= 500) {
    return true;
  }
  return (
    code === 'request_timeout' ||
    code === 'rate_limited' ||
    code === 'request_failed_429' ||
    code === 'request_failed_500' ||
    code === 'request_failed_502' ||
    code === 'request_failed_503' ||
    code === 'request_failed_504'
  );
}

function nextIconDomainSyncBackoffMs() {
  iconDomainSyncBackoffAttempt = Math.max(1, iconDomainSyncBackoffAttempt + 1);
  const exponent = Math.min(iconDomainSyncBackoffAttempt - 1, 6);
  const baseMs = Math.min(ICON_DOMAIN_SYNC_BACKOFF_BASE_MS * 2 ** exponent, ICON_DOMAIN_SYNC_BACKOFF_MAX_MS);
  const jitterMs = Math.round(Math.random() * Math.max(250, baseMs * 0.2));
  return baseMs + jitterMs;
}

function markIconDomainSyncSuccess() {
  iconDomainSyncBackoffAttempt = 0;
  iconDomainSyncBackoffUntil = 0;
}

function selectDomainsForIconsState(domains) {
  const uniqueDomains = Array.from(
    new Set(
      domains
        .map((domain) => normalizeIconDomainForApi(domain))
        .filter((domain) => Boolean(domain)),
    ),
  );
  if (uniqueDomains.length <= ICONS_STATE_QUERY_DOMAINS_MAX) {
    return uniqueDomains;
  }
  const missing = [];
  const known = [];
  for (const domain of uniqueDomains) {
    const hasKnownIcon = iconDomainAliases(domain).some((alias) => Boolean(iconCacheEntryForDomain(alias)));
    if (hasKnownIcon) {
      known.push(domain);
    } else {
      missing.push(domain);
    }
  }
  return [...missing, ...known].slice(0, ICONS_STATE_QUERY_DOMAINS_MAX);
}

async function syncIconStateDomainRegistrations(projectedItems) {
  const apiClient = currentApiClient();
  if (!apiClient || !sessionToken || !isIconsStateSyncEnabled()) {
    return;
  }
  if (Date.now() < iconDomainSyncBackoffUntil) {
    return;
  }
  const credentialById = new Map();
  for (const credential of credentialsCache.credentials) {
    credentialById.set(credential.itemId, credential);
  }
  let registrationChanged = false;
  for (const itemId of Array.from(iconDomainRegistrationByItemId.keys())) {
    if (!credentialById.has(itemId)) {
      iconDomainRegistrationByItemId.delete(itemId);
      registrationChanged = true;
    }
  }
  const pendingEntries = [];
  for (const projected of projectedItems) {
    const credential = credentialById.get(projected?.itemId);
    if (!credential || credential.itemType !== 'login') {
      continue;
    }
    const hosts = collectIconHostsFromCredential(credential);
    if (hosts.length === 0) {
      continue;
    }
    const signature = `${credential.revision}:${hosts.join(',')}`;
    if (iconDomainRegistrationByItemId.get(credential.itemId) === signature) {
      continue;
    }
    pendingEntries.push({
      itemId: credential.itemId,
      itemRevision: credential.revision,
      hosts,
      signature,
    });
  }
  if (pendingEntries.length === 0) {
    if (registrationChanged) {
      scheduleIconDomainRegistrationCachePersist();
    }
    return;
  }

  const fallbackPerItemSync = async (entries) => {
    const updateTasks = entries.map((entry) => async () => {
      try {
        await apiClient.putIconDomainsItem({
          bearerToken: sessionToken,
          itemId: entry.itemId,
          itemRevision: entry.itemRevision,
          hosts: entry.hosts,
        });
        iconDomainRegistrationByItemId.set(entry.itemId, entry.signature);
        registrationChanged = true;
      } catch {
        // Keep previous signature and retry later.
      }
    });
    await runWithConcurrency(updateTasks, ICON_DOMAIN_SYNC_CONCURRENCY);
  };

  const syncChunkWithAdaptiveBatch = async (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      return;
    }
    try {
      const response = await apiClient.putIconDomainsBatch({
        bearerToken: sessionToken,
        entries: entries.map((entry) => ({
          itemId: entry.itemId,
          itemRevision: entry.itemRevision,
          hosts: entry.hosts,
        })),
      });
      const staleItemIds = new Set(
        Array.isArray(response?.entries)
          ? response.entries
              .filter((entry) => entry?.result === 'success_no_op_stale_revision')
              .map((entry) => entry.itemId)
          : [],
      );
      for (const entry of entries) {
        if (staleItemIds.has(entry.itemId)) {
          continue;
        }
        iconDomainRegistrationByItemId.set(entry.itemId, entry.signature);
        registrationChanged = true;
      }
      return;
    } catch (error) {
      if (!isIconDomainSyncPayloadError(error)) {
        throw error;
      }
      if (entries.length <= 1) {
        await fallbackPerItemSync(entries);
        return;
      }
      const middle = Math.ceil(entries.length / 2);
      await syncChunkWithAdaptiveBatch(entries.slice(0, middle));
      await syncChunkWithAdaptiveBatch(entries.slice(middle));
    }
  };

  for (let index = 0; index < pendingEntries.length; index += ICON_DOMAIN_SYNC_BATCH_SIZE) {
    const chunk = pendingEntries.slice(index, index + ICON_DOMAIN_SYNC_BATCH_SIZE);
    try {
      await syncChunkWithAdaptiveBatch(chunk);
      markIconDomainSyncSuccess();
    } catch (error) {
      const now = Date.now();
      if (now - lastIconDomainBatchFallbackLogAt > 30_000) {
        lastIconDomainBatchFallbackLogAt = now;
        const status = Number(error?.status ?? 0);
        const code = String(error?.code ?? '');
        const detail = typeof error?.message === 'string' ? error.message : '';
        console.warn('[vaultlite][icons] domains batch sync failed; using per-item fallback', {
          status: Number.isFinite(status) ? status : 0,
          code,
          detail,
          chunkSize: chunk.length,
        });
      }
      if (shouldBackoffIconDomainSync(error)) {
        iconDomainSyncBackoffUntil = Date.now() + nextIconDomainSyncBackoffMs();
        break;
      }
      await fallbackPerItemSync(chunk);
    }
  }
  if (registrationChanged) {
    scheduleIconDomainRegistrationCachePersist();
  }
}

async function hydrateCanonicalIconsForDomainsFromState(domains, projectedItems) {
  const apiClient = currentApiClient();
  if (!apiClient || !sessionToken || !Array.isArray(domains) || domains.length === 0) {
    return;
  }
  if (Date.now() - lastIconsStateFailureAt < ICONS_STATE_RETRY_COOLDOWN_MS) {
    return;
  }
  await syncIconStateDomainRegistrations(projectedItems);
  const uniqueDomains = selectDomainsForIconsState(domains);
  if (uniqueDomains.length === 0) {
    return;
  }

  const response = await apiClient.getIconsState({
    bearerToken: sessionToken,
    domains: uniqueDomains,
    etag: iconsStateEtag || undefined,
  });
  if (response?.status === 'not_modified') {
    if (typeof response?.etag === 'string' && response.etag.length > 0) {
      iconsStateEtag = response.etag;
    }
    return;
  }
  const payload = response?.payload && typeof response.payload === 'object' ? response.payload : null;
  if (!payload || !Array.isArray(payload.records)) {
    return;
  }
  if (typeof response?.etag === 'string' && response.etag.length > 0) {
    iconsStateEtag = response.etag;
  } else if (typeof payload.etag === 'string' && payload.etag.length > 0) {
    iconsStateEtag = payload.etag;
  }

  const manualObjectIds = Array.from(
    new Set(
      payload.records
        .filter(
          (record) =>
            record &&
            record.status === 'ready' &&
            record.objectClass === 'manual_private' &&
            typeof record.objectId === 'string' &&
            record.objectId.trim().length > 0,
        )
        .map((record) => record.objectId.trim())
        .filter(
          (objectId) =>
            !Array.from(canonicalIconCacheByDomain.values()).some(
              (entry) => entry.objectClass === 'manual_private' && entry.objectId === objectId,
            ),
        ),
    ),
  );
  const manualTicketByObjectId = new Map();
  if (manualObjectIds.length > 0) {
    try {
      const ticketResponse = await apiClient.issueIconObjectTickets({
        bearerToken: sessionToken,
        objectIds: manualObjectIds,
        ttlSeconds: 300,
      });
      for (const entry of ticketResponse?.tickets ?? []) {
        if (entry?.objectId && entry?.ticket) {
          manualTicketByObjectId.set(entry.objectId, entry.ticket);
        }
      }
    } catch {
      // Manual-private icons remain on previous cache entry until next refresh.
    }
  }

  let changed = false;
  const now = Date.now();
  for (const record of payload.records) {
    if (!record || typeof record !== 'object') {
      continue;
    }
    const safeDomain = normalizeIconDomainForApi(record.domain);
    if (!safeDomain) {
      continue;
    }
    if (record.status === 'removed' || record.status === 'absent') {
      for (const alias of iconDomainAliases(safeDomain)) {
        if (canonicalIconCacheByDomain.delete(alias)) {
          changed = true;
        }
      }
      iconResolveMissByDomain.set(safeDomain, now);
      continue;
    }
    if (record.status !== 'ready') {
      continue;
    }

    const objectCacheKey = iconObjectCacheKeyFromStateRecord(record);
    if (!objectCacheKey) {
      continue;
    }
    let cachedEntry = null;
    for (const alias of iconDomainAliases(safeDomain)) {
      const candidate = canonicalIconCacheByDomain.get(alias);
      const candidateObjectKey =
        candidate?.objectClass === 'automatic_public' && typeof candidate.objectSha256 === 'string'
          ? `a:${candidate.objectSha256}`
          : candidate?.objectClass === 'manual_private' && typeof candidate.objectId === 'string'
            ? `m:${candidate.objectId}`
            : null;
      if (candidateObjectKey && candidateObjectKey === objectCacheKey) {
        cachedEntry = candidate;
        break;
      }
    }

    let dataUrl = cachedEntry?.dataUrl ?? null;
    if (!dataUrl) {
      const objectUrl = iconObjectUrlFromStateRecord(record, manualTicketByObjectId);
      if (!objectUrl) {
        continue;
      }
      dataUrl = await fetchIconObjectDataUrl(objectUrl);
      if (!dataUrl) {
        continue;
      }
    }

    const cacheEntry = {
      domain: safeDomain,
      dataUrl,
      sourceUrl: null,
      objectClass: record.objectClass === 'manual_private' ? 'manual_private' : 'automatic_public',
      objectId: typeof record.objectId === 'string' ? record.objectId : null,
      objectSha256: typeof record.objectSha256 === 'string' ? record.objectSha256 : null,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : nowIso(),
      cachedAt: now,
    };
    for (const alias of iconDomainAliases(safeDomain)) {
      const previous = canonicalIconCacheByDomain.get(alias);
      const same =
        previous &&
        previous.dataUrl === cacheEntry.dataUrl &&
        previous.objectClass === cacheEntry.objectClass &&
        previous.objectId === cacheEntry.objectId &&
        previous.objectSha256 === cacheEntry.objectSha256 &&
        previous.updatedAt === cacheEntry.updatedAt;
      canonicalIconCacheByDomain.set(alias, {
        ...cacheEntry,
        domain: alias,
      });
      if (!same) {
        changed = true;
      }
    }
    iconResolveMissByDomain.delete(safeDomain);
  }

  if (changed) {
    scheduleCanonicalIconCachePersist();
  }
  lastIconsStateFailureAt = 0;
}

function collectProjectedDomains(items) {
  const domains = new Set();
  for (const item of items) {
    if (!item || item.itemType !== 'login') {
      continue;
    }
    const safeDomain = normalizeIconDomainFromUrl(item.firstUrl);
    if (safeDomain) {
      domains.add(safeDomain);
    }
  }
  return Array.from(domains);
}

function mergeUniqueIconCandidates(candidates) {
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      continue;
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    unique.push(candidate);
  }
  return unique;
}

function applyCachedIconsToProjection(items) {
  return items.map((item) => {
    if (!item || item.itemType !== 'login') {
      return item;
    }
    const safeDomain = normalizeIconDomainFromUrl(item.firstUrl);
    if (!safeDomain) {
      return item;
    }
    const cached = iconCacheEntryForDomain(safeDomain);
    if (!cached) {
      return item;
    }
    return {
      ...item,
      faviconCandidates: mergeUniqueIconCandidates([cached.dataUrl, ...(item.faviconCandidates ?? [])]),
    };
  });
}

async function hydrateCanonicalIconsForDomains(domains, projectedItems = []) {
  const apiClient = currentApiClient();
  if (!apiClient || !sessionToken || !Array.isArray(domains) || domains.length === 0) {
    return;
  }
  if (!isIconsStateSyncEnabled()) {
    return;
  }
  try {
    await hydrateCanonicalIconsForDomainsFromState(domains, projectedItems);
  } catch {
    lastIconsStateFailureAt = Date.now();
  }
  return;
}

async function ensureProjectedIconsHydrated(items) {
  const domains = collectProjectedDomains(items);
  if (domains.length === 0) {
    return;
  }
  if (!sessionToken || !currentApiClient()) {
    return;
  }
  const cooldownMs = isIconsStateSyncEnabled() ? ICON_STATE_HYDRATION_START_COOLDOWN_MS : ICON_HYDRATION_START_COOLDOWN_MS;
  if (Date.now() - lastIconHydrationStartedAt < cooldownMs) {
    return;
  }
  if (!iconHydrationInFlight) {
    lastIconHydrationStartedAt = Date.now();
    void persistRuntimeState();
    iconHydrationInFlight = hydrateCanonicalIconsForDomains(domains, items).finally(() => {
      iconHydrationInFlight = null;
    });
  }
}

function listManualIconsView() {
  return Object.entries(manualIconMap)
    .map(([host, dataUrl]) => ({
      host,
      dataUrl,
    }))
    .sort((left, right) => left.host.localeCompare(right.host));
}

function isUnauthorizedApiError(error) {
  const code = String(error?.code ?? '');
  const status = Number(error?.status ?? 0);
  return code === 'unauthorized' || code === 'request_failed_401' || status === 401;
}

function isNonRetriableApiError(error) {
  const status = Number(error?.status ?? 0);
  if (!Number.isFinite(status)) {
    return false;
  }
  if (status === 429) {
    return false;
  }
  return status >= 400 && status < 500;
}

function normalizeManualIconQueueEntry(host, rawEntry) {
  const safeHost = sanitizeIconHost(host);
  if (!safeHost || !rawEntry || typeof rawEntry !== 'object') {
    return null;
  }
  const action = rawEntry.action === 'remove' ? 'remove' : rawEntry.action === 'upsert' ? 'upsert' : null;
  if (!action) {
    return null;
  }
  const queuedAt =
    typeof rawEntry.queuedAt === 'string' && rawEntry.queuedAt.trim().length > 0
      ? rawEntry.queuedAt
      : nowIso();
  if (action === 'remove') {
    return {
      host: safeHost,
      action,
      queuedAt,
    };
  }
  const dataUrl = typeof rawEntry.dataUrl === 'string' ? rawEntry.dataUrl : '';
  if (!validateManualIconDataUrl(dataUrl)) {
    return null;
  }
  return {
    host: safeHost,
    action,
    dataUrl,
    source: rawEntry.source === 'url' ? 'url' : 'file',
    queuedAt,
  };
}

async function persistManualIconSyncQueue() {
  await chrome.storage.local.set({
    [MANUAL_ICON_SYNC_QUEUE_STORAGE_KEY]: manualIconSyncQueue,
  });
}

async function enqueueManualIconSyncUpsert(input) {
  manualIconSyncQueue[input.host] = {
    action: 'upsert',
    dataUrl: input.dataUrl,
    source: input.source === 'url' ? 'url' : 'file',
    queuedAt: nowIso(),
  };
  await persistManualIconSyncQueue();
}

async function enqueueManualIconSyncRemove(host) {
  manualIconSyncQueue[host] = {
    action: 'remove',
    queuedAt: nowIso(),
  };
  await persistManualIconSyncQueue();
}

async function dropManualIconSyncQueueHost(host) {
  if (!(host in manualIconSyncQueue)) {
    return;
  }
  delete manualIconSyncQueue[host];
  await persistManualIconSyncQueue();
}

async function processManualIconSyncQueueBestEffort() {
  if (manualIconSyncQueueProcessInFlight) {
    return manualIconSyncQueueProcessInFlight;
  }

  manualIconSyncQueueProcessInFlight = (async () => {
    const apiClient = currentApiClient();
    if (!apiClient || !sessionToken) {
      return;
    }
    const hosts = Object.keys(manualIconSyncQueue).sort((left, right) => left.localeCompare(right));
    for (const host of hosts) {
      const normalized = normalizeManualIconQueueEntry(host, manualIconSyncQueue[host]);
      if (!normalized) {
        await dropManualIconSyncQueueHost(host);
        continue;
      }

      const executeOnce = async () => {
        if (normalized.action === 'remove') {
          await apiClient.removeManualSiteIcon({
            bearerToken: sessionToken,
            domain: normalized.host,
          });
          return;
        }
        await apiClient.upsertManualSiteIcon({
          bearerToken: sessionToken,
          domain: normalized.host,
          dataUrl: normalized.dataUrl,
          source: normalized.source,
        });
      };

      try {
        await executeOnce();
        await dropManualIconSyncQueueHost(host);
      } catch (error) {
        if (isUnauthorizedApiError(error)) {
          await clearExtensionSessionToken();
          break;
        }
        if (isNonRetriableApiError(error)) {
          await dropManualIconSyncQueueHost(host);
          continue;
        }
        // Keep in queue to retry later.
      }
    }
  })();

  try {
    await manualIconSyncQueueProcessInFlight;
  } finally {
    manualIconSyncQueueProcessInFlight = null;
  }
}

async function hydrateManualIconsFromServerBestEffort() {
  const apiClient = currentApiClient();
  if (!apiClient || !sessionToken) {
    return;
  }
  const now = Date.now();
  if (now - lastManualIconHydratedAt < MANUAL_ICON_HYDRATE_COOLDOWN_MS) {
    return;
  }
  if (manualIconHydrationInFlight) {
    await manualIconHydrationInFlight;
    return;
  }

  lastManualIconHydratedAt = now;
  void persistRuntimeState();
  manualIconHydrationInFlight = (async () => {
    try {
      const response = await apiClient.listManualSiteIcons({
        bearerToken: sessionToken,
        etag: manualIconsEtag || undefined,
      });
      if (response?.status === 'not_modified') {
        if (typeof response.etag === 'string' && response.etag.length > 0) {
          manualIconsEtag = response.etag;
        }
        lastManualIconHydratedAt = Date.now();
        void persistRuntimeState();
        return;
      }
      if (!response || response.status !== 'ok' || !Array.isArray(response.payload?.icons)) {
        return;
      }
      if (typeof response.etag === 'string' && response.etag.length > 0) {
        manualIconsEtag = response.etag;
      }
      const nextManualIconMap = {};
      for (const entry of response.payload.icons) {
        const safeHost = sanitizeIconHost(String(entry.domain ?? ''));
        const dataUrl = String(entry.dataUrl ?? '');
        if (!safeHost || !validateManualIconDataUrl(dataUrl)) {
          continue;
        }
        nextManualIconMap[safeHost] = dataUrl;
      }
      manualIconMap = nextManualIconMap;
      lastManualIconHydratedAt = Date.now();
      void persistRuntimeState();
      await processManualIconSyncQueueBestEffort();
    } catch {
      // Best-effort hydration.
    }
  })().finally(() => {
    manualIconHydrationInFlight = null;
  });

  await manualIconHydrationInFlight;
}

async function listManualIconsInternal() {
  return ok({
    icons: listManualIconsView(),
  });
}

async function setManualIconInternal(input) {
  const safeHost = sanitizeIconHost(input?.host ?? '');
  if (!safeHost) {
    return fail('icon_host_invalid', 'Host is invalid.');
  }
  const dataUrl = typeof input?.dataUrl === 'string' ? input.dataUrl : '';
  if (!validateManualIconDataUrl(dataUrl)) {
    return fail('icon_data_invalid', 'Icon data is invalid.');
  }
  await upsertManualIconRecord({
    host: safeHost,
    dataUrl,
    source: input?.source === 'url' ? 'url' : 'file',
  });
  manualIconMap[safeHost] = dataUrl;
  await enqueueManualIconSyncUpsert({
    host: safeHost,
    dataUrl,
    source: input?.source === 'url' ? 'url' : 'file',
  });
  await processManualIconSyncQueueBestEffort();
  const syncStatus = safeHost in manualIconSyncQueue ? 'queued' : 'synced';
  return ok({
    icons: listManualIconsView(),
    syncStatus,
  });
}

async function removeManualIconInternal(input) {
  const safeHost = sanitizeIconHost(input?.host ?? '');
  if (!safeHost) {
    return ok({
      icons: listManualIconsView(),
    });
  }
  const nextMap = await removeManualIconRecord(safeHost);
  manualIconMap = {};
  for (const [host, record] of Object.entries(nextMap)) {
    if (!record || typeof record !== 'object' || !validateManualIconDataUrl(record.dataUrl ?? '')) {
      continue;
    }
    manualIconMap[host] = record.dataUrl;
  }
  await enqueueManualIconSyncRemove(safeHost);
  await processManualIconSyncQueueBestEffort();
  const syncStatus = safeHost in manualIconSyncQueue ? 'queued' : 'synced';
  return ok({
    icons: listManualIconsView(),
    syncStatus,
  });
}

function normalizePasswordGeneratorHistoryEntry(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  if (!id) {
    return null;
  }
  const createdAt = Number(candidate.createdAt);
  if (!Number.isFinite(createdAt)) {
    return null;
  }
  const password = typeof candidate.password === 'string' ? candidate.password : '';
  if (!password) {
    return null;
  }
  const pageUrl = typeof candidate.pageUrl === 'string' ? candidate.pageUrl : '';
  const pageHost = sanitizeIconHost(typeof candidate.pageHost === 'string' ? candidate.pageHost : '');
  return {
    id,
    createdAt,
    password,
    pageUrl,
    pageHost: pageHost || 'unknown',
  };
}

async function listPasswordGeneratorHistoryInternal() {
  if (state.phase !== 'ready' || !sessionToken || !unlockedContext?.accountKey) {
    return ok({ entries: [] });
  }
  const apiClient = currentApiClient();
  if (!apiClient) {
    return ok({ entries: [] });
  }
  try {
    const response = await apiClient.listPasswordGeneratorHistory({
      bearerToken: sessionToken,
    });
    const entries = [];
    const records = Array.isArray(response?.entries) ? response.entries : [];
    for (const record of records) {
      try {
        const payload = await decryptVaultItemPayload({
          accountKey: unlockedContext.accountKey,
          encryptedPayload: String(record.encryptedPayload ?? ''),
        });
        const normalized = normalizePasswordGeneratorHistoryEntry({
          id: record.entryId,
          createdAt: Number(payload?.createdAt) || Date.parse(String(record.createdAt ?? '')),
          password: typeof payload?.password === 'string' ? payload.password : '',
          pageUrl: typeof payload?.pageUrl === 'string' ? payload.pageUrl : '',
          pageHost: typeof payload?.pageHost === 'string' ? payload.pageHost : '',
        });
        if (normalized) {
          entries.push(normalized);
        }
      } catch {
        // Skip malformed or undecryptable history records.
      }
    }
    entries.sort((left, right) => right.createdAt - left.createdAt);
    return ok({
      entries: entries.slice(0, PASSWORD_GENERATOR_HISTORY_MAX_ENTRIES),
    });
  } catch (error) {
    if (isUnauthorizedApiError(error)) {
      await clearExtensionSessionToken();
    }
    return fail('password_generator_history_unavailable', 'Password history is unavailable right now.');
  }
}

async function upsertPasswordGeneratorHistoryEntryInternal(input) {
  if (state.phase !== 'ready' || !sessionToken || !unlockedContext?.accountKey) {
    return fail('locked', 'Unlock this trusted device first.');
  }
  const apiClient = currentApiClient();
  if (!apiClient) {
    return fail('server_unavailable', 'Server unavailable.');
  }
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!password) {
    return fail('invalid_input', 'Password is required.');
  }
  const rawPageUrl = typeof input?.pageUrl === 'string' ? input.pageUrl : '';
  let derivedHost = '';
  if (rawPageUrl) {
    try {
      derivedHost = new URL(rawPageUrl).host;
    } catch {
      derivedHost = '';
    }
  }
  const pageHost = sanitizeIconHost(
    typeof input?.pageHost === 'string' && input.pageHost.trim().length > 0 ? input.pageHost : derivedHost,
  ) || 'unknown';
  const rawCreatedAt = Number(input?.createdAt);
  const createdAt = Number.isFinite(rawCreatedAt) ? Math.trunc(rawCreatedAt) : Date.now();
  const id = typeof input?.entryId === 'string' && input.entryId.trim().length > 0
    ? input.entryId.trim()
    : `pg_${createdAt}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    const encryptedPayload = await encryptVaultItemPayload({
      accountKey: unlockedContext.accountKey,
      itemType: 'secure_note',
      payload: {
        password,
        pageUrl: rawPageUrl,
        pageHost,
        createdAt,
      },
    });
    await apiClient.upsertPasswordGeneratorHistoryEntry({
      bearerToken: sessionToken,
      entryId: id,
      encryptedPayload,
      createdAt: new Date(createdAt).toISOString(),
    });
    return ok({
      entry: {
        id,
        createdAt,
        password,
        pageUrl: rawPageUrl,
        pageHost,
      },
    });
  } catch (error) {
    if (isUnauthorizedApiError(error)) {
      await clearExtensionSessionToken();
    }
    return fail('password_generator_history_sync_failed', 'Could not sync password history right now.');
  }
}

function sortProjectedCredentials(left, right) {
  const leftScore = (left.matchFlags.exactOrigin ? 10 : 0) + left.matchFlags.domainScore;
  const rightScore = (right.matchFlags.exactOrigin ? 10 : 0) + right.matchFlags.domainScore;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }
  const titleCompare = left.title.localeCompare(right.title);
  if (titleCompare !== 0) {
    return titleCompare;
  }
  return left.itemId.localeCompare(right.itemId);
}

function normalizeTypeFilter(rawTypeFilter) {
  if (typeof rawTypeFilter === 'string' && VALID_TYPE_FILTERS.has(rawTypeFilter)) {
    return rawTypeFilter;
  }
  return 'all';
}

function toBoolean(value) {
  return value === true;
}

function filterProjectedCredentials(input) {
  const normalizedTypeFilter = normalizeTypeFilter(input.typeFilter);
  const normalizedQuery = typeof input.query === 'string' ? input.query : '';
  const suggestedOnly = toBoolean(input.suggestedOnly);
  return input.items.filter((item) => {
    if (normalizedTypeFilter !== 'all' && item.itemType !== normalizedTypeFilter) {
      return false;
    }
    if (suggestedOnly && !item.matchFlags.exactOrigin && item.matchFlags.domainScore === 0) {
      return false;
    }
    return matchesQuery(item, normalizedQuery);
  });
}

function projectCredentialsForPage(pageUrl) {
  return credentialsCache.credentials.map((credential) => projectCredentialForPopup(credential, pageUrl));
}

function projectCredentialIndexForPage(entry, pageUrl) {
  const urls = Array.isArray(entry?.urls) ? entry.urls : [];
  const exactOrigin = entry?.itemType === 'login' ? isCredentialAllowedForSite(pageUrl, urls) : false;
  const domainScore = entry?.itemType === 'login' ? scoreDomainMatch(pageUrl, urls) : 0;
  let manualIconDataUrl = null;
  for (const rawUrl of urls) {
    try {
      const safeHost = sanitizeIconHost(new URL(rawUrl).hostname);
      if (safeHost && manualIconMap[safeHost]) {
        manualIconDataUrl = manualIconMap[safeHost];
      }
      break;
    } catch {
      // Ignore malformed URL in projection cache.
    }
  }
  const firstUrl = typeof entry?.firstUrl === 'string' ? entry.firstUrl : '';
  return {
    itemId: entry?.itemId ?? '',
    itemType: entry?.itemType ?? 'login',
    title: entry?.title ?? 'Untitled item',
    subtitle: entry?.subtitle ?? '—',
    searchText: entry?.searchText ?? entry?.title ?? '',
    firstUrl,
    faviconCandidates: mergeUniqueIconCandidates([
      ...(manualIconDataUrl ? [manualIconDataUrl] : []),
      ...buildFaviconCandidates(firstUrl),
    ]),
    urlHostSummary: typeof entry?.urlHostSummary === 'string' ? entry.urlHostSummary : 'No URL',
    matchFlags: {
      exactOrigin,
      domainScore,
    },
  };
}

function projectCredentialsFromSessionCacheForPage(pageUrl) {
  const items = Array.isArray(sessionListProjectionCache.items) ? sessionListProjectionCache.items : [];
  return items
    .map((entry) => projectCredentialIndexForPage(entry, pageUrl))
    .filter((entry) => typeof entry.itemId === 'string' && entry.itemId.length > 0);
}

async function listCredentialsInternal(input = {}) {
  const listStartedAt = Date.now();
  if (credentialsCache.credentials.length === 0) {
    const projectionLoaded = await loadSessionListProjectionCacheBestEffort();
    if (projectionLoaded) {
      void loadCredentialCacheFromLocalBestEffort();
    } else {
      await loadCredentialCacheFromLocalBestEffort();
    }
  }
  const cacheResult = await refreshCredentialCache({
    awaitCompletion: false,
    preferLocalCache: true,
  });
  if (!cacheResult.ok) {
    return cacheResult;
  }
  armIdleLockTimer();

  const explicitPageUrl = typeof input.pageUrl === 'string' ? input.pageUrl : '';
  let activePageUrl = explicitPageUrl;
  if (!activePageUrl) {
    const activeTab = await fetchActiveTab();
    activePageUrl = activeTab?.tabUrl ?? '';
  }
  const pageEligible = isPageUrlEligibleForFill(activePageUrl);

  let projectedItems =
    credentialsCache.credentials.length > 0
      ? projectCredentialsForPage(activePageUrl)
      : projectCredentialsFromSessionCacheForPage(activePageUrl);
  let projections = filterProjectedCredentials({
    items: projectedItems,
    query: input.query,
    typeFilter: input.typeFilter,
    suggestedOnly: input.suggestedOnly,
  })
    .sort(sortProjectedCredentials);

  void ensureProjectedIconsHydrated(projections);
  projections = applyCachedIconsToProjection(projections);

  const normalizedTypeFilter = normalizeTypeFilter(input.typeFilter);
  const normalizedQuery = typeof input.query === 'string' ? input.query.trim() : '';
  const suggestedFilter = toBoolean(input.suggestedOnly);
  const shouldRetryEmptyCache =
    credentialsCache.credentials.length === 0 &&
    cacheWarmupState !== 'running' &&
    cacheWarmupState !== 'syncing' &&
    cacheWarmupState !== 'loading_local' &&
    normalizedTypeFilter === 'all' &&
    normalizedQuery.length === 0 &&
    !suggestedFilter &&
    Date.now() - lastEmptyCacheRetryAt > 15_000;

  if (shouldRetryEmptyCache) {
    lastEmptyCacheRetryAt = Date.now();
    void refreshCredentialCache({ force: true, awaitCompletion: false });
  }

  const exactMatchCount = projections.filter((entry) => entry.matchFlags.exactOrigin).length;
  const listSource =
    credentialsCache.credentials.length > 0
      ? lastCredentialCacheSource || 'memory'
      : sessionListProjectionCache.items.length > 0
        ? 'projection'
        : 'empty';
  projectionCacheDiagnostics.lastListSource = listSource;
  projectionCacheDiagnostics.lastFirstItemRenderMs =
    projections.length > 0 ? Date.now() - listStartedAt : null;
  projectionCacheDiagnostics.lastEmptyListReasonCode = projections.length > 0 ? null : 'no_projected_items';

  return ok({
    page: {
      url: activePageUrl,
      eligible: pageEligible,
      exactMatchCount,
    },
    items: projections,
    source: listSource,
  });
}

async function fillCredentialInternal(itemId) {
  const cacheResult = await refreshCredentialCache();
  if (!cacheResult.ok) {
    return cacheResult;
  }
  armIdleLockTimer();

  const targetCredential = credentialsCache.credentials.find((entry) => entry.itemId === itemId) ?? null;
  if (!targetCredential) {
    return fail('credential_not_found', 'Credential not found in extension cache.');
  }
  if (targetCredential.itemType !== 'login') {
    return fail('manual_fill_unavailable', 'Manual fill is available for login items only.');
  }

  const activeTab = await fetchActiveTab();
  if (!activeTab || !activeTab.tabUrl) {
    return fail('manual_fill_unavailable', 'Manual fill unavailable on this page.');
  }

  if (!isPageUrlEligibleForFill(activeTab.tabUrl)) {
    return ok({ result: 'manual_fill_unavailable' });
  }

  if (!isCredentialAllowedForSite(activeTab.tabUrl, targetCredential.urls)) {
    return ok({ result: 'credential_not_allowed_for_site' });
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.tabId, allFrames: false },
      files: ['content-script.js'],
    });

    const recheckedTab = await chrome.tabs.get(activeTab.tabId);
    if (!recheckedTab || recheckedTab.url !== activeTab.tabUrl) {
      return ok({ result: 'page_changed_try_again' });
    }

    const fillResponse = await chrome.tabs.sendMessage(activeTab.tabId, {
      type: 'vaultlite.fill',
      expectedPageUrl: activeTab.tabUrl,
      credential: {
        username: targetCredential.username,
        password: targetCredential.password,
      },
    });

    if (!fillResponse || typeof fillResponse.result !== 'string') {
      return ok({ result: 'manual_fill_unavailable' });
    }

    return ok({ result: fillResponse.result });
  } catch {
    return ok({ result: 'manual_fill_unavailable' });
  }
}

async function getCredentialFieldInternal(itemId, field) {
  const cacheResult = await refreshCredentialCache();
  if (!cacheResult.ok) {
    return cacheResult;
  }
  armIdleLockTimer();

  const targetCredential = credentialsCache.credentials.find((entry) => entry.itemId === itemId) ?? null;
  if (!targetCredential) {
    return fail('credential_not_found', 'Credential not found in extension cache.');
  }

  const value = resolveItemFieldValue(targetCredential, field);
  if (value === null) {
    return fail('invalid_input', 'Unsupported field requested.');
  }
  return ok({ value });
}

function resolveItemFieldValue(item, field) {
  if (item.itemType === 'login') {
    if (field === 'username') {
      return item.username ?? '';
    }
    if (field === 'password') {
      return item.password ?? '';
    }
    if (field === 'url') {
      return Array.isArray(item.urls) && item.urls.length > 0 ? item.urls[0] : '';
    }
    return null;
  }

  if (item.itemType === 'card') {
    if (field === 'card_number') {
      return item.number ?? '';
    }
    if (field === 'card_cvv') {
      return item.securityCode ?? '';
    }
    if (field === 'card_expiry') {
      const month = Number.isFinite(item.expiryMonth) ? String(item.expiryMonth).padStart(2, '0') : '';
      const year = Number.isFinite(item.expiryYear) ? String(item.expiryYear) : '';
      return month && year ? `${month}/${year}` : '';
    }
    return null;
  }

  if (item.itemType === 'document' || item.itemType === 'secure_note') {
    if (field === 'content') {
      return item.content ?? '';
    }
    if (field === 'title') {
      return item.title ?? '';
    }
    return null;
  }

  return null;
}

async function applyTrustedPairingResult(pairingResult) {
  const normalizedLocalUnlockKdfProfile = normalizeLocalUnlockKdfProfile(
    pairingResult.package.localUnlockEnvelope?.kdfProfile ?? null,
  );
  trustedState = {
    username: pairingResult.user.username,
    deviceId: pairingResult.device.deviceId,
    deviceName: pairingResult.device.deviceName,
    authSalt: pairingResult.package.authSalt,
    encryptedAccountBundle: pairingResult.package.encryptedAccountBundle,
    accountKeyWrapped: pairingResult.package.accountKeyWrapped,
    localUnlockEnvelope: {
      ...pairingResult.package.localUnlockEnvelope,
      kdfProfile: normalizedLocalUnlockKdfProfile,
    },
    localUnlockKdfProfile: normalizedLocalUnlockKdfProfile,
    sessionRecoverKey:
      typeof pairingResult.sessionRecoverKey === 'string' ? pairingResult.sessionRecoverKey : null,
    deploymentFingerprint: null,
    serverOrigin: state.serverOrigin,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  state.hasTrustedState = true;
  state.userId = pairingResult.user.userId ?? state.userId;
  state.username = trustedState.username;
  state.deviceId = trustedState.deviceId;
  state.deviceName = trustedState.deviceName;
  state.deploymentFingerprint = trustedState.deploymentFingerprint;

  sessionToken = pairingResult.extensionSessionToken;
  state.sessionExpiresAt = pairingResult.sessionExpiresAt;

  clearSensitiveMemory();
  setPhase('local_unlock_required', null);

  await Promise.all([persistTrusted(trustedState), persistSessionToken()]);
  await hydrateManualIconsFromServerBestEffort();
}

async function pollLinkPairingFromBridgeInternal(input, sender) {
  const senderValidation = validateBridgeSender(sender, 'settings');
  if (senderValidation) {
    return senderValidation;
  }
  if (typeof input?.requestId !== 'string' || input.requestId.trim().length < 8) {
    return fail('invalid_input', 'Trusted-device request id is invalid.');
  }

  const expectedWebOrigin = deriveWebOriginFromServerOrigin(state.serverOrigin);
  if (!expectedWebOrigin) {
    return fail('server_origin_not_allowed', 'Configure server URL first in extension settings.');
  }
  const permissionGranted = await ensureServerHostPermission(expectedWebOrigin);
  if (!permissionGranted) {
    return fail(
      'server_origin_permission_required',
      'Grant web origin permission in extension settings before auto connect.',
    );
  }

  return pollLinkPairingInternal({
    requestId: input.requestId.trim(),
  });
}

async function openPopupFromBridgeInternal(sender) {
  const senderValidation = validateBridgeSender(sender, 'settings');
  if (senderValidation) {
    return senderValidation;
  }
  try {
    if (!chrome.action?.openPopup) {
      return fail('popup_open_not_supported', 'Automatic popup opening is not supported in this browser.');
    }
    await chrome.action.openPopup();
    return ok();
  } catch {
    return fail('popup_open_not_supported', 'Open the extension popup from the toolbar to continue.');
  }
}

function isSafeUnlockGrantRequestId(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function isSafeBase64Url(value, minimumLength = 16) {
  return (
    typeof value === 'string' &&
    value.length >= minimumLength &&
    /^[A-Za-z0-9_-]+$/u.test(value)
  );
}

async function nudgeUnlockGrantFromBridgeInternal(input, sender) {
  const senderValidation = validateBridgeSender(sender, 'unlock');
  if (senderValidation) {
    return senderValidation;
  }
  if (!isSafeUnlockGrantRequestId(input?.requestId)) {
    return fail('invalid_input', 'Unlock grant request id is invalid.');
  }

  await maybeAutoApproveUnlockGrants({
    source: 'nudge',
    requestId: input.requestId,
  });
  return ok();
}

async function requestWebBootstrapGrantFromBridgeInternal(input, sender) {
  const senderValidation = validateBridgeSender(sender, 'auth_or_unlock');
  if (senderValidation) {
    return senderValidation;
  }
  if (!isSafeBase64Url(input?.requestPublicKey, 40)) {
    return fail('invalid_input', 'Bootstrap request public key is invalid.');
  }
  if (!isSafeBase64Url(input?.clientNonce, 16)) {
    return fail('invalid_input', 'Bootstrap client nonce is invalid.');
  }
  if (!isSafeBase64Url(input?.webChallenge, 16)) {
    return fail('invalid_input', 'Bootstrap challenge is invalid.');
  }
  const readyError = await ensureReadyState();
  if (readyError) {
    return readyError;
  }
  const apiClient = currentApiClient();
  if (!apiClient || !sessionToken || !unlockedContext?.accountKey) {
    return fail('remote_authentication_required', 'Unlock this extension before continuing.');
  }
  try {
    const deploymentFingerprint = await resolveDeploymentFingerprint(apiClient);
    const requested = await apiClient.requestWebBootstrapGrant({
      bearerToken: sessionToken,
      deploymentFingerprint,
      requestPublicKey: input.requestPublicKey,
      clientNonce: input.clientNonce,
      webChallenge: input.webChallenge,
      unlockAccountKey: unlockedContext.accountKey,
    });
    return ok({
      payload: {
        grantId: requested.grantId,
        expiresAt: requested.expiresAt,
        interval: requested.interval,
        serverOrigin: requested.serverOrigin,
      },
    });
  } catch (error) {
    const described = describeError(error, 'web_bootstrap_request_failed');
    return fail(described.code, described.message);
  }
}

async function resolveDeploymentFingerprint(apiClient) {
  if (typeof state.deploymentFingerprint === 'string' && state.deploymentFingerprint.trim().length > 0) {
    return state.deploymentFingerprint;
  }
  const metadata = await apiClient.getRuntimeMetadata();
  const fingerprint =
    typeof metadata?.deploymentFingerprint === 'string' ? metadata.deploymentFingerprint.trim() : '';
  if (!fingerprint) {
    throw new Error('server_connection_failed');
  }
  state.deploymentFingerprint = fingerprint;
  await persistConfig({
    serverOrigin: state.serverOrigin,
    deploymentFingerprint: fingerprint,
    updatedAt: nowIso(),
  });
  return fingerprint;
}

async function startLinkPairingInternal(input = {}) {
  if (!state.serverOrigin) {
    return fail('server_origin_not_allowed', 'Set a valid server URL first.');
  }

  const apiClient = currentApiClient();
  if (!apiClient) {
    return fail('server_origin_not_allowed', 'Set a valid server URL first.');
  }

  const deviceNameRaw = typeof input?.deviceNameHint === 'string' ? input.deviceNameHint.trim() : '';
  const deviceNameHint = deviceNameRaw.length > 0 ? deviceNameRaw : DEFAULT_DEVICE_NAME;

  try {
    const deploymentFingerprint = await resolveDeploymentFingerprint(apiClient);
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign', 'verify'],
    );
    const publicSpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const requestPublicKey = toBase64Url(new Uint8Array(publicSpki));
    const clientNonce = randomBase64Url(16);

    const linkRequest = await apiClient.createLinkRequest({
      deploymentFingerprint,
      requestPublicKey,
      clientNonce,
      deviceNameHint,
    });

    linkPairingSession = {
      requestId: linkRequest.requestId,
      shortCode: linkRequest.shortCode,
      fingerprintPhrase: linkRequest.fingerprintPhrase,
      expiresAt: linkRequest.expiresAt,
      interval: normalizeLinkInterval(linkRequest.interval),
      lastStatus: 'authorization_pending',
      clientNonce,
      deploymentFingerprint,
      serverOrigin: state.serverOrigin,
      privateKey: keyPair.privateKey,
    };
    await persistLinkPairingSession();
    setPhase('pairing_required', null);

    return ok({
      state: snapshotForUi(),
      linkRequest: {
        requestId: linkPairingSession.requestId,
        shortCode: linkPairingSession.shortCode,
        fingerprintPhrase: linkPairingSession.fingerprintPhrase,
        expiresAt: linkPairingSession.expiresAt,
        interval: linkPairingSession.interval,
        status: 'authorization_pending',
        message: linkPairingStatusMessage('authorization_pending'),
      },
    });
  } catch (error) {
    await clearLinkPairingSessionPersisted();
    const described = describeError(error, 'pairing_failed');
    return fail(described.code, described.message);
  }
}

async function pendingLinkResponse(status, intervalSeconds) {
  if (!linkPairingSession) {
    return fail('link_request_not_found', 'Start trusted-surface connection again.');
  }
  linkPairingSession.lastStatus = status;
  linkPairingSession.interval = normalizeLinkInterval(intervalSeconds ?? linkPairingSession.interval);
  await persistLinkPairingSession();
  return ok({
    state: snapshotForUi(),
    linkRequest: {
      requestId: linkPairingSession.requestId,
      shortCode: linkPairingSession.shortCode,
      fingerprintPhrase: linkPairingSession.fingerprintPhrase,
      expiresAt: linkPairingSession.expiresAt,
      interval: linkPairingSession.interval,
      status,
      message: linkPairingStatusMessage(status),
    },
  });
}

async function pollLinkPairingInternal(input = {}) {
  if (!linkPairingSession) {
    return fail('link_request_not_found', 'Start trusted-surface connection again.');
  }
  if (typeof input?.requestId === 'string' && input.requestId !== linkPairingSession.requestId) {
    await clearLinkPairingSessionPersisted();
    return fail('pairing_context_mismatch', 'Connection request does not match current context.');
  }

  if (Date.parse(linkPairingSession.expiresAt) <= Date.now()) {
    await clearLinkPairingSessionPersisted();
    setPhase('pairing_required', linkPairingStatusMessage('expired'));
    return ok({
      state: snapshotForUi(),
      terminal: true,
      status: 'expired',
      message: linkPairingStatusMessage('expired'),
    });
  }

  const apiClient = currentApiClient();
  if (!apiClient) {
    await clearLinkPairingSessionPersisted();
    return fail('server_origin_not_allowed', 'Set a valid server URL first.');
  }

  try {
    const statusProof = await signLinkProof({ action: 'status' });
    const statusResponse = await apiClient.getLinkStatus({
      requestId: linkPairingSession.requestId,
      requestProof: statusProof,
    });
    const status = typeof statusResponse?.status === 'string' ? statusResponse.status : 'denied';

    if (status === 'authorization_pending' || status === 'slow_down') {
      const nextInterval = normalizeLinkInterval(
        typeof statusResponse?.interval === 'number' ? statusResponse.interval : linkPairingSession.interval,
      );
      return pendingLinkResponse(status, nextInterval);
    }

    if (status === 'approved') {
      const consumeProof = await signLinkProof({ action: 'consume' });
      const consumeResponse = await apiClient.consumeLinkRequest({
        requestId: linkPairingSession.requestId,
        requestProof: consumeProof,
        consumeNonce: randomBase64Url(16),
      });
      await applyTrustedPairingResult(consumeResponse);
      await clearLinkPairingSessionPersisted();
      return ok({
        state: snapshotForUi(),
        completed: true,
        status: 'consumed',
        message: 'Extension connected successfully.',
      });
    }

    await clearLinkPairingSessionPersisted();
    setPhase('pairing_required', linkPairingStatusMessage(status));
    return ok({
      state: snapshotForUi(),
      terminal: true,
      status,
      message: linkPairingStatusMessage(status),
    });
  } catch (error) {
    const described = describeError(error, 'pairing_failed');
    if (described.code === 'slow_down') {
      const requestedInterval =
        typeof error?.interval === 'number'
          ? error.interval
          : (linkPairingSession?.interval ?? EXTENSION_LINK_FALLBACK_INTERVAL_SECONDS) + 5;
      const nextInterval = normalizeLinkInterval(requestedInterval);
      if (linkPairingSession) {
        linkPairingSession.interval = nextInterval;
      }
      return pendingLinkResponse('slow_down', nextInterval);
    }
    await clearLinkPairingSessionPersisted();
    setPhase('pairing_required', described.message);
    return fail(described.code, described.message);
  }
}

async function cancelLinkPairingInternal() {
  await clearLinkPairingSessionPersisted();
  if (!trustedState) {
    setPhase('pairing_required', null);
  }
  return ok({ state: snapshotForUi() });
}

async function unlockLocalInternal(input) {
  if (!trustedState) {
    setPhase('pairing_required', 'Connect extension before unlocking.');
    return fail('pairing_required', state.lastError);
  }
  const password = typeof input?.password === 'string' ? input.password : '';
  if (!password) {
    return fail('invalid_input', 'Enter your account password to unlock this device.');
  }

  const currentPhase = state.phase;
  if (!trustedState || currentPhase === 'pairing_required') {
    return fail('pairing_required', state.lastError ?? 'Connect extension through trusted surface settings.');
  }
  if (state.phase === 'ready' && unlockedContext?.accountKey) {
    armIdleLockTimer();
    return ok({ state: snapshotForUi() });
  }
  if (currentPhase !== 'local_unlock_required' && currentPhase !== 'remote_authentication_required') {
    return fail('remote_authentication_required', state.lastError ?? 'Session state changed. Try again.');
  }

  try {
    const unlockedPayload = await decryptLocalUnlockEnvelope({
      password,
      authSalt: trustedState.authSalt,
      envelope: trustedState.localUnlockEnvelope,
      kdfProfile: trustedState.localUnlockKdfProfile ?? null,
    });

    if (typeof unlockedPayload?.accountKey !== 'string' || unlockedPayload.accountKey.length < 20) {
      return fail('invalid_credentials', 'Could not unlock this device with the provided password.');
    }

    clearSensitiveMemory();
    const unlockedAt = Date.now();
    unlockedContext = {
      accountKey: unlockedPayload.accountKey,
      unlockedAt,
      unlockedUntil: unlockedAt + state.unlockIdleTimeoutMs,
    };
    setPhase('ready', null);
    setLastUnlockedLockRevision(state.lockRevision);
    await persistUnlockedContext();
    armIdleLockTimer();
    void maybeAutoApproveUnlockGrants({ source: 'phase-ready' });
    void maybeUpgradeLocalUnlockEnvelopeProfile(password);
    void loadCredentialCacheFromLocalBestEffort();

    if (shouldRefreshSessionAfterUnlock(currentPhase)) {
      void restoreSessionInternal(false).catch(() => {});
    }

    return ok({ state: snapshotForUi() });
  } catch (error) {
    clearSensitiveMemory();
    const described = describeError(error, 'invalid_credentials');
    const treatAsInvalidCredentials =
      described.code === 'invalid_credentials' || isCredentialDecryptFailure(error);
    const message = treatAsInvalidCredentials
      ? 'Could not unlock this device with the provided password.'
      : described.message;
    const code = treatAsInvalidCredentials ? 'invalid_credentials' : described.code;
    setPhase('local_unlock_required', message);
    return fail(code, message);
  }
}

async function lockInternal() {
  clearSensitiveMemory();
  if (trustedState && sessionToken) {
    setPhase('local_unlock_required', null);
  } else if (trustedState) {
    setPhase('remote_authentication_required', 'Session expired. Authenticate again to continue.');
  } else if (state.serverOrigin) {
    setPhase('pairing_required', null);
  } else {
    setPhase('pairing_required', null);
  }
  return ok({ state: snapshotForUi() });
}

async function initializeBackgroundRuntimeCore() {
  if (chrome.storage?.session?.setAccessLevel) {
    try {
      await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    } catch {
      // Continue with default level when API is unavailable.
    }
  }

  await loadPersistedState();
  void hydrateCanonicalIconCacheFromStorage().catch(() => {});
  void processManualIconSyncQueueBestEffort().catch(() => {});
  await reconcileUnlockGrantApprovalAlarm();
  void reconcileAutoPairBridgeScript()
    .then(() => {
      bridgeUnavailable = false;
    })
    .catch(() => {
      bridgeUnavailable = true;
    });
  if (!state.serverOrigin) {
    setPhase('pairing_required', null);
    return;
  }
  if (!trustedState) {
    await clearExtensionSessionToken();
    if (linkPairingSession) {
      setPhase(
        'pairing_required',
        linkPairingStatusMessage(linkPairingSession.lastStatus ?? 'authorization_pending'),
      );
    } else {
      setPhase('pairing_required', 'Connect extension through trusted surface settings.');
    }
    return;
  }
  if (trustedState.serverOrigin !== state.serverOrigin) {
    await clearExtensionSessionToken();
    setPhase('pairing_required', 'Server changed. Reset trusted state before reconnecting.');
    return;
  }

  if (hasValidUnlockedContext()) {
    setPhase('ready', null);
    touchUnlockedContext();
    void loadCredentialCacheFromLocalBestEffort();
  } else {
    unlockedContext = null;
    void clearPersistedUnlockedContext();
    setPhase('local_unlock_required', null);
  }
  void restoreSessionInternal(false).catch(() => {});
}

async function initializeBackgroundRuntime(force = false) {
  if (runtimeInitializationPromise) {
    return runtimeInitializationPromise;
  }
  if (!force && runtimeInitialized) {
    return;
  }

  runtimeInitializationPromise = (async () => {
    try {
      await initializeBackgroundRuntimeCore();
      runtimeInitialized = true;
    } catch (error) {
      runtimeInitialized = false;
      const described = describeError(error, 'runtime_initialize_failed');
      setPhase('pairing_required', described.message);
    }
  })().finally(() => {
    runtimeInitializationPromise = null;
  });

  return runtimeInitializationPromise;
}

async function handleCommand(command, senderContext, sender) {
  await initializeBackgroundRuntime();
  switch (command?.type) {
    case 'vaultlite.get_state': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:read');
      if (capabilityError) {
        return capabilityError;
      }
      const passive = command?.passive === true;
      if (!passive) {
        await restoreSessionInternal(false);
      }
      return ok({ state: snapshotForUi() });
    }
    case 'vaultlite.get_page_context': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:read');
      if (capabilityError) {
        return capabilityError;
      }
      return getPageContextInternal();
    }
    case 'vaultlite.set_server_url': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:write');
      if (capabilityError) {
        return capabilityError;
      }
      return setServerUrlInternal(command.serverUrl);
    }
    case 'vaultlite.reset_trusted_state': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:write');
      if (capabilityError) {
        return capabilityError;
      }
      await resetTrustedStateInternal();
      if (state.serverOrigin) {
        setPhase('pairing_required', 'Trusted state cleared. Pair extension again.');
      } else {
        setPhase('pairing_required', null);
      }
      return ok({ state: snapshotForUi() });
    }
    case 'vaultlite.start_link_pairing': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'pairing:lts');
      if (capabilityError) {
        return capabilityError;
      }
      return startLinkPairingInternal(command);
    }
    case 'vaultlite.poll_link_pairing': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'pairing:lts');
      if (capabilityError) {
        return capabilityError;
      }
      return pollLinkPairingInternal(command);
    }
    case 'vaultlite.cancel_link_pairing': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'pairing:lts');
      if (capabilityError) {
        return capabilityError;
      }
      return cancelLinkPairingInternal();
    }
    case 'vaultlite.bridge_ping': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'bridge:auto_pair');
      if (capabilityError) {
        return capabilityError;
      }
      return pingBridgeInternal(sender);
    }
    case 'vaultlite.bridge_poll_link_pairing': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'bridge:auto_pair');
      if (capabilityError) {
        return capabilityError;
      }
      return pollLinkPairingFromBridgeInternal(command, sender);
    }
    case 'vaultlite.bridge_open_popup': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'bridge:auto_pair');
      if (capabilityError) {
        return capabilityError;
      }
      return openPopupFromBridgeInternal(sender);
    }
    case 'vaultlite.bridge_nudge_unlock_grant': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'bridge:auto_pair');
      if (capabilityError) {
        return capabilityError;
      }
      return fail(
        'feature_disabled',
        'Cross-surface session synchronization is disabled for this deployment.',
      );
    }
    case 'vaultlite.bridge_request_web_bootstrap_grant': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'bridge:auto_pair');
      if (capabilityError) {
        return capabilityError;
      }
      return fail(
        'feature_disabled',
        'Cross-surface session synchronization is disabled for this deployment.',
      );
    }
    case 'vaultlite.unlock_local': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'unlock:local');
      if (capabilityError) {
        return capabilityError;
      }
      return unlockLocalInternal(command);
    }
    case 'vaultlite.lock': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:write');
      if (capabilityError) {
        return capabilityError;
      }
      return lockInternal();
    }
    case 'vaultlite.list_credentials': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'vault:list');
      if (capabilityError) {
        return capabilityError;
      }
      return listCredentialsInternal({
        query: command.query ?? '',
        typeFilter: command.typeFilter ?? 'all',
        suggestedOnly: command.suggestedOnly === true,
        pageUrl: typeof command.pageUrl === 'string' ? command.pageUrl : '',
      });
    }
    case 'vaultlite.fill_credential': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'fill:dispatch');
      if (capabilityError) {
        return capabilityError;
      }
      return fillCredentialInternal(command.itemId);
    }
    case 'vaultlite.get_credential_field': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'clipboard:reveal');
      if (capabilityError) {
        return capabilityError;
      }
      return getCredentialFieldInternal(command.itemId, command.field);
    }
    case 'vaultlite.list_manual_icons': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:read');
      if (capabilityError) {
        return capabilityError;
      }
      return listManualIconsInternal();
    }
    case 'vaultlite.set_manual_icon': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:write');
      if (capabilityError) {
        return capabilityError;
      }
      return setManualIconInternal(command);
    }
    case 'vaultlite.remove_manual_icon': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:write');
      if (capabilityError) {
        return capabilityError;
      }
      return removeManualIconInternal(command);
    }
    case 'vaultlite.list_password_generator_history': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:read');
      if (capabilityError) {
        return capabilityError;
      }
      return listPasswordGeneratorHistoryInternal();
    }
    case 'vaultlite.get_projection_cache_diagnostics': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:read');
      if (capabilityError) {
        return capabilityError;
      }
      return ok({
        diagnostics: projectionCacheDiagnosticsSnapshot(),
      });
    }
    case 'vaultlite.add_password_generator_history_entry': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:write');
      if (capabilityError) {
        return capabilityError;
      }
      return upsertPasswordGeneratorHistoryEntryInternal(command);
    }
    case 'vaultlite.open_full_page_auth': {
      const capabilityError = rejectWithCapabilityIfNeeded(senderContext, 'state:read');
      if (capabilityError) {
        return capabilityError;
      }
      await chrome.tabs.create({
        url: chrome.runtime.getURL('full-page-auth.html'),
      });
      return ok();
    }
    default:
      return fail('unknown_command', 'Unknown extension command.');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    const senderContext = resolveSenderContext(sender, extensionOrigin());
    void handleCommand(message, senderContext, sender)
      .then((result) => sendResponse(result))
      .catch((error) => {
        const described = describeError(error, 'internal_error');
        sendResponse(fail(described.code, described.message));
      });
  } catch (error) {
    const described = describeError(error, 'internal_error');
    sendResponse(fail(described.code, described.message));
  }
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void initializeBackgroundRuntime(true);
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    void initializeBackgroundRuntime(true);
  });
}

if (chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    clearIconCachePersistTimer();
    void persistCanonicalIconCacheToStorage();
  });
}

void initializeBackgroundRuntime(true);
