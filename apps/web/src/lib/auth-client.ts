import type {
  AdminAuditListOutput,
  AdminInviteCreateInput,
  AdminInviteCreateOutput,
  AdminInviteListOutput,
  AdminInviteRevokeOutput,
  AdminUserLifecycleMutationOutput,
  AdminUserListOutput,
  AccountKitSignatureInput,
  AccountKitSignatureOutput,
  BootstrapCheckpointCompleteInput,
  BootstrapCheckpointCompleteOutput,
  BootstrapCheckpointDownloadInput,
  BootstrapCheckpointDownloadOutput,
  BootstrapInitializeOwnerInput,
  BootstrapInitializeOwnerOutput,
  BootstrapStateOutput,
  BootstrapVerifyInput,
  BootstrapVerifyOutput,
  OnboardingAccountKitSignInput,
  RecentReauthInput,
  RecentReauthOutput,
  RemoteAuthenticationChallengeOutput,
  RuntimeMetadata,
  SessionRestoreResponse,
  TrustedSessionResponse,
} from '@vaultlite/contracts';

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const target = document.cookie
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(prefix));

  return target ? decodeURIComponent(target.slice(prefix.length)) : null;
}

export interface VaultLiteAuthClient {
  getBootstrapState(): Promise<BootstrapStateOutput>;
  bootstrapVerify(input: BootstrapVerifyInput): Promise<BootstrapVerifyOutput>;
  bootstrapInitializeOwner(input: BootstrapInitializeOwnerInput): Promise<BootstrapInitializeOwnerOutput>;
  bootstrapCheckpointDownload(
    input: BootstrapCheckpointDownloadInput,
  ): Promise<BootstrapCheckpointDownloadOutput>;
  bootstrapCheckpointComplete(
    input: BootstrapCheckpointCompleteInput,
  ): Promise<BootstrapCheckpointCompleteOutput>;
  getRuntimeMetadata(): Promise<RuntimeMetadata>;
  restoreSession(): Promise<SessionRestoreResponse>;
  requestRemoteAuthenticationChallenge(username: string): Promise<RemoteAuthenticationChallengeOutput>;
  completeRemoteAuthentication(input: {
    username: string;
    deviceId: string;
    authProof: string;
  }): Promise<TrustedSessionResponse>;
  completeOnboarding(input: {
    inviteToken: string;
    username: string;
    authSalt: string;
    authVerifier: string;
    encryptedAccountBundle: string;
    accountKeyWrapped: string;
    deviceId: string;
    deviceName: string;
  }): Promise<TrustedSessionResponse>;
  bootstrapDevice(input: {
    username: string;
    authProof: string;
    deviceName: string;
    devicePlatform: 'web' | 'extension';
  }): Promise<
    TrustedSessionResponse & {
      encryptedAccountBundle: string;
      accountKeyWrapped: string;
      authSalt: string;
    }
  >;
  signOnboardingAccountKit(input: OnboardingAccountKitSignInput): Promise<AccountKitSignatureOutput>;
  signAccountKit(input: AccountKitSignatureInput): Promise<AccountKitSignatureOutput>;
  reissueAccountKit(input: AccountKitSignatureInput): Promise<AccountKitSignatureOutput>;
  verifyAccountKit(input: {
    payload: AccountKitSignatureInput['payload'];
    signature: string;
  }): Promise<{
    status: 'valid' | 'invalid';
  }>;
  recentReauth(input: RecentReauthInput): Promise<RecentReauthOutput>;
  createAdminInvite(input: AdminInviteCreateInput): Promise<AdminInviteCreateOutput>;
  listAdminInvites(): Promise<AdminInviteListOutput>;
  revokeAdminInvite(inviteId: string): Promise<AdminInviteRevokeOutput>;
  listAdminUsers(): Promise<AdminUserListOutput>;
  listAdminAudit(limit?: number): Promise<AdminAuditListOutput>;
  suspendAdminUser(userId: string): Promise<AdminUserLifecycleMutationOutput>;
  reactivateAdminUser(userId: string): Promise<AdminUserLifecycleMutationOutput>;
  deprovisionAdminUser(userId: string): Promise<AdminUserLifecycleMutationOutput>;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.method && init.method !== 'GET' && readCookie('vl_csrf')
        ? { 'x-csrf-token': readCookie('vl_csrf') ?? '' }
        : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let responseCode = '';
    let responseMessage = '';
    let responseReasonCode = '';
    let responseResult = '';

    try {
      const errorBody = await response.clone().json() as {
        code?: string;
        message?: string;
        reasonCode?: string;
        result?: string;
      };
      responseCode = typeof errorBody.code === 'string' ? errorBody.code : '';
      responseMessage = typeof errorBody.message === 'string' ? errorBody.message : '';
      responseReasonCode = typeof errorBody.reasonCode === 'string' ? errorBody.reasonCode : '';
      responseResult = typeof errorBody.result === 'string' ? errorBody.result : '';
    } catch {
      // Response was not JSON, preserve status-only error below.
    }

