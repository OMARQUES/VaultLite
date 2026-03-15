import type {
  AttachmentBlobRecord,
  AttachmentBlobRepository,
  AuthRateLimitRecord,
  AuthRateLimitRepository,
  CompleteOnboardingAtomicInput,
  CompleteOnboardingAtomicResult,
  DeviceRecord,
  DeviceRepository,
  InviteRecord,
  InviteRepository,
  SessionRecord,
  SessionRepository,
  UserAccountRecord,
  UserAccountRepository,
  VaultItemRecord,
  VaultItemTombstoneRecord,
  VaultItemRepository,
  VaultLiteStorage,
} from '@vaultlite/storage-abstractions';
import { createInMemoryVaultLiteStorage } from '@vaultlite/storage-abstractions';

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  exec(query: string): Promise<unknown>;
  batch?(statements: D1PreparedStatementLike[]): Promise<unknown>;
}

export interface R2StoredObjectLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: {
    contentType?: string;
  };
  size?: number;
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2StoredObjectLike | null>;
  delete(key: string): Promise<void>;
}

export interface CloudflareMigration {
  id: string;
  filename: string;
  sql: string;
  statements: string[];
}

const MIGRATION_FILENAME_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/i;
const EMBEDDED_CLOUDFLARE_MIGRATIONS: Array<{
  id: string;
  filename: string;
  sql: string;
}> = [
  {
    id: '0001_initial',
    filename: '0001_initial.sql',
    sql: `CREATE TABLE IF NOT EXISTS invites (
  invite_id TEXT PRIMARY KEY,
  invite_token TEXT NOT NULL UNIQUE,
  created_by_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_accounts (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  auth_salt TEXT NOT NULL,
  auth_verifier TEXT NOT NULL,
  encrypted_account_bundle TEXT NOT NULL,
  account_key_wrapped TEXT NOT NULL,
  bundle_version INTEGER NOT NULL,
  lifecycle_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trusted_devices (
  device_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  rotated_from_session_id TEXT
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_limit_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL,
  window_started_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachment_blobs (
  blob_key TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  item_id TEXT,
  lifecycle_state TEXT NOT NULL,
  envelope TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
  },
  {
    id: '0002_vault_items',
    filename: '0002_vault_items.sql',
    sql: `CREATE TABLE IF NOT EXISTS vault_items (
  item_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_items_owner_created_at
  ON vault_items (owner_user_id, created_at);`,
  },
  {
    id: '0003_vault_item_tombstones',
    filename: '0003_vault_item_tombstones.sql',
    sql: `CREATE TABLE IF NOT EXISTS vault_item_tombstones (
  item_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (item_id, owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_item_tombstones_owner_deleted_at
  ON vault_item_tombstones (owner_user_id, deleted_at);`,
  },
];

export function getInfrastructureMigrationDirectory(): URL | string {
  try {
    return new URL('../../../infrastructure/migrations/', import.meta.url);
  } catch {
    if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
      return `${process.cwd()}\\infrastructure\\migrations`;
    }

    throw new Error('Unable to resolve infrastructure migrations directory');
  }
}

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => `${statement};`);
}

export async function loadCloudflareMigrations(
  source: URL | string = getInfrastructureMigrationDirectory(),
): Promise<CloudflareMigration[]> {
  const defaultSource = getInfrastructureMigrationDirectory();
  const isDefaultSource =
    typeof source === 'string' && typeof defaultSource === 'string'
      ? source === defaultSource
      : source instanceof URL && defaultSource instanceof URL
        ? source.href === defaultSource.href
        : false;
  try {
    const { readdir, readFile } = await import('node:fs/promises');
    const { pathToFileURL } = await import('node:url');
    const directory =
      source instanceof URL
        ? source
        : pathToFileURL(source.endsWith('\\') || source.endsWith('/') ? source : `${source}/`);
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((entry) => entry.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right));

    const migrations: CloudflareMigration[] = [];
    let expectedOrder = 1;

    for (const filename of entries) {
      const match = MIGRATION_FILENAME_PATTERN.exec(filename);
      if (!match) {
        throw new Error(`Invalid migration filename: ${filename}`);
      }

      const order = Number.parseInt(match[1] ?? '', 10);
      if (order !== expectedOrder) {
        throw new Error(
          `Invalid migration order: expected ${expectedOrder.toString().padStart(4, '0')} but found ${filename}`,
        );
      }

      const fileUrl =
        source instanceof URL ? new URL(filename, source) : new URL(filename, directory);
      const sql = await readFile(fileUrl, 'utf8');
      migrations.push({
        id: `${match[1]}_${match[2]}`,
        filename,
        sql,
        statements: splitStatements(sql),
      });
      expectedOrder += 1;
    }

    return migrations;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      isDefaultSource &&
      (message.includes('no such file or directory') ||
        message.includes('invalid url string') ||
        message.includes('access to the file system is not allowed'))
    ) {
      return EMBEDDED_CLOUDFLARE_MIGRATIONS.map((migration) => ({
        ...migration,
        statements: splitStatements(migration.sql),
      }));
    }

    throw error;
  }
}

async function executeOne(db: D1DatabaseLike, query: string, values: unknown[] = []): Promise<void> {
  await db.prepare(query).bind(...values).run();
}

async function selectOne<T>(
  db: D1DatabaseLike,
  query: string,
  values: unknown[] = [],
): Promise<T | null> {
  return db.prepare(query).bind(...values).first<T>();
}

async function selectMany<T>(
  db: D1DatabaseLike,
  query: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await db.prepare(query).bind(...values).all<T>();
  return result.results;
}

class CloudflareInviteRepository implements InviteRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: InviteRecord): Promise<InviteRecord> {
    await executeOne(
      this.db,
      `INSERT INTO invites (invite_id, invite_token, created_by_user_id, expires_at, consumed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.inviteId,
        record.inviteToken,
        record.createdByUserId,
        record.expiresAt,
        record.consumedAt,
        record.createdAt,
      ],
    );
    return record;
  }

  async findUsableByToken(inviteToken: string, nowIso: string): Promise<InviteRecord | null> {
    return selectOne<InviteRecord>(
      this.db,
      `SELECT invite_id AS inviteId, invite_token AS inviteToken, created_by_user_id AS createdByUserId,
              expires_at AS expiresAt, consumed_at AS consumedAt, created_at AS createdAt
       FROM invites
       WHERE invite_token = ? AND consumed_at IS NULL AND expires_at > ?`,
      [inviteToken, nowIso],
    );
  }

  async consume(inviteId: string, consumedAtIso: string): Promise<void> {
    await executeOne(this.db, `UPDATE invites SET consumed_at = ? WHERE invite_id = ?`, [
      consumedAtIso,
      inviteId,
    ]);
  }
}

class CloudflareUserAccountRepository implements UserAccountRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: UserAccountRecord): Promise<UserAccountRecord> {
    await executeOne(
      this.db,
      `INSERT INTO user_accounts (
          user_id, username, auth_salt, auth_verifier, encrypted_account_bundle,
          account_key_wrapped, bundle_version, lifecycle_state, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.userId,
        record.username,
        record.authSalt,
        record.authVerifier,
        record.encryptedAccountBundle,
        record.accountKeyWrapped,
        record.bundleVersion,
        record.lifecycleState,
        record.createdAt,
        record.updatedAt,
      ],
    );

    return record;
  }

  async findByUsername(username: string): Promise<UserAccountRecord | null> {
    return selectOne<UserAccountRecord>(
      this.db,
      `SELECT user_id AS userId, username, auth_salt AS authSalt, auth_verifier AS authVerifier,
              encrypted_account_bundle AS encryptedAccountBundle, account_key_wrapped AS accountKeyWrapped,
              bundle_version AS bundleVersion, lifecycle_state AS lifecycleState,
              created_at AS createdAt, updated_at AS updatedAt
       FROM user_accounts WHERE username = ?`,
      [username],
    );
  }

  async findByUserId(userId: string): Promise<UserAccountRecord | null> {
    return selectOne<UserAccountRecord>(
      this.db,
      `SELECT user_id AS userId, username, auth_salt AS authSalt, auth_verifier AS authVerifier,
              encrypted_account_bundle AS encryptedAccountBundle, account_key_wrapped AS accountKeyWrapped,
              bundle_version AS bundleVersion, lifecycle_state AS lifecycleState,
              created_at AS createdAt, updated_at AS updatedAt
       FROM user_accounts WHERE user_id = ?`,
      [userId],
    );
  }

  async updateLifecycle(userId: string, lifecycleState: UserAccountRecord['lifecycleState'], updatedAtIso: string): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE user_accounts SET lifecycle_state = ?, updated_at = ? WHERE user_id = ?`,
      [lifecycleState, updatedAtIso, userId],
    );
  }

  async replaceAuthBundle(input: {
    userId: string;
    authSalt: string;
    authVerifier: string;
    encryptedAccountBundle: string;
    accountKeyWrapped: string;
    expectedBundleVersion: number;
    updatedAtIso: string;
  }): Promise<UserAccountRecord> {
    const current = await this.findByUserId(input.userId);
    if (!current) {
      throw new Error(`Unknown user ${input.userId}`);
    }
    if (current.bundleVersion !== input.expectedBundleVersion) {
      throw new Error('Bundle version mismatch');
    }

    const nextBundleVersion = current.bundleVersion + 1;
    await executeOne(
      this.db,
      `UPDATE user_accounts
       SET auth_salt = ?, auth_verifier = ?, encrypted_account_bundle = ?, account_key_wrapped = ?,
           bundle_version = ?, updated_at = ?
       WHERE user_id = ?`,
      [
        input.authSalt,
        input.authVerifier,
        input.encryptedAccountBundle,
        input.accountKeyWrapped,
        nextBundleVersion,
        input.updatedAtIso,
        input.userId,
      ],
    );

    return {
      ...current,
      authSalt: input.authSalt,
      authVerifier: input.authVerifier,
      encryptedAccountBundle: input.encryptedAccountBundle,
      accountKeyWrapped: input.accountKeyWrapped,
      bundleVersion: nextBundleVersion,
      updatedAt: input.updatedAtIso,
    };
  }
}

