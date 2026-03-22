import type {
  AttachmentLifecycleState,
  BootstrapDeploymentState,
  DeviceState,
  TrustedDevice,
  UserRole,
  UserLifecycleState,
  VaultItemTombstoneRecord,
  VaultItemType,
} from '@vaultlite/domain';

export type { VaultItemTombstoneRecord } from '@vaultlite/domain';

export interface InviteRecord {
  inviteId: string;
  tokenHash: string;
  tokenPreview: string;
  createdByUserId: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByUserId: string | null;
  revokedAt: string | null;
  revokedByUserId: string | null;
  createdAt: string;
}

export interface UserAccountRecord {
  userId: string;
  username: string;
  role: UserRole;
  authSalt: string;
  authVerifier: string;
  encryptedAccountBundle: string;
  accountKeyWrapped: string;
  bundleVersion: number;
  lifecycleState: UserLifecycleState;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRecord extends TrustedDevice {
  userId: string;
  deviceState: DeviceState;
  revokedAt: string | null;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  deviceId: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
  recentReauthAt: string | null;
  revokedAt: string | null;
  rotatedFromSessionId: string | null;
}

export interface SessionPolicyRecord {
  userId: string;
  unlockIdleTimeoutMs: number;
  updatedAt: string;
}

export interface ExtensionPairingRecord {
  pairingId: string;
  codeHash: string;
  userId: string;
  deploymentFingerprint: string;
  serverOrigin: string;
  authSalt: string;
  encryptedAccountBundle: string;
  accountKeyWrapped: string;
  localUnlockEnvelope: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByDeviceId: string | null;
}

export type ExtensionLinkRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'consumed';

export interface ExtensionLinkRequestRecord {
  requestId: string;
  userId: string | null;
  deploymentFingerprint: string;
  serverOrigin: string;
  requestPublicKey: string;
  clientNonce: string;
  shortCode: string;
  fingerprintPhrase: string;
  deviceNameHint: string | null;
  authSalt: string | null;
  encryptedAccountBundle: string | null;
  accountKeyWrapped: string | null;
  localUnlockEnvelope: string | null;
  status: ExtensionLinkRequestStatus;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  approvedByDeviceId: string | null;
  rejectedAt: string | null;
  rejectionReasonCode: string | null;
  consumedAt: string | null;
  consumedByDeviceId: string | null;
}

export interface SurfaceLinkRecord {
  userId: string;
  webDeviceId: string;
  extensionDeviceId: string;
  createdAt: string;
  updatedAt: string;
}

export type UnlockGrantStatus = 'pending' | 'approved' | 'rejected' | 'consumed';

export type UnlockGrantSurface = 'web' | 'extension';

export interface UnlockGrantRecord {
  requestId: string;
  userId: string;
  deploymentFingerprint: string;
  serverOrigin: string;
  requesterSurface: UnlockGrantSurface;
  requesterDeviceId: string;
  requesterPublicKey: string;
  requesterClientNonce: string;
  approverSurface: UnlockGrantSurface;
  approverDeviceId: string;
  status: UnlockGrantStatus;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  approvedByDeviceId: string | null;
  unlockAccountKey: string | null;
  rejectedAt: string | null;
  rejectionReasonCode: string | null;
  consumedAt: string | null;
  consumedByDeviceId: string | null;
}

export interface ExtensionSessionRecoverSecretRecord {
  userId: string;
  deviceId: string;
  secretHash: string;
  updatedAt: string;
}

export interface SiteIconCacheRecord {
  domain: string;
  dataUrl: string;
  sourceUrl: string | null;
  updatedAt: string;
  fetchedAt: string;
}

export interface ManualSiteIconOverrideRecord {
  userId: string;
  domain: string;
  dataUrl: string;
  source: 'url' | 'file';
  updatedAt: string;
}

export interface AuthRateLimitRecord {
  key: string;
  attemptCount: number;
  windowStartedAt: string;
  windowEndsAt: string;
}

export interface AttachmentBlobRecord {
  key: string;
  ownerUserId: string;
  itemId: string | null;
  fileName: string;
  lifecycleState: AttachmentLifecycleState;
  envelope: string;
  contentType: string;
  size: number;
  idempotencyKey: string | null;
  uploadToken: string | null;
  expiresAt: string | null;
  uploadedAt: string | null;
  attachedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItemRecord {
  itemId: string;
  ownerUserId: string;
  itemType: VaultItemType;
  revision: number;
  encryptedPayload: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentStateRecord {
  bootstrapState: BootstrapDeploymentState;
  ownerUserId: string | null;
  ownerCreatedAt: string | null;
  bootstrapPublicClosedAt: string | null;
  initialCheckpointCompletedAt: string | null;
  initializedAt: string | null;
  checkpointDownloadAttemptCount: number;
  checkpointLastDownloadAt: string | null;
  checkpointLastDownloadRequestId: string | null;
}

export interface IdempotencyRecord {
  scope: string;
  payloadHash: string;
  statusCode: number;
  responseBody: string;
  result: 'success_changed' | 'success_no_op' | 'conflict' | 'denied';
  reasonCode: string | null;
  resourceRefs: string;
  auditEventId: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface AuditEventRecord {
  eventId: string;
  eventType: string;
  actorUserId: string | null;
  targetType: string;
  targetId: string | null;
  result: 'success_changed' | 'success_no_op' | 'conflict' | 'denied';
  reasonCode: string | null;
  requestId: string | null;
  createdAt: string;
  ipHash: string | null;
  userAgentHash: string | null;
}

export interface InviteRepository {
  create(record: InviteRecord): Promise<InviteRecord>;
  findById(inviteId: string): Promise<InviteRecord | null>;
  list(): Promise<InviteRecord[]>;
  findUsableByTokenHash(tokenHash: string, nowIso: string): Promise<InviteRecord | null>;
  markConsumed(input: {
    inviteId: string;
    consumedByUserId: string;
    consumedAtIso: string;
  }): Promise<void>;
  markRevoked(input: {
    inviteId: string;
    revokedByUserId: string;
    revokedAtIso: string;
  }): Promise<void>;
}

export interface UserAccountRepository {
  create(record: UserAccountRecord): Promise<UserAccountRecord>;
  list(): Promise<UserAccountRecord[]>;
  findByUsername(username: string): Promise<UserAccountRecord | null>;
  findByUserId(userId: string): Promise<UserAccountRecord | null>;
  countActiveOwners(): Promise<number>;
  updateLifecycle(userId: string, lifecycleState: UserLifecycleState, updatedAtIso: string): Promise<void>;
  replaceAuthBundle(input: {
    userId: string;
    authSalt: string;
    authVerifier: string;
    encryptedAccountBundle: string;
    accountKeyWrapped: string;
    expectedBundleVersion: number;
    updatedAtIso: string;
  }): Promise<UserAccountRecord>;
}

export interface DeviceRepository {
  register(record: DeviceRecord): Promise<DeviceRecord>;
  listByUserId(userId: string): Promise<DeviceRecord[]>;
  findById(deviceId: string): Promise<DeviceRecord | null>;
  countActiveByUserId(userId: string): Promise<number>;
  setDeviceStateByUserId(
    userId: string,
    deviceState: DeviceState,
    changedAtIso: string,
  ): Promise<void>;
  revokeByUserId(userId: string, revokedAtIso: string): Promise<void>;
  revokeByDeviceId(deviceId: string, revokedAtIso: string): Promise<void>;
}

export interface SessionRepository {
  create(record: SessionRecord): Promise<SessionRecord>;
  findBySessionId(sessionId: string): Promise<SessionRecord | null>;
  listByUserId(userId: string): Promise<SessionRecord[]>;
  updateRecentReauth(sessionId: string, recentReauthAtIso: string): Promise<void>;
  revoke(sessionId: string, revokedAtIso: string): Promise<void>;
  revokeByUserId(userId: string, revokedAtIso: string): Promise<void>;
  revokeByDeviceId(deviceId: string, revokedAtIso: string): Promise<void>;
}

export interface SessionPolicyRepository {
  findByUserId(userId: string): Promise<SessionPolicyRecord | null>;
  upsert(record: SessionPolicyRecord): Promise<SessionPolicyRecord>;
}

export interface ExtensionPairingRepository {
  create(record: ExtensionPairingRecord): Promise<ExtensionPairingRecord>;
  findByCodeHashAny(codeHash: string): Promise<ExtensionPairingRecord | null>;
  findByCodeHash(codeHash: string, nowIso: string): Promise<ExtensionPairingRecord | null>;
  consume(input: {
    pairingId: string;
    consumedAt: string;
    consumedByDeviceId: string;
  }): Promise<ExtensionPairingRecord | null>;
}

export interface ExtensionLinkRequestRepository {
  create(record: ExtensionLinkRequestRecord): Promise<ExtensionLinkRequestRecord>;
  findByRequestId(requestId: string): Promise<ExtensionLinkRequestRecord | null>;
  listRecent(nowIso: string, limit: number): Promise<ExtensionLinkRequestRecord[]>;
  approve(input: {
    requestId: string;
    expectedStatus: ExtensionLinkRequestStatus;
    approvedAt: string;
    approvedByUserId: string;
    approvedByDeviceId: string;
    userId: string;
    authSalt: string;
    encryptedAccountBundle: string;
    accountKeyWrapped: string;
    localUnlockEnvelope: string;
  }): Promise<ExtensionLinkRequestRecord | null>;
  reject(input: {
    requestId: string;
    expectedStatus: ExtensionLinkRequestStatus;
    rejectedAt: string;
    reasonCode: string | null;
  }): Promise<ExtensionLinkRequestRecord | null>;
  consume(input: {
    requestId: string;
    expectedStatus: ExtensionLinkRequestStatus;
    consumedAt: string;
    consumedByDeviceId: string;
  }): Promise<ExtensionLinkRequestRecord | null>;
}

export interface SurfaceLinkRepository {
  upsert(record: SurfaceLinkRecord): Promise<SurfaceLinkRecord>;
  findByWebDeviceId(userId: string, webDeviceId: string): Promise<SurfaceLinkRecord | null>;
  findByExtensionDeviceId(userId: string, extensionDeviceId: string): Promise<SurfaceLinkRecord | null>;
  removeByDeviceId(userId: string, deviceId: string): Promise<void>;
}

export interface UnlockGrantRepository {
  create(record: UnlockGrantRecord): Promise<UnlockGrantRecord>;
  findByRequestId(requestId: string): Promise<UnlockGrantRecord | null>;
  listPendingForApprover(
    userId: string,
    approverSurface: UnlockGrantSurface,
    approverDeviceId: string,
    nowIso: string,
    limit: number,
  ): Promise<UnlockGrantRecord[]>;
  approve(input: {
    requestId: string;
    expectedStatus: UnlockGrantStatus;
    approvedAt: string;
    approvedByDeviceId: string;
    unlockAccountKey: string | null;
  }): Promise<UnlockGrantRecord | null>;
  reject(input: {
    requestId: string;
    expectedStatus: UnlockGrantStatus;
    rejectedAt: string;
    reasonCode: string | null;
  }): Promise<UnlockGrantRecord | null>;
  consume(input: {
    requestId: string;
    expectedStatus: UnlockGrantStatus;
    consumedAt: string;
    consumedByDeviceId: string;
  }): Promise<UnlockGrantRecord | null>;
}

export interface ExtensionSessionRecoverSecretRepository {
  findByDeviceId(deviceId: string): Promise<ExtensionSessionRecoverSecretRecord | null>;
  upsert(record: ExtensionSessionRecoverSecretRecord): Promise<ExtensionSessionRecoverSecretRecord>;
  removeByDeviceId(deviceId: string): Promise<void>;
  removeByUserId(userId: string): Promise<void>;
}

export interface AuthRateLimitRepository {
  increment(input: {
    key: string;
    nowIso: string;
    windowSeconds: number;
  }): Promise<AuthRateLimitRecord>;
  get(key: string): Promise<AuthRateLimitRecord | null>;
  reset(key: string): Promise<void>;
}

export interface SiteIconCacheRepository {
  listByDomains(domains: string[]): Promise<SiteIconCacheRecord[]>;
  findByDomain(domain: string): Promise<SiteIconCacheRecord | null>;
  upsert(record: SiteIconCacheRecord): Promise<SiteIconCacheRecord>;
}

export interface ManualSiteIconOverrideRepository {
  listByUserId(userId: string): Promise<ManualSiteIconOverrideRecord[]>;
  listByUserIdAndDomains(userId: string, domains: string[]): Promise<ManualSiteIconOverrideRecord[]>;
  findByUserIdAndDomain(userId: string, domain: string): Promise<ManualSiteIconOverrideRecord | null>;
  upsert(record: ManualSiteIconOverrideRecord): Promise<ManualSiteIconOverrideRecord>;
  remove(userId: string, domain: string): Promise<boolean>;
}

export interface AttachmentBlobRepository {
  put(record: AttachmentBlobRecord): Promise<AttachmentBlobRecord>;
  get(key: string): Promise<AttachmentBlobRecord | null>;
  listByOwnerAndItem(ownerUserId: string, itemId: string): Promise<AttachmentBlobRecord[]>;
  findByOwnerItemAndIdempotency(
    ownerUserId: string,
    itemId: string,
    idempotencyKey: string,
  ): Promise<AttachmentBlobRecord | null>;
  markUploaded(input: {
    key: string;
    ownerUserId: string;
    envelope: string;
    updatedAt: string;
    uploadedAt: string;
  }): Promise<AttachmentBlobRecord>;
  markAttached(input: {
    key: string;
    ownerUserId: string;
    itemId: string;
    updatedAt: string;
    attachedAt: string;
  }): Promise<AttachmentBlobRecord>;
  delete(key: string): Promise<void>;
}

export interface DeploymentStateRepository {
  get(): Promise<DeploymentStateRecord>;
  transitionToOwnerCreatedCheckpointPending(input: {
    ownerUserId: string;
    ownerCreatedAt: string;
    bootstrapPublicClosedAt: string;
  }): Promise<{ changed: boolean; state: DeploymentStateRecord }>;
  recordCheckpointDownloadAttempt(input: {
    ownerUserId: string;
    requestId: string;
    attemptedAt: string;
  }): Promise<DeploymentStateRecord>;
  completeInitialization(input: {
    completedAt: string;
  }): Promise<{ changed: boolean; state: DeploymentStateRecord }>;
}

export interface IdempotencyRepository {
  get(scope: string, nowIso: string): Promise<IdempotencyRecord | null>;
  put(record: IdempotencyRecord): Promise<IdempotencyRecord>;
}

export interface AuditEventRepository {
  create(record: AuditEventRecord): Promise<AuditEventRecord>;
  listRecent(limit?: number): Promise<AuditEventRecord[]>;
}

export interface VaultItemRepository {
  listByOwnerUserId(ownerUserId: string): Promise<VaultItemRecord[]>;
  listTombstonesByOwnerUserId(ownerUserId: string): Promise<VaultItemTombstoneRecord[]>;
  findByItemId(itemId: string, ownerUserId: string): Promise<VaultItemRecord | null>;
  findTombstoneByItemId(itemId: string, ownerUserId: string): Promise<VaultItemTombstoneRecord | null>;
  create(record: VaultItemRecord): Promise<VaultItemRecord>;
  update(input: {
    itemId: string;
    ownerUserId: string;
    itemType: VaultItemType;
    encryptedPayload: string;
    expectedRevision: number;
    updatedAt: string;
  }): Promise<VaultItemRecord>;
  delete(itemId: string, ownerUserId: string, deletedAtIso: string): Promise<boolean>;
  restore(input: {
    itemId: string;
    ownerUserId: string;
    restoredAtIso: string;
    restoreRetentionDays: number;
  }): Promise<{
    status: 'success_changed' | 'success_no_op' | 'restore_window_expired' | 'not_found';
    item: VaultItemRecord | null;
  }>;
}

export interface CompleteOnboardingAtomicInput {
  nowIso: string;
  inviteTokenHash: string;
  user: UserAccountRecord;
  device: DeviceRecord;
  session: SessionRecord;
}

export interface CompleteOnboardingAtomicResult {
  user: UserAccountRecord;
  device: DeviceRecord;
  session: SessionRecord;
}

export interface RevokeDeviceAndSessionsAtomicInput {
  userId: string;
  deviceId: string;
  revokedAtIso: string;
}

export interface RotatePasswordAtomicInput {
  userId: string;
  currentAuthVerifier: string;
  nextAuthSalt: string;
  nextAuthVerifier: string;
  nextEncryptedAccountBundle: string;
  nextAccountKeyWrapped: string;
  expectedBundleVersion: number;
  currentSessionId: string;
  newSession: SessionRecord;
  updatedAtIso: string;
  revokedAtIso: string;
}

export interface RotatePasswordAtomicResult {
  user: UserAccountRecord;
  session: SessionRecord;
}

export interface VaultLiteStorage {
  deploymentState: DeploymentStateRepository;
  invites: InviteRepository;
  users: UserAccountRepository;
  devices: DeviceRepository;
  sessions: SessionRepository;
  sessionPolicies: SessionPolicyRepository;
  extensionPairings: ExtensionPairingRepository;
  extensionLinkRequests: ExtensionLinkRequestRepository;
  surfaceLinks: SurfaceLinkRepository;
  unlockGrants: UnlockGrantRepository;
  extensionSessionRecoverSecrets: ExtensionSessionRecoverSecretRepository;
  siteIconCache: SiteIconCacheRepository;
  manualSiteIconOverrides: ManualSiteIconOverrideRepository;
  authRateLimits: AuthRateLimitRepository;
  idempotency: IdempotencyRepository;
  auditEvents: AuditEventRepository;
  attachmentBlobs: AttachmentBlobRepository;
  vaultItems: VaultItemRepository;
  completeOnboardingAtomic(input: CompleteOnboardingAtomicInput): Promise<CompleteOnboardingAtomicResult>;
  revokeDeviceAndSessionsAtomic(input: RevokeDeviceAndSessionsAtomicInput): Promise<void>;
  rotatePasswordAtomic(input: RotatePasswordAtomicInput): Promise<RotatePasswordAtomicResult>;
}

function sortDevices(records: DeviceRecord[]): DeviceRecord[] {
  return [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function createInMemoryVaultLiteStorage(input: {
  failOnCompleteOnboardingAtomicStep?: 'user' | 'invite' | 'device' | 'session';
} = {}): VaultLiteStorage {
  const invites = new Map<string, InviteRecord>();
  const usersById = new Map<string, UserAccountRecord>();
  const usersByUsername = new Map<string, UserAccountRecord>();
  const devices = new Map<string, DeviceRecord>();
  const sessions = new Map<string, SessionRecord>();
  const sessionPolicies = new Map<string, SessionPolicyRecord>();
  const extensionPairings = new Map<string, ExtensionPairingRecord>();
  const extensionLinkRequests = new Map<string, ExtensionLinkRequestRecord>();
  const surfaceLinksByPair = new Map<string, SurfaceLinkRecord>();
  const unlockGrants = new Map<string, UnlockGrantRecord>();
  const extensionSessionRecoverSecrets = new Map<string, ExtensionSessionRecoverSecretRecord>();
  const siteIconCache = new Map<string, SiteIconCacheRecord>();
  const manualSiteIconOverrides = new Map<string, ManualSiteIconOverrideRecord>();
  const rateLimits = new Map<string, AuthRateLimitRecord>();
  const attachmentBlobs = new Map<string, AttachmentBlobRecord>();
  const vaultItems = new Map<string, VaultItemRecord>();
  const vaultItemTombstones = new Map<string, VaultItemTombstoneRecord>();
  const idempotencyRecords = new Map<string, IdempotencyRecord>();
  const auditEvents = new Map<string, AuditEventRecord>();
  let deploymentState: DeploymentStateRecord = {
    bootstrapState: 'UNINITIALIZED_PUBLIC_OPEN',
    ownerUserId: null,
    ownerCreatedAt: null,
    bootstrapPublicClosedAt: null,
    initialCheckpointCompletedAt: null,
    initializedAt: null,
    checkpointDownloadAttemptCount: 0,
    checkpointLastDownloadAt: null,
    checkpointLastDownloadRequestId: null,
  };

  return {
    deploymentState: {
      async get() {
        return { ...deploymentState };
      },
      async transitionToOwnerCreatedCheckpointPending(inputRecord) {
        if (deploymentState.bootstrapState !== 'UNINITIALIZED_PUBLIC_OPEN') {
          return { changed: false, state: { ...deploymentState } };
        }

        deploymentState = {
          ...deploymentState,
          bootstrapState: 'OWNER_CREATED_CHECKPOINT_PENDING',
          ownerUserId: inputRecord.ownerUserId,
          ownerCreatedAt: inputRecord.ownerCreatedAt,
          bootstrapPublicClosedAt: inputRecord.bootstrapPublicClosedAt,
        };
        return { changed: true, state: { ...deploymentState } };
      },
      async recordCheckpointDownloadAttempt(inputRecord) {
        if (
          deploymentState.bootstrapState !== 'OWNER_CREATED_CHECKPOINT_PENDING' ||
          deploymentState.ownerUserId !== inputRecord.ownerUserId
        ) {
          return { ...deploymentState };
        }

        deploymentState = {
          ...deploymentState,
          checkpointDownloadAttemptCount: deploymentState.checkpointDownloadAttemptCount + 1,
          checkpointLastDownloadAt: inputRecord.attemptedAt,
          checkpointLastDownloadRequestId: inputRecord.requestId,
        };
        return { ...deploymentState };
      },
      async completeInitialization(inputRecord) {
        if (deploymentState.bootstrapState === 'INITIALIZED') {
          return { changed: false, state: { ...deploymentState } };
        }
        if (deploymentState.bootstrapState !== 'OWNER_CREATED_CHECKPOINT_PENDING') {
          return { changed: false, state: { ...deploymentState } };
        }

        deploymentState = {
          ...deploymentState,
          bootstrapState: 'INITIALIZED',
          initialCheckpointCompletedAt: inputRecord.completedAt,
          initializedAt: inputRecord.completedAt,
        };
        return { changed: true, state: { ...deploymentState } };
      },
    },
    invites: {
      async create(record) {
        invites.set(record.inviteId, { ...record });
        return { ...record };
      },
      async findById(inviteId) {
        const invite = invites.get(inviteId);
        return invite ? { ...invite } : null;
      },
      async list() {
        return Array.from(invites.values())
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map((record) => ({ ...record }));
      },
      async findUsableByTokenHash(tokenHash, nowIso) {
        const now = nowIso;
        for (const invite of invites.values()) {
          if (
            invite.tokenHash === tokenHash &&
            invite.consumedAt === null &&
            invite.revokedAt === null &&
            invite.expiresAt > now
          ) {
            return { ...invite };
          }
        }

        return null;
      },
      async markConsumed(inputRecord) {
        const invite = invites.get(inputRecord.inviteId);
        if (!invite) {
          return;
        }

        invites.set(inputRecord.inviteId, {
          ...invite,
          consumedAt: inputRecord.consumedAtIso,
          consumedByUserId: inputRecord.consumedByUserId,
        });
      },
      async markRevoked(inputRecord) {
        const invite = invites.get(inputRecord.inviteId);
        if (!invite) {
          return;
        }

        invites.set(inputRecord.inviteId, {
          ...invite,
          revokedAt: inputRecord.revokedAtIso,
          revokedByUserId: inputRecord.revokedByUserId,
        });
      },
    },
    users: {
      async create(record) {
        const clone = { ...record };
        usersById.set(clone.userId, clone);
        usersByUsername.set(clone.username, clone);
        return { ...clone };
      },
      async list() {
        return Array.from(usersById.values())
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map((record) => ({ ...record }));
      },
      async findByUsername(username) {
        const record = usersByUsername.get(username);
        return record ? { ...record } : null;
      },
      async findByUserId(userId) {
        const record = usersById.get(userId);
        return record ? { ...record } : null;
      },
      async countActiveOwners() {
        return Array.from(usersById.values()).filter(
          (record) => record.role === 'owner' && record.lifecycleState === 'active',
        ).length;
      },
      async updateLifecycle(userId, lifecycleState, updatedAtIso) {
        const record = usersById.get(userId);
        if (!record) {
          return;
        }

        const updated = { ...record, lifecycleState, updatedAt: updatedAtIso };
        usersById.set(userId, updated);
        usersByUsername.set(updated.username, updated);
      },
      async replaceAuthBundle(input) {
        const record = usersById.get(input.userId);
        if (!record) {
          throw new Error(`Unknown user ${input.userId}`);
        }

        if (record.bundleVersion !== input.expectedBundleVersion) {
          throw new Error('Bundle version mismatch');
        }

        const updated: UserAccountRecord = {
          ...record,
          authSalt: input.authSalt,
          authVerifier: input.authVerifier,
          encryptedAccountBundle: input.encryptedAccountBundle,
          accountKeyWrapped: input.accountKeyWrapped,
          bundleVersion: record.bundleVersion + 1,
          updatedAt: input.updatedAtIso,
        };
        usersById.set(updated.userId, updated);
        usersByUsername.set(updated.username, updated);
        return { ...updated };
      },
    },
    devices: {
      async register(record) {
        devices.set(record.deviceId, { ...record });
        return { ...record };
      },
      async listByUserId(userId) {
        return sortDevices(
          Array.from(devices.values()).filter((device) => device.userId === userId),
        );
      },
      async findById(deviceId) {
        const record = devices.get(deviceId);
        return record ? { ...record } : null;
      },
      async countActiveByUserId(userId) {
        return Array.from(devices.values()).filter(
          (device) => device.userId === userId && device.deviceState === 'active',
        ).length;
      },
      async setDeviceStateByUserId(userId, deviceState, changedAtIso) {
        for (const [deviceId, device] of devices.entries()) {
          if (device.userId === userId) {
            devices.set(deviceId, {
              ...device,
              deviceState,
              revokedAt: deviceState === 'active' ? null : changedAtIso,
            });
          }
        }
      },
      async revokeByUserId(userId, revokedAtIso) {
        for (const [deviceId, device] of devices.entries()) {
          if (device.userId === userId) {
            devices.set(deviceId, { ...device, deviceState: 'revoked', revokedAt: revokedAtIso });
          }
        }
      },
      async revokeByDeviceId(deviceId, revokedAtIso) {
        const device = devices.get(deviceId);
        if (!device) {
          return;
        }

        devices.set(deviceId, { ...device, deviceState: 'revoked', revokedAt: revokedAtIso });
      },
    },
    sessions: {
      async create(record) {
        sessions.set(record.sessionId, { ...record });
        return { ...record };
      },
      async findBySessionId(sessionId) {
        const record = sessions.get(sessionId);
        return record ? { ...record } : null;
      },
      async listByUserId(userId) {
        return Array.from(sessions.values())
          .filter((record) => record.userId === userId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map((record) => ({ ...record }));
      },
      async updateRecentReauth(sessionId, recentReauthAtIso) {
        const record = sessions.get(sessionId);
        if (!record) {
          return;
        }
        sessions.set(sessionId, {
          ...record,
          recentReauthAt: recentReauthAtIso,
        });
      },
      async revoke(sessionId, revokedAtIso) {
        const record = sessions.get(sessionId);
        if (!record) {
          return;
        }

        sessions.set(sessionId, { ...record, revokedAt: revokedAtIso });
      },
      async revokeByUserId(userId, revokedAtIso) {
        for (const [sessionId, record] of sessions.entries()) {
          if (record.userId === userId) {
            sessions.set(sessionId, { ...record, revokedAt: revokedAtIso });
          }
        }
      },
      async revokeByDeviceId(deviceId, revokedAtIso) {
        for (const [sessionId, record] of sessions.entries()) {
          if (record.deviceId === deviceId) {
            sessions.set(sessionId, { ...record, revokedAt: revokedAtIso });
          }
        }
      },
    },
    sessionPolicies: {
      async findByUserId(userId) {
        const record = sessionPolicies.get(userId);
        return record ? { ...record } : null;
      },
      async upsert(record) {
        sessionPolicies.set(record.userId, { ...record });
        return { ...record };
      },
    },
    extensionPairings: {
      async create(record) {
        extensionPairings.set(record.pairingId, { ...record });
        return { ...record };
      },
      async findByCodeHashAny(codeHash) {
        for (const record of extensionPairings.values()) {
          if (record.codeHash === codeHash) {
            return { ...record };
          }
        }
        return null;
      },
      async findByCodeHash(codeHash, nowIso) {
        for (const record of extensionPairings.values()) {
          if (record.codeHash !== codeHash) {
            continue;
          }
          if (record.consumedAt !== null) {
            continue;
          }
          if (record.expiresAt <= nowIso) {
            continue;
          }
          return { ...record };
        }
        return null;
      },
      async consume(inputRecord) {
        const record = extensionPairings.get(inputRecord.pairingId);
        if (!record || record.consumedAt !== null) {
          return null;
        }
        const next: ExtensionPairingRecord = {
          ...record,
          consumedAt: inputRecord.consumedAt,
          consumedByDeviceId: inputRecord.consumedByDeviceId,
        };
        extensionPairings.set(next.pairingId, next);
        return { ...next };
      },
    },
    extensionLinkRequests: {
      async create(record) {
        extensionLinkRequests.set(record.requestId, { ...record });
        return { ...record };
      },
      async findByRequestId(requestId) {
        const record = extensionLinkRequests.get(requestId);
        return record ? { ...record } : null;
      },
      async listRecent(nowIso, limit) {
        return Array.from(extensionLinkRequests.values())
          .filter((record) => record.expiresAt > nowIso)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, Math.max(1, limit))
          .map((record) => ({ ...record }));
      },
      async approve(inputRecord) {
        const record = extensionLinkRequests.get(inputRecord.requestId);
        if (!record || record.status !== inputRecord.expectedStatus) {
          return null;
        }
        const next: ExtensionLinkRequestRecord = {
          ...record,
          status: 'approved',
          approvedAt: inputRecord.approvedAt,
          approvedByUserId: inputRecord.approvedByUserId,
          approvedByDeviceId: inputRecord.approvedByDeviceId,
          userId: inputRecord.userId,
          authSalt: inputRecord.authSalt,
          encryptedAccountBundle: inputRecord.encryptedAccountBundle,
          accountKeyWrapped: inputRecord.accountKeyWrapped,
          localUnlockEnvelope: inputRecord.localUnlockEnvelope,
          rejectedAt: null,
          rejectionReasonCode: null,
        };
        extensionLinkRequests.set(next.requestId, next);
        return { ...next };
      },
      async reject(inputRecord) {
        const record = extensionLinkRequests.get(inputRecord.requestId);
        if (!record || record.status !== inputRecord.expectedStatus) {
          return null;
        }
        const next: ExtensionLinkRequestRecord = {
          ...record,
          status: 'rejected',
          rejectedAt: inputRecord.rejectedAt,
          rejectionReasonCode: inputRecord.reasonCode,
        };
        extensionLinkRequests.set(next.requestId, next);
        return { ...next };
      },
      async consume(inputRecord) {
        const record = extensionLinkRequests.get(inputRecord.requestId);
        if (!record || record.status !== inputRecord.expectedStatus) {
          return null;
        }
        const next: ExtensionLinkRequestRecord = {
          ...record,
          status: 'consumed',
          consumedAt: inputRecord.consumedAt,
          consumedByDeviceId: inputRecord.consumedByDeviceId,
        };
        extensionLinkRequests.set(next.requestId, next);
        return { ...next };
      },
    },
    surfaceLinks: {
      async upsert(record) {
        const key = `${record.userId}:${record.webDeviceId}:${record.extensionDeviceId}`;
        const existing = surfaceLinksByPair.get(key);
        const next: SurfaceLinkRecord = existing
          ? { ...existing, updatedAt: record.updatedAt }
          : { ...record };
        surfaceLinksByPair.set(key, next);
        return { ...next };
      },
      async findByWebDeviceId(userId, webDeviceId) {
        for (const record of surfaceLinksByPair.values()) {
          if (record.userId === userId && record.webDeviceId === webDeviceId) {
            return { ...record };
          }
        }
        return null;
      },
      async findByExtensionDeviceId(userId, extensionDeviceId) {
        for (const record of surfaceLinksByPair.values()) {
          if (record.userId === userId && record.extensionDeviceId === extensionDeviceId) {
            return { ...record };
          }
        }
        return null;
      },
      async removeByDeviceId(userId, deviceId) {
        for (const [key, record] of surfaceLinksByPair.entries()) {
          if (
            record.userId === userId &&
            (record.webDeviceId === deviceId || record.extensionDeviceId === deviceId)
          ) {
            surfaceLinksByPair.delete(key);
          }
        }
      },
    },
    unlockGrants: {
      async create(record) {
        unlockGrants.set(record.requestId, { ...record });
        return { ...record };
      },
      async findByRequestId(requestId) {
        const record = unlockGrants.get(requestId);
        return record ? { ...record } : null;
      },
      async listPendingForApprover(userId, approverSurface, approverDeviceId, nowIso, limit) {
        return Array.from(unlockGrants.values())
          .filter(
            (record) =>
              record.userId === userId &&
              record.approverSurface === approverSurface &&
              record.approverDeviceId === approverDeviceId &&
              record.status === 'pending' &&
              record.expiresAt > nowIso,
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, Math.max(1, limit))
          .map((record) => ({ ...record }));
      },
      async approve(inputRecord) {
        const record = unlockGrants.get(inputRecord.requestId);
        if (!record || record.status !== inputRecord.expectedStatus) {
          return null;
        }
        const next: UnlockGrantRecord = {
          ...record,
          status: 'approved',
          approvedAt: inputRecord.approvedAt,
          approvedByDeviceId: inputRecord.approvedByDeviceId,
          unlockAccountKey: inputRecord.unlockAccountKey,
          rejectedAt: null,
          rejectionReasonCode: null,
        };
        unlockGrants.set(next.requestId, next);
        return { ...next };
      },
      async reject(inputRecord) {
        const record = unlockGrants.get(inputRecord.requestId);
        if (!record || record.status !== inputRecord.expectedStatus) {
          return null;
        }
        const next: UnlockGrantRecord = {
          ...record,
          status: 'rejected',
          unlockAccountKey: null,
          rejectedAt: inputRecord.rejectedAt,
          rejectionReasonCode: inputRecord.reasonCode,
        };
        unlockGrants.set(next.requestId, next);
        return { ...next };
      },
      async consume(inputRecord) {
        const record = unlockGrants.get(inputRecord.requestId);
        if (!record || record.status !== inputRecord.expectedStatus) {
          return null;
        }
        const next: UnlockGrantRecord = {
          ...record,
          status: 'consumed',
          consumedAt: inputRecord.consumedAt,
          consumedByDeviceId: inputRecord.consumedByDeviceId,
        };
        unlockGrants.set(next.requestId, next);
        return { ...next };
      },
    },
    extensionSessionRecoverSecrets: {
      async findByDeviceId(deviceId) {
        const record = extensionSessionRecoverSecrets.get(deviceId);
        return record ? { ...record } : null;
      },
      async upsert(record) {
        extensionSessionRecoverSecrets.set(record.deviceId, { ...record });
        return { ...record };
      },
      async removeByDeviceId(deviceId) {
        extensionSessionRecoverSecrets.delete(deviceId);
      },
      async removeByUserId(userId) {
        for (const [deviceId, record] of extensionSessionRecoverSecrets.entries()) {
          if (record.userId === userId) {
            extensionSessionRecoverSecrets.delete(deviceId);
          }
        }
      },
    },
    siteIconCache: {
      async listByDomains(domains) {
        const normalized = domains
          .filter((domain) => typeof domain === 'string')
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0);
        if (normalized.length === 0) {
          return [];
        }
        const deduped = Array.from(new Set(normalized));
        return deduped
          .map((domain) => siteIconCache.get(domain))
          .filter((record): record is SiteIconCacheRecord => Boolean(record))
          .map((record) => ({ ...record }));
      },
      async findByDomain(domain) {
        const normalized = domain.trim().toLowerCase();
        if (!normalized) {
          return null;
        }
        const record = siteIconCache.get(normalized);
        return record ? { ...record } : null;
      },
      async upsert(record) {
        const normalized: SiteIconCacheRecord = {
          ...record,
          domain: record.domain.trim().toLowerCase(),
        };
        siteIconCache.set(normalized.domain, normalized);
        return { ...normalized };
      },
    },
    manualSiteIconOverrides: {
      async listByUserId(userId) {
        return Array.from(manualSiteIconOverrides.values())
          .filter((record) => record.userId === userId)
          .sort((left, right) => left.domain.localeCompare(right.domain))
          .map((record) => ({ ...record }));
      },
      async listByUserIdAndDomains(userId, domains) {
        const normalizedDomains = new Set(
          domains
            .filter((domain) => typeof domain === 'string')
            .map((domain) => domain.trim().toLowerCase())
            .filter((domain) => domain.length > 0),
        );
        if (normalizedDomains.size === 0) {
          return [];
        }
        return Array.from(manualSiteIconOverrides.values())
          .filter((record) => record.userId === userId && normalizedDomains.has(record.domain))
          .sort((left, right) => left.domain.localeCompare(right.domain))
          .map((record) => ({ ...record }));
      },
      async findByUserIdAndDomain(userId, domain) {
        const key = `${userId}:${domain.trim().toLowerCase()}`;
        const record = manualSiteIconOverrides.get(key);
        return record ? { ...record } : null;
      },
      async upsert(record) {
        const normalized: ManualSiteIconOverrideRecord = {
          ...record,
          domain: record.domain.trim().toLowerCase(),
        };
        const key = `${normalized.userId}:${normalized.domain}`;
        manualSiteIconOverrides.set(key, normalized);
        return { ...normalized };
      },
      async remove(userId, domain) {
        const key = `${userId}:${domain.trim().toLowerCase()}`;
        return manualSiteIconOverrides.delete(key);
      },
    },
    authRateLimits: {
      async increment(input) {
        const current = rateLimits.get(input.key);
        const nowMs = Date.parse(input.nowIso);
        const nextWindowEndsAt = new Date(nowMs + input.windowSeconds * 1000).toISOString();
        const isExpired = !current || Date.parse(current.windowEndsAt) <= nowMs;
        const next: AuthRateLimitRecord = isExpired
          ? {
              key: input.key,
              attemptCount: 1,
              windowStartedAt: input.nowIso,
              windowEndsAt: nextWindowEndsAt,
            }
          : {
              ...current,
              attemptCount: current.attemptCount + 1,
            };
        rateLimits.set(input.key, next);
        return { ...next };
      },
      async get(key) {
        const record = rateLimits.get(key);
        return record ? { ...record } : null;
      },
      async reset(key) {
        rateLimits.delete(key);
      },
    },
    idempotency: {
      async get(scope, nowIso) {
        const record = idempotencyRecords.get(scope);
        if (!record) {
          return null;
        }
        if (record.expiresAt <= nowIso) {
          idempotencyRecords.delete(scope);
          return null;
        }
        return { ...record };
      },
      async put(record) {
        idempotencyRecords.set(record.scope, { ...record });
        return { ...record };
      },
    },
    auditEvents: {
      async create(record) {
        auditEvents.set(record.eventId, { ...record });
        return { ...record };
      },
      async listRecent(limit = 200) {
        return Array.from(auditEvents.values())
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, Math.max(1, limit))
          .map((record) => ({ ...record }));
      },
    },
    attachmentBlobs: {
      async put(record) {
        attachmentBlobs.set(record.key, { ...record });
        return { ...record };
      },
      async get(key) {
        const record = attachmentBlobs.get(key);
        return record ? { ...record } : null;
      },
      async listByOwnerAndItem(ownerUserId, itemId) {
        return Array.from(attachmentBlobs.values())
          .filter((record) => record.ownerUserId === ownerUserId && record.itemId === itemId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map((record) => ({ ...record }));
      },
      async findByOwnerItemAndIdempotency(ownerUserId, itemId, idempotencyKey) {
        const record = Array.from(attachmentBlobs.values()).find(
          (current) =>
            current.ownerUserId === ownerUserId &&
            current.itemId === itemId &&
            current.idempotencyKey === idempotencyKey,
        );
        return record ? { ...record } : null;
      },
      async markUploaded(input) {
        const record = attachmentBlobs.get(input.key);
        if (!record || record.ownerUserId !== input.ownerUserId) {
          throw new Error('attachment_not_found');
        }
        const updated: AttachmentBlobRecord = {
          ...record,
          lifecycleState: 'uploaded',
          envelope: input.envelope,
          uploadedAt: input.uploadedAt,
          updatedAt: input.updatedAt,
        };
        attachmentBlobs.set(updated.key, updated);
        return { ...updated };
      },
      async markAttached(input) {
        const record = attachmentBlobs.get(input.key);
        if (!record || record.ownerUserId !== input.ownerUserId) {
          throw new Error('attachment_not_found');
        }
        if (record.itemId !== input.itemId) {
          throw new Error('attachment_already_bound_to_other_item');
        }
        if (record.lifecycleState === 'attached') {
          return { ...record };
        }
        if (record.lifecycleState !== 'uploaded') {
          throw new Error('attachment_upload_incomplete');
        }
        const updated: AttachmentBlobRecord = {
          ...record,
          lifecycleState: 'attached',
          attachedAt: input.attachedAt,
          updatedAt: input.updatedAt,
          expiresAt: null,
          uploadToken: null,
        };
        attachmentBlobs.set(updated.key, updated);
        return { ...updated };
      },
      async delete(key) {
        attachmentBlobs.delete(key);
      },
    },
    vaultItems: {
      async listByOwnerUserId(ownerUserId) {
        return Array.from(vaultItems.values())
          .filter((record) => record.ownerUserId === ownerUserId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map((record) => ({ ...record }));
      },
      async listTombstonesByOwnerUserId(ownerUserId) {
        return Array.from(vaultItemTombstones.values())
          .filter((record) => record.ownerUserId === ownerUserId)
          .sort((left, right) => left.deletedAt.localeCompare(right.deletedAt))
          .map((record) => ({ ...record }));
      },
      async findByItemId(itemId, ownerUserId) {
        const record = vaultItems.get(itemId);
        if (!record || record.ownerUserId !== ownerUserId) {
          return null;
        }

        return { ...record };
      },
      async findTombstoneByItemId(itemId, ownerUserId) {
        const record = vaultItemTombstones.get(`${ownerUserId}:${itemId}`);
        if (!record) {
          return null;
        }

        return { ...record };
      },
      async create(record) {
        vaultItems.set(record.itemId, { ...record });
        return { ...record };
      },
      async update(input) {
        const current = vaultItems.get(input.itemId);
        if (!current || current.ownerUserId !== input.ownerUserId) {
          throw new Error('item_not_found');
        }
        if (current.revision !== input.expectedRevision) {
          throw new Error('revision_conflict');
        }

        const updated: VaultItemRecord = {
          ...current,
          itemType: input.itemType,
          encryptedPayload: input.encryptedPayload,
          revision: current.revision + 1,
          updatedAt: input.updatedAt,
        };
        vaultItems.set(updated.itemId, updated);
        return { ...updated };
      },
      async delete(itemId, ownerUserId, deletedAtIso) {
        const current = vaultItems.get(itemId);
        if (!current || current.ownerUserId !== ownerUserId) {
          return false;
        }

        const tombstone: VaultItemTombstoneRecord = {
          itemId: current.itemId,
          ownerUserId: current.ownerUserId,
          itemType: current.itemType,
          revision: current.revision + 1,
          encryptedPayload: current.encryptedPayload,
          createdAt: current.createdAt,
          updatedAt: current.updatedAt,
          deletedAt: deletedAtIso,
        };
        vaultItemTombstones.set(`${ownerUserId}:${itemId}`, tombstone);
        vaultItems.delete(itemId);
        return true;
      },
      async restore(inputRecord) {
        const key = `${inputRecord.ownerUserId}:${inputRecord.itemId}`;
        const active = vaultItems.get(inputRecord.itemId);
        const tombstone = vaultItemTombstones.get(key) ?? null;

        if (active && active.ownerUserId === inputRecord.ownerUserId) {
          if (tombstone) {
            vaultItemTombstones.delete(key);
          }
          return {
            status: 'success_no_op' as const,
            item: { ...active },
          };
        }

        if (!tombstone) {
          return {
            status: 'not_found' as const,
            item: null,
          };
        }

        const deletedAtMillis = Date.parse(tombstone.deletedAt);
        const restoredAtMillis = Date.parse(inputRecord.restoredAtIso);
        const restoreWindowMillis = inputRecord.restoreRetentionDays * 24 * 60 * 60 * 1000;
        if (
          !Number.isFinite(deletedAtMillis) ||
          !Number.isFinite(restoredAtMillis) ||
          deletedAtMillis + restoreWindowMillis < restoredAtMillis
        ) {
          return {
            status: 'restore_window_expired' as const,
            item: null,
          };
        }

        const restoredItem: VaultItemRecord = {
          itemId: tombstone.itemId,
          ownerUserId: tombstone.ownerUserId,
          itemType: tombstone.itemType,
          revision: tombstone.revision + 1,
          encryptedPayload: tombstone.encryptedPayload,
          createdAt: tombstone.createdAt,
          updatedAt: inputRecord.restoredAtIso,
        };

        vaultItems.set(restoredItem.itemId, restoredItem);
        vaultItemTombstones.delete(key);
        return {
          status: 'success_changed' as const,
          item: { ...restoredItem },
        };
      },
    },
    async completeOnboardingAtomic(inputRecord) {
      let usableInvite: InviteRecord | null = null;
      for (const invite of invites.values()) {
        if (
          invite.tokenHash === inputRecord.inviteTokenHash &&
          invite.consumedAt === null &&
          invite.revokedAt === null &&
          invite.expiresAt > inputRecord.nowIso
        ) {
          usableInvite = { ...invite };
          break;
        }
      }

      if (!usableInvite) {
        throw new Error('invalid_invite');
      }

      if (usersByUsername.has(inputRecord.user.username)) {
        throw new Error('username_unavailable');
      }

      const invitesSnapshot = new Map(invites);
      const usersByIdSnapshot = new Map(usersById);
      const usersByUsernameSnapshot = new Map(usersByUsername);
      const devicesSnapshot = new Map(devices);
      const sessionsSnapshot = new Map(sessions);

      try {
        if (input.failOnCompleteOnboardingAtomicStep === 'user') {
          throw new Error('simulated_complete_onboarding_atomic_failure');
        }
        usersById.set(inputRecord.user.userId, { ...inputRecord.user });
        usersByUsername.set(inputRecord.user.username, { ...inputRecord.user });

        if (input.failOnCompleteOnboardingAtomicStep === 'invite') {
          throw new Error('simulated_complete_onboarding_atomic_failure');
        }
        invites.set(usableInvite.inviteId, {
          ...usableInvite,
          consumedAt: inputRecord.nowIso,
          consumedByUserId: inputRecord.user.userId,
        });

        if (input.failOnCompleteOnboardingAtomicStep === 'device') {
          throw new Error('simulated_complete_onboarding_atomic_failure');
        }
        devices.set(inputRecord.device.deviceId, { ...inputRecord.device });

        if (input.failOnCompleteOnboardingAtomicStep === 'session') {
          throw new Error('simulated_complete_onboarding_atomic_failure');
        }
        sessions.set(inputRecord.session.sessionId, { ...inputRecord.session });

        return {
          user: { ...inputRecord.user },
          device: { ...inputRecord.device },
          session: { ...inputRecord.session },
        };
      } catch (error) {
        invites.clear();
        invitesSnapshot.forEach((value, key) => invites.set(key, value));
        usersById.clear();
        usersByIdSnapshot.forEach((value, key) => usersById.set(key, value));
        usersByUsername.clear();
        usersByUsernameSnapshot.forEach((value, key) => usersByUsername.set(key, value));
        devices.clear();
        devicesSnapshot.forEach((value, key) => devices.set(key, value));
        sessions.clear();
        sessionsSnapshot.forEach((value, key) => sessions.set(key, value));
        throw error;
      }
    },
    async revokeDeviceAndSessionsAtomic(inputRecord) {
      const device = devices.get(inputRecord.deviceId);
      if (!device || device.userId !== inputRecord.userId) {
        return;
      }

      devices.set(inputRecord.deviceId, {
        ...device,
        deviceState: 'revoked',
        revokedAt: inputRecord.revokedAtIso,
      });
      for (const [sessionId, session] of sessions.entries()) {
        if (session.userId === inputRecord.userId && session.deviceId === inputRecord.deviceId) {
          sessions.set(sessionId, {
            ...session,
            revokedAt: inputRecord.revokedAtIso,
          });
        }
      }
      for (const [key, link] of surfaceLinksByPair.entries()) {
        if (
          link.userId === inputRecord.userId &&
          (link.webDeviceId === inputRecord.deviceId || link.extensionDeviceId === inputRecord.deviceId)
        ) {
          surfaceLinksByPair.delete(key);
        }
      }
      extensionSessionRecoverSecrets.delete(inputRecord.deviceId);
    },
    async rotatePasswordAtomic(inputRecord) {
      const user = usersById.get(inputRecord.userId);
      if (!user) {
        throw new Error('user_not_found');
      }
      if (user.authVerifier !== inputRecord.currentAuthVerifier) {
        throw new Error('invalid_credentials');
      }
      if (user.bundleVersion !== inputRecord.expectedBundleVersion) {
        throw new Error('stale_bundle_version');
      }
      const currentSession = sessions.get(inputRecord.currentSessionId);
      if (!currentSession || currentSession.userId !== inputRecord.userId || currentSession.revokedAt !== null) {
        throw new Error('unauthorized');
      }
      const currentDevice = devices.get(currentSession.deviceId);
      if (!currentDevice || currentDevice.userId !== inputRecord.userId || currentDevice.deviceState !== 'active') {
        throw new Error('unauthorized');
      }

      const nextUser: UserAccountRecord = {
        ...user,
        authSalt: inputRecord.nextAuthSalt,
        authVerifier: inputRecord.nextAuthVerifier,
        encryptedAccountBundle: inputRecord.nextEncryptedAccountBundle,
        accountKeyWrapped: inputRecord.nextAccountKeyWrapped,
        bundleVersion: user.bundleVersion + 1,
        updatedAt: inputRecord.updatedAtIso,
      };
      usersById.set(nextUser.userId, nextUser);
      usersByUsername.set(nextUser.username, nextUser);
      for (const [sessionId, session] of sessions.entries()) {
        if (session.userId === inputRecord.userId) {
          sessions.set(sessionId, {
            ...session,
            revokedAt: inputRecord.revokedAtIso,
          });
        }
      }
      for (const [deviceId, secret] of extensionSessionRecoverSecrets.entries()) {
        if (secret.userId === inputRecord.userId) {
          extensionSessionRecoverSecrets.delete(deviceId);
        }
      }
      sessions.set(inputRecord.newSession.sessionId, { ...inputRecord.newSession });

      return {
        user: { ...nextUser },
        session: { ...inputRecord.newSession },
      };
    },
  };
}

