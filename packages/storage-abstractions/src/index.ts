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
  lockRevision: number;
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
  lockRevision: number;
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

export type WebBootstrapGrantStatus = 'pending' | 'consumed' | 'revoked';

export interface WebBootstrapGrantRecord {
  grantId: string;
  userId: string;
  deploymentFingerprint: string;
  serverOrigin: string;
  extensionDeviceId: string;
  webDeviceId: string;
  requesterPublicKey: string;
  requesterClientNonce: string;
  webChallenge: string;
  unlockAccountKey: string;
  lockRevision: number;
  status: WebBootstrapGrantStatus;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedByDeviceId: string | null;
  revokedAt: string | null;
  revocationReasonCode: string | null;
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

export type AutomaticIconRegistryStatus = 'pending' | 'ready' | 'absent';

export interface AutomaticIconRegistryRecord {
  domain: string;
  status: AutomaticIconRegistryStatus;
  objectId: string | null;
  sourceUrl: string | null;
  failCount: number;
  lastCheckedAt: string;
  nextEligibleAt: string;
  updatedAt: string;
}

export interface ManualSiteIconOverrideRecord {
  userId: string;
  domain: string;
  dataUrl: string;
  source: 'url' | 'file';
  updatedAt: string;
}

export type IconObjectClass = 'automatic_public' | 'manual_private';
export type UserIconStateStatus = 'pending' | 'ready' | 'absent' | 'removed';

export interface IconObjectRecord {
  objectId: string;
  objectClass: IconObjectClass;
  ownerUserId: string | null;
  sha256: string;
  r2Key: string;
  contentType: string;
  byteLength: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserIconStateRecord {
  userId: string;
  domain: string;
  status: UserIconStateStatus;
  objectId: string | null;
  updatedAt: string;
}

export interface UserIconItemDomainHeadRecord {
  userId: string;
  deviceId: string;
  surface: 'web' | 'extension';
  itemId: string;
  itemRevision: number;
  generationId: string | null;
  lastSeenAt: string;
  updatedAt: string;
}

export interface UserIconItemDomainRecord {
  userId: string;
  deviceId: string;
  surface: 'web' | 'extension';
  itemId: string;
  host: string;
  itemRevision: number;
  generationId: string | null;
  lastSeenAt: string;
  updatedAt: string;
}

export interface UserIconReindexSessionRecord {
  userId: string;
  deviceId: string;
  surface: 'web' | 'extension';
  generationId: string;
  startedAt: string;
  updatedAt: string;
}

export interface IconIngestJobRecord {
  jobId: string;
  userId: string;
  domain: string;
  objectClass: IconObjectClass;
  status: 'staged' | 'uploading' | 'uploaded_uncommitted' | 'committed' | 'upload_failed' | 'aborted';
  sha256: string;
  r2Key: string;
  objectId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordGeneratorHistoryRecord {
  userId: string;
  entryId: string;
  encryptedPayload: string;
  createdAt: string;
  updatedAt: string;
}

export interface RealtimeOutboxRecord {
  id: string;
  userId: string;
  topic: string;
  aggregateId: string | null;
  idempotencyKey: string;
  eventId: string;
  occurredAt: string;
  sourceDeviceId: string | null;
  payloadJson: string;
  createdAt: string;
  publishedAt: string | null;
  attemptCount: number;
  lastError: string | null;
}

export interface AuthRateLimitRecord {
  key: string;
  attemptCount: number;
  windowStartedAt: string;
  windowEndsAt: string;
}

export interface RealtimeOneTimeTokenRecord {
  tokenKey: string;
  consumedAt: string;
  expiresAt: string;
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
  findByPair(userId: string, webDeviceId: string, extensionDeviceId: string): Promise<SurfaceLinkRecord | null>;
  listByDeviceId(userId: string, deviceId: string): Promise<SurfaceLinkRecord[]>;
  bumpLockRevisionByDevice(input: {
    userId: string;
    deviceId: string;
    updatedAtIso: string;
  }): Promise<number>;
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
  revokePendingByDeviceWithLockRevision(input: {
    userId: string;
    deviceId: string;
    minLockRevisionExclusive: number;
    revokedAt: string;
    reasonCode: string | null;
  }): Promise<number>;
}

export interface WebBootstrapGrantRepository {
  create(record: WebBootstrapGrantRecord): Promise<WebBootstrapGrantRecord>;
  findByGrantId(grantId: string): Promise<WebBootstrapGrantRecord | null>;
  consume(input: {
    grantId: string;
    expectedStatus: WebBootstrapGrantStatus;
    consumedAt: string;
    consumedByDeviceId: string;
  }): Promise<WebBootstrapGrantRecord | null>;
  revokePendingByDeviceWithLockRevision(input: {
    userId: string;
    deviceId: string;
    minLockRevisionExclusive: number;
    revokedAt: string;
    reasonCode: string | null;
  }): Promise<number>;
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

export interface RealtimeOneTimeTokenRepository {
  consume(input: {
    tokenKey: string;
    consumedAt: string;
    expiresAt: string;
  }): Promise<{ consumed: boolean }>;
  pruneExpired(input: {
    nowIso: string;
    limit: number;
  }): Promise<number>;
}

export interface SiteIconCacheRepository {
  listByDomains(domains: string[]): Promise<SiteIconCacheRecord[]>;
  findByDomain(domain: string): Promise<SiteIconCacheRecord | null>;
  upsert(record: SiteIconCacheRecord): Promise<SiteIconCacheRecord>;
}

export interface AutomaticIconRegistryRepository {
  listByDomains(domains: string[]): Promise<AutomaticIconRegistryRecord[]>;
  findByDomain(domain: string): Promise<AutomaticIconRegistryRecord | null>;
  upsert(record: AutomaticIconRegistryRecord): Promise<AutomaticIconRegistryRecord>;
}

export interface ManualSiteIconOverrideRepository {
  listByUserId(userId: string): Promise<ManualSiteIconOverrideRecord[]>;
  listByUserIdAndDomains(userId: string, domains: string[]): Promise<ManualSiteIconOverrideRecord[]>;
  findByUserIdAndDomain(userId: string, domain: string): Promise<ManualSiteIconOverrideRecord | null>;
  upsert(record: ManualSiteIconOverrideRecord): Promise<ManualSiteIconOverrideRecord>;
  remove(userId: string, domain: string): Promise<boolean>;
}

export interface IconObjectRepository {
  create(record: IconObjectRecord): Promise<IconObjectRecord>;
  findByObjectId(objectId: string): Promise<IconObjectRecord | null>;
  findByClassAndSha256(input: {
    objectClass: IconObjectClass;
    sha256: string;
    ownerUserId?: string | null;
  }): Promise<IconObjectRecord | null>;
  removeByObjectId(objectId: string): Promise<boolean>;
  listOrphanCandidates(input: {
    notReferencedAfterIso: string;
    limit: number;
  }): Promise<IconObjectRecord[]>;
}

export interface UserIconStateRepository {
  listByUserId(userId: string): Promise<UserIconStateRecord[]>;
  listByUserIdAndDomains(userId: string, domains: string[]): Promise<UserIconStateRecord[]>;
  findByUserIdAndDomain(userId: string, domain: string): Promise<UserIconStateRecord | null>;
  upsert(record: UserIconStateRecord): Promise<{ record: UserIconStateRecord; changed: boolean }>;
  remove(input: {
    userId: string;
    domain: string;
    updatedAt: string;
  }): Promise<boolean>;
  getVersion(userId: string): Promise<number>;
  bumpVersion(input: {
    userId: string;
    updatedAt: string;
  }): Promise<number>;
}

export interface UserIconItemDomainRepository {
  replaceItemHosts(input: {
    userId: string;
    deviceId: string;
    surface: 'web' | 'extension';
    itemId: string;
    itemRevision: number;
    hosts: string[];
    generationId?: string | null;
    updatedAt: string;
  }): Promise<{
    result: 'success_changed' | 'success_no_op' | 'success_no_op_stale_revision';
    changed: boolean;
  }>;
  startReindex(input: {
    userId: string;
    deviceId: string;
    surface: 'web' | 'extension';
    generationId: string;
    startedAt: string;
  }): Promise<UserIconReindexSessionRecord>;
  upsertReindexChunk(input: {
    userId: string;
    deviceId: string;
    surface: 'web' | 'extension';
    generationId: string;
    entries: Array<{ itemId: string; itemRevision: number; hosts: string[] }>;
    updatedAt: string;
  }): Promise<{ acceptedItems: number }>;
  commitReindex(input: {
    userId: string;
    deviceId: string;
    surface: 'web' | 'extension';
    generationId: string;
    updatedAt: string;
  }): Promise<{ changed: boolean }>;
  listEffectiveHostsByUserId(userId: string): Promise<string[]>;
}

export interface IconIngestJobRepository {
  create(record: IconIngestJobRecord): Promise<IconIngestJobRecord>;
  updateStatus(input: {
    jobId: string;
    status: IconIngestJobRecord['status'];
    objectId?: string | null;
    errorCode?: string | null;
    updatedAt: string;
  }): Promise<IconIngestJobRecord | null>;
  findByJobId(jobId: string): Promise<IconIngestJobRecord | null>;
  listByStatus(input: {
    status: IconIngestJobRecord['status'];
    limit: number;
  }): Promise<IconIngestJobRecord[]>;
  delete(jobId: string): Promise<boolean>;
}

export interface PasswordGeneratorHistoryRepository {
  listByUserId(userId: string, limit: number): Promise<PasswordGeneratorHistoryRecord[]>;
  upsert(record: PasswordGeneratorHistoryRecord): Promise<PasswordGeneratorHistoryRecord>;
  pruneByUserId(userId: string, limit: number): Promise<void>;
}

export interface RealtimeOutboxRepository {
  enqueue(record: RealtimeOutboxRecord): Promise<RealtimeOutboxRecord>;
  listPendingByUserId(userId: string, limit: number): Promise<RealtimeOutboxRecord[]>;
  markPublished(input: {
    id: string;
    publishedAt: string;
  }): Promise<void>;
  markFailed(input: {
    id: string;
    failedAt: string;
    lastError: string;
  }): Promise<void>;
  deletePublishedBefore(input: {
    cutoffIso: string;
    limit: number;
  }): Promise<number>;
}

export interface AttachmentBlobRepository {
  put(record: AttachmentBlobRecord): Promise<AttachmentBlobRecord>;
  get(key: string): Promise<AttachmentBlobRecord | null>;
  listByOwner(ownerUserId: string): Promise<AttachmentBlobRecord[]>;
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
  webBootstrapGrants: WebBootstrapGrantRepository;
  extensionSessionRecoverSecrets: ExtensionSessionRecoverSecretRepository;
  siteIconCache: SiteIconCacheRepository;
  automaticIconRegistry: AutomaticIconRegistryRepository;
  manualSiteIconOverrides: ManualSiteIconOverrideRepository;
  iconObjects: IconObjectRepository;
  userIconState: UserIconStateRepository;
  userIconItemDomains: UserIconItemDomainRepository;
  iconIngestJobs: IconIngestJobRepository;
  passwordGeneratorHistory: PasswordGeneratorHistoryRepository;
  realtimeOutbox: RealtimeOutboxRepository;
  realtimeOneTimeTokens: RealtimeOneTimeTokenRepository;
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
  const webBootstrapGrants = new Map<string, WebBootstrapGrantRecord>();
  const extensionSessionRecoverSecrets = new Map<string, ExtensionSessionRecoverSecretRecord>();
  const siteIconCache = new Map<string, SiteIconCacheRecord>();
  const automaticIconRegistry = new Map<string, AutomaticIconRegistryRecord>();
  const manualSiteIconOverrides = new Map<string, ManualSiteIconOverrideRecord>();
  const iconObjects = new Map<string, IconObjectRecord>();
  const userIconState = new Map<string, UserIconStateRecord>();
  const userIconVersions = new Map<string, number>();
  const userIconItemDomainHeads = new Map<string, UserIconItemDomainHeadRecord>();
  const userIconItemDomainRows = new Map<string, UserIconItemDomainRecord>();
  const userIconReindexSessions = new Map<string, UserIconReindexSessionRecord>();
  const iconIngestJobs = new Map<string, IconIngestJobRecord>();
  const passwordGeneratorHistory = new Map<string, PasswordGeneratorHistoryRecord>();
  const realtimeOutbox = new Map<string, RealtimeOutboxRecord>();
  const realtimeOneTimeTokens = new Map<string, RealtimeOneTimeTokenRecord>();
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
          ? {
              ...existing,
              updatedAt: record.updatedAt,
              lockRevision: Number.isFinite(record.lockRevision) ? record.lockRevision : existing.lockRevision,
            }
          : { ...record, lockRevision: Number.isFinite(record.lockRevision) ? record.lockRevision : 0 };
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
      async findByPair(userId, webDeviceId, extensionDeviceId) {
        const key = `${userId}:${webDeviceId}:${extensionDeviceId}`;
        const record = surfaceLinksByPair.get(key);
        return record ? { ...record } : null;
      },
      async listByDeviceId(userId, deviceId) {
        return Array.from(surfaceLinksByPair.values())
          .filter(
            (record) =>
              record.userId === userId &&
              (record.webDeviceId === deviceId || record.extensionDeviceId === deviceId),
          )
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((record) => ({ ...record }));
      },
      async bumpLockRevisionByDevice(input) {
        let nextRevision = 0;
        for (const [key, record] of surfaceLinksByPair.entries()) {
          if (
            record.userId !== input.userId ||
            (record.webDeviceId !== input.deviceId && record.extensionDeviceId !== input.deviceId)
          ) {
            continue;
          }
          const updated: SurfaceLinkRecord = {
            ...record,
            lockRevision: record.lockRevision + 1,
            updatedAt: input.updatedAtIso,
          };
          surfaceLinksByPair.set(key, updated);
          if (updated.lockRevision > nextRevision) {
            nextRevision = updated.lockRevision;
          }
        }
        return nextRevision;
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
      async revokePendingByDeviceWithLockRevision(inputRecord) {
        let changed = 0;
        for (const [requestId, record] of unlockGrants.entries()) {
          if (
            record.userId !== inputRecord.userId ||
            (record.requesterDeviceId !== inputRecord.deviceId &&
              record.approverDeviceId !== inputRecord.deviceId) ||
            record.status !== 'pending' ||
            record.lockRevision >= inputRecord.minLockRevisionExclusive
          ) {
            continue;
          }
          unlockGrants.set(requestId, {
            ...record,
            status: 'rejected',
            rejectedAt: inputRecord.revokedAt,
            rejectionReasonCode: inputRecord.reasonCode,
            unlockAccountKey: null,
          });
          changed += 1;
        }
        return changed;
      },
    },
    webBootstrapGrants: {
      async create(record) {
        webBootstrapGrants.set(record.grantId, { ...record });
        return { ...record };
      },
      async findByGrantId(grantId) {
        const record = webBootstrapGrants.get(grantId);
        return record ? { ...record } : null;
      },
      async consume(inputRecord) {
        const record = webBootstrapGrants.get(inputRecord.grantId);
        if (!record || record.status !== inputRecord.expectedStatus) {
          return null;
        }
        const next: WebBootstrapGrantRecord = {
          ...record,
          status: 'consumed',
          consumedAt: inputRecord.consumedAt,
          consumedByDeviceId: inputRecord.consumedByDeviceId,
          revokedAt: null,
          revocationReasonCode: null,
        };
        webBootstrapGrants.set(next.grantId, next);
        return { ...next };
      },
      async revokePendingByDeviceWithLockRevision(inputRecord) {
        let changed = 0;
        for (const [grantId, record] of webBootstrapGrants.entries()) {
          if (
            record.userId !== inputRecord.userId ||
            (record.extensionDeviceId !== inputRecord.deviceId &&
              record.webDeviceId !== inputRecord.deviceId) ||
            record.status !== 'pending' ||
            record.lockRevision >= inputRecord.minLockRevisionExclusive
          ) {
            continue;
          }
          webBootstrapGrants.set(grantId, {
            ...record,
            status: 'revoked',
            revokedAt: inputRecord.revokedAt,
            revocationReasonCode: inputRecord.reasonCode,
            consumedAt: null,
            consumedByDeviceId: null,
          });
          changed += 1;
        }
        return changed;
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
    automaticIconRegistry: {
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
          .map((domain) => automaticIconRegistry.get(domain))
          .filter((record): record is AutomaticIconRegistryRecord => Boolean(record))
          .map((record) => ({ ...record }));
      },
      async findByDomain(domain) {
        const normalized = domain.trim().toLowerCase();
        if (!normalized) {
          return null;
        }
        const record = automaticIconRegistry.get(normalized);
        return record ? { ...record } : null;
      },
      async upsert(record) {
        const normalized: AutomaticIconRegistryRecord = {
          ...record,
          domain: record.domain.trim().toLowerCase(),
          status: record.status === 'ready' ? 'ready' : record.status === 'absent' ? 'absent' : 'pending',
          objectId: record.objectId ?? null,
          sourceUrl: record.sourceUrl ?? null,
          failCount: Math.max(0, Math.trunc(record.failCount)),
        };
        automaticIconRegistry.set(normalized.domain, normalized);
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
    iconObjects: {
      async create(record) {
        const normalized: IconObjectRecord = {
          ...record,
          objectId: record.objectId.trim(),
          ownerUserId: record.ownerUserId ?? null,
          sha256: record.sha256.trim().toLowerCase(),
          r2Key: record.r2Key.trim(),
          contentType: record.contentType.trim().toLowerCase(),
          byteLength: Math.max(0, Math.trunc(record.byteLength)),
        };
        iconObjects.set(normalized.objectId, normalized);
        return { ...normalized };
      },
      async findByObjectId(objectId) {
        const record = iconObjects.get(objectId.trim());
        return record ? { ...record } : null;
      },
      async findByClassAndSha256(inputRecord) {
        const targetSha = inputRecord.sha256.trim().toLowerCase();
        for (const record of iconObjects.values()) {
          if (record.objectClass !== inputRecord.objectClass || record.sha256 !== targetSha) {
            continue;
          }
          if (record.objectClass === 'manual_private') {
            const ownerUserId = inputRecord.ownerUserId ?? null;
            if (record.ownerUserId !== ownerUserId) {
              continue;
            }
          }
          return { ...record };
        }
        return null;
      },
      async removeByObjectId(objectId) {
        return iconObjects.delete(objectId.trim());
      },
      async listOrphanCandidates(inputRecord) {
        const safeLimit = Number.isFinite(inputRecord.limit)
          ? Math.max(1, Math.min(2_000, Math.trunc(inputRecord.limit)))
          : 200;
        const referenced = new Set<string>();
        for (const stateRecord of userIconState.values()) {
          if (stateRecord.objectId) {
            referenced.add(stateRecord.objectId);
          }
        }
        return Array.from(iconObjects.values())
          .filter((record) => record.updatedAt <= inputRecord.notReferencedAfterIso && !referenced.has(record.objectId))
          .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
          .slice(0, safeLimit)
          .map((record) => ({ ...record }));
      },
    },
    userIconState: {
      async listByUserId(userId) {
        return Array.from(userIconState.values())
          .filter((record) => record.userId === userId)
          .sort((left, right) => left.domain.localeCompare(right.domain))
          .map((record) => ({ ...record }));
      },
      async listByUserIdAndDomains(userId, domains) {
        const normalizedDomains = new Set(
          domains
            .filter((domain): domain is string => typeof domain === 'string')
            .map((domain) => domain.trim().toLowerCase())
            .filter((domain) => domain.length > 0),
        );
        if (normalizedDomains.size === 0) {
          return [];
        }
        return Array.from(userIconState.values())
          .filter((record) => record.userId === userId && normalizedDomains.has(record.domain))
          .sort((left, right) => left.domain.localeCompare(right.domain))
          .map((record) => ({ ...record }));
      },
      async findByUserIdAndDomain(userId, domain) {
        const normalizedDomain = domain.trim().toLowerCase();
        if (!normalizedDomain) {
          return null;
        }
        const record = userIconState.get(`${userId}:${normalizedDomain}`);
        return record ? { ...record } : null;
      },
      async upsert(record) {
        const normalized: UserIconStateRecord = {
          ...record,
          domain: record.domain.trim().toLowerCase(),
          status: record.status,
          objectId: record.objectId ?? null,
        };
        const key = `${normalized.userId}:${normalized.domain}`;
        const existing = userIconState.get(key);
        const changed =
          !existing ||
          existing.status !== normalized.status ||
          existing.objectId !== normalized.objectId ||
          existing.updatedAt !== normalized.updatedAt;
        userIconState.set(key, normalized);
        return {
          record: { ...normalized },
          changed,
        };
      },
      async remove(inputRecord) {
        const key = `${inputRecord.userId}:${inputRecord.domain.trim().toLowerCase()}`;
        return userIconState.delete(key);
      },
      async getVersion(userId) {
        return userIconVersions.get(userId) ?? 0;
      },
      async bumpVersion(inputRecord) {
        const current = userIconVersions.get(inputRecord.userId) ?? 0;
        const next = current + 1;
        userIconVersions.set(inputRecord.userId, next);
        return next;
      },
    },
    userIconItemDomains: {
      async replaceItemHosts(inputRecord) {
        const normalizedItemId = inputRecord.itemId.trim();
        const normalizedHosts = Array.from(
          new Set(
            inputRecord.hosts
              .filter((host): host is string => typeof host === 'string')
              .map((host) => host.trim().toLowerCase())
              .filter((host) => host.length > 0),
          ),
        );
        const headKey = `${inputRecord.userId}:${inputRecord.deviceId}:${normalizedItemId}`;
        const existingHead = userIconItemDomainHeads.get(headKey);
        if (existingHead && inputRecord.itemRevision < existingHead.itemRevision) {
          return {
            result: 'success_no_op_stale_revision' as const,
            changed: false,
          };
        }

        const existingHosts = Array.from(userIconItemDomainRows.values())
          .filter(
            (record) =>
              record.userId === inputRecord.userId &&
              record.deviceId === inputRecord.deviceId &&
              record.itemId === normalizedItemId,
          )
          .map((record) => record.host)
          .sort();
        const nextHosts = [...normalizedHosts].sort();
        const hostsChanged =
          existingHosts.length !== nextHosts.length ||
          existingHosts.some((value, index) => value !== nextHosts[index]);
        const revisionChanged = !existingHead || existingHead.itemRevision !== inputRecord.itemRevision;

        for (const [rowKey, row] of userIconItemDomainRows.entries()) {
          if (
            row.userId === inputRecord.userId &&
            row.deviceId === inputRecord.deviceId &&
            row.itemId === normalizedItemId
          ) {
            userIconItemDomainRows.delete(rowKey);
          }
        }
        for (const host of normalizedHosts) {
          const row: UserIconItemDomainRecord = {
            userId: inputRecord.userId,
            deviceId: inputRecord.deviceId,
            surface: inputRecord.surface,
            itemId: normalizedItemId,
            host,
            itemRevision: inputRecord.itemRevision,
            generationId: inputRecord.generationId ?? existingHead?.generationId ?? null,
            lastSeenAt: inputRecord.updatedAt,
            updatedAt: inputRecord.updatedAt,
          };
          userIconItemDomainRows.set(`${row.userId}:${row.deviceId}:${row.itemId}:${row.host}`, row);
        }
        userIconItemDomainHeads.set(headKey, {
          userId: inputRecord.userId,
          deviceId: inputRecord.deviceId,
          surface: inputRecord.surface,
          itemId: normalizedItemId,
          itemRevision: inputRecord.itemRevision,
          generationId: inputRecord.generationId ?? existingHead?.generationId ?? null,
          lastSeenAt: inputRecord.updatedAt,
          updatedAt: inputRecord.updatedAt,
        });
        const changed = hostsChanged || revisionChanged;
        return {
          result: changed ? ('success_changed' as const) : ('success_no_op' as const),
          changed,
        };
      },
      async startReindex(inputRecord) {
        const sessionKey = `${inputRecord.userId}:${inputRecord.deviceId}`;
        const session: UserIconReindexSessionRecord = {
          userId: inputRecord.userId,
          deviceId: inputRecord.deviceId,
          surface: inputRecord.surface,
          generationId: inputRecord.generationId,
          startedAt: inputRecord.startedAt,
          updatedAt: inputRecord.startedAt,
        };
        userIconReindexSessions.set(sessionKey, session);
        return { ...session };
      },
      async upsertReindexChunk(inputRecord) {
        const sessionKey = `${inputRecord.userId}:${inputRecord.deviceId}`;
        const session = userIconReindexSessions.get(sessionKey);
        if (!session || session.generationId !== inputRecord.generationId) {
          return { acceptedItems: 0 };
        }
        let acceptedItems = 0;
        for (const entry of inputRecord.entries) {
          const normalizedItemId = entry.itemId.trim();
          const headKey = `${inputRecord.userId}:${inputRecord.deviceId}:${normalizedItemId}`;
          const existingHead = userIconItemDomainHeads.get(headKey);
          if (existingHead && entry.itemRevision < existingHead.itemRevision) {
            continue;
          }
          const normalizedHosts = Array.from(
            new Set(
              entry.hosts
                .filter((host): host is string => typeof host === 'string')
                .map((host) => host.trim().toLowerCase())
                .filter((host) => host.length > 0),
            ),
          );
          for (const [rowKey, row] of userIconItemDomainRows.entries()) {
            if (
              row.userId === inputRecord.userId &&
              row.deviceId === inputRecord.deviceId &&
              row.itemId === normalizedItemId
            ) {
              userIconItemDomainRows.delete(rowKey);
            }
          }
          for (const host of normalizedHosts) {
            const row: UserIconItemDomainRecord = {
              userId: inputRecord.userId,
              deviceId: inputRecord.deviceId,
              surface: inputRecord.surface,
              itemId: normalizedItemId,
              host,
              itemRevision: entry.itemRevision,
              generationId: inputRecord.generationId,
              lastSeenAt: inputRecord.updatedAt,
              updatedAt: inputRecord.updatedAt,
            };
            userIconItemDomainRows.set(`${row.userId}:${row.deviceId}:${row.itemId}:${row.host}`, row);
          }
          acceptedItems += 1;
          userIconItemDomainHeads.set(headKey, {
            userId: inputRecord.userId,
            deviceId: inputRecord.deviceId,
            surface: inputRecord.surface,
            itemId: normalizedItemId,
            itemRevision: entry.itemRevision,
            generationId: inputRecord.generationId,
            lastSeenAt: inputRecord.updatedAt,
            updatedAt: inputRecord.updatedAt,
          });
        }
        userIconReindexSessions.set(sessionKey, {
          ...session,
          updatedAt: inputRecord.updatedAt,
        });
        return { acceptedItems };
      },
      async commitReindex(inputRecord) {
        const sessionKey = `${inputRecord.userId}:${inputRecord.deviceId}`;
        const session = userIconReindexSessions.get(sessionKey);
        if (!session || session.generationId !== inputRecord.generationId) {
          return { changed: false };
        }
        let changed = false;
        for (const [headKey, head] of userIconItemDomainHeads.entries()) {
          if (head.userId !== inputRecord.userId || head.deviceId !== inputRecord.deviceId) {
            continue;
          }
          if (head.generationId === inputRecord.generationId) {
            continue;
          }
          userIconItemDomainHeads.delete(headKey);
          changed = true;
          for (const [rowKey, row] of userIconItemDomainRows.entries()) {
            if (
              row.userId === inputRecord.userId &&
              row.deviceId === inputRecord.deviceId &&
              row.itemId === head.itemId
            ) {
              userIconItemDomainRows.delete(rowKey);
            }
          }
        }
        userIconReindexSessions.delete(sessionKey);
        return { changed };
      },
      async listEffectiveHostsByUserId(userId) {
        return Array.from(
          new Set(
            Array.from(userIconItemDomainRows.values())
              .filter((record) => record.userId === userId)
              .map((record) => record.host),
          ),
        ).sort();
      },
    },
    iconIngestJobs: {
      async create(record) {
        const normalized: IconIngestJobRecord = {
          ...record,
          domain: record.domain.trim().toLowerCase(),
          sha256: record.sha256.trim().toLowerCase(),
          r2Key: record.r2Key.trim(),
          objectId: record.objectId ?? null,
          errorCode: record.errorCode ?? null,
        };
        iconIngestJobs.set(normalized.jobId, normalized);
        return { ...normalized };
      },
      async updateStatus(inputRecord) {
        const current = iconIngestJobs.get(inputRecord.jobId);
        if (!current) {
          return null;
        }
        const updated: IconIngestJobRecord = {
          ...current,
          status: inputRecord.status,
          objectId:
            Object.prototype.hasOwnProperty.call(inputRecord, 'objectId') && inputRecord.objectId !== undefined
              ? (inputRecord.objectId ?? null)
              : current.objectId,
          errorCode:
            Object.prototype.hasOwnProperty.call(inputRecord, 'errorCode') && inputRecord.errorCode !== undefined
              ? (inputRecord.errorCode ?? null)
              : current.errorCode,
          updatedAt: inputRecord.updatedAt,
        };
        iconIngestJobs.set(updated.jobId, updated);
        return { ...updated };
      },
      async findByJobId(jobId) {
        const record = iconIngestJobs.get(jobId);
        return record ? { ...record } : null;
      },
      async listByStatus(inputRecord) {
        const safeLimit = Number.isFinite(inputRecord.limit)
          ? Math.max(1, Math.min(5_000, Math.trunc(inputRecord.limit)))
          : 200;
        return Array.from(iconIngestJobs.values())
          .filter((record) => record.status === inputRecord.status)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .slice(0, safeLimit)
          .map((record) => ({ ...record }));
      },
      async delete(jobId) {
        return iconIngestJobs.delete(jobId);
      },
    },
    passwordGeneratorHistory: {
      async listByUserId(userId, limit) {
        const normalizedLimit = Number.isFinite(limit)
          ? Math.max(1, Math.min(500, Math.trunc(limit)))
          : 200;
        return Array.from(passwordGeneratorHistory.values())
          .filter((record) => record.userId === userId)
          .sort((left, right) => {
            const updatedCompare = right.updatedAt.localeCompare(left.updatedAt);
            if (updatedCompare !== 0) return updatedCompare;
            return right.entryId.localeCompare(left.entryId);
          })
          .slice(0, normalizedLimit)
          .map((record) => ({ ...record }));
      },
      async upsert(record) {
        const normalized: PasswordGeneratorHistoryRecord = {
          ...record,
          entryId: record.entryId.trim(),
        };
        const key = `${normalized.userId}:${normalized.entryId}`;
        passwordGeneratorHistory.set(key, normalized);
        return { ...normalized };
      },
      async pruneByUserId(userId, limit) {
        const normalizedLimit = Number.isFinite(limit)
          ? Math.max(1, Math.min(500, Math.trunc(limit)))
          : 200;
        const userRecords = Array.from(passwordGeneratorHistory.values())
          .filter((record) => record.userId === userId)
          .sort((left, right) => {
            const updatedCompare = right.updatedAt.localeCompare(left.updatedAt);
            if (updatedCompare !== 0) return updatedCompare;
            return right.entryId.localeCompare(left.entryId);
          });
        userRecords.slice(normalizedLimit).forEach((record) => {
          passwordGeneratorHistory.delete(`${record.userId}:${record.entryId}`);
        });
      },
    },
    realtimeOutbox: {
      async enqueue(record) {
        const normalized: RealtimeOutboxRecord = {
          ...record,
          attemptCount: Math.max(0, Math.trunc(record.attemptCount)),
        };
        realtimeOutbox.set(normalized.id, normalized);
        return { ...normalized };
      },
      async listPendingByUserId(userId, limit) {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 100;
        return Array.from(realtimeOutbox.values())
          .filter((record) => record.userId === userId && record.publishedAt === null)
          .sort((left, right) => {
            const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
            if (byCreatedAt !== 0) {
              return byCreatedAt;
            }
            return left.id.localeCompare(right.id);
          })
          .slice(0, safeLimit)
          .map((record) => ({ ...record }));
      },
      async markPublished(inputRecord) {
        const record = realtimeOutbox.get(inputRecord.id);
        if (!record) {
          return;
        }
        realtimeOutbox.set(inputRecord.id, {
          ...record,
          publishedAt: inputRecord.publishedAt,
          lastError: null,
        });
      },
      async markFailed(inputRecord) {
        const record = realtimeOutbox.get(inputRecord.id);
        if (!record) {
          return;
        }
        realtimeOutbox.set(inputRecord.id, {
          ...record,
          attemptCount: record.attemptCount + 1,
          lastError: inputRecord.lastError,
          createdAt: record.createdAt,
        });
      },
      async deletePublishedBefore(inputRecord) {
        const safeLimit = Number.isFinite(inputRecord.limit)
          ? Math.max(1, Math.min(1_000, Math.trunc(inputRecord.limit)))
          : 500;
        const candidates = Array.from(realtimeOutbox.values())
          .filter(
            (record) =>
              record.publishedAt !== null && record.publishedAt <= inputRecord.cutoffIso,
          )
          .sort((left, right) => (left.publishedAt ?? '').localeCompare(right.publishedAt ?? ''))
          .slice(0, safeLimit);
        for (const candidate of candidates) {
          realtimeOutbox.delete(candidate.id);
        }
        return candidates.length;
      },
    },
    realtimeOneTimeTokens: {
      async consume(inputRecord) {
        for (const [tokenKey, record] of realtimeOneTimeTokens.entries()) {
          if (record.expiresAt <= inputRecord.consumedAt) {
            realtimeOneTimeTokens.delete(tokenKey);
          }
        }
        if (realtimeOneTimeTokens.has(inputRecord.tokenKey)) {
          return { consumed: false };
        }
        realtimeOneTimeTokens.set(inputRecord.tokenKey, {
          tokenKey: inputRecord.tokenKey,
          consumedAt: inputRecord.consumedAt,
          expiresAt: inputRecord.expiresAt,
        });
        return { consumed: true };
      },
      async pruneExpired(inputRecord) {
        const safeLimit = Number.isFinite(inputRecord.limit)
          ? Math.max(1, Math.min(1_000, Math.trunc(inputRecord.limit)))
          : 500;
        let deletedCount = 0;
        for (const [tokenKey, record] of realtimeOneTimeTokens.entries()) {
          if (deletedCount >= safeLimit) {
            break;
          }
          if (record.expiresAt <= inputRecord.nowIso) {
            realtimeOneTimeTokens.delete(tokenKey);
            deletedCount += 1;
          }
        }
        return deletedCount;
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
      async listByOwner(ownerUserId) {
        return Array.from(attachmentBlobs.values())
          .filter((record) => record.ownerUserId === ownerUserId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((record) => ({ ...record }));
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

