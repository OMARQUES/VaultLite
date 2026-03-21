import {
  STORAGE_LOCAL_CONFIG_KEY,
  STORAGE_LOCAL_TRUSTED_KEY,
  STORAGE_SESSION_KEY,
  canonicalizeServerUrl,
  deriveWebOriginFromServerOrigin,
  isAllowedSettingsPath,
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
  decryptLocalUnlockEnvelope,
  decryptVaultItemPayload,
  normalizeVaultItemPayload,
} from './runtime-crypto.js';
import { diagnoseCredentialCache } from './credential-cache-diagnostics.js';

const CREDENTIAL_CACHE_TTL_MS = 60_000;
const RESTORE_THROTTLE_MS = 15_000;
const DEFAULT_DEVICE_NAME = 'VaultLite Extension';
const MEMORY_IDLE_LOCK_MS = 5 * 60 * 1000;
const AUTO_PAIR_BRIDGE_SCRIPT_ID = 'vaultlite-auto-pair-bridge-v1';
const EXTENSION_LINK_FALLBACK_INTERVAL_SECONDS = 5;
const EXTENSION_LINK_MAX_INTERVAL_SECONDS = 30;
const EXTENSION_LINK_MIN_INTERVAL_SECONDS = 1;
const STORAGE_LINK_PAIRING_SESSION_KEY = 'vaultlite.link_pairing_session.v1';

const state = {
  phase: 'anonymous',
  serverOrigin: null,
  deploymentFingerprint: null,
  username: null,
  deviceId: null,
  deviceName: null,
  sessionExpiresAt: null,
  hasTrustedState: false,
  lastError: null,
};

let trustedState = null;
let sessionToken = null;
let unlockedContext = null;
let manualIconMap = {};
let credentialsCache = {
  loadedAt: 0,
  credentials: [],
};
let lastRestoreAttemptAt = 0;
let idleLockTimer = null;
let restoreInFlightPromise = null;
let lastEmptyCacheRetryAt = 0;
let linkPairingSession = null;

function sessionStorageArea() {
  if (!chrome.storage || !chrome.storage.session) {
    return null;
  }
  return chrome.storage.session;
}

function extensionOrigin() {
  return chrome.runtime.getURL('/').replace(/\/+$/u, '');
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

function setPhase(phase, errorMessage = null) {
  state.phase = phase;
  state.lastError = errorMessage;
}

function clearSensitiveMemory() {
  unlockedContext = null;
  clearLinkPairingSession();
  void clearPersistedLinkPairingSession();
  credentialsCache = {
    loadedAt: 0,
    credentials: [],
  };
  lastEmptyCacheRetryAt = 0;
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
  idleLockTimer = setTimeout(() => {
    void lockInternal();
  }, MEMORY_IDLE_LOCK_MS);
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
      updatedAt: nowIso(),
    },
  });
}

async function clearExtensionSessionToken() {
  if (!sessionToken) {
    return;
  }
  sessionToken = null;
  state.sessionExpiresAt = null;
  await persistSessionToken();
}

async function clearTrustedStateForReconnect(reasonMessage) {
  trustedState = null;
  state.hasTrustedState = false;
  state.username = null;
  state.deviceId = null;
  state.deviceName = null;
  state.deploymentFingerprint = null;
  await clearTrusted();
  await clearExtensionSessionToken();
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
  state.username = input.user?.username ?? state.username;
  state.deviceId = input.device?.deviceId ?? state.deviceId;
  state.deviceName = input.device?.deviceName ?? state.deviceName;
  state.sessionExpiresAt = input.sessionExpiresAt ?? state.sessionExpiresAt;
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
    username: state.username,
    deviceId: state.deviceId,
    deviceName: state.deviceName,
    sessionExpiresAt: state.sessionExpiresAt,
    hasTrustedState: state.hasTrustedState,
    hasTokenInMemory: Boolean(sessionToken),
    lastError: state.lastError,
    linkRequest,
  };
}

