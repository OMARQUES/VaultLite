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
    password: string;
  }): Promise<ExtensionLinkActionOutput>;
  rejectExtensionLink(input: {
    requestId: string;
    password: string;
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

  function transition(patch: Partial<SessionState>) {
    Object.assign(state, patch);
  }

  function clearReadyState() {
    readyState = null;
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

  async function requireTrustedLocalStateForExtensionTrust(password: string): Promise<{
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

    const pairingLocalUnlockEnvelope = await createLocalUnlockEnvelope({
      password,
      authSalt: trustedLocalState.authSalt,
      payload: {
        accountKey: readyState.accountKey,
        encryptedAccountBundle: trustedLocalState.encryptedAccountBundle,
        accountKeyWrapped: trustedLocalState.accountKeyWrapped,
      },
    });

    return {
      authSalt: trustedLocalState.authSalt,
      encryptedAccountBundle: trustedLocalState.encryptedAccountBundle,
      accountKeyWrapped: trustedLocalState.accountKeyWrapped,
      localUnlockEnvelope: pairingLocalUnlockEnvelope,
    };
  }

  async function refreshBootstrapStateInternal() {
    const stateResponse = await input.authClient.getBootstrapState();
    transition({
      bootstrapState: stateResponse.bootstrapState,
    });
    return stateResponse.bootstrapState;
  }

  return {
    state: readonly(state) as Readonly<SessionState>,
    async refreshBootstrapState() {
      await refreshBootstrapStateInternal();
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
      const extensionTrustPackage = await requireTrustedLocalStateForExtensionTrust(inputData.password);
      await this.confirmRecentReauth({
        password: inputData.password,
      });
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
      await this.confirmRecentReauth({
        password: inputData.password,
      });
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
