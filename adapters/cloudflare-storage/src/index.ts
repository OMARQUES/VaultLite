import type {
  AttachmentBlobRecord,
  AttachmentBlobRepository,
  AuditEventRecord,
  AuditEventRepository,
  DeploymentStateRecord,
  DeploymentStateRepository,
  AuthRateLimitRecord,
  AuthRateLimitRepository,
  CompleteOnboardingAtomicInput,
  CompleteOnboardingAtomicResult,
  DeviceRecord,
  DeviceRepository,
  InviteRecord,
  InviteRepository,
  IdempotencyRecord,
  IdempotencyRepository,
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
  {
    id: '0004_attachment_upload_pending',
    filename: '0004_attachment_upload_pending.sql',
    sql: `ALTER TABLE attachment_blobs ADD COLUMN idempotency_key TEXT;
ALTER TABLE attachment_blobs ADD COLUMN upload_token TEXT;
ALTER TABLE attachment_blobs ADD COLUMN expires_at TEXT;
ALTER TABLE attachment_blobs ADD COLUMN uploaded_at TEXT;

CREATE INDEX IF NOT EXISTS idx_attachment_blobs_owner_item_created_at
  ON attachment_blobs (owner_user_id, item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attachment_blobs_owner_item_idempotency
  ON attachment_blobs (owner_user_id, item_id, idempotency_key);`,
  },
  {
    id: '0005_bootstrap_admin_foundation',
    filename: '0005_bootstrap_admin_foundation.sql',
    sql: `ALTER TABLE invites ADD COLUMN token_hash TEXT;
ALTER TABLE invites ADD COLUMN token_preview TEXT;
ALTER TABLE invites ADD COLUMN consumed_by_user_id TEXT;
ALTER TABLE invites ADD COLUMN revoked_at TEXT;
ALTER TABLE invites ADD COLUMN revoked_by_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_invites_token_hash
  ON invites (token_hash);

ALTER TABLE user_accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

ALTER TABLE trusted_devices ADD COLUMN device_state TEXT NOT NULL DEFAULT 'active';

ALTER TABLE sessions ADD COLUMN recent_reauth_at TEXT;

CREATE TABLE IF NOT EXISTS deployment_state (
  singleton_key TEXT PRIMARY KEY,
  bootstrap_state TEXT NOT NULL,
  owner_user_id TEXT,
  owner_created_at TEXT,
  bootstrap_public_closed_at TEXT,
  initial_checkpoint_completed_at TEXT,
  initialized_at TEXT,
  checkpoint_download_attempt_count INTEGER NOT NULL DEFAULT 0,
  checkpoint_last_download_at TEXT,
  checkpoint_last_download_request_id TEXT
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  scope TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  result TEXT NOT NULL,
  reason_code TEXT,
  resource_refs TEXT NOT NULL,
  audit_event_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_records_expires_at
  ON idempotency_records (expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT,
  result TEXT NOT NULL,
  reason_code TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON audit_events (created_at);`,
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
      `INSERT INTO invites (
          invite_id,
          invite_token,
          token_hash,
          token_preview,
          created_by_user_id,
          expires_at,
          consumed_at,
          consumed_by_user_id,
          revoked_at,
          revoked_by_user_id,
          created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.inviteId,
        // Legacy NOT NULL column retained by 0001 schema; keep it non-sensitive.
        // We persist token hash (never raw token) to preserve token_hash-only invariant.
        record.tokenHash,
        record.tokenHash,
        record.tokenPreview,
        record.createdByUserId,
        record.expiresAt,
        record.consumedAt,
        record.consumedByUserId,
        record.revokedAt,
        record.revokedByUserId,
        record.createdAt,
      ],
    );
    return record;
  }

  async findById(inviteId: string): Promise<InviteRecord | null> {
    return selectOne<InviteRecord>(
      this.db,
      `SELECT invite_id AS inviteId, token_hash AS tokenHash, token_preview AS tokenPreview,
              created_by_user_id AS createdByUserId, expires_at AS expiresAt,
              consumed_at AS consumedAt, consumed_by_user_id AS consumedByUserId,
              revoked_at AS revokedAt, revoked_by_user_id AS revokedByUserId,
              created_at AS createdAt
       FROM invites WHERE invite_id = ?`,
      [inviteId],
    );
  }

  async list(): Promise<InviteRecord[]> {
    return selectMany<InviteRecord>(
      this.db,
      `SELECT invite_id AS inviteId, token_hash AS tokenHash, token_preview AS tokenPreview,
              created_by_user_id AS createdByUserId, expires_at AS expiresAt,
              consumed_at AS consumedAt, consumed_by_user_id AS consumedByUserId,
              revoked_at AS revokedAt, revoked_by_user_id AS revokedByUserId,
              created_at AS createdAt
       FROM invites
       ORDER BY created_at DESC`,
    );
  }

  async findUsableByTokenHash(tokenHash: string, nowIso: string): Promise<InviteRecord | null> {
    return selectOne<InviteRecord>(
      this.db,
      `SELECT invite_id AS inviteId, token_hash AS tokenHash, token_preview AS tokenPreview,
              created_by_user_id AS createdByUserId, expires_at AS expiresAt,
              consumed_at AS consumedAt, consumed_by_user_id AS consumedByUserId,
              revoked_at AS revokedAt, revoked_by_user_id AS revokedByUserId,
              created_at AS createdAt
       FROM invites
       WHERE token_hash = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      [tokenHash, nowIso],
    );
  }

  async markConsumed(input: {
    inviteId: string;
    consumedByUserId: string;
    consumedAtIso: string;
  }): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE invites
       SET consumed_at = ?, consumed_by_user_id = ?
       WHERE invite_id = ?`,
      [input.consumedAtIso, input.consumedByUserId, input.inviteId],
    );
  }

  async markRevoked(input: {
    inviteId: string;
    revokedByUserId: string;
    revokedAtIso: string;
  }): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE invites
       SET revoked_at = ?, revoked_by_user_id = ?
       WHERE invite_id = ?`,
      [input.revokedAtIso, input.revokedByUserId, input.inviteId],
    );
  }
}