class CloudflareDeviceRepository implements DeviceRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async register(record: DeviceRecord): Promise<DeviceRecord> {
    await executeOne(
      this.db,
      `INSERT INTO trusted_devices (device_id, user_id, device_name, platform, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [record.deviceId, record.userId, record.deviceName, record.platform, record.createdAt, record.revokedAt],
    );
    return record;
  }

  async listByUserId(userId: string): Promise<DeviceRecord[]> {
    return selectMany<DeviceRecord>(
      this.db,
      `SELECT device_id AS deviceId, user_id AS userId, device_name AS deviceName,
              platform, created_at AS createdAt, revoked_at AS revokedAt
       FROM trusted_devices WHERE user_id = ? ORDER BY created_at ASC`,
      [userId],
    );
  }

  async findById(deviceId: string): Promise<DeviceRecord | null> {
    return selectOne<DeviceRecord>(
      this.db,
      `SELECT device_id AS deviceId, user_id AS userId, device_name AS deviceName,
              platform, created_at AS createdAt, revoked_at AS revokedAt
       FROM trusted_devices WHERE device_id = ?`,
      [deviceId],
    );
  }

  async revokeByUserId(userId: string, revokedAtIso: string): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE trusted_devices SET revoked_at = ? WHERE user_id = ?`,
      [revokedAtIso, userId],
    );
  }

  async revokeByDeviceId(deviceId: string, revokedAtIso: string): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE trusted_devices SET revoked_at = ? WHERE device_id = ?`,
      [revokedAtIso, deviceId],
    );
  }
}

class CloudflareSessionRepository implements SessionRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: SessionRecord): Promise<SessionRecord> {
    await executeOne(
      this.db,
      `INSERT INTO sessions (session_id, user_id, device_id, csrf_token, created_at, expires_at, revoked_at, rotated_from_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.sessionId,
        record.userId,
        record.deviceId,
        record.csrfToken,
        record.createdAt,
        record.expiresAt,
        record.revokedAt,
        record.rotatedFromSessionId,
      ],
    );
    return record;
  }

  async findBySessionId(sessionId: string): Promise<SessionRecord | null> {
    return selectOne<SessionRecord>(
      this.db,
      `SELECT session_id AS sessionId, user_id AS userId, device_id AS deviceId, csrf_token AS csrfToken,
              created_at AS createdAt, expires_at AS expiresAt, revoked_at AS revokedAt,
              rotated_from_session_id AS rotatedFromSessionId
       FROM sessions WHERE session_id = ?`,
      [sessionId],
    );
  }

  async revoke(sessionId: string, revokedAtIso: string): Promise<void> {
    await executeOne(this.db, `UPDATE sessions SET revoked_at = ? WHERE session_id = ?`, [
      revokedAtIso,
      sessionId,
    ]);
  }

  async revokeByUserId(userId: string, revokedAtIso: string): Promise<void> {
    await executeOne(this.db, `UPDATE sessions SET revoked_at = ? WHERE user_id = ?`, [
      revokedAtIso,
      userId,
    ]);
  }

  async revokeByDeviceId(deviceId: string, revokedAtIso: string): Promise<void> {
    await executeOne(this.db, `UPDATE sessions SET revoked_at = ? WHERE device_id = ?`, [
      revokedAtIso,
      deviceId,
    ]);
  }
}

