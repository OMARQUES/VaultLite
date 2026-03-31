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
  DeviceListOutput,
  DeviceRevokeOutput,
  ExtensionLinkActionOutput,
  ExtensionLinkApproveInput,
  ExtensionLinkPendingListOutput,
  ExtensionLinkRejectInput,
  IconsDomainItemPutInput,
  IconsDomainItemPutOutput,
  IconsDomainBatchPutInput,
  IconsDomainBatchPutOutput,
  IconsDomainReindexChunkInput,
  IconsDomainReindexCommitInput,
  IconsDomainReindexOutput,
  IconsDomainReindexStartInput,
  IconsObjectTicketIssueInput,
  IconsObjectTicketIssueOutput,
  IconsStateOutput,
  SiteIconDiscoverBatchInput,
  SiteIconDiscoverBatchOutput,
  SiteIconManualActionOutput,
  SiteIconManualListOutput,
  SiteIconManualRemoveInput,
  SiteIconManualUpsertInput,
  SiteIconResolveBatchInput,
  SiteIconResolveBatchOutput,
  VaultFolderAssignmentUpsertInput,
  VaultFolderMutationOutput,
  VaultFoldersStateOutput,
  VaultFolderUpsertInput,
  OnboardingAccountKitSignInput,
  PasswordRotationCompleteOutput,
  PasswordRotationInput,
  PasswordGeneratorHistoryActionOutput,
  PasswordGeneratorHistoryListOutput,
  PasswordGeneratorHistoryUpsertInput,
  RealtimeConnectTokenOutput,
  RecentReauthInput,
  RecentReauthOutput,
  RemoteAuthenticationChallengeOutput,
  RuntimeMetadata,
  SessionPolicyOutput,
  SessionPolicyUpdateInput,
  SessionLockInput,
  SessionLockOutput,
  SessionRestoreResponse,
  TrustedSessionResponse,
  UnlockGrantActionOutput,
  UnlockGrantConsumeInput,
  UnlockGrantConsumeOutput,
  UnlockGrantPendingListOutput,
  UnlockGrantRequestInput,
  UnlockGrantRequestOutput,
  UnlockGrantStatusInput,
  UnlockGrantStatusOutput,
  WebBootstrapGrantConsumeInput,
  WebBootstrapGrantConsumeOutput,
} from '@vaultlite/contracts';
import { dispatchVaultUnauthorizedEvent } from './http-events';

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
  getRealtimeConnectToken(input?: { cursor?: number }): Promise<RealtimeConnectTokenOutput>;
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
  listDevices(): Promise<DeviceListOutput>;
  revokeDevice(deviceId: string): Promise<DeviceRevokeOutput>;
  completePasswordRotation(input: PasswordRotationInput): Promise<PasswordRotationCompleteOutput>;
  listExtensionLinkPending(): Promise<ExtensionLinkPendingListOutput>;
  approveExtensionLink(input: ExtensionLinkApproveInput): Promise<ExtensionLinkActionOutput>;
  rejectExtensionLink(input: ExtensionLinkRejectInput): Promise<ExtensionLinkActionOutput>;
  getSessionPolicy(): Promise<SessionPolicyOutput>;
  updateSessionPolicy(input: SessionPolicyUpdateInput): Promise<SessionPolicyOutput>;
  lockSession(input: SessionLockInput): Promise<SessionLockOutput>;
  requestUnlockGrant(input: UnlockGrantRequestInput): Promise<UnlockGrantRequestOutput>;
  listPendingUnlockGrants(): Promise<UnlockGrantPendingListOutput>;
  approveUnlockGrant(input: {
    requestId: string;
    approvalNonce: string;
    unlockAccountKey?: string;
  }): Promise<UnlockGrantActionOutput>;
  rejectUnlockGrant(input: { requestId: string; rejectionReasonCode?: string }): Promise<UnlockGrantActionOutput>;
  getUnlockGrantStatus(input: UnlockGrantStatusInput): Promise<UnlockGrantStatusOutput>;
  consumeUnlockGrant(input: UnlockGrantConsumeInput): Promise<UnlockGrantConsumeOutput>;
  consumeWebBootstrapGrant(input: WebBootstrapGrantConsumeInput): Promise<WebBootstrapGrantConsumeOutput>;
  getIconsState(input?: { domains?: string[]; etag?: string }): Promise<
    | { status: 'ok'; payload: IconsStateOutput; etag: string | null }
    | { status: 'not_modified'; etag: string | null }
  >;
  putIconDomainsItem(input: IconsDomainItemPutInput): Promise<IconsDomainItemPutOutput>;
  putIconDomainsBatch(input: IconsDomainBatchPutInput): Promise<IconsDomainBatchPutOutput>;
  startIconDomainsReindex(input: IconsDomainReindexStartInput): Promise<IconsDomainReindexOutput>;
  sendIconDomainsReindexChunk(input: IconsDomainReindexChunkInput): Promise<IconsDomainReindexOutput>;
  commitIconDomainsReindex(input: IconsDomainReindexCommitInput): Promise<IconsDomainReindexOutput>;
  issueIconObjectTickets(input: IconsObjectTicketIssueInput): Promise<IconsObjectTicketIssueOutput>;
  resolveSiteIcons(input: SiteIconResolveBatchInput): Promise<SiteIconResolveBatchOutput>;
  discoverSiteIcons(input: SiteIconDiscoverBatchInput): Promise<SiteIconDiscoverBatchOutput>;
  listManualSiteIcons(input?: { etag?: string }): Promise<
    | { status: 'ok'; payload: SiteIconManualListOutput; etag: string | null }
    | { status: 'not_modified'; etag: string | null }
  >;
  upsertManualSiteIcon(input: SiteIconManualUpsertInput): Promise<SiteIconManualActionOutput>;
  removeManualSiteIcon(input: SiteIconManualRemoveInput): Promise<SiteIconManualActionOutput>;
  listPasswordGeneratorHistory(): Promise<PasswordGeneratorHistoryListOutput>;
  upsertPasswordGeneratorHistoryEntry(
    input: PasswordGeneratorHistoryUpsertInput,
  ): Promise<PasswordGeneratorHistoryActionOutput>;
  listVaultFoldersState(input?: { etag?: string }): Promise<
    | { status: 'ok'; payload: VaultFoldersStateOutput; etag: string | null }
    | { status: 'not_modified'; etag: string | null }
  >;
  upsertVaultFolder(input: VaultFolderUpsertInput): Promise<VaultFolderMutationOutput>;
  assignVaultFolder(input: VaultFolderAssignmentUpsertInput): Promise<VaultFolderMutationOutput>;
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: {
    emitUnauthorizedEvent?: boolean;
  },
): Promise<T> {
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
    if (response.status === 401 && options?.emitUnauthorizedEvent) {
      dispatchVaultUnauthorizedEvent({
        source: 'auth',
        status: 401,
        code: responseCode || null,
        message: responseMessage || null,
        url: typeof input === 'string' ? input : input.toString(),
      });
    }
    throw new Error(
      details
        ? `Request failed with status ${response.status} (${details})`
        : `Request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

function resolveFetchUrl(baseUrl: string, path: string): string {
  const target = `${baseUrl}${path}`;
  if (/^https?:\/\//i.test(target)) {
    return target;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(target, window.location.origin).toString();
  }
  return target;
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
        { emitUnauthorizedEvent: true },
      );
    },
    bootstrapCheckpointComplete(input) {
      return requestJson<BootstrapCheckpointCompleteOutput>(
        `${baseUrl}/api/bootstrap/checkpoint/complete`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    getRuntimeMetadata() {
      return requestJson<RuntimeMetadata>(`${baseUrl}/api/runtime/metadata`);
    },
    restoreSession() {
      return requestJson<SessionRestoreResponse>(`${baseUrl}/api/auth/session/restore`);
    },
    getRealtimeConnectToken(input) {
      return requestJson<RealtimeConnectTokenOutput>(
        `${baseUrl}/api/realtime/connect-token`,
        {
          method: 'POST',
          body: JSON.stringify({
            cursor: typeof input?.cursor === 'number' ? input.cursor : 0,
          }),
        },
        { emitUnauthorizedEvent: true },
      );
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
      }, { emitUnauthorizedEvent: true });
    },
    reissueAccountKit(input) {
      return requestJson<AccountKitSignatureOutput>(`${baseUrl}/api/auth/account-kit/reissue`, {
        method: 'POST',
        body: JSON.stringify(input),
      }, { emitUnauthorizedEvent: true });
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
      }, { emitUnauthorizedEvent: true });
    },
    createAdminInvite(input) {
      return requestJson<AdminInviteCreateOutput>(
        `${baseUrl}/api/admin/invites`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    listAdminInvites() {
      return requestJson<AdminInviteListOutput>(`${baseUrl}/api/admin/invites`, undefined, {
        emitUnauthorizedEvent: true,
      });
    },
    revokeAdminInvite(inviteId) {
      return requestJson<AdminInviteRevokeOutput>(
        `${baseUrl}/api/admin/invites/${encodeURIComponent(inviteId)}/revoke`,
        withIdempotencyHeader({
          method: 'POST',
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    listAdminUsers() {
      return requestJson<AdminUserListOutput>(`${baseUrl}/api/admin/users`, undefined, {
        emitUnauthorizedEvent: true,
      });
    },
    listAdminAudit(limit = 250) {
      return requestJson<AdminAuditListOutput>(
        `${baseUrl}/api/admin/audit?limit=${encodeURIComponent(String(limit))}`,
        undefined,
        { emitUnauthorizedEvent: true },
      );
    },
    suspendAdminUser(userId) {
      return requestJson<AdminUserLifecycleMutationOutput>(
        `${baseUrl}/api/admin/users/${encodeURIComponent(userId)}/suspend`,
        withIdempotencyHeader({
          method: 'POST',
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    reactivateAdminUser(userId) {
      return requestJson<AdminUserLifecycleMutationOutput>(
        `${baseUrl}/api/admin/users/${encodeURIComponent(userId)}/reactivate`,
        withIdempotencyHeader({
          method: 'POST',
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    deprovisionAdminUser(userId) {
      return requestJson<AdminUserLifecycleMutationOutput>(
        `${baseUrl}/api/admin/users/${encodeURIComponent(userId)}/deprovision`,
        withIdempotencyHeader({
          method: 'POST',
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    listDevices() {
      return requestJson<DeviceListOutput>(`${baseUrl}/api/auth/devices`, undefined, {
        emitUnauthorizedEvent: true,
      });
    },
    revokeDevice(deviceId) {
      return requestJson<DeviceRevokeOutput>(
        `${baseUrl}/api/auth/devices/${encodeURIComponent(deviceId)}/revoke`,
        withIdempotencyHeader({
          method: 'POST',
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    completePasswordRotation(input) {
      return requestJson<PasswordRotationCompleteOutput>(
        `${baseUrl}/api/auth/password-rotation/complete`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    listExtensionLinkPending() {
      return requestJson<ExtensionLinkPendingListOutput>(
        `${baseUrl}/api/auth/extension/link/pending`,
        undefined,
        { emitUnauthorizedEvent: true },
      );
    },
    approveExtensionLink(input) {
      return requestJson<ExtensionLinkActionOutput>(
        `${baseUrl}/api/auth/extension/link/approve`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    rejectExtensionLink(input) {
      return requestJson<ExtensionLinkActionOutput>(
        `${baseUrl}/api/auth/extension/link/reject`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    getSessionPolicy() {
      return requestJson<SessionPolicyOutput>(`${baseUrl}/api/auth/session-policy`, undefined, {
        emitUnauthorizedEvent: true,
      });
    },
    updateSessionPolicy(input) {
      return requestJson<SessionPolicyOutput>(
        `${baseUrl}/api/auth/session-policy`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    lockSession(input) {
      return requestJson<SessionLockOutput>(
        `${baseUrl}/api/auth/session/lock`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    requestUnlockGrant(input) {
      return requestJson<UnlockGrantRequestOutput>(
        `${baseUrl}/api/auth/unlock-grant/request`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    consumeWebBootstrapGrant(input) {
      return requestJson<WebBootstrapGrantConsumeOutput>(
        `${baseUrl}/api/auth/web-bootstrap-grant/consume`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    listPendingUnlockGrants() {
      return requestJson<UnlockGrantPendingListOutput>(
        `${baseUrl}/api/auth/unlock-grant/pending`,
        undefined,
        { emitUnauthorizedEvent: true },
      );
    },
    approveUnlockGrant(input) {
      return requestJson<UnlockGrantActionOutput>(
        `${baseUrl}/api/auth/unlock-grant/approve`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    rejectUnlockGrant(input) {
      return requestJson<UnlockGrantActionOutput>(
        `${baseUrl}/api/auth/unlock-grant/reject`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    getUnlockGrantStatus(input) {
      return requestJson<UnlockGrantStatusOutput>(
        `${baseUrl}/api/auth/unlock-grant/status`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    consumeUnlockGrant(input) {
      return requestJson<UnlockGrantConsumeOutput>(
        `${baseUrl}/api/auth/unlock-grant/consume`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    async getIconsState(input) {
      const query = new URLSearchParams();
      if (Array.isArray(input?.domains) && input.domains.length > 0) {
        query.set('domains', input.domains.join(','));
      }
      const response = await fetch(
        resolveFetchUrl(baseUrl, `/api/icons/state${query.size > 0 ? `?${query.toString()}` : ''}`),
        {
          credentials: 'include',
          method: 'GET',
          headers: {
            ...(input?.etag ? { 'if-none-match': input.etag } : {}),
          },
        },
      );
      if (response.status === 304) {
        return {
          status: 'not_modified' as const,
          etag: response.headers.get('etag'),
        };
      }
      if (!response.ok) {
        let responseCode = '';
        try {
          const payload = (await response.clone().json()) as { code?: string };
          responseCode = payload.code ?? '';
        } catch {
          // noop
        }
        if (response.status === 401) {
          dispatchVaultUnauthorizedEvent({
            source: 'auth',
            status: 401,
            code: responseCode || null,
            message: null,
            url: `${baseUrl}/api/icons/state`,
          });
        }
        throw new Error(responseCode || `request_failed_${response.status}`);
      }
      return {
        status: 'ok' as const,
        payload: (await response.json()) as IconsStateOutput,
        etag: response.headers.get('etag'),
      };
    },
    putIconDomainsItem(input) {
      return requestJson<IconsDomainItemPutOutput>(
        `${baseUrl}/api/icons/domains/item`,
        {
          method: 'PUT',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    putIconDomainsBatch(input) {
      return requestJson<IconsDomainBatchPutOutput>(
        `${baseUrl}/api/icons/domains/batch`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    startIconDomainsReindex(input) {
      return requestJson<IconsDomainReindexOutput>(
        `${baseUrl}/api/icons/domains/reindex/start`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    sendIconDomainsReindexChunk(input) {
      return requestJson<IconsDomainReindexOutput>(
        `${baseUrl}/api/icons/domains/reindex/chunk`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    commitIconDomainsReindex(input) {
      return requestJson<IconsDomainReindexOutput>(
        `${baseUrl}/api/icons/domains/reindex/commit`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    issueIconObjectTickets(input) {
      return requestJson<IconsObjectTicketIssueOutput>(
        `${baseUrl}/api/icons/object-tickets`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    resolveSiteIcons(input) {
      return requestJson<SiteIconResolveBatchOutput>(
        `${baseUrl}/api/icons/resolve`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    discoverSiteIcons(input) {
      return requestJson<SiteIconDiscoverBatchOutput>(
        `${baseUrl}/api/icons/discover`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    async listManualSiteIcons(input) {
      const response = await fetch(resolveFetchUrl(baseUrl, '/api/icons/manual'), {
        credentials: 'include',
        method: 'GET',
        headers: {
          ...(input?.etag ? { 'if-none-match': input.etag } : {}),
        },
      });
      if (response.status === 304) {
        return {
          status: 'not_modified' as const,
          etag: response.headers.get('etag'),
        };
      }
      if (!response.ok) {
        let responseCode = '';
        try {
          const payload = (await response.clone().json()) as { code?: string };
          responseCode = payload.code ?? '';
        } catch {
          // noop
        }
        if (response.status === 401) {
          dispatchVaultUnauthorizedEvent({
            source: 'auth',
            status: 401,
            code: responseCode || null,
            message: null,
            url: `${baseUrl}/api/icons/manual`,
          });
        }
        throw new Error(responseCode || `request_failed_${response.status}`);
      }
      return {
        status: 'ok' as const,
        payload: (await response.json()) as SiteIconManualListOutput,
        etag: response.headers.get('etag'),
      };
    },
    upsertManualSiteIcon(input) {
      return requestJson<SiteIconManualActionOutput>(
        `${baseUrl}/api/icons/manual/upsert`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    removeManualSiteIcon(input) {
      return requestJson<SiteIconManualActionOutput>(
        `${baseUrl}/api/icons/manual/remove`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
    listPasswordGeneratorHistory() {
      return requestJson<PasswordGeneratorHistoryListOutput>(
        `${baseUrl}/api/password-generator/history`,
        undefined,
        { emitUnauthorizedEvent: true },
      );
    },
    async listVaultFoldersState(input) {
      const response = await fetch(resolveFetchUrl(baseUrl, '/api/vault/folders/state'), {
        credentials: 'include',
        headers: {
          ...(input?.etag ? { 'if-none-match': input.etag } : {}),
        },
      });
      if (response.status === 304) {
        return {
          status: 'not_modified' as const,
          etag: response.headers.get('etag'),
        };
      }
      if (!response.ok) {
        throw new Error(`request_failed_${response.status}`);
      }
      return {
        status: 'ok' as const,
        payload: (await response.json()) as VaultFoldersStateOutput,
        etag: response.headers.get('etag'),
      };
    },
    upsertVaultFolder(input) {
      return requestJson<VaultFolderMutationOutput>(
        `${baseUrl}/api/vault/folders/upsert`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    assignVaultFolder(input) {
      return requestJson<VaultFolderMutationOutput>(
        `${baseUrl}/api/vault/folders/assign`,
        withIdempotencyHeader({
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { emitUnauthorizedEvent: true },
      );
    },
    upsertPasswordGeneratorHistoryEntry(input) {
      return requestJson<PasswordGeneratorHistoryActionOutput>(
        `${baseUrl}/api/password-generator/history/upsert`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { emitUnauthorizedEvent: true },
      );
    },
  };
}
