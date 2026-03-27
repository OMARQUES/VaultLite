import type {
  DeviceListOutput,
  DeviceRevokeOutput,
  ExtensionLinkActionOutput,
  ExtensionLinkPendingListOutput,
  PasswordRotationCompleteOutput,
  PasswordGeneratorHistoryActionOutput,
  PasswordGeneratorHistoryListOutput,
  PasswordGeneratorHistoryUpsertInput,
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
  calibrateLocalUnlockKdfProfile,
  createLocalUnlockEnvelope,
  createOpaqueBundlePlaceholder,
  createRandomBase64Url,
  decryptLocalUnlockEnvelope,
  deriveAuthProof,
  generateAccountKey,
  LOCAL_UNLOCK_KDF_BASELINE_PROFILE,
  normalizeLocalUnlockKdfProfile,
  type LocalUnlockKdfProfile,
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
  lockRevision: number;
  lastUnlockedLockRevision: number;
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
  listPasswordGeneratorHistory(): Promise<PasswordGeneratorHistoryListOutput>;
  upsertPasswordGeneratorHistoryEntry(
    input: PasswordGeneratorHistoryUpsertInput,
  ): Promise<PasswordGeneratorHistoryActionOutput>;
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
const WEB_UNLOCK_CACHE_LOCALSTORAGE_LEGACY_CLEANUP_KEY = 'vaultlite:web-unlock-cache-legacy-cleaned.v1';
const ENABLE_LOCAL_KDF_CALIBRATION_V1 = true;

interface WebUnlockCacheRecord {
  username: string;
  deviceId: string;
  algorithm: 'AES-GCM';
  iv: string;
  ciphertext: string;
  expiresAt: number;
  lockRevision: number;
}

interface WebUnlockCachePayload {
  accountKey: string;
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
      parsed.algorithm !== 'AES-GCM' ||
      typeof parsed?.iv !== 'string' ||
      parsed.iv.length < 8 ||
      typeof parsed?.ciphertext !== 'string' ||
      parsed.ciphertext.length < 16 ||
      typeof parsed?.expiresAt !== 'number' ||
      typeof parsed?.lockRevision !== 'number'
    ) {
      return null;
    }
    return {
      username: parsed.username,
      deviceId: parsed.deviceId,
      algorithm: 'AES-GCM',
      iv: parsed.iv,
      ciphertext: parsed.ciphertext,
      expiresAt: parsed.expiresAt,
      lockRevision: Math.max(0, Math.trunc(parsed.lockRevision)),
    };
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  const binary = atob(padded);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function toStrictUint8Array(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(bytes);
}

function loadWebUnlockCache(): WebUnlockCacheRecord | null {
  try {
    return parseWebUnlockCacheRecord(globalThis.sessionStorage?.getItem(WEB_UNLOCK_CACHE_STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

async function ensureWebUnlockCacheKey(existing: CryptoKey | null): Promise<CryptoKey | null> {
  if (existing) {
    return existing;
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof globalThis.crypto?.getRandomValues !== 'function') {
    return null;
  }
  try {
    return await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

function buildWebUnlockCacheAad(record: {
  username: string;
  deviceId: string;
  expiresAt: number;
  lockRevision: number;
}): Uint8Array {
  return new TextEncoder().encode(
    `${record.username}|${record.deviceId}|${Math.trunc(record.expiresAt)}|${Math.trunc(record.lockRevision)}`,
  );
}

async function encryptWebUnlockCacheRecord(input: {
  username: string;
  deviceId: string;
  accountKey: string;
  expiresAt: number;
  lockRevision: number;
  key: CryptoKey;
}): Promise<WebUnlockCacheRecord | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof globalThis.crypto?.getRandomValues !== 'function') {
    return null;
  }
  try {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(
      JSON.stringify({
        accountKey: input.accountKey,
      } satisfies WebUnlockCachePayload),
    );
    const ciphertext = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toStrictUint8Array(iv) as unknown as BufferSource,
        additionalData: toStrictUint8Array(buildWebUnlockCacheAad({
          username: input.username,
          deviceId: input.deviceId,
          expiresAt: input.expiresAt,
          lockRevision: input.lockRevision,
        })) as unknown as BufferSource,
      },
      input.key,
      plaintext,
    );
    return {
      username: input.username,
      deviceId: input.deviceId,
      algorithm: 'AES-GCM',
      iv: bytesToBase64Url(iv),
      ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
      expiresAt: input.expiresAt,
      lockRevision: Math.max(0, Math.trunc(input.lockRevision)),
    };
  } catch {
    return null;
  }
}

async function decryptWebUnlockCacheAccountKey(
  record: WebUnlockCacheRecord,
  key: CryptoKey | null,
): Promise<string | null> {
  if (!key) {
    return null;
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return null;
  }
  try {
    const decrypted = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toStrictUint8Array(base64UrlToBytes(record.iv)) as unknown as BufferSource,
        additionalData: toStrictUint8Array(buildWebUnlockCacheAad({
          username: record.username,
          deviceId: record.deviceId,
          expiresAt: record.expiresAt,
          lockRevision: record.lockRevision,
        })) as unknown as BufferSource,
      },
      key,
      toStrictUint8Array(base64UrlToBytes(record.ciphertext)) as unknown as BufferSource,
    );
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as Partial<WebUnlockCachePayload>;
    if (typeof parsed?.accountKey !== 'string' || parsed.accountKey.length < 20) {
      return null;
    }
    return parsed.accountKey;
  } catch {
    return null;
  }
}

function persistWebUnlockCache(record: WebUnlockCacheRecord) {
  try {
    globalThis.sessionStorage?.setItem(WEB_UNLOCK_CACHE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage failures and keep in-memory unlock only.
  }
}

function clearWebUnlockCache() {
  try {
    globalThis.sessionStorage?.removeItem(WEB_UNLOCK_CACHE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function cleanupLegacyWebUnlockCacheLocalStorageOnce() {
  try {
    const alreadyCleaned =
      globalThis.localStorage?.getItem(WEB_UNLOCK_CACHE_LOCALSTORAGE_LEGACY_CLEANUP_KEY) === '1';
    if (alreadyCleaned) {
      return;
    }
    globalThis.localStorage?.removeItem(WEB_UNLOCK_CACHE_STORAGE_KEY);
    globalThis.localStorage?.setItem(WEB_UNLOCK_CACHE_LOCALSTORAGE_LEGACY_CLEANUP_KEY, '1');
  } catch {
    // Ignore storage failures.
  }
}

async function resolveLocalUnlockKdfProfile(
  existingProfile?: LocalUnlockKdfProfile | null,
): Promise<LocalUnlockKdfProfile> {
  if (existingProfile) {
    return normalizeLocalUnlockKdfProfile(existingProfile);
  }
  if (!ENABLE_LOCAL_KDF_CALIBRATION_V1) {
    return LOCAL_UNLOCK_KDF_BASELINE_PROFILE;
  }
  try {
    return await calibrateLocalUnlockKdfProfile();
  } catch {
    return LOCAL_UNLOCK_KDF_BASELINE_PROFILE;
  }
}

export function createSessionStore(input: {
  authClient: VaultLiteAuthClient;
  trustedLocalStateStore: TrustedLocalStateStore;
}): SessionStore {
  cleanupLegacyWebUnlockCacheLocalStorageOnce();
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
    lockRevision: 0,
    lastUnlockedLockRevision: 0,
    lastError: null,
    lastActivityAt: null,
    autoLockAfterMs: readPersistedAutoLockAfterMs(),
  });
  let readyState: ReadyState | null = null;
  let pendingOnboarding: PendingOnboardingState | null = null;
  let runtimeMetadata: RuntimeMetadata | null = null;
  let webUnlockCacheKey: CryptoKey | null = null;

  function transition(patch: Partial<SessionState>) {
    Object.assign(state, patch);
  }

  function clearReadyState() {
    readyState = null;
    webUnlockCacheKey = null;
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

  async function tryRestoreReadyStateFromCache(inputValue: {
    username: string;
    userId: string;
    role: 'owner' | 'user';
    deviceId: string;
    deviceName: string;
    lifecycleState: 'active' | 'suspended' | 'deprovisioned' | null;
    bundleVersion: number | null;
    trustedLocalEncryptedBundle: string;
    lockRevision: number;
  }): Promise<boolean> {
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
    // Keep a valid local unlock cache unless the backend reports a newer
    // lock revision for this trusted session context.
    if (inputValue.lockRevision > cached.lockRevision) {
      clearWebUnlockCache();
      return false;
    }
    const decryptedAccountKey = await decryptWebUnlockCacheAccountKey(cached, webUnlockCacheKey);
    if (!decryptedAccountKey) {
      clearWebUnlockCache();
      return false;
    }
    readyState = {
      accountKey: decryptedAccountKey,
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
      lockRevision: inputValue.lockRevision,
      lastUnlockedLockRevision: inputValue.lockRevision,
      lastError: null,
      lastActivityAt: Date.now(),
    });
    return true;
  }

  async function persistReadyStateUnlockCache() {
    if (!readyState || !state.username || !state.deviceId || state.phase !== 'ready') {
      return;
    }
    const readySnapshot = readyState;
    const usernameSnapshot = state.username;
    const deviceIdSnapshot = state.deviceId;
    const lockRevisionSnapshot = Math.max(0, Math.trunc(state.lockRevision));
    const expiresAt = Date.now() + state.autoLockAfterMs;
    const resolvedKey = await ensureWebUnlockCacheKey(webUnlockCacheKey);
    if (!resolvedKey) {
      return;
    }
    if (
      readyState !== readySnapshot ||
      state.phase !== 'ready' ||
      state.username !== usernameSnapshot ||
      state.deviceId !== deviceIdSnapshot
    ) {
      return;
    }
    webUnlockCacheKey = resolvedKey;
    const encryptedRecord = await encryptWebUnlockCacheRecord({
      username: usernameSnapshot,
      deviceId: deviceIdSnapshot,
      accountKey: readySnapshot.accountKey,
      expiresAt,
      lockRevision: lockRevisionSnapshot,
      key: resolvedKey,
    });
    if (!encryptedRecord) {
      return;
    }
    persistWebUnlockCache(encryptedRecord);
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
        await persistReadyStateUnlockCache();
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
          lockRevision: 0,
          lastError: null,
          lastActivityAt: null,
        });
        return;
      }

      const lockRevision = Math.max(0, Math.trunc(restored.lockRevision ?? 0));

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
          lockRevision,
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
          lockRevision: 0,
          lastError: 'Deployment initialization in progress.',
          lastActivityAt: null,
        });
        return;
      }

      if (
        await tryRestoreReadyStateFromCache({
          username: restored.user.username,
          userId: restored.user.userId,
          role: restored.user.role,
          deviceId: restored.device.deviceId,
          deviceName: restored.device.deviceName,
          lifecycleState: restored.user.lifecycleState,
          bundleVersion: restored.user.bundleVersion,
          trustedLocalEncryptedBundle: trustedLocalState.encryptedAccountBundle,
          lockRevision,
        })
      ) {
        return;
      }

      transition({
        phase: 'local_unlock_required',
        username: restored.user.username,
        userId: restored.user.userId,
        role: restored.user.role,
        deviceId: restored.device.deviceId,
        deviceName: restored.device.deviceName,
        lifecycleState: restored.user.lifecycleState,
        bundleVersion: restored.user.bundleVersion,
        lockRevision,
        lastError: null,
        lastActivityAt: null,
      });
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
        const localUnlockKdfProfile = await resolveLocalUnlockKdfProfile(null);
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
          kdfProfile: localUnlockKdfProfile,
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
          localUnlockKdfProfile,
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
          lockRevision: 0,
          lastUnlockedLockRevision: 0,
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
      const localUnlockKdfProfile = await resolveLocalUnlockKdfProfile(null);
      const localUnlockEnvelope = await createLocalUnlockEnvelope({
        password: bootstrap.password,
        authSalt: response.authSalt,
        payload: {
          accountKey: parsedAccountKit.payload.accountKey,
          encryptedAccountBundle: response.encryptedAccountBundle,
          accountKeyWrapped: response.accountKeyWrapped,
        },
        kdfProfile: localUnlockKdfProfile,
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
        localUnlockKdfProfile,
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

      let payload: ReadyState;
      try {
        payload = await decryptLocalUnlockEnvelope<ReadyState>({
          password: unlock.password,
          authSalt: trustedLocalState.authSalt,
          envelope: trustedLocalState.localUnlockEnvelope,
          kdfProfile: trustedLocalState.localUnlockKdfProfile ?? null,
        });
      } catch {
        const message = 'Could not unlock this device with the provided password.';
        transition({
          phase: 'local_unlock_required',
          username: unlock.username,
          userId: restored.user.userId,
          role: restored.user.role,
          deviceId: trustedLocalState.deviceId,
          deviceName: trustedLocalState.deviceName,
          lifecycleState: restored.user.lifecycleState,
          bundleVersion: restored.user.bundleVersion,
          lockRevision: Math.max(0, Math.trunc(restored.lockRevision ?? state.lockRevision)),
          lastUnlockedLockRevision: state.lastUnlockedLockRevision,
          lastError: message,
          lastActivityAt: null,
        });
        throw new Error(message);
      }
      const currentLockRevision = Math.max(0, Math.trunc(restored.lockRevision ?? state.lockRevision));
      const unlockAuthProofPromise = deriveAuthProof(unlock.password, trustedLocalState.authSalt);
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
        lockRevision: currentLockRevision,
        lastUnlockedLockRevision: currentLockRevision,
        lastError: null,
        lastActivityAt: Date.now(),
      });
      await persistReadyStateUnlockCache();
      // Best-effort: unlocking with current password should satisfy recent reauth-sensitive actions.
      // Never block local unlock UX if network or session refresh temporarily fails.
      void unlockAuthProofPromise
        .then((authProof) => input.authClient.recentReauth({ authProof }))
        .catch(() => undefined);
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
      const localUnlockKdfProfile = await resolveLocalUnlockKdfProfile(
        trustedLocalState.localUnlockKdfProfile ?? null,
      );
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
        kdfProfile: localUnlockKdfProfile,
      });
      const nextUpdatedAt = new Date().toISOString();

      try {
        await input.trustedLocalStateStore.save({
          ...trustedLocalState,
          authSalt: nextAuthSalt,
          encryptedAccountBundle: nextEncryptedAccountBundle,
          accountKeyWrapped: nextAccountKeyWrapped,
          localUnlockEnvelope: nextEnvelope,
          localUnlockKdfProfile,
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
          lockRevision: state.lockRevision,
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
        lockRevision: state.lockRevision,
        lastUnlockedLockRevision: state.lastUnlockedLockRevision,
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
    listPasswordGeneratorHistory() {
      return input.authClient.listPasswordGeneratorHistory();
    },
    upsertPasswordGeneratorHistoryEntry(inputData) {
      return input.authClient.upsertPasswordGeneratorHistoryEntry(inputData);
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
        void persistReadyStateUnlockCache();
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
        void persistReadyStateUnlockCache();
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