class CloudflareAuthRateLimitRepository implements AuthRateLimitRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async increment(key: string, nowIso: string): Promise<AuthRateLimitRecord> {
    const current = await this.get(key);
    if (!current) {
      await executeOne(
        this.db,
        `INSERT INTO auth_rate_limits (rate_limit_key, attempt_count, window_started_at)
         VALUES (?, ?, ?)`,
        [key, 1, nowIso],
      );
      return { key, attemptCount: 1, windowStartedAt: nowIso };
    }

    const nextAttemptCount = current.attemptCount + 1;
    await executeOne(
      this.db,
      `UPDATE auth_rate_limits SET attempt_count = ?, window_started_at = ? WHERE rate_limit_key = ?`,
      [nextAttemptCount, current.windowStartedAt, key],
    );
    return { key, attemptCount: nextAttemptCount, windowStartedAt: current.windowStartedAt };
  }

  async get(key: string): Promise<AuthRateLimitRecord | null> {
    return selectOne<AuthRateLimitRecord>(
      this.db,
      `SELECT rate_limit_key AS key, attempt_count AS attemptCount, window_started_at AS windowStartedAt
       FROM auth_rate_limits WHERE rate_limit_key = ?`,
      [key],
    );
  }

  async reset(key: string): Promise<void> {
    await executeOne(this.db, `DELETE FROM auth_rate_limits WHERE rate_limit_key = ?`, [key]);
  }
}

