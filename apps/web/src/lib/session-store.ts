import type {
  DeviceListOutput,
  DeviceRevokeOutput,
  ExtensionLinkActionOutput,
  ExtensionLinkPendingListOutput,
  PasswordRotationCompleteOutput,
  RuntimeMetadata,
  SiteIconDiscoverBatchInput,
  SiteIconDiscoverBatchOutput,
  SiteIconManualActionOutput,
  SiteIconManualListOutput,
  SiteIconManualRemoveInput,
  SiteIconManualUpsertInput,
  SiteIconResolveBatchInput,
  SiteIconResolveBatchOutput,
} from '@vaultlite/contracts';
import { reactive, readonly } from 'vue';

import {
  createLocalUnlockEnvelope,
  createOpaqueBundlePlaceholder,
  createRandomBase64Url,
  decryptLocalUnlockEnvelope,
  deriveAuthProof,
  generateAccountKey,
} from './browser-crypto';
import type { VaultLiteAuthClient } from './auth-client';
import { toHumanErrorMessage } from './human-error';
import type { TrustedLocalStateRecord, TrustedLocalStateStore } from './trusted-local-state';

type SessionPhase =
  | 'anonymous'
  | 'remote_authentication_required'
  | 'onboarding_in_progress'
  | 'onboarding_export_required'
  | 'local_unlock_required'
  | 'ready';

interface ReadyState {
  accountKey: string;
  encryptedAccountBundle: string;
}

interface PendingOnboardingState {
  inviteToken: string;
  username: string;
  password: string;
  deviceId: string;
  deviceName: string;
  authSalt: string;
  authVerifier: string;
  accountKeyWrapped: string;
  encryptedAccountBundle: string;
  accountKit: NonNullable<TrustedLocalStateRecord['accountKit']>;
}

export interface SessionState {
  phase: SessionPhase;
  bootstrapState:
    | 'UNINITIALIZED_PUBLIC_OPEN'
    | 'OWNER_CREATED_CHECKPOINT_PENDING'
    | 'INITIALIZED'
    | null;
  username: string | null;
  userId: string | null;
  role: 'owner' | 'user' | null;
  deviceId: string | null;
  deviceName: string | null;
  lifecycleState: 'active' | 'suspended' | 'deprovisioned' | null;
  bundleVersion: number | null;
  lastError: string | null;
  lastActivityAt: number | null;
  autoLockAfterMs: number;
}

export interface SessionStore {
  state: Readonly<SessionState>;
  refreshBootstrapState(): Promise<void>;
  restoreSession(): Promise<void>;
  refreshSessionPolicy(): Promise<void>;
  updateSessionPolicy(input: {
    unlockIdleTimeoutMs: number;
  }): Promise<void>;
  prepareOnboarding(input: {
    inviteToken: string;
    username: string;
    password: string;
    deviceName: string;
  }): Promise<NonNullable<TrustedLocalStateRecord['accountKit']>>;
  finalizeOnboarding(): Promise<NonNullable<TrustedLocalStateRecord['accountKit']>>;
  remoteAuthenticate(input: {
    username: string;
    password: string;
  }): Promise<void>;
  bootstrapDevice(input: {
    username: string;
    password: string;
    deviceName: string;
    accountKitJson: string;
  }): Promise<void>;
  localUnlock(input: {
    username: string;
    password: string;
  }): Promise<void>;
  reissueAccountKit(): Promise<NonNullable<TrustedLocalStateRecord['accountKit']>>;
  confirmRecentReauth(input: {
    password: string;
  }): Promise<{
    validUntil: string;
  }>;
  listExtensionLinkPending(): Promise<ExtensionLinkPendingListOutput>;
  approveExtensionLink(input: {
    requestId: string;
  }): Promise<ExtensionLinkActionOutput>;
  rejectExtensionLink(input: {
    requestId: string;
    rejectionReasonCode?: string;
  }): Promise<ExtensionLinkActionOutput>;
  listDevices(): Promise<DeviceListOutput>;
  revokeDevice(deviceId: string): Promise<DeviceRevokeOutput>;
  rotatePassword(input: {
    currentPassword: string;
    nextPassword: string;
  }): Promise<PasswordRotationCompleteOutput>;
  resolveSiteIcons(input: SiteIconResolveBatchInput): Promise<SiteIconResolveBatchOutput>;
  discoverSiteIcons(input: SiteIconDiscoverBatchInput): Promise<SiteIconDiscoverBatchOutput>;
  listManualSiteIcons(): Promise<SiteIconManualListOutput>;
  upsertManualSiteIcon(input: SiteIconManualUpsertInput): Promise<SiteIconManualActionOutput>;
  removeManualSiteIcon(input: SiteIconManualRemoveInput): Promise<SiteIconManualActionOutput>;
  getRuntimeMetadata(): Promise<RuntimeMetadata>;
  handleUnauthorized(input?: {
    reasonCode?: string | null;
    message?: string | null;
  }): void;
  setAutoLockAfterMs(value: number): void;
  lock(): void;
  markActivity(now?: number): void;
  enforceAutoLock(now?: number): void;
  getUnlockedVaultContext(): {
    username: string;
    accountKey: string;
  };
}

