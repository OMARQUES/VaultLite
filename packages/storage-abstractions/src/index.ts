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
  lifecycleState: AttachmentLifecycleState;
  envelope: string;
  contentType: string;
  size: number;
  idempotencyKey: string | null;
  uploadToken: string | null;
  expiresAt: string | null;
  uploadedAt: string | null;
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
  updateRecentReauth(sessionId: string, recentReauthAtIso: string): Promise<void>;
  revoke(sessionId: string, revokedAtIso: string): Promise<void>;
  revokeByUserId(userId: string, revokedAtIso: string): Promise<void>;
  revokeByDeviceId(deviceId: string, revokedAtIso: string): Promise<void>;
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
  delete(itemId: string, ownerUserId: string): Promise<boolean>;
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

export interface VaultLiteStorage {
  deploymentState: DeploymentStateRepository;
  invites: InviteRepository;
  users: UserAccountRepository;
  devices: DeviceRepository;
  sessions: SessionRepository;
  authRateLimits: AuthRateLimitRepository;
  idempotency: IdempotencyRepository;
  auditEvents: AuditEventRepository;
  attachmentBlobs: AttachmentBlobRepository;
  vaultItems: VaultItemRepository;
  completeOnboardingAtomic(input: CompleteOnboardingAtomicInput): Promise<CompleteOnboardingAtomicResult>;
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
      async delete(itemId, ownerUserId) {
        const current = vaultItems.get(itemId);
        if (!current || current.ownerUserId !== ownerUserId) {
          return false;
        }

        const tombstone: VaultItemTombstoneRecord = {
          itemId: current.itemId,
          ownerUserId: current.ownerUserId,
          itemType: current.itemType,
          revision: current.revision + 1,
          deletedAt: new Date().toISOString(),
        };
        vaultItemTombstones.set(`${ownerUserId}:${itemId}`, tombstone);
        vaultItems.delete(itemId);
        return true;
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
  };
}