class CloudflareAttachmentBlobRepository implements AttachmentBlobRepository {
  constructor(private readonly db: D1DatabaseLike, private readonly bucket: R2BucketLike) {}

  async put(record: AttachmentBlobRecord): Promise<AttachmentBlobRecord> {
    await this.bucket.put(record.key, record.envelope, {
      httpMetadata: {
        contentType: record.contentType,
      },
    });
    await executeOne(
      this.db,
      `INSERT OR REPLACE INTO attachment_blobs (
          blob_key, owner_user_id, item_id, lifecycle_state, envelope, content_type, size, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.key,
        record.ownerUserId,
        record.itemId,
        record.lifecycleState,
        record.envelope,
        record.contentType,
        record.size,
        record.createdAt,
        record.updatedAt,
      ],
    );
    return record;
  }

  async get(key: string): Promise<AttachmentBlobRecord | null> {
    const metadata = await selectOne<AttachmentBlobRecord>(
      this.db,
      `SELECT blob_key AS key, owner_user_id AS ownerUserId, item_id AS itemId,
              lifecycle_state AS lifecycleState, envelope, content_type AS contentType,
              size, created_at AS createdAt, updated_at AS updatedAt
       FROM attachment_blobs WHERE blob_key = ?`,
      [key],
    );

    if (!metadata) {
      return null;
    }

    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }

    return metadata;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
    await executeOne(this.db, `DELETE FROM attachment_blobs WHERE blob_key = ?`, [key]);
  }
}

class CloudflareVaultItemRepository implements VaultItemRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async listByOwnerUserId(ownerUserId: string): Promise<VaultItemRecord[]> {
    return selectMany<VaultItemRecord>(
      this.db,
      `SELECT item_id AS itemId, owner_user_id AS ownerUserId, item_type AS itemType,
              revision, encrypted_payload AS encryptedPayload, created_at AS createdAt,
              updated_at AS updatedAt
       FROM vault_items
       WHERE owner_user_id = ?
       ORDER BY created_at ASC`,
      [ownerUserId],
    );
  }

  async listTombstonesByOwnerUserId(ownerUserId: string): Promise<VaultItemTombstoneRecord[]> {
    return selectMany<VaultItemTombstoneRecord>(
      this.db,
      `SELECT item_id AS itemId, owner_user_id AS ownerUserId, item_type AS itemType,
              revision, deleted_at AS deletedAt
       FROM vault_item_tombstones
       WHERE owner_user_id = ?
       ORDER BY deleted_at ASC`,
      [ownerUserId],
    );
  }

  async findByItemId(itemId: string, ownerUserId: string): Promise<VaultItemRecord | null> {
    return selectOne<VaultItemRecord>(
      this.db,
      `SELECT item_id AS itemId, owner_user_id AS ownerUserId, item_type AS itemType,
              revision, encrypted_payload AS encryptedPayload, created_at AS createdAt,
              updated_at AS updatedAt
       FROM vault_items
       WHERE item_id = ? AND owner_user_id = ?`,
      [itemId, ownerUserId],
    );
  }

  async findTombstoneByItemId(
    itemId: string,
    ownerUserId: string,
  ): Promise<VaultItemTombstoneRecord | null> {
    return selectOne<VaultItemTombstoneRecord>(
      this.db,
      `SELECT item_id AS itemId, owner_user_id AS ownerUserId, item_type AS itemType,
              revision, deleted_at AS deletedAt
       FROM vault_item_tombstones
       WHERE item_id = ? AND owner_user_id = ?`,
      [itemId, ownerUserId],
    );
  }

  async create(record: VaultItemRecord): Promise<VaultItemRecord> {
    await executeOne(
      this.db,
      `INSERT INTO vault_items (
          item_id, owner_user_id, item_type, revision, encrypted_payload, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.itemId,
        record.ownerUserId,
        record.itemType,
        record.revision,
        record.encryptedPayload,
        record.createdAt,
        record.updatedAt,
      ],
    );
    return record;
  }

