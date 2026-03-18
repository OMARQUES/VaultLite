import type { RuntimeMetadata } from '@vaultlite/contracts';
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
  return error instanceof Error ? error.message : String(error);
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
          lastError: 'Trusted local state missing for session restoration',
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
          lastError: asErrorMessage(error),
          lastActivityAt: null,
        });
        throw error;
      }
    },
    async remoteAuthenticate(authentication) {
      const trustedLocalState = await input.trustedLocalStateStore.load(authentication.username);
      if (!trustedLocalState) {
        const message = 'Trusted local state not found for this username';
        transition({
          phase: 'remote_authentication_required',
          username: authentication.username,
          role: null,
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
        lastError: null,
        lastActivityAt: null,
      });
      clearReadyState();
    },
    async localUnlock(unlock) {
      const trustedLocalState = await input.trustedLocalStateStore.load(unlock.username);
      if (!trustedLocalState) {
        const message = 'Trusted local state not found for this username';
        transition({
          phase: 'remote_authentication_required',
          username: unlock.username,
          role: null,
          lastError: message,
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
        username: trustedLocalState.username,
        role: state.role,
        deviceId: trustedLocalState.deviceId,
        deviceName: trustedLocalState.deviceName,
        lastError: null,
        lastActivityAt: Date.now(),
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
