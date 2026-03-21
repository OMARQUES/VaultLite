export type ExtensionSessionPhase =
  | 'anonymous'
  | 'remote_authentication_required'
  | 'pairing_required'
  | 'local_unlock_required'
  | 'ready';

export interface TrustedExtensionState {
  username: string;
  deviceId: string;
  deviceName: string;
  authSalt: string;
  encryptedAccountBundle: string;
  accountKeyWrapped: string;
  localUnlockEnvelope: {
    version: 'local-unlock.v1';
    nonce: string;
    ciphertext: string;
  };
  deploymentFingerprint: string;
  serverOrigin: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionSessionSnapshot {
  phase: ExtensionSessionPhase;
  username: string | null;
  deviceId: string | null;
  deviceName: string | null;
  sessionExpiresAt: string | null;
  hasTokenInMemory: boolean;
  lastError: string | null;
}

export interface ExtensionSessionStore {
  getSnapshot(): ExtensionSessionSnapshot;
  setPairingRequired(): void;
  setLocalUnlockRequired(input: { username: string; deviceId: string; deviceName: string }): void;
  setReady(input: { username: string; deviceId: string; deviceName: string }): void;
  setRemoteAuthenticationRequired(reason?: string): void;
  setBearerSession(input: { token: string; expiresAt: string }): void;
  clearEphemeral(): void;
}

export function createExtensionSessionStore(): ExtensionSessionStore {
  let phase: ExtensionSessionPhase = 'anonymous';
  let username: string | null = null;
  let deviceId: string | null = null;
  let deviceName: string | null = null;
  let extensionToken: string | null = null;
  let sessionExpiresAt: string | null = null;
  let lastError: string | null = null;

  function setIdentity(input: { username: string; deviceId: string; deviceName: string }): void {
    username = input.username;
    deviceId = input.deviceId;
    deviceName = input.deviceName;
  }

  function clearSensitive(): void {
    extensionToken = null;
    sessionExpiresAt = null;
  }

  return {
    getSnapshot() {
      return {
        phase,
        username,
        deviceId,
        deviceName,
        sessionExpiresAt,
        hasTokenInMemory: Boolean(extensionToken),
        lastError,
      };
    },
    setPairingRequired() {
      clearSensitive();
      phase = 'pairing_required';
      lastError = null;
    },
    setLocalUnlockRequired(input) {
      setIdentity(input);
      clearSensitive();
      phase = 'local_unlock_required';
      lastError = null;
    },
    setReady(input) {
      setIdentity(input);
      phase = 'ready';
      lastError = null;
    },
    setRemoteAuthenticationRequired(reason) {
      clearSensitive();
      phase = 'remote_authentication_required';
      lastError = reason ?? null;
    },
    setBearerSession(input) {
      extensionToken = input.token;
      sessionExpiresAt = input.expiresAt;
    },
    clearEphemeral() {
      clearSensitive();
      if (phase === 'ready') {
        phase = 'local_unlock_required';
      }
    },
  };
}