  async update(input: {
    itemId: string;
    ownerUserId: string;
    itemType: VaultItemRecord['itemType'];
    encryptedPayload: string;
    expectedRevision: number;
    updatedAt: string;
  }): Promise<VaultItemRecord> {
    const current = await this.findByItemId(input.itemId, input.ownerUserId);
    if (!current) {
      throw new Error('item_not_found');
    }
    if (current.revision !== input.expectedRevision) {
      throw new Error('revision_conflict');
    }

    const nextRevision = current.revision + 1;
    await executeOne(
      this.db,
      `UPDATE vault_items
       SET item_type = ?, encrypted_payload = ?, revision = ?, updated_at = ?
       WHERE item_id = ? AND owner_user_id = ?`,
      [
        input.itemType,
        input.encryptedPayload,
        nextRevision,
        input.updatedAt,
        input.itemId,
        input.ownerUserId,
      ],
    );

    return {
      ...current,
      itemType: input.itemType,
      encryptedPayload: input.encryptedPayload,
      revision: nextRevision,
      updatedAt: input.updatedAt,
    };
  }

  async delete(itemId: string, ownerUserId: string): Promise<boolean> {
    const current = await this.findByItemId(itemId, ownerUserId);
    if (!current) {
      return false;
    }

    const tombstoneRevision = current.revision + 1;
    const deletedAt = new Date().toISOString();
    if (typeof this.db.batch === 'function') {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT OR REPLACE INTO vault_item_tombstones (
               item_id, owner_user_id, item_type, revision, deleted_at
             ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(itemId, ownerUserId, current.itemType, tombstoneRevision, deletedAt),
        this.db
          .prepare(`DELETE FROM vault_items WHERE item_id = ? AND owner_user_id = ?`)
          .bind(itemId, ownerUserId),
      ]);
    } else {
      await executeOne(
        this.db,
        `INSERT OR REPLACE INTO vault_item_tombstones (
           item_id, owner_user_id, item_type, revision, deleted_at
         ) VALUES (?, ?, ?, ?, ?)`,
        [itemId, ownerUserId, current.itemType, tombstoneRevision, deletedAt],
      );
      await executeOne(
        this.db,
        `DELETE FROM vault_items WHERE item_id = ? AND owner_user_id = ?`,
        [itemId, ownerUserId],
      );
    }
    return true;
  }
}