    const details = responseMessage || responseCode || responseReasonCode || responseResult;
    throw new Error(
      details
        ? `Request failed with status ${response.status} (${details})`
        : `Request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

function nextIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function withIdempotencyHeader(init: RequestInit, key?: string): RequestInit {
  return {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      'x-idempotency-key': key ?? nextIdempotencyKey(),
    },
  };
}

export function createVaultLiteAuthClient(baseUrl = ''): VaultLiteAuthClient {
  return {
    getBootstrapState() {
      return requestJson<BootstrapStateOutput>(`${baseUrl}/api/bootstrap/state`);
    },
    bootstrapVerify(input) {
      return requestJson<BootstrapVerifyOutput>(`${baseUrl}/api/bootstrap/verify`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    bootstrapInitializeOwner(input) {
      return requestJson<BootstrapInitializeOwnerOutput>(
        `${baseUrl}/api/bootstrap/initialize-owner`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
      );
    },
    bootstrapCheckpointDownload(input) {
      return requestJson<BootstrapCheckpointDownloadOutput>(
        `${baseUrl}/api/bootstrap/checkpoint/download-account-kit`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
    },
    bootstrapCheckpointComplete(input) {
      return requestJson<BootstrapCheckpointCompleteOutput>(
        `${baseUrl}/api/bootstrap/checkpoint/complete`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
      );
    },
    getRuntimeMetadata() {
      return requestJson<RuntimeMetadata>(`${baseUrl}/api/runtime/metadata`);
    },
    restoreSession() {
      return requestJson<SessionRestoreResponse>(`${baseUrl}/api/auth/session/restore`);
    },
    requestRemoteAuthenticationChallenge(username) {
      return requestJson<RemoteAuthenticationChallengeOutput>(
        `${baseUrl}/api/auth/remote-authentication/challenge`,
        {
          method: 'POST',
          body: JSON.stringify({ username }),
        },
      );
    },
    completeRemoteAuthentication(input) {
      return requestJson<TrustedSessionResponse>(
        `${baseUrl}/api/auth/remote-authentication/complete`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
    },
    completeOnboarding(input) {
      return requestJson<TrustedSessionResponse>(`${baseUrl}/api/auth/onboarding/complete`, {
        method: 'POST',
        body: JSON.stringify({
          inviteToken: input.inviteToken,
          username: input.username,
          authSalt: input.authSalt,
          authVerifier: input.authVerifier,
          encryptedAccountBundle: input.encryptedAccountBundle,
          accountKeyWrapped: input.accountKeyWrapped,
          accountKitExportAcknowledged: true,
          zeroRecoveryAcknowledged: true,
          initialDevice: {
            deviceId: input.deviceId,
            deviceName: input.deviceName,
            platform: 'web',
          },
        }),
      });
    },
    bootstrapDevice(input) {
      return requestJson(`${baseUrl}/api/auth/devices/bootstrap`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    signOnboardingAccountKit(input) {
      return requestJson<AccountKitSignatureOutput>(`${baseUrl}/api/auth/onboarding/account-kit/sign`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    signAccountKit(input) {
      return requestJson<AccountKitSignatureOutput>(`${baseUrl}/api/auth/account-kit/sign`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    reissueAccountKit(input) {
      return requestJson<AccountKitSignatureOutput>(`${baseUrl}/api/auth/account-kit/reissue`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    verifyAccountKit(input) {
      return requestJson(`${baseUrl}/api/auth/account-kit/verify`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    recentReauth(input) {
      return requestJson<RecentReauthOutput>(`${baseUrl}/api/auth/recent-reauth`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    createAdminInvite(input) {
      return requestJson<AdminInviteCreateOutput>(
        `${baseUrl}/api/admin/invites`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
      );
    },
    listAdminInvites() {
      return requestJson<AdminInviteListOutput>(`${baseUrl}/api/admin/invites`);
    },
    revokeAdminInvite(inviteId) {
      return requestJson<AdminInviteRevokeOutput>(
        `${baseUrl}/api/admin/invites/${encodeURIComponent(inviteId)}/revoke`,
        withIdempotencyHeader({
          method: 'POST',
        }),
      );
    },
    listAdminUsers() {
      return requestJson<AdminUserListOutput>(`${baseUrl}/api/admin/users`);
    },
    listAdminAudit(limit = 250) {
      return requestJson<AdminAuditListOutput>(
        `${baseUrl}/api/admin/audit?limit=${encodeURIComponent(String(limit))}`,
      );
    },
    suspendAdminUser(userId) {
      return requestJson<AdminUserLifecycleMutationOutput>(
        `${baseUrl}/api/admin/users/${encodeURIComponent(userId)}/suspend`,
        withIdempotencyHeader({
          method: 'POST',
        }),
      );
    },
    reactivateAdminUser(userId) {
      return requestJson<AdminUserLifecycleMutationOutput>(
        `${baseUrl}/api/admin/users/${encodeURIComponent(userId)}/reactivate`,
        withIdempotencyHeader({
          method: 'POST',
        }),
      );
    },
    deprovisionAdminUser(userId) {
      return requestJson<AdminUserLifecycleMutationOutput>(
        `${baseUrl}/api/admin/users/${encodeURIComponent(userId)}/deprovision`,
        withIdempotencyHeader({
          method: 'POST',
        }),
      );
    },
  };
}
