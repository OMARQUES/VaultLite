import type {
  AttachmentLifecycleState,
  TrustedDevice,
  UserLifecycleState,
  VaultItemTombstoneRecord,
  VaultItemType,
} from '@vaultlite/domain';

export type { VaultItemTombstoneRecord } from '@vaultlite/domain';

export interface InviteRecord {
  inviteId: string;
  inviteToken: string;
  createdByUserId: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface UserAccountRecord {
  userId: string;
  username: string;
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
  revokedAt: string | null;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  deviceId: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  rotatedFromSessionId: string | null;
}

export interface AuthRateLimitRecord {
  key: string;
  attemptCount: number;
  windowStartedAt: string;
}

export interface AttachmentBlobRecord {
  key: string;
  ownerUserId: string;
  itemId: string | null;
  lifecycleState: AttachmentLifecycleState;
  envelope: string;
  contentType: string;
  size: number;
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

export interface InviteRepository {
  create(record: InviteRecord): Promise<InviteRecord>;
  findUsableByToken(inviteToken: string, nowIso: string): Promise<InviteRecord | null>;
  consume(inviteId: string, consumedAtIso: string): Promise<void>;
}

export interface UserAccountRepository {
  create(record: UserAccountRecord): Promise<UserAccountRecord>;
  findByUsername(username: string): Promise<UserAccountRecord | null>;
  findByUserId(userId: string): Promise<UserAccountRecord | null>;
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
  revokeByUserId(userId: string, revokedAtIso: string): Promise<void>;
  revokeByDeviceId(deviceId: string, revokedAtIso: string): Promise<void>;
}

export interface SessionRepository {
  create(record: SessionRecord): Promise<SessionRecord>;
  findBySessionId(sessionId: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, revokedAtIso: string): Promise<void>;
  revokeByUserId(userId: string, revokedAtIso: string): Promise<void>;
  revokeByDeviceId(deviceId: string, revokedAtIso: string): Promise<void>;
}

export interface AuthRateLimitRepository {
  increment(key: string, nowIso: string): Promise<AuthRateLimitRecord>;
  get(key: string): Promise<AuthRateLimitRecord | null>;
  reset(key: string): Promise<void>;
}

export interface AttachmentBlobRepository {
  put(record: AttachmentBlobRecord): Promise<AttachmentBlobRecord>;
  get(key: string): Promise<AttachmentBlobRecord | null>;
  delete(key: string): Promise<void>;
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
  inviteToken: string;
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
  invites: InviteRepository;
  users: UserAccountRepository;
  devices: DeviceRepository;
  sessions: SessionRepository;
  authRateLimits: AuthRateLimitRepository;
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

  return {
    invites: {
      async create(record) {
        invites.set(record.inviteId, { ...record });
        return { ...record };
      },
      async findUsableByToken(inviteToken, nowIso) {
        const now = nowIso;
        for (const invite of invites.values()) {
          if (
            invite.inviteToken === inviteToken &&
            invite.consumedAt === null &&
            invite.expiresAt > now
          ) {
            return { ...invite };
          }
        }

        return null;
      },
      async consume(inviteId, consumedAtIso) {
        const invite = invites.get(inviteId);
        if (!invite) {
          return;
        }

        invites.set(inviteId, { ...invite, consumedAt: consumedAtIso });
      },
    },
    users: {
      async create(record) {
        const clone = { ...record };
        usersById.set(clone.userId, clone);
        usersByUsername.set(clone.username, clone);
        return { ...clone };
      },
      async findByUsername(username) {
        const record = usersByUsername.get(username);
        return record ? { ...record } : null;
      },
      async findByUserId(userId) {
        const record = usersById.get(userId);
        return record ? { ...record } : null;
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
      async revokeByUserId(userId, revokedAtIso) {
        for (const [deviceId, device] of devices.entries()) {
          if (device.userId === userId) {
            devices.set(deviceId, { ...device, revokedAt: revokedAtIso });
          }
        }
      },
      async revokeByDeviceId(deviceId, revokedAtIso) {
        const device = devices.get(deviceId);
        if (!device) {
          return;
        }

        devices.set(deviceId, { ...device, revokedAt: revokedAtIso });
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
      async increment(key, nowIso) {
        const current = rateLimits.get(key);
        const next: AuthRateLimitRecord = current
          ? { ...current, attemptCount: current.attemptCount + 1 }
          : { key, attemptCount: 1, windowStartedAt: nowIso };
        rateLimits.set(key, next);
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
    attachmentBlobs: {
      async put(record) {
        attachmentBlobs.set(record.key, { ...record });
        return { ...record };
      },
      async get(key) {
        const record = attachmentBlobs.get(key);
        return record ? { ...record } : null;
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
          invite.inviteToken === inputRecord.inviteToken &&
          invite.consumedAt === null &&
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