export async function applyCloudflareMigrations(db: D1DatabaseLike): Promise<void> {
  const migrations = await loadCloudflareMigrations();

  for (const migration of migrations) {
    for (const statement of migration.statements) {
      await db.prepare(statement).run();
    }
  }
}

export function createCloudflareVaultLiteStorage(input: {
  db: D1DatabaseLike;
  bucket: R2BucketLike;
}): VaultLiteStorage {
  const invites = new CloudflareInviteRepository(input.db);
  const users = new CloudflareUserAccountRepository(input.db);
  const devices = new CloudflareDeviceRepository(input.db);
  const sessions = new CloudflareSessionRepository(input.db);
  const vaultItems = new CloudflareVaultItemRepository(input.db);

  return {
    invites,
    users,
    devices,
    sessions,
    authRateLimits: new CloudflareAuthRateLimitRepository(input.db),
    attachmentBlobs: new CloudflareAttachmentBlobRepository(input.db, input.bucket),
    vaultItems,
    async completeOnboardingAtomic(record: CompleteOnboardingAtomicInput): Promise<CompleteOnboardingAtomicResult> {
      const invite = await invites.findUsableByToken(record.inviteToken, record.nowIso);
      if (!invite) {
        throw new Error('invalid_invite');
      }

      const existingUser = await users.findByUsername(record.user.username);
      if (existingUser) {
        throw new Error('username_unavailable');
      }

      if (typeof input.db.batch === 'function') {
        await input.db.batch([
          input.db.prepare(
            `INSERT INTO user_accounts (
                user_id, username, auth_salt, auth_verifier, encrypted_account_bundle,
                account_key_wrapped, bundle_version, lifecycle_state, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            record.user.userId,
            record.user.username,
            record.user.authSalt,
            record.user.authVerifier,
            record.user.encryptedAccountBundle,
            record.user.accountKeyWrapped,
            record.user.bundleVersion,
            record.user.lifecycleState,
            record.user.createdAt,
            record.user.updatedAt,
          ),
          input.db.prepare(`UPDATE invites SET consumed_at = ? WHERE invite_id = ?`).bind(
            record.nowIso,
            invite.inviteId,
          ),
          input.db.prepare(
            `INSERT INTO trusted_devices (device_id, user_id, device_name, platform, created_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).bind(
            record.device.deviceId,
            record.device.userId,
            record.device.deviceName,
            record.device.platform,
            record.device.createdAt,
            record.device.revokedAt,
          ),
          input.db.prepare(
            `INSERT INTO sessions (session_id, user_id, device_id, csrf_token, created_at, expires_at, revoked_at, rotated_from_session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            record.session.sessionId,
            record.session.userId,
            record.session.deviceId,
            record.session.csrfToken,
            record.session.createdAt,
            record.session.expiresAt,
            record.session.revokedAt,
            record.session.rotatedFromSessionId,
          ),
        ]);
      } else {
        await input.db.exec('BEGIN TRANSACTION');

        try {
          await users.create(record.user);
          await invites.consume(invite.inviteId, record.nowIso);
          await devices.register(record.device);
          await sessions.create(record.session);
          await input.db.exec('COMMIT');
        } catch (error) {
          try {
            await input.db.exec('ROLLBACK');
          } catch {
            // Preserve the original error for the caller.
          }
          throw error;
        }
      }

      return {
        user: record.user,
        device: record.device,
        session: record.session,
      };
    },
  };
}

export function createFallbackCloudflareStorage(): VaultLiteStorage {
  return createInMemoryVaultLiteStorage();
}