function isCredentialCacheFresh() {
  return Date.now() - credentialsCache.loadedAt < CREDENTIAL_CACHE_TTL_MS;
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
  ]);
  const sessionStorage = sessionStorageArea();
  let sessionState = {};
  if (sessionStorage) {
    try {
      sessionState = await sessionStorage.get([STORAGE_SESSION_KEY, STORAGE_LINK_PAIRING_SESSION_KEY]);
    } catch {
      sessionState = {};
    }
  }

  const config = localState?.[STORAGE_LOCAL_CONFIG_KEY] ?? null;
  const trusted = localState?.[STORAGE_LOCAL_TRUSTED_KEY] ?? null;
  const rawManualIcons = localState?.[MANUAL_ICON_STORAGE_KEY] ?? {};
  const sessionEntry = sessionState?.[STORAGE_SESSION_KEY] ?? null;
  const linkPairingEntry = sessionState?.[STORAGE_LINK_PAIRING_SESSION_KEY] ?? null;

  state.serverOrigin = config?.serverOrigin ?? null;
  state.deploymentFingerprint = trusted?.deploymentFingerprint ?? config?.deploymentFingerprint ?? null;
  trustedState = trusted;
  state.hasTrustedState = Boolean(trustedState);
  sessionToken = typeof sessionEntry?.token === 'string' ? sessionEntry.token : null;

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
}

async function resetTrustedStateInternal() {
  trustedState = null;
  state.hasTrustedState = false;
  await clearExtensionSessionToken();
  state.username = null;
  state.deviceId = null;
  state.deviceName = null;
  state.deploymentFingerprint = null;
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

function validateBridgeSenderForPing(sender) {
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
  if (!isAllowedSettingsSenderUrl(sender.url, expectedWebOrigin)) {
    return fail('permission_denied', 'Bridge URL is not allowed.');
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

  const senderValidation = validateBridgeSenderForPing(sender);
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
  }
  state.deploymentFingerprint = metadata?.deploymentFingerprint ?? state.deploymentFingerprint;
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
  } catch {
    return fail('bridge_registration_failed', 'Could not configure extension auto connect bridge.');
  }

  return ok({ state: snapshotForUi() });
}