class CloudflareUserAccountRepository implements UserAccountRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: UserAccountRecord): Promise<UserAccountRecord> {
    await executeOne(
      this.db,
      `INSERT INTO user_accounts (
          user_id, username, role, auth_salt, auth_verifier, encrypted_account_bundle,
          account_key_wrapped, bundle_version, lifecycle_state, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.userId,
        record.username,
        record.role,
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

  async list(): Promise<UserAccountRecord[]> {
    return selectMany<UserAccountRecord>(
      this.db,
      `SELECT user_id AS userId, username, role, auth_salt AS authSalt, auth_verifier AS authVerifier,
              encrypted_account_bundle AS encryptedAccountBundle, account_key_wrapped AS accountKeyWrapped,
              bundle_version AS bundleVersion, lifecycle_state AS lifecycleState,
              created_at AS createdAt, updated_at AS updatedAt
       FROM user_accounts
       ORDER BY created_at ASC`,
    );
  }

  async findByUsername(username: string): Promise<UserAccountRecord | null> {
    return selectOne<UserAccountRecord>(
      this.db,
      `SELECT user_id AS userId, username, role, auth_salt AS authSalt, auth_verifier AS authVerifier,
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
      `SELECT user_id AS userId, username, role, auth_salt AS authSalt, auth_verifier AS authVerifier,
              encrypted_account_bundle AS encryptedAccountBundle, account_key_wrapped AS accountKeyWrapped,
              bundle_version AS bundleVersion, lifecycle_state AS lifecycleState,
              created_at AS createdAt, updated_at AS updatedAt
       FROM user_accounts WHERE user_id = ?`,
      [userId],
    );
  }

  async countActiveOwners(): Promise<number> {
    const row = await selectOne<{ count: number }>(
      this.db,
      `SELECT COUNT(*) AS count
       FROM user_accounts
       WHERE role = 'owner' AND lifecycle_state = 'active'`,
    );
    return Number(row?.count ?? 0);
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
      role: current.role,
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
      `INSERT INTO trusted_devices (
          device_id, user_id, device_name, platform, device_state, created_at, revoked_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        record.deviceId,
        record.userId,
        record.deviceName,
        record.platform,
        record.deviceState,
        record.createdAt,
        record.revokedAt,
      ],
    );
    return record;
  }

  async listByUserId(userId: string): Promise<DeviceRecord[]> {
    return selectMany<DeviceRecord>(
      this.db,
      `SELECT device_id AS deviceId, user_id AS userId, device_name AS deviceName,
              platform, device_state AS deviceState, created_at AS createdAt, revoked_at AS revokedAt
       FROM trusted_devices WHERE user_id = ? ORDER BY created_at ASC`,
      [userId],
    );
  }

  async findById(deviceId: string): Promise<DeviceRecord | null> {
    return selectOne<DeviceRecord>(
      this.db,
      `SELECT device_id AS deviceId, user_id AS userId, device_name AS deviceName,
              platform, device_state AS deviceState, created_at AS createdAt, revoked_at AS revokedAt
       FROM trusted_devices WHERE device_id = ?`,
      [deviceId],
    );
  }

  async countActiveByUserId(userId: string): Promise<number> {
    const row = await selectOne<{ count: number }>(
      this.db,
      `SELECT COUNT(*) AS count
       FROM trusted_devices
       WHERE user_id = ? AND device_state = 'active'`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  async setDeviceStateByUserId(
    userId: string,
    deviceState: DeviceRecord['deviceState'],
    changedAtIso: string,
  ): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE trusted_devices
       SET device_state = ?, revoked_at = ?
       WHERE user_id = ?`,
      [deviceState, deviceState === 'active' ? null : changedAtIso, userId],
    );
  }

  async revokeByUserId(userId: string, revokedAtIso: string): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE trusted_devices SET device_state = 'revoked', revoked_at = ? WHERE user_id = ?`,
      [revokedAtIso, userId],
    );
  }

  async revokeByDeviceId(deviceId: string, revokedAtIso: string): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE trusted_devices SET device_state = 'revoked', revoked_at = ? WHERE device_id = ?`,
      [revokedAtIso, deviceId],
    );
  }
}