const AUTO_LOCK_AFTER_MS_DEFAULT = 5 * 60 * 1000;
const AUTO_LOCK_AFTER_MS_MIN = 30 * 1000;
const AUTO_LOCK_AFTER_MS_MAX = 24 * 60 * 60 * 1000;
const AUTO_LOCK_AFTER_MS_STORAGE_KEY = 'vaultlite:auto-lock-after-ms';
const WEB_UNLOCK_CACHE_STORAGE_KEY = 'vaultlite:web-unlock-cache.v1';
const UNLOCK_GRANT_RETRY_COOLDOWN_MS = 10_000;
const UNLOCK_GRANT_STATUS_SLOWDOWN_SECONDS = 5;
const BRIDGE_REQUEST_TYPE = 'vaultlite.bridge.request';
const BRIDGE_RESPONSE_TYPE = 'vaultlite.bridge.response';
const BRIDGE_PROTOCOL_VERSION = 1;
const BRIDGE_WEB_SOURCE = 'vaultlite-webapp';
const BRIDGE_EXTENSION_SOURCE = 'vaultlite-extension-bridge';
const UNLOCK_GRANT_NUDGE_DEBOUNCE_MS = 1_500;
const UNLOCK_GRANT_NUDGE_TIMEOUT_MS = 1_200;