async function restoreSessionInternal(force = false) {
  if (restoreInFlightPromise) {
    await restoreInFlightPromise;
    return;
  }

  restoreInFlightPromise = (async () => {
    if (!state.serverOrigin) {
      setPhase('pairing_required', null);
      return;
    }
    if (!sessionToken) {
      if (trustedState) {
        setPhase(
          'remote_authentication_required',
          'Session expired. Start a new trusted-device request from the extension popup.',
        );
      } else if (linkPairingSession) {
        setPhase(
          'pairing_required',
          linkPairingStatusMessage(linkPairingSession.lastStatus ?? 'authorization_pending'),
        );
      } else {
        setPhase('pairing_required', 'Connect this extension from web settings.');
      }
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

    try {
      const restoreOutput = await apiClient.restoreSession(sessionToken);
      if (restoreOutput.extensionSessionToken) {
        sessionToken = restoreOutput.extensionSessionToken;
        await persistSessionToken();
      }

      withSessionIdentity(restoreOutput);

      if (
        restoreOutput.sessionState !== 'local_unlock_required' ||
        !restoreOutput.user ||
        !restoreOutput.device
      ) {
        clearSensitiveMemory();
        setPhase(
          'remote_authentication_required',
          'Session expired. Start a new trusted-device request from the extension popup.',
        );
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

      if (state.phase !== 'ready') {
        setPhase('local_unlock_required', null);
      } else {
        armIdleLockTimer();
      }
    } catch (error) {
      const described = describeError(error, 'restore_failed');
      clearSensitiveMemory();
      if (described.code === 'unauthorized' || described.code === 'request_failed_401') {
        await clearExtensionSessionToken();
        setPhase(
          'remote_authentication_required',
          'Session no longer valid. Start a new trusted-device request from the extension popup.',
        );
        return;
      }
      setPhase('remote_authentication_required', described.message);
    }
  })();

  try {
    await restoreInFlightPromise;
  } finally {
    restoreInFlightPromise = null;
  }
}

async function ensureReadyState() {
  if (state.phase !== 'ready' || !sessionToken || !unlockedContext?.accountKey) {
    return fail('local_unlock_required', 'Unlock this extension first.');
  }
  await restoreSessionInternal(false);
  if (state.phase !== 'ready' || !sessionToken || !unlockedContext?.accountKey) {
    return fail('remote_authentication_required', state.lastError ?? 'Session expired.');
  }
  return null;
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

async function refreshCredentialCache(options = {}) {
  const force = options?.force === true;
  const readyError = await ensureReadyState();
  if (readyError) {
    return readyError;
  }

  if (!force && isCredentialCacheFresh()) {
    return ok();
  }

  const apiClient = currentApiClient();
  if (!apiClient) {
    return fail('server_origin_not_allowed', 'Configure a valid server URL first.');
  }

  try {
    const collected = [];
    let loginEntriesSeen = 0;
    let decryptFailures = 0;
    let snapshotToken;
    let cursor;
    while (true) {
      const page = await apiClient.fetchSnapshot({
        bearerToken: sessionToken,
        snapshotToken,
        cursor,
        pageSize: 100,
      });
      if (!snapshotToken) {
        snapshotToken = page.snapshotToken;
      }
      for (const entry of page.entries) {
        if (entry.entryType !== 'item' || !SUPPORTED_ITEM_TYPES.has(entry.item.itemType)) {
          continue;
        }
        if (entry.item.itemType === 'login') {
          loginEntriesSeen += 1;
        }
        try {
          const payload = await decryptVaultItemPayload({
            accountKey: unlockedContext.accountKey,
            encryptedPayload: entry.item.encryptedPayload,
          });
          collected.push(normalizeVaultEntry(entry, payload));
        } catch {
          if (entry.item.itemType === 'login') {
            decryptFailures += 1;
          }
        }
      }
      cursor = page.nextCursor;
      if (!cursor) {
        break;
      }
    }

    const diagnostic = diagnoseCredentialCache({
      loginEntriesSeen,
      decryptedEntries: collected.length,
      decryptFailures,
    });
    if (diagnostic) {
      return fail(diagnostic.code, diagnostic.message);
    }

    credentialsCache = {
      loadedAt: Date.now(),
      credentials: collected,
    };
    return ok();
  } catch (error) {
    const described = describeError(error, 'snapshot_failed');
    if (
      described.code === 'unauthorized' ||
      described.code === 'request_failed_401' ||
      described.code === 'request_failed_403'
    ) {
      await clearExtensionSessionToken();
      clearSensitiveMemory();
      setPhase(
        'remote_authentication_required',
        'Session expired. Start a new trusted-device request from the extension popup.',
      );
      return fail('remote_authentication_required', state.lastError);
    }
    return fail(described.code, described.message);
  }
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

function buildFaviconCandidates(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return [];
  }
  try {
    const parsed = new URL(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);
    if (!parsed.hostname) {
      return [];
    }
    const host = parsed.hostname;
    return [
      `https://${host}/favicon.ico`,
      `https://${host}/apple-touch-icon.png`,
    ];
  } catch {
    return [];
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
  return ok({
    icons: listManualIconsView(),
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
  return ok({
    icons: listManualIconsView(),
  });
}

function sortProjectedCredentials(left, right) {
  const leftScore = (left.matchFlags.exactOrigin ? 10 : 0) + left.matchFlags.domainScore;
  const rightScore = (right.matchFlags.exactOrigin ? 10 : 0) + right.matchFlags.domainScore;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }
  return left.title.localeCompare(right.title);
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

async function listCredentialsInternal(input = {}) {
  const cacheResult = await refreshCredentialCache();
  if (!cacheResult.ok) {
    return cacheResult;
  }
  armIdleLockTimer();

  const activeTab = await fetchActiveTab();
  const activePageUrl = activeTab?.tabUrl ?? '';
  const pageEligible = isPageUrlEligibleForFill(activePageUrl);

  let projectedItems = projectCredentialsForPage(activePageUrl);
  let projections = filterProjectedCredentials({
    items: projectedItems,
    query: input.query,
    typeFilter: input.typeFilter,
    suggestedOnly: input.suggestedOnly,
  })
    .sort(sortProjectedCredentials);

  const normalizedTypeFilter = normalizeTypeFilter(input.typeFilter);
  const normalizedQuery = typeof input.query === 'string' ? input.query.trim() : '';
  const suggestedFilter = toBoolean(input.suggestedOnly);
  const shouldRetryEmptyCache =
    credentialsCache.credentials.length === 0 &&
    normalizedTypeFilter === 'all' &&
    normalizedQuery.length === 0 &&
    !suggestedFilter &&
    Date.now() - lastEmptyCacheRetryAt > 15_000;

  if (shouldRetryEmptyCache) {
    lastEmptyCacheRetryAt = Date.now();
    const retryCacheResult = await refreshCredentialCache({ force: true });
    if (!retryCacheResult.ok) {
      return retryCacheResult;
    }

    projectedItems = projectCredentialsForPage(activePageUrl);
    projections = filterProjectedCredentials({
      items: projectedItems,
      query: input.query,
      typeFilter: input.typeFilter,
      suggestedOnly: input.suggestedOnly,
    }).sort(sortProjectedCredentials);
  }

  const exactMatchCount = projections.filter((entry) => entry.matchFlags.exactOrigin).length;

  return ok({
    page: {
      url: activePageUrl,
      eligible: pageEligible,
      exactMatchCount,
    },
    items: projections,
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
  trustedState = {
    username: pairingResult.user.username,
    deviceId: pairingResult.device.deviceId,
    deviceName: pairingResult.device.deviceName,
    authSalt: pairingResult.package.authSalt,
    encryptedAccountBundle: pairingResult.package.encryptedAccountBundle,
    accountKeyWrapped: pairingResult.package.accountKeyWrapped,
    localUnlockEnvelope: pairingResult.package.localUnlockEnvelope,
    deploymentFingerprint: null,
    serverOrigin: state.serverOrigin,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  state.hasTrustedState = true;
  state.username = trustedState.username;
  state.deviceId = trustedState.deviceId;
  state.deviceName = trustedState.deviceName;
  state.deploymentFingerprint = trustedState.deploymentFingerprint;

  sessionToken = pairingResult.extensionSessionToken;
  state.sessionExpiresAt = pairingResult.sessionExpiresAt;

  clearSensitiveMemory();
  setPhase('local_unlock_required', null);

  await Promise.all([persistTrusted(trustedState), persistSessionToken()]);
}

async function pollLinkPairingFromBridgeInternal(input, sender) {
  const senderValidation = validateBridgeSenderForPing(sender);
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
  const senderValidation = validateBridgeSenderForPing(sender);
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

  await restoreSessionInternal(true);
  if (state.phase === 'remote_authentication_required') {
    return fail('remote_authentication_required', state.lastError ?? 'Session expired.');
  }

  try {
    const unlockedPayload = await decryptLocalUnlockEnvelope({
      password,
      authSalt: trustedState.authSalt,
      envelope: trustedState.localUnlockEnvelope,
    });

    if (typeof unlockedPayload?.accountKey !== 'string' || unlockedPayload.accountKey.length < 20) {
      return fail('invalid_credentials', 'Could not unlock this device with the provided password.');
    }

    clearSensitiveMemory();
    unlockedContext = {
      accountKey: unlockedPayload.accountKey,
      unlockedAt: Date.now(),
    };
    setPhase('ready', null);
    armIdleLockTimer();

    const warmupResult = await refreshCredentialCache();
    if (!warmupResult.ok) {
      return warmupResult;
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
    setPhase('remote_authentication_required', 'Session expired. Start a new trusted-device request from the extension popup.');
  } else if (state.serverOrigin) {
    setPhase('pairing_required', null);
  } else {
    setPhase('pairing_required', null);
  }
  return ok({ state: snapshotForUi() });
}

async function initializeBackgroundRuntime() {
  if (chrome.storage?.session?.setAccessLevel) {
    try {
      await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    } catch {
      // Continue with default level when API is unavailable.
    }
  }

  await loadPersistedState();
  try {
    await reconcileAutoPairBridgeScript();
  } catch {
    setPhase('pairing_required', 'Auto connect bridge unavailable. Reload extension and try again.');
    return;
  }
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

  await restoreSessionInternal(true);
  if (state.phase === 'anonymous') {
    setPhase('local_unlock_required', null);
  }
}

async function handleCommand(command, senderContext, sender) {
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
  void initializeBackgroundRuntime();
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    void initializeBackgroundRuntime();
  });
}

void initializeBackgroundRuntime();