class CloudflareSessionRepository implements SessionRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: SessionRecord): Promise<SessionRecord> {
    await executeOne(
      this.db,
      `INSERT INTO sessions (
          session_id, user_id, device_id, csrf_token, created_at, expires_at, recent_reauth_at, revoked_at, rotated_from_session_id
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.sessionId,
        record.userId,
        record.deviceId,
        record.csrfToken,
        record.createdAt,
        record.expiresAt,
        record.recentReauthAt,
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
              created_at AS createdAt, expires_at AS expiresAt, recent_reauth_at AS recentReauthAt, revoked_at AS revokedAt,
              rotated_from_session_id AS rotatedFromSessionId
       FROM sessions WHERE session_id = ?`,
      [sessionId],
    );
  }

  async updateRecentReauth(sessionId: string, recentReauthAtIso: string): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE sessions SET recent_reauth_at = ? WHERE session_id = ?`,
      [recentReauthAtIso, sessionId],
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

class CloudflareDeploymentStateRepository implements DeploymentStateRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  private async ensureRow(): Promise<void> {
    await executeOne(
      this.db,
      `INSERT OR IGNORE INTO deployment_state (
          singleton_key,
          bootstrap_state,
          owner_user_id,
          owner_created_at,
          bootstrap_public_closed_at,
          initial_checkpoint_completed_at,
          initialized_at,
          checkpoint_download_attempt_count,
          checkpoint_last_download_at,
          checkpoint_last_download_request_id
       ) VALUES ('singleton', 'UNINITIALIZED_PUBLIC_OPEN', NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL)`,
    );
  }

  async get(): Promise<DeploymentStateRecord> {
    await this.ensureRow();
    const state = await selectOne<DeploymentStateRecord>(
      this.db,
      `SELECT bootstrap_state AS bootstrapState,
              owner_user_id AS ownerUserId,
              owner_created_at AS ownerCreatedAt,
              bootstrap_public_closed_at AS bootstrapPublicClosedAt,
              initial_checkpoint_completed_at AS initialCheckpointCompletedAt,
              initialized_at AS initializedAt,
              checkpoint_download_attempt_count AS checkpointDownloadAttemptCount,
              checkpoint_last_download_at AS checkpointLastDownloadAt,
              checkpoint_last_download_request_id AS checkpointLastDownloadRequestId
       FROM deployment_state
       WHERE singleton_key = 'singleton'`,
    );

    if (!state) {
      throw new Error('deployment_state_missing');
    }
    return state;
  }

  async transitionToOwnerCreatedCheckpointPending(input: {
    ownerUserId: string;
    ownerCreatedAt: string;
    bootstrapPublicClosedAt: string;
  }): Promise<{ changed: boolean; state: DeploymentStateRecord }> {
    await this.ensureRow();
    await executeOne(
      this.db,
      `UPDATE deployment_state
       SET bootstrap_state = 'OWNER_CREATED_CHECKPOINT_PENDING',
           owner_user_id = ?,
           owner_created_at = ?,
           bootstrap_public_closed_at = ?
       WHERE singleton_key = 'singleton' AND bootstrap_state = 'UNINITIALIZED_PUBLIC_OPEN'`,
      [input.ownerUserId, input.ownerCreatedAt, input.bootstrapPublicClosedAt],
    );

    const state = await this.get();
    return {
      changed: state.bootstrapState === 'OWNER_CREATED_CHECKPOINT_PENDING' && state.ownerUserId === input.ownerUserId,
      state,
    };
  }

  async recordCheckpointDownloadAttempt(input: {
    ownerUserId: string;
    requestId: string;
    attemptedAt: string;
  }): Promise<DeploymentStateRecord> {
    await this.ensureRow();
    await executeOne(
      this.db,
      `UPDATE deployment_state
       SET checkpoint_download_attempt_count = checkpoint_download_attempt_count + 1,
           checkpoint_last_download_at = ?,
           checkpoint_last_download_request_id = ?
       WHERE singleton_key = 'singleton'
         AND bootstrap_state = 'OWNER_CREATED_CHECKPOINT_PENDING'
         AND owner_user_id = ?`,
      [input.attemptedAt, input.requestId, input.ownerUserId],
    );

    return this.get();
  }

  async completeInitialization(input: {
    completedAt: string;
  }): Promise<{ changed: boolean; state: DeploymentStateRecord }> {
    await this.ensureRow();
    await executeOne(
      this.db,
      `UPDATE deployment_state
       SET bootstrap_state = 'INITIALIZED',
           initial_checkpoint_completed_at = ?,
           initialized_at = ?
       WHERE singleton_key = 'singleton'
         AND bootstrap_state = 'OWNER_CREATED_CHECKPOINT_PENDING'`,
      [input.completedAt, input.completedAt],
    );
    const state = await this.get();
    return {
      changed: state.bootstrapState === 'INITIALIZED',
      state,
    };
  }
}

class CloudflareIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async get(scope: string, nowIso: string): Promise<IdempotencyRecord | null> {
    const record = await selectOne<IdempotencyRecord>(
      this.db,
      `SELECT scope, payload_hash AS payloadHash, status_code AS statusCode, response_body AS responseBody,
              result, reason_code AS reasonCode, resource_refs AS resourceRefs,
              audit_event_id AS auditEventId, created_at AS createdAt, expires_at AS expiresAt
       FROM idempotency_records
       WHERE scope = ?`,
      [scope],
    );

    if (!record) {
      return null;
    }

    if (record.expiresAt <= nowIso) {
      await executeOne(this.db, `DELETE FROM idempotency_records WHERE scope = ?`, [scope]);
      return null;
    }

    return record;
  }

  async put(record: IdempotencyRecord): Promise<IdempotencyRecord> {
    await executeOne(
      this.db,
      `INSERT OR REPLACE INTO idempotency_records (
          scope, payload_hash, status_code, response_body, result, reason_code,
          resource_refs, audit_event_id, created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.scope,
        record.payloadHash,
        record.statusCode,
        record.responseBody,
        record.result,
        record.reasonCode,
        record.resourceRefs,
        record.auditEventId,
        record.createdAt,
        record.expiresAt,
      ],
    );
    return record;
  }
}

class CloudflareAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: AuditEventRecord): Promise<AuditEventRecord> {
    await executeOne(
      this.db,
      `INSERT INTO audit_events (
          event_id, event_type, actor_user_id, target_type, target_id, result,
          reason_code, request_id, created_at, ip_hash, user_agent_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.eventId,
        record.eventType,
        record.actorUserId,
        record.targetType,
        record.targetId,
        record.result,
        record.reasonCode,
        record.requestId,
        record.createdAt,
        record.ipHash,
        record.userAgentHash,
      ],
    );
    return record;
  }

  async listRecent(limit = 200): Promise<AuditEventRecord[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    return selectMany<AuditEventRecord>(
      this.db,
      `SELECT event_id AS eventId, event_type AS eventType, actor_user_id AS actorUserId,
              target_type AS targetType, target_id AS targetId, result, reason_code AS reasonCode,
              request_id AS requestId, created_at AS createdAt, ip_hash AS ipHash,
              user_agent_hash AS userAgentHash
       FROM audit_events
       ORDER BY created_at DESC
       LIMIT ?`,
      [safeLimit],
    );
  }
}

class CloudflareAttachmentBlobRepository implements AttachmentBlobRepository {
  constructor(private readonly db: D1DatabaseLike, private readonly bucket: R2BucketLike) {}

  async put(record: AttachmentBlobRecord): Promise<AttachmentBlobRecord> {
    if (record.envelope.length > 0) {
      await this.bucket.put(record.key, record.envelope, {
        httpMetadata: {
          contentType: record.contentType,
        },
      });
    }
    await executeOne(
      this.db,
      `INSERT OR REPLACE INTO attachment_blobs (
          blob_key, owner_user_id, item_id, lifecycle_state, envelope, content_type, size,
          idempotency_key, upload_token, expires_at, uploaded_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.key,
        record.ownerUserId,
        record.itemId,
        record.lifecycleState,
        record.envelope,
        record.contentType,
        record.size,
        record.idempotencyKey,
        record.uploadToken,
        record.expiresAt,
        record.uploadedAt,
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
              size, idempotency_key AS idempotencyKey, upload_token AS uploadToken,
              expires_at AS expiresAt, uploaded_at AS uploadedAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM attachment_blobs WHERE blob_key = ?`,
      [key],
    );

    if (!metadata) {
      return null;
    }

    if (metadata.envelope.length === 0) {
      return metadata;
    }

    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }
    return metadata;
  }

  async listByOwnerAndItem(ownerUserId: string, itemId: string): Promise<AttachmentBlobRecord[]> {
    return selectMany<AttachmentBlobRecord>(
      this.db,
      `SELECT blob_key AS key, owner_user_id AS ownerUserId, item_id AS itemId,
              lifecycle_state AS lifecycleState, envelope, content_type AS contentType,
              size, idempotency_key AS idempotencyKey, upload_token AS uploadToken,
              expires_at AS expiresAt, uploaded_at AS uploadedAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM attachment_blobs
       WHERE owner_user_id = ? AND item_id = ?
       ORDER BY created_at ASC`,
      [ownerUserId, itemId],
    );
  }

  async findByOwnerItemAndIdempotency(
    ownerUserId: string,
    itemId: string,
    idempotencyKey: string,
  ): Promise<AttachmentBlobRecord | null> {
    return selectOne<AttachmentBlobRecord>(
      this.db,
      `SELECT blob_key AS key, owner_user_id AS ownerUserId, item_id AS itemId,
              lifecycle_state AS lifecycleState, envelope, content_type AS contentType,
              size, idempotency_key AS idempotencyKey, upload_token AS uploadToken,
              expires_at AS expiresAt, uploaded_at AS uploadedAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM attachment_blobs
       WHERE owner_user_id = ? AND item_id = ? AND idempotency_key = ?
       LIMIT 1`,
      [ownerUserId, itemId, idempotencyKey],
    );
  }

  async markUploaded(input: {
    key: string;
    ownerUserId: string;
    envelope: string;
    updatedAt: string;
    uploadedAt: string;
  }): Promise<AttachmentBlobRecord> {
    const current = await this.get(input.key);
    if (!current || current.ownerUserId !== input.ownerUserId) {
      throw new Error('attachment_not_found');
    }

    await this.bucket.put(input.key, input.envelope, {
      httpMetadata: {
        contentType: current.contentType,
      },
    });
    await executeOne(
      this.db,
      `UPDATE attachment_blobs
       SET lifecycle_state = ?, envelope = ?, uploaded_at = ?, updated_at = ?
       WHERE blob_key = ? AND owner_user_id = ?`,
      ['uploaded', input.envelope, input.uploadedAt, input.updatedAt, input.key, input.ownerUserId],
    );

    const updated = await this.get(input.key);
    if (!updated) {
      throw new Error('attachment_not_found');
    }
    return updated;
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
  const deploymentState = new CloudflareDeploymentStateRepository(input.db);
  const invites = new CloudflareInviteRepository(input.db);
  const users = new CloudflareUserAccountRepository(input.db);
  const devices = new CloudflareDeviceRepository(input.db);
  const sessions = new CloudflareSessionRepository(input.db);
  const vaultItems = new CloudflareVaultItemRepository(input.db);

  return {
    deploymentState,
    invites,
    users,
    devices,
    sessions,
    authRateLimits: new CloudflareAuthRateLimitRepository(input.db),
    idempotency: new CloudflareIdempotencyRepository(input.db),
    auditEvents: new CloudflareAuditEventRepository(input.db),
    attachmentBlobs: new CloudflareAttachmentBlobRepository(input.db, input.bucket),
    vaultItems,
    async completeOnboardingAtomic(record: CompleteOnboardingAtomicInput): Promise<CompleteOnboardingAtomicResult> {
      const invite = await invites.findUsableByTokenHash(record.inviteTokenHash, record.nowIso);
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
                user_id, username, role, auth_salt, auth_verifier, encrypted_account_bundle,
                account_key_wrapped, bundle_version, lifecycle_state, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            record.user.userId,
            record.user.username,
            record.user.role,
            record.user.authSalt,
            record.user.authVerifier,
            record.user.encryptedAccountBundle,
            record.user.accountKeyWrapped,
            record.user.bundleVersion,
            record.user.lifecycleState,
            record.user.createdAt,
            record.user.updatedAt,
          ),
          input.db.prepare(
            `UPDATE invites SET consumed_at = ?, consumed_by_user_id = ? WHERE invite_id = ?`,
          ).bind(
            record.nowIso,
            record.user.userId,
            invite.inviteId,
          ),
          input.db.prepare(
            `INSERT INTO trusted_devices (
               device_id, user_id, device_name, platform, device_state, created_at, revoked_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            record.device.deviceId,
            record.device.userId,
            record.device.deviceName,
            record.device.platform,
            record.device.deviceState,
            record.device.createdAt,
            record.device.revokedAt,
          ),
          input.db.prepare(
            `INSERT INTO sessions (
               session_id, user_id, device_id, csrf_token, created_at, expires_at, recent_reauth_at, revoked_at, rotated_from_session_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            record.session.sessionId,
            record.session.userId,
            record.session.deviceId,
            record.session.csrfToken,
            record.session.createdAt,
            record.session.expiresAt,
            record.session.recentReauthAt,
            record.session.revokedAt,
            record.session.rotatedFromSessionId,
          ),
        ]);
      } else {
        await input.db.exec('BEGIN TRANSACTION');

        try {
          await users.create(record.user);
          await invites.markConsumed({
            inviteId: invite.inviteId,
            consumedAtIso: record.nowIso,
            consumedByUserId: record.user.userId,
          });
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