interface WebUnlockCacheRecord {
  username: string;
  deviceId: string;
  accountKey: string;
  expiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnlockRoute(pathname: string): boolean {
  return pathname === '/unlock' || pathname === '/unlock/';
}

function isSafeBridgeRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function encodeUnlockGrantSignaturePayload(input: {
  action: 'status' | 'consume';
  requestId: string;
  nonce: string;
  clientNonce: string;
  serverOrigin: string;
  deploymentFingerprint: string;
}): ArrayBuffer {
  const encoded = new TextEncoder().encode(
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
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

function asErrorMessage(error: unknown): string {
  return toHumanErrorMessage(error);
}

function unauthorizedMessage(input?: {
  reasonCode?: string | null;
  message?: string | null;
}): string {
  if (input?.message && input.message.trim().length > 0) {
    return input.message;
  }
  if (input?.reasonCode === 'account_suspended') {
    return 'Your account is suspended. Ask the owner to reactivate access.';
  }
  return 'Your account is suspended or your session is no longer valid.';
}

function isValidAutoLockAfterMs(value: number): boolean {
  return Number.isFinite(value) && value >= AUTO_LOCK_AFTER_MS_MIN && value <= AUTO_LOCK_AFTER_MS_MAX;
}

function readPersistedAutoLockAfterMs(): number {
  try {
    const rawValue = globalThis.localStorage?.getItem(AUTO_LOCK_AFTER_MS_STORAGE_KEY);
    if (!rawValue) {
      return AUTO_LOCK_AFTER_MS_DEFAULT;
    }

    const parsed = Number.parseInt(rawValue, 10);
    if (!isValidAutoLockAfterMs(parsed)) {
      return AUTO_LOCK_AFTER_MS_DEFAULT;
    }

    return parsed;
  } catch {
    return AUTO_LOCK_AFTER_MS_DEFAULT;
  }
}

function persistAutoLockAfterMs(value: number) {
  try {
    globalThis.localStorage?.setItem(AUTO_LOCK_AFTER_MS_STORAGE_KEY, String(value));
  } catch {
    // Fail closed to in-memory session state when storage is unavailable.
  }
}

function parseWebUnlockCacheRecord(rawValue: string | null): WebUnlockCacheRecord | null {
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue) as Partial<WebUnlockCacheRecord>;
    if (
      typeof parsed?.username !== 'string' ||
      typeof parsed?.deviceId !== 'string' ||
      typeof parsed?.accountKey !== 'string' ||
      parsed.accountKey.length < 20 ||
      typeof parsed?.expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      username: parsed.username,
      deviceId: parsed.deviceId,
      accountKey: parsed.accountKey,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function loadWebUnlockCache(): WebUnlockCacheRecord | null {
  try {
    const localCache = parseWebUnlockCacheRecord(
      globalThis.localStorage?.getItem(WEB_UNLOCK_CACHE_STORAGE_KEY) ?? null,
    );
    if (localCache) {
      return localCache;
    }

    // Legacy migration path from per-tab sessionStorage cache.
    const sessionCache = parseWebUnlockCacheRecord(
      globalThis.sessionStorage?.getItem(WEB_UNLOCK_CACHE_STORAGE_KEY) ?? null,
    );
    if (!sessionCache) {
      return null;
    }

    globalThis.localStorage?.setItem(WEB_UNLOCK_CACHE_STORAGE_KEY, JSON.stringify(sessionCache));
    globalThis.sessionStorage?.removeItem(WEB_UNLOCK_CACHE_STORAGE_KEY);
    return sessionCache;
  } catch {
    return null;
  }
}

function persistWebUnlockCache(record: WebUnlockCacheRecord) {
  try {
    globalThis.localStorage?.setItem(WEB_UNLOCK_CACHE_STORAGE_KEY, JSON.stringify(record));
    globalThis.sessionStorage?.removeItem(WEB_UNLOCK_CACHE_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep in-memory unlock only.
  }
}

function clearWebUnlockCache() {
  try {
    globalThis.localStorage?.removeItem(WEB_UNLOCK_CACHE_STORAGE_KEY);
    globalThis.sessionStorage?.removeItem(WEB_UNLOCK_CACHE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function createSessionStore(input: {
  authClient: VaultLiteAuthClient;
  trustedLocalStateStore: TrustedLocalStateStore;
}): SessionStore {
  const state = reactive<SessionState>({
    phase: 'anonymous',
    bootstrapState: null,
    username: null,
    userId: null,
    role: null,
    deviceId: null,
    deviceName: null,
    lifecycleState: null,
    bundleVersion: null,
    lastError: null,
    lastActivityAt: null,
    autoLockAfterMs: readPersistedAutoLockAfterMs(),
  });
  let readyState: ReadyState | null = null;
  let pendingOnboarding: PendingOnboardingState | null = null;
  let runtimeMetadata: RuntimeMetadata | null = null;
  let unlockGrantApproveInFlight: Promise<void> | null = null;
  let unlockGrantConsumeInFlight: Promise<boolean> | null = null;
  let lastUnlockGrantAttemptAt = 0;
  let unlockGrantPollTimer: number | null = null;
  let lastUnlockGrantNudgeAt = 0;

  function transition(patch: Partial<SessionState>) {
    const previousPhase = state.phase;
    Object.assign(state, patch);
    if (previousPhase !== state.phase) {
      if (state.phase === 'ready') {
        if (unlockGrantPollTimer === null) {
          unlockGrantPollTimer = window.setInterval(() => {
            void maybeAutoApproveUnlockGrants();
          }, 3_000);
        }
      } else if (unlockGrantPollTimer !== null) {
        window.clearInterval(unlockGrantPollTimer);
        unlockGrantPollTimer = null;
      }
    }
  }

  function clearReadyState() {
    readyState = null;
    clearWebUnlockCache();
  }

  function clearPendingOnboarding() {
    pendingOnboarding = null;
  }

  async function ensureRuntimeMetadata(): Promise<RuntimeMetadata> {
    if (!runtimeMetadata) {
      runtimeMetadata = await input.authClient.getRuntimeMetadata();
    }

    return runtimeMetadata;
  }

  async function requireTrustedLocalStateForExtensionTrust(): Promise<{
    authSalt: string;
    encryptedAccountBundle: string;
    accountKeyWrapped: string;
    localUnlockEnvelope: {
      version: 'local-unlock.v1';
      nonce: string;
      ciphertext: string;
    };
  }> {
    if (!state.username || !state.userId || !readyState || state.phase !== 'ready') {
      throw new Error('Extension pairing requires unlocked state');
    }

    const trustedLocalState = await input.trustedLocalStateStore.load(state.username);
    if (!trustedLocalState || (state.deviceId && trustedLocalState.deviceId !== state.deviceId)) {
      throw new Error('This device is no longer trusted for this account. Add the device again.');
    }
    if (!trustedLocalState.localUnlockEnvelope) {
      throw new Error('trusted_local_state_missing');
    }

    return {
      authSalt: trustedLocalState.authSalt,
      encryptedAccountBundle: trustedLocalState.encryptedAccountBundle,
      accountKeyWrapped: trustedLocalState.accountKeyWrapped,
      localUnlockEnvelope: trustedLocalState.localUnlockEnvelope,
    };
  }

  async function refreshBootstrapStateInternal() {
    const stateResponse = await input.authClient.getBootstrapState();
    transition({
      bootstrapState: stateResponse.bootstrapState,
    });
    return stateResponse.bootstrapState;
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, ms));
    });
  }

  async function sendUnlockGrantNudgeBestEffort(
    requestId: string,
    options?: {
      debounce?: boolean;
    },
  ): Promise<boolean> {
    if (!isSafeBridgeRequestId(requestId)) {
      return false;
    }
    if (!isUnlockRoute(window.location.pathname)) {
      return false;
    }
    const now = Date.now();
    if (options?.debounce && now - lastUnlockGrantNudgeAt < UNLOCK_GRANT_NUDGE_DEBOUNCE_MS) {
      return false;
    }
    lastUnlockGrantNudgeAt = now;
    const bridgeRequestId =
      typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : createRandomBase64Url(16);
    const targetOrigin = window.location.origin;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        window.removeEventListener('message', onMessage);
        window.clearTimeout(timeoutHandle);
        resolve(result);
      };

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) {
          return;
        }
        if (event.origin !== targetOrigin) {
          return;
        }
        if (!isRecord(event.data)) {
          return;
        }
        if (event.data.type !== BRIDGE_RESPONSE_TYPE) {
          return;
        }
        if (event.data.version !== BRIDGE_PROTOCOL_VERSION) {
          return;
        }
        if (event.data.source !== BRIDGE_EXTENSION_SOURCE) {
          return;
        }
        if (event.data.requestId !== bridgeRequestId) {
          return;
        }
        finish(event.data.ok === true);
      };

      const timeoutHandle = window.setTimeout(() => {
        finish(false);
      }, UNLOCK_GRANT_NUDGE_TIMEOUT_MS);

      window.addEventListener('message', onMessage);
      try {
        window.postMessage(
          {
            type: BRIDGE_REQUEST_TYPE,
            version: BRIDGE_PROTOCOL_VERSION,
            source: BRIDGE_WEB_SOURCE,
            requestId: bridgeRequestId,
            action: 'unlock-grant.nudge',
            payload: {
              requestId,
            },
          },
          targetOrigin,
        );
      } catch {
        finish(false);
      }
    });
  }

  async function maybeAutoApproveUnlockGrants() {
    if (!readyState || state.phase !== 'ready') {
      return;
    }
    if (unlockGrantApproveInFlight) {
      return unlockGrantApproveInFlight;
    }

    unlockGrantApproveInFlight = (async () => {
      try {
        const response = await input.authClient.listPendingUnlockGrants();
        const requests = Array.isArray(response.requests) ? response.requests : [];
        for (const request of requests) {
          if (request.status !== 'pending') {
            continue;
          }
          try {
            await input.authClient.approveUnlockGrant({
              requestId: request.requestId,
              approvalNonce: createRandomBase64Url(16),
              unlockAccountKey: readyState.accountKey,
            });
          } catch {
            // Best effort only.
          }
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
  }

  async function tryUnlockViaExtensionGrant(inputValue: {
    username: string;
    userId: string;
    role: 'owner' | 'user';
    deviceId: string;
    deviceName: string;
    lifecycleState: 'active' | 'suspended' | 'deprovisioned' | null;
    bundleVersion: number | null;
    trustedLocalEncryptedBundle: string;
  }): Promise<boolean> {
    if (unlockGrantConsumeInFlight) {
      return unlockGrantConsumeInFlight;
    }
    const now = Date.now();
    if (now - lastUnlockGrantAttemptAt < UNLOCK_GRANT_RETRY_COOLDOWN_MS) {
      return false;
    }
    lastUnlockGrantAttemptAt = now;

    unlockGrantConsumeInFlight = (async () => {
      try {
        const metadata = await ensureRuntimeMetadata();
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-256',
          },
          true,
          ['sign', 'verify'],
        );
        const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const requestPublicKey = toBase64Url(new Uint8Array(publicKeySpki));
        const clientNonce = createRandomBase64Url(16);
        const requested = await input.authClient.requestUnlockGrant({
          deploymentFingerprint: metadata.deploymentFingerprint,
          targetSurface: 'extension',
          requestPublicKey,
          clientNonce,
        });
        let intervalSeconds = typeof requested.interval === 'number' && requested.interval > 0
          ? requested.interval
          : 2;
        const requestId = requested.requestId;
        const serverOrigin = requested.serverOrigin;
        void sendUnlockGrantNudgeBestEffort(requestId);
        const deadlineMs = Date.parse(requested.expiresAt);
        const effectiveDeadlineMs = Number.isFinite(deadlineMs) ? deadlineMs : Date.now() + 120_000;

        while (Date.now() < effectiveDeadlineMs) {
          const statusNonce = createRandomBase64Url(16);
          const statusPayload = encodeUnlockGrantSignaturePayload({
            action: 'status',
            requestId,
            nonce: statusNonce,
            clientNonce,
            serverOrigin,
            deploymentFingerprint: metadata.deploymentFingerprint,
          });
          const statusSignature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            keyPair.privateKey,
            statusPayload,
          );
          const statusResponse = await input.authClient.getUnlockGrantStatus({
            requestId,
            requestProof: {
              nonce: statusNonce,
              signature: toBase64Url(new Uint8Array(statusSignature)),
            },
          });
          if (statusResponse.status === 'authorization_pending' || statusResponse.status === 'slow_down') {
            intervalSeconds =
              typeof statusResponse.interval === 'number' && statusResponse.interval > 0
                ? statusResponse.interval
                : intervalSeconds + UNLOCK_GRANT_STATUS_SLOWDOWN_SECONDS;
            if (statusResponse.status === 'slow_down') {
              void sendUnlockGrantNudgeBestEffort(requestId, { debounce: true });
            }
            await delay(intervalSeconds * 1_000);
            continue;
          }
          if (statusResponse.status !== 'approved') {
            return false;
          }

          const consumeNonce = createRandomBase64Url(16);
          const consumePayload = encodeUnlockGrantSignaturePayload({
            action: 'consume',
            requestId,
            nonce: consumeNonce,
            clientNonce,
            serverOrigin,
            deploymentFingerprint: metadata.deploymentFingerprint,
          });
          const consumeSignature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            keyPair.privateKey,
            consumePayload,
          );
          const consumed = await input.authClient.consumeUnlockGrant({
            requestId,
            consumeNonce: createRandomBase64Url(16),
            requestProof: {
              nonce: consumeNonce,
              signature: toBase64Url(new Uint8Array(consumeSignature)),
            },
          });
          if (typeof consumed.unlockAccountKey !== 'string' || consumed.unlockAccountKey.length < 20) {
            return false;
          }
          readyState = {
            accountKey: consumed.unlockAccountKey,
            encryptedAccountBundle: inputValue.trustedLocalEncryptedBundle,
          };
          transition({
            phase: 'ready',
            username: inputValue.username,
            userId: inputValue.userId,
            role: inputValue.role,
            deviceId: inputValue.deviceId,
            deviceName: inputValue.deviceName,
            lifecycleState: inputValue.lifecycleState,
            bundleVersion: inputValue.bundleVersion,
            lastError: null,
            lastActivityAt: Date.now(),
          });
          persistReadyStateUnlockCache();
          return true;
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

  function applyUnlockPolicy(unlockIdleTimeoutMs: number | undefined) {
    const parsed = Number(unlockIdleTimeoutMs);
    if (!isValidAutoLockAfterMs(parsed)) {
      return;
    }
    transition({
      autoLockAfterMs: parsed,
    });
    persistAutoLockAfterMs(parsed);
  }

  function tryRestoreReadyStateFromCache(inputValue: {
    username: string;
    userId: string;
    role: 'owner' | 'user';
    deviceId: string;
    deviceName: string;
    lifecycleState: 'active' | 'suspended' | 'deprovisioned' | null;
    bundleVersion: number | null;
    trustedLocalEncryptedBundle: string;
  }): boolean {
    const cached = loadWebUnlockCache();
    if (!cached) {
      return false;
    }
    if (
      cached.username !== inputValue.username ||
      cached.deviceId !== inputValue.deviceId ||
      cached.expiresAt <= Date.now()
    ) {
      clearWebUnlockCache();
      return false;
    }
    readyState = {
      accountKey: cached.accountKey,
      encryptedAccountBundle: inputValue.trustedLocalEncryptedBundle,
    };
    transition({
      phase: 'ready',
      username: inputValue.username,
      userId: inputValue.userId,
      role: inputValue.role,
      deviceId: inputValue.deviceId,
      deviceName: inputValue.deviceName,
      lifecycleState: inputValue.lifecycleState,
      bundleVersion: inputValue.bundleVersion,
      lastError: null,
      lastActivityAt: Date.now(),
    });
    return true;
  }

  function persistReadyStateUnlockCache() {
    if (!readyState || !state.username || !state.deviceId || state.phase !== 'ready') {
      return;
    }
    const expiresAt = Date.now() + state.autoLockAfterMs;
    persistWebUnlockCache({
      username: state.username,
      deviceId: state.deviceId,
      accountKey: readyState.accountKey,
      expiresAt,
    });
  }

  return {
    state: readonly(state) as Readonly<SessionState>,
    async refreshBootstrapState() {
      await refreshBootstrapStateInternal();
    },
    async refreshSessionPolicy() {
      const response = await input.authClient.getSessionPolicy();
      applyUnlockPolicy(response.policy.unlockIdleTimeoutMs);
    },
    async updateSessionPolicy(inputData) {
      const response = await input.authClient.updateSessionPolicy({
        unlockIdleTimeoutMs: inputData.unlockIdleTimeoutMs,
      });
      applyUnlockPolicy(response.policy.unlockIdleTimeoutMs);
      if (state.phase === 'ready') {
        persistReadyStateUnlockCache();
      }
    },
    async restoreSession() {
      const bootstrapState = await refreshBootstrapStateInternal();
      if (bootstrapState === 'UNINITIALIZED_PUBLIC_OPEN') {
        clearReadyState();
        transition({
          phase: 'anonymous',
          username: null,
          userId: null,
          role: null,
          deviceId: null,
          deviceName: null,
          lifecycleState: null,
          bundleVersion: null,
          lastError: null,
          lastActivityAt: null,
        });
        return;
      }

      const restored = await input.authClient.restoreSession();
      applyUnlockPolicy(restored.unlockIdleTimeoutMs);
      if (restored.sessionState !== 'local_unlock_required' || !restored.user || !restored.device) {
        clearReadyState();
        transition({
          phase: 'remote_authentication_required',
          username: restored.user?.username ?? null,
          userId: null,
          role: restored.user?.role ?? null,
          deviceId: null,
          deviceName: null,
          lifecycleState: restored.user?.lifecycleState ?? null,
          bundleVersion: restored.user?.bundleVersion ?? null,
          lastError: null,
          lastActivityAt: null,
        });
        return;
      }

      const trustedLocalState = await input.trustedLocalStateStore.load(restored.user.username);
      if (!trustedLocalState || trustedLocalState.deviceId !== restored.device.deviceId) {
        clearReadyState();
        transition({
          phase: 'remote_authentication_required',
          username: restored.user.username,
          userId: restored.user.userId,
          role: restored.user.role,
          deviceId: restored.device.deviceId,
          deviceName: restored.device.deviceName,
          lifecycleState: restored.user.lifecycleState,
          bundleVersion: restored.user.bundleVersion,
          lastError: 'This device is no longer trusted for this account. Add the device again.',
          lastActivityAt: null,
        });
        return;
      }

      if (bootstrapState === 'OWNER_CREATED_CHECKPOINT_PENDING' && restored.user.role !== 'owner') {
        clearReadyState();
        transition({
          phase: 'remote_authentication_required',
          username: null,
          userId: null,
          role: null,
          deviceId: null,
          deviceName: null,
          lifecycleState: null,
          bundleVersion: null,
          lastError: 'Deployment initialization in progress.',
          lastActivityAt: null,
        });
        return;
      }

      if (
        tryRestoreReadyStateFromCache({
          username: restored.user.username,
          userId: restored.user.userId,
          role: restored.user.role,
          deviceId: restored.device.deviceId,
          deviceName: restored.device.deviceName,
          lifecycleState: restored.user.lifecycleState,
          bundleVersion: restored.user.bundleVersion,
          trustedLocalEncryptedBundle: trustedLocalState.encryptedAccountBundle,
        })
      ) {
        void maybeAutoApproveUnlockGrants();
        return;
      }

      const unlockGrantInput = {
        username: restored.user.username,
        userId: restored.user.userId,
        role: restored.user.role,
        deviceId: restored.device.deviceId,
        deviceName: restored.device.deviceName,
        lifecycleState: restored.user.lifecycleState,
        bundleVersion: restored.user.bundleVersion,
        trustedLocalEncryptedBundle: trustedLocalState.encryptedAccountBundle,
      };
      transition({
        phase: 'local_unlock_required',
        username: restored.user.username,
        userId: restored.user.userId,
        role: restored.user.role,
        deviceId: restored.device.deviceId,
        deviceName: restored.device.deviceName,
        lifecycleState: restored.user.lifecycleState,
        bundleVersion: restored.user.bundleVersion,
        lastError: null,
        lastActivityAt: null,
      });

      if (restored.unlockGrantEnabled !== false) {
        void tryUnlockViaExtensionGrant(unlockGrantInput).then((unlockedViaGrant) => {
          if (unlockedViaGrant) {
            void maybeAutoApproveUnlockGrants();
          }
        });
      }
    },
    async prepareOnboarding(onboarding) {
      transition({
        phase: 'onboarding_in_progress',
        username: onboarding.username,
        userId: null,
        role: null,
        deviceId: null,
        deviceName: onboarding.deviceName,
        lifecycleState: null,
        bundleVersion: null,
        lastError: null,
        lastActivityAt: null,
      });

      try {
        const metadata = await ensureRuntimeMetadata();
        const authSalt = createRandomBase64Url(16);
        const authVerifier = await deriveAuthProof(onboarding.password, authSalt);
        const deviceId = `device_${createRandomBase64Url(12)}`;
        const accountKey = generateAccountKey();
        const encryptedAccountBundle = createOpaqueBundlePlaceholder({
          username: onboarding.username,
          serverUrl: metadata.serverUrl,
          deviceId,
        });
        const accountKeyWrapped = createOpaqueBundlePlaceholder({
          username: onboarding.username,
          serverUrl: metadata.serverUrl,
          deviceId: `${deviceId}_wrapped`,
        });
        const accountKitPayload = {
          version: 'account-kit.v1' as const,
          serverUrl: metadata.serverUrl,
          username: onboarding.username,
          accountKey,
          deploymentFingerprint: metadata.deploymentFingerprint,
          issuedAt: new Date().toISOString(),
        };
        const signedAccountKit = await input.authClient.signOnboardingAccountKit({
          inviteToken: onboarding.inviteToken,
          username: onboarding.username,
          payload: accountKitPayload,
        });

        pendingOnboarding = {
          inviteToken: onboarding.inviteToken,
          username: onboarding.username,
          password: onboarding.password,
          deviceId,
          deviceName: onboarding.deviceName,
          authSalt,
          authVerifier,
          accountKeyWrapped,
          encryptedAccountBundle,
          accountKit: {
            payload: accountKitPayload,
            signature: signedAccountKit.signature,
          },
        };

        transition({
          phase: 'onboarding_export_required',
          username: onboarding.username,
          role: null,
          deviceId,
          deviceName: onboarding.deviceName,
          lifecycleState: null,
          bundleVersion: null,
          lastError: null,
          lastActivityAt: null,
        });

        return pendingOnboarding.accountKit;
      } catch (error) {
        clearPendingOnboarding();
        transition({
          phase: 'remote_authentication_required',
          username: onboarding.username,
          userId: null,
          role: null,
          deviceId: null,
          deviceName: null,
          lifecycleState: null,
          bundleVersion: null,
          lastError: asErrorMessage(error),
          lastActivityAt: null,
        });
        throw error;
      }
    },
    async finalizeOnboarding() {
      if (!pendingOnboarding) {
        throw new Error('No pending onboarding export to finalize');
      }

      const current = pendingOnboarding;

      try {
        const session = await input.authClient.completeOnboarding({
          inviteToken: current.inviteToken,
          username: current.username,
          authSalt: current.authSalt,
          authVerifier: current.authVerifier,
          encryptedAccountBundle: current.encryptedAccountBundle,
          accountKeyWrapped: current.accountKeyWrapped,
          deviceId: current.deviceId,
          deviceName: current.deviceName,
        });
        const localUnlockEnvelope = await createLocalUnlockEnvelope({
          password: current.password,
          authSalt: current.authSalt,
          payload: {
            accountKey: current.accountKit.payload.accountKey,
            encryptedAccountBundle: current.encryptedAccountBundle,
            accountKeyWrapped: current.accountKeyWrapped,
          },
        });

        await input.trustedLocalStateStore.save({
          username: current.username,
          deviceId: current.deviceId,
          deviceName: current.deviceName,
          platform: 'web',
          authSalt: current.authSalt,
          encryptedAccountBundle: current.encryptedAccountBundle,
          accountKeyWrapped: current.accountKeyWrapped,
          localUnlockEnvelope,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        readyState = {
          accountKey: current.accountKit.payload.accountKey,
          encryptedAccountBundle: current.encryptedAccountBundle,
        };
        clearPendingOnboarding();
        transition({
          phase: 'ready',
          username: session.user.username,
          userId: session.user.userId,
          role: session.user.role,
          deviceId: session.device.deviceId,
          deviceName: session.device.deviceName,
          lifecycleState: session.user.lifecycleState,
          bundleVersion: session.user.bundleVersion,
          lastError: null,
          lastActivityAt: Date.now(),
        });

        return current.accountKit;
      } catch (error) {
        clearReadyState();
        clearPendingOnboarding();
        transition({
          phase: 'remote_authentication_required',
          username: current.username,
          userId: null,
          role: null,
          deviceId: null,
          deviceName: null,
          lifecycleState: null,
          bundleVersion: null,
          lastError: asErrorMessage(error),
          lastActivityAt: null,
        });
        throw error;
      }
    },
    async remoteAuthenticate(authentication) {
      const trustedLocalState = await input.trustedLocalStateStore.load(authentication.username);
      if (!trustedLocalState) {
        const message = 'This device is no longer trusted for this account. Add the device again.';
        transition({
          phase: 'remote_authentication_required',
          username: authentication.username,
          role: null,
          bundleVersion: null,
          lastError: message,
        });
        throw new Error(message);
      }

      const challenge = await input.authClient.requestRemoteAuthenticationChallenge(authentication.username);
      const authProof = await deriveAuthProof(authentication.password, challenge.authSalt);
      const session = await input.authClient.completeRemoteAuthentication({
        username: authentication.username,
        deviceId: trustedLocalState.deviceId,
        authProof,
      });

      transition({
        phase: 'local_unlock_required',
        username: session.user.username,
        userId: session.user.userId,
        role: session.user.role,
        deviceId: session.device.deviceId,
        deviceName: session.device.deviceName,
        lifecycleState: session.user.lifecycleState,
        bundleVersion: session.user.bundleVersion,
        lastError: null,
        lastActivityAt: null,
      });
      clearReadyState();
    },
    async bootstrapDevice(bootstrap) {
      const parsedAccountKit = JSON.parse(bootstrap.accountKitJson) as NonNullable<
        TrustedLocalStateRecord['accountKit']
      >;
      const metadata = await ensureRuntimeMetadata();
      if (
        parsedAccountKit.payload.serverUrl !== metadata.serverUrl ||
        parsedAccountKit.payload.deploymentFingerprint !== metadata.deploymentFingerprint
      ) {
        throw new Error('Account Kit deployment mismatch');
      }

      const verification = await input.authClient.verifyAccountKit({
        payload: parsedAccountKit.payload,
        signature: parsedAccountKit.signature,
      });
      if (verification.status !== 'valid') {
        throw new Error('Invalid Account Kit');
      }
      if (parsedAccountKit.payload.username !== bootstrap.username) {
        throw new Error('Account Kit username mismatch');
      }

      const authChallenge = await input.authClient.requestRemoteAuthenticationChallenge(bootstrap.username);
      const authProof = await deriveAuthProof(bootstrap.password, authChallenge.authSalt);
      const response = await input.authClient.bootstrapDevice({
        username: bootstrap.username,
        authProof,
        deviceName: bootstrap.deviceName,
        devicePlatform: 'web',
      });
      const localUnlockEnvelope = await createLocalUnlockEnvelope({
        password: bootstrap.password,
        authSalt: response.authSalt,
        payload: {
          accountKey: parsedAccountKit.payload.accountKey,
          encryptedAccountBundle: response.encryptedAccountBundle,
          accountKeyWrapped: response.accountKeyWrapped,
        },
      });

      await input.trustedLocalStateStore.save({
        username: bootstrap.username,
        deviceId: response.device.deviceId,
        deviceName: response.device.deviceName,
        platform: 'web',
        authSalt: response.authSalt,
        encryptedAccountBundle: response.encryptedAccountBundle,
        accountKeyWrapped: response.accountKeyWrapped,
        localUnlockEnvelope,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      transition({
        phase: 'local_unlock_required',
        username: response.user.username,
        userId: response.user.userId,
        role: response.user.role,
        deviceId: response.device.deviceId,
        deviceName: response.device.deviceName,
        lifecycleState: response.user.lifecycleState,
        bundleVersion: response.user.bundleVersion,
        lastError: null,
        lastActivityAt: null,
      });
      clearReadyState();
    },
    async localUnlock(unlock) {
      const trustedLocalState = await input.trustedLocalStateStore.load(unlock.username);
      if (!trustedLocalState) {
        const message = 'This device is no longer trusted for this account. Add the device again.';
        transition({
          phase: 'remote_authentication_required',
          username: unlock.username,
          role: null,
          bundleVersion: null,
          lastError: message,
        });
        throw new Error(message);
      }

      const restored = await input.authClient.restoreSession();
      if (
        restored.sessionState !== 'local_unlock_required' ||
        !restored.user ||
        !restored.device ||
        restored.user.username !== unlock.username ||
        restored.device.deviceId !== trustedLocalState.deviceId ||
        restored.user.lifecycleState !== 'active'
      ) {
        const message = unauthorizedMessage({
          message: state.lastError,
          reasonCode:
            restored.user?.lifecycleState === 'suspended' ? 'account_suspended' : null,
        });
        clearReadyState();
        transition({
          phase: 'local_unlock_required',
          username: unlock.username,
          userId: restored.user?.userId ?? state.userId,
          role: restored.user?.role ?? state.role,
          deviceId: trustedLocalState.deviceId,
          deviceName: trustedLocalState.deviceName,
          lifecycleState: restored.user?.lifecycleState ?? state.lifecycleState,
          bundleVersion: restored.user?.bundleVersion ?? state.bundleVersion,
          lastError: message,
          lastActivityAt: null,
        });
        throw new Error(message);
      }

      const payload = await decryptLocalUnlockEnvelope<ReadyState>({
        password: unlock.password,
        authSalt: trustedLocalState.authSalt,
        envelope: trustedLocalState.localUnlockEnvelope,
      });
      readyState = payload;
      transition({
        phase: 'ready',
        username: restored.user.username,
        userId: restored.user.userId,
        role: restored.user.role,
        deviceId: restored.device.deviceId,
        deviceName: restored.device.deviceName,
        lifecycleState: restored.user.lifecycleState,
        bundleVersion: restored.user.bundleVersion,
        lastError: null,
        lastActivityAt: Date.now(),
      });
      persistReadyStateUnlockCache();
      void maybeAutoApproveUnlockGrants();
    },
    handleUnauthorized(inputData) {
      clearReadyState();
      const message = unauthorizedMessage(inputData);
      const shouldRequireUnlock =
        inputData?.reasonCode === 'account_suspended' && Boolean(state.username);
      transition({
        phase: shouldRequireUnlock ? 'local_unlock_required' : 'remote_authentication_required',
        lastError: message,
        lastActivityAt: null,
      });
    },
    async reissueAccountKit() {
      if (!readyState || !state.username) {
        throw new Error('Account Kit reissue requires unlocked state');
      }

      const metadata = await ensureRuntimeMetadata();
      const payload = {
        version: 'account-kit.v1' as const,
        serverUrl: metadata.serverUrl,
        username: state.username,
        accountKey: readyState.accountKey,
        deploymentFingerprint: metadata.deploymentFingerprint,
        issuedAt: new Date().toISOString(),
      };
      const signed = await input.authClient.reissueAccountKit({ payload });

      return {
        payload,
        signature: signed.signature,
      };
    },
    async confirmRecentReauth(inputData) {
      if (!state.username) {
        throw new Error('Recent reauth requires an authenticated user');
      }

      const trustedLocalState = await input.trustedLocalStateStore.load(state.username);
      if (!trustedLocalState || (state.deviceId && trustedLocalState.deviceId !== state.deviceId)) {
        throw new Error('This device is no longer trusted for this account. Add the device again.');
      }

      const authProof = await deriveAuthProof(inputData.password, trustedLocalState.authSalt);
      const response = await input.authClient.recentReauth({ authProof });
      return {
        validUntil: response.validUntil,
      };
    },
    async listExtensionLinkPending() {
      if (!state.username || !state.userId) {
        throw new Error('Extension link requests require an authenticated user');
      }
      return input.authClient.listExtensionLinkPending();
    },
    async approveExtensionLink(inputData) {
      const extensionTrustPackage = await requireTrustedLocalStateForExtensionTrust();
      return input.authClient.approveExtensionLink({
        requestId: inputData.requestId,
        approvalNonce: createRandomBase64Url(16),
        package: extensionTrustPackage,
      });
    },
    async rejectExtensionLink(inputData) {
      if (!state.username || !state.userId) {
        throw new Error('Extension link requests require an authenticated user');
      }
      return input.authClient.rejectExtensionLink({
        requestId: inputData.requestId,
        rejectionReasonCode: inputData.rejectionReasonCode,
      });
    },
    async listDevices() {
      if (!state.username || !state.userId) {
        throw new Error('Device list requires an authenticated user');
      }
      return input.authClient.listDevices();
    },
    async revokeDevice(deviceId) {
      if (!state.username || !state.userId) {
        throw new Error('Device revoke requires an authenticated user');
      }
      return input.authClient.revokeDevice(deviceId);
    },
    async rotatePassword(rotation) {
      if (!readyState || !state.username || !state.userId || !state.deviceId || state.phase !== 'ready') {
        throw new Error('Password rotation requires unlocked state');
      }

      const trustedLocalState = await input.trustedLocalStateStore.load(state.username);
      if (!trustedLocalState || trustedLocalState.deviceId !== state.deviceId) {
        throw new Error('This device is no longer trusted for this account. Add the device again.');
      }

      const currentAuthProof = await deriveAuthProof(rotation.currentPassword, trustedLocalState.authSalt);
      await input.authClient.recentReauth({
        authProof: currentAuthProof,
      });

      const nextAuthSalt = createRandomBase64Url(16);
      const nextAuthVerifier = await deriveAuthProof(rotation.nextPassword, nextAuthSalt);
      const nextEncryptedAccountBundle = trustedLocalState.encryptedAccountBundle;
      const nextAccountKeyWrapped = trustedLocalState.accountKeyWrapped;
      const expectedBundleVersion = state.bundleVersion ?? 0;
      const accountKey = readyState.accountKey;
      const rotationResponse = await input.authClient.completePasswordRotation({
        currentAuthProof,
        nextAuthSalt,
        nextAuthVerifier,
        nextEncryptedAccountBundle,
        nextAccountKeyWrapped,
        expected_bundle_version: expectedBundleVersion,
      });

      const nextEnvelope = await createLocalUnlockEnvelope({
        password: rotation.nextPassword,
        authSalt: nextAuthSalt,
        payload: {
          accountKey,
          encryptedAccountBundle: nextEncryptedAccountBundle,
          accountKeyWrapped: nextAccountKeyWrapped,
        },
      });
      const nextUpdatedAt = new Date().toISOString();

      try {
        await input.trustedLocalStateStore.save({
          ...trustedLocalState,
          authSalt: nextAuthSalt,
          encryptedAccountBundle: nextEncryptedAccountBundle,
          accountKeyWrapped: nextAccountKeyWrapped,
          localUnlockEnvelope: nextEnvelope,
          updatedAt: nextUpdatedAt,
        });
      } catch {
        clearReadyState();
        transition({
          phase: 'local_unlock_required',
          username: rotationResponse.user.username,
          userId: rotationResponse.user.userId,
          role: rotationResponse.user.role,
          deviceId: rotationResponse.device.deviceId,
          deviceName: rotationResponse.device.deviceName,
          lifecycleState: rotationResponse.user.lifecycleState,
          bundleVersion: rotationResponse.bundleVersion,
          lastError: 'Password rotation finished. Unlock this device again to continue securely.',
          lastActivityAt: null,
        });
        throw new Error('Password rotation finished. Unlock this device again to continue securely.');
      }

      readyState = {
        accountKey,
        encryptedAccountBundle: nextEncryptedAccountBundle,
      };
      transition({
        phase: 'ready',
        username: rotationResponse.user.username,
        userId: rotationResponse.user.userId,
        role: rotationResponse.user.role,
        deviceId: rotationResponse.device.deviceId,
        deviceName: rotationResponse.device.deviceName,
        lifecycleState: rotationResponse.user.lifecycleState,
        bundleVersion: rotationResponse.bundleVersion,
        lastError: null,
        lastActivityAt: Date.now(),
      });

      return rotationResponse;
    },
    resolveSiteIcons(inputData) {
      return input.authClient.resolveSiteIcons(inputData);
    },
    discoverSiteIcons(inputData) {
      return input.authClient.discoverSiteIcons(inputData);
    },
    listManualSiteIcons() {
      return input.authClient.listManualSiteIcons();
    },
    upsertManualSiteIcon(inputData) {
      return input.authClient.upsertManualSiteIcon(inputData);
    },
    removeManualSiteIcon(inputData) {
      return input.authClient.removeManualSiteIcon(inputData);
    },
    async getRuntimeMetadata() {
      return ensureRuntimeMetadata();
    },
    setAutoLockAfterMs(value: number) {
      if (!isValidAutoLockAfterMs(value)) {
        return;
      }

      transition({
        autoLockAfterMs: value,
      });
      persistAutoLockAfterMs(value);
      if (state.phase === 'ready') {
        persistReadyStateUnlockCache();
      }
    },
    lock() {
      clearReadyState();
      transition({
        phase: state.username ? 'local_unlock_required' : 'remote_authentication_required',
        lastActivityAt: null,
      });
    },
    markActivity(now = Date.now()) {
      if (state.phase === 'ready') {
        transition({
          lastActivityAt: now,
        });
        persistReadyStateUnlockCache();
      }
    },
    enforceAutoLock(now = Date.now()) {
      if (state.phase !== 'ready' || state.lastActivityAt === null) {
        return;
      }

      if (now - state.lastActivityAt >= state.autoLockAfterMs) {
        this.lock();
      }
    },
    getUnlockedVaultContext() {
      if (!readyState || !state.username || state.phase !== 'ready') {
        throw new Error('Vault access requires local unlock');
      }

      return {
        username: state.username,
        accountKey: readyState.accountKey,
      };
    },
  };
}
