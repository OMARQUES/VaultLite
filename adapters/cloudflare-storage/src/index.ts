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
  ExtensionSessionRecoverSecretRecord,
  ExtensionSessionRecoverSecretRepository,
  ManualSiteIconOverrideRecord,
  ManualSiteIconOverrideRepository,
  ExtensionLinkRequestRecord,
  ExtensionLinkRequestRepository,
  ExtensionLinkRequestStatus,
  ExtensionPairingRecord,
  ExtensionPairingRepository,
  InviteRecord,
  InviteRepository,
  IdempotencyRecord,
  IdempotencyRepository,
  SessionPolicyRecord,
  SessionPolicyRepository,
  SurfaceLinkRecord,
  SurfaceLinkRepository,
  UnlockGrantRecord,
  UnlockGrantRepository,
  UnlockGrantStatus,
  SessionRecord,
  SessionRepository,
  RotatePasswordAtomicInput,
  RotatePasswordAtomicResult,
  RevokeDeviceAndSessionsAtomicInput,
  SiteIconCacheRecord,
  SiteIconCacheRepository,
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
  {
    id: '0006_auth_rate_limit_window_end',
    filename: '0006_auth_rate_limit_window_end.sql',
    sql: `ALTER TABLE auth_rate_limits ADD COLUMN window_ends_at TEXT;

UPDATE auth_rate_limits
SET window_ends_at = window_started_at
WHERE window_ends_at IS NULL;`,
  },
  {
    id: '0007_vault_tombstone_restore_payload',
    filename: '0007_vault_tombstone_restore_payload.sql',
    sql: `ALTER TABLE vault_item_tombstones ADD COLUMN encrypted_payload TEXT;
ALTER TABLE vault_item_tombstones ADD COLUMN created_at TEXT;
ALTER TABLE vault_item_tombstones ADD COLUMN updated_at TEXT;`,
  },
  {
    id: '0008_attachment_filename_attached_at',
    filename: '0008_attachment_filename_attached_at.sql',
    sql: `ALTER TABLE attachment_blobs ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE attachment_blobs ADD COLUMN attached_at TEXT;`,
  },
  {
    id: '0009_extension_pairings',
    filename: '0009_extension_pairings.sql',
    sql: `CREATE TABLE IF NOT EXISTS extension_pairings (
  pairing_id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  deployment_fingerprint TEXT NOT NULL,
  server_origin TEXT NOT NULL,
  auth_salt TEXT NOT NULL,
  encrypted_account_bundle TEXT NOT NULL,
  account_key_wrapped TEXT NOT NULL,
  local_unlock_envelope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_by_device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_extension_pairings_user_created_at
  ON extension_pairings (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_extension_pairings_expires_at
  ON extension_pairings (expires_at);`,
  },
  {
    id: '0010_extension_link_requests',
    filename: '0010_extension_link_requests.sql',
    sql: `CREATE TABLE IF NOT EXISTS extension_link_requests (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NULL,
  deployment_fingerprint TEXT NOT NULL,
  server_origin TEXT NOT NULL,
  request_public_key TEXT NOT NULL,
  client_nonce TEXT NOT NULL,
  short_code TEXT NOT NULL,
  fingerprint_phrase TEXT NOT NULL,
  device_name_hint TEXT NULL,
  auth_salt TEXT NULL,
  encrypted_account_bundle TEXT NULL,
  account_key_wrapped TEXT NULL,
  local_unlock_envelope TEXT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_at TEXT NULL,
  approved_by_user_id TEXT NULL,
  approved_by_device_id TEXT NULL,
  rejected_at TEXT NULL,
  rejection_reason_code TEXT NULL,
  consumed_at TEXT NULL,
  consumed_by_device_id TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_extension_link_requests_status_created
  ON extension_link_requests (status, created_at);

CREATE INDEX IF NOT EXISTS idx_extension_link_requests_expires
  ON extension_link_requests (expires_at);`,
  },
  {
    id: '0011_site_icons',
    filename: '0011_site_icons.sql',
    sql: `CREATE TABLE IF NOT EXISTS site_icon_cache (
  domain TEXT PRIMARY KEY,
  data_url TEXT NOT NULL,
  source_url TEXT,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_icon_cache_updated
  ON site_icon_cache (updated_at);

CREATE TABLE IF NOT EXISTS manual_site_icon_overrides (
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  data_url TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_manual_site_icon_overrides_user_updated
  ON manual_site_icon_overrides (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_manual_site_icon_overrides_domain
  ON manual_site_icon_overrides (domain);`,
  },
  {
    id: '0012_session_policy_unlock_grants',
    filename: '0012_session_policy_unlock_grants.sql',
    sql: `CREATE TABLE IF NOT EXISTS session_policies (
  user_id TEXT PRIMARY KEY,
  unlock_idle_timeout_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS surface_links (
  user_id TEXT NOT NULL,
  web_device_id TEXT NOT NULL,
  extension_device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, web_device_id, extension_device_id)
);

CREATE INDEX IF NOT EXISTS idx_surface_links_user_web
  ON surface_links (user_id, web_device_id);

CREATE INDEX IF NOT EXISTS idx_surface_links_user_extension
  ON surface_links (user_id, extension_device_id);

CREATE TABLE IF NOT EXISTS unlock_grants (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deployment_fingerprint TEXT NOT NULL,
  server_origin TEXT NOT NULL,
  requester_surface TEXT NOT NULL,
  requester_device_id TEXT NOT NULL,
  requester_public_key TEXT NOT NULL,
  requester_client_nonce TEXT NOT NULL,
  approver_surface TEXT NOT NULL,
  approver_device_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_at TEXT NULL,
  approved_by_device_id TEXT NULL,
  unlock_account_key TEXT NULL,
  rejected_at TEXT NULL,
  rejection_reason_code TEXT NULL,
  consumed_at TEXT NULL,
  consumed_by_device_id TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_unlock_grants_approver_status
  ON unlock_grants (user_id, approver_surface, approver_device_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_unlock_grants_expires
  ON unlock_grants (expires_at);

CREATE TABLE IF NOT EXISTS extension_session_recover_secrets (
  device_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_extension_session_recover_secrets_user
  ON extension_session_recover_secrets (user_id);`,
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

function extractChangedRows(runResult: unknown): number {
  if (typeof runResult !== 'object' || runResult === null) {
    return 0;
  }
  const withMeta = runResult as { meta?: { changes?: number } };
  const changes = withMeta.meta?.changes;
  return typeof changes === 'number' && Number.isFinite(changes) ? changes : 0;
}

async function executeOneWithChanges(
  db: D1DatabaseLike,
  query: string,
  values: unknown[] = [],
): Promise<number> {
  const result = await db.prepare(query).bind(...values).run();
  return extractChangedRows(result);
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

  async listByUserId(userId: string): Promise<SessionRecord[]> {
    return selectMany<SessionRecord>(
      this.db,
      `SELECT session_id AS sessionId, user_id AS userId, device_id AS deviceId, csrf_token AS csrfToken,
              created_at AS createdAt, expires_at AS expiresAt, recent_reauth_at AS recentReauthAt, revoked_at AS revokedAt,
              rotated_from_session_id AS rotatedFromSessionId
       FROM sessions
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      [userId],
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

class CloudflareSessionPolicyRepository implements SessionPolicyRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findByUserId(userId: string): Promise<SessionPolicyRecord | null> {
    return selectOne<SessionPolicyRecord>(
      this.db,
      `SELECT user_id AS userId,
              unlock_idle_timeout_ms AS unlockIdleTimeoutMs,
              updated_at AS updatedAt
       FROM session_policies
       WHERE user_id = ?`,
      [userId],
    );
  }

  async upsert(record: SessionPolicyRecord): Promise<SessionPolicyRecord> {
    await executeOne(
      this.db,
      `INSERT INTO session_policies (user_id, unlock_idle_timeout_ms, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         unlock_idle_timeout_ms = excluded.unlock_idle_timeout_ms,
         updated_at = excluded.updated_at`,
      [record.userId, record.unlockIdleTimeoutMs, record.updatedAt],
    );
    return { ...record };
  }
}

class CloudflareSurfaceLinkRepository implements SurfaceLinkRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async upsert(record: SurfaceLinkRecord): Promise<SurfaceLinkRecord> {
    await executeOne(
      this.db,
      `INSERT INTO surface_links (user_id, web_device_id, extension_device_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, web_device_id, extension_device_id) DO UPDATE SET
         updated_at = excluded.updated_at`,
      [
        record.userId,
        record.webDeviceId,
        record.extensionDeviceId,
        record.createdAt,
        record.updatedAt,
      ],
    );
    return { ...record };
  }

  async findByWebDeviceId(userId: string, webDeviceId: string): Promise<SurfaceLinkRecord | null> {
    return selectOne<SurfaceLinkRecord>(
      this.db,
      `SELECT user_id AS userId,
              web_device_id AS webDeviceId,
              extension_device_id AS extensionDeviceId,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM surface_links
       WHERE user_id = ? AND web_device_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, webDeviceId],
    );
  }

  async findByExtensionDeviceId(
    userId: string,
    extensionDeviceId: string,
  ): Promise<SurfaceLinkRecord | null> {
    return selectOne<SurfaceLinkRecord>(
      this.db,
      `SELECT user_id AS userId,
              web_device_id AS webDeviceId,
              extension_device_id AS extensionDeviceId,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM surface_links
       WHERE user_id = ? AND extension_device_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, extensionDeviceId],
    );
  }

  async removeByDeviceId(userId: string, deviceId: string): Promise<void> {
    await executeOne(
      this.db,
      `DELETE FROM surface_links
       WHERE user_id = ?
         AND (web_device_id = ? OR extension_device_id = ?)`,
      [userId, deviceId, deviceId],
    );
  }
}

class CloudflareUnlockGrantRepository implements UnlockGrantRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: UnlockGrantRecord): Promise<UnlockGrantRecord> {
    await executeOne(
      this.db,
      `INSERT INTO unlock_grants (
          request_id,
          user_id,
          deployment_fingerprint,
          server_origin,
          requester_surface,
          requester_device_id,
          requester_public_key,
          requester_client_nonce,
          approver_surface,
          approver_device_id,
          status,
          created_at,
          expires_at,
          approved_at,
          approved_by_device_id,
          unlock_account_key,
          rejected_at,
          rejection_reason_code,
          consumed_at,
          consumed_by_device_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.requestId,
        record.userId,
        record.deploymentFingerprint,
        record.serverOrigin,
        record.requesterSurface,
        record.requesterDeviceId,
        record.requesterPublicKey,
        record.requesterClientNonce,
        record.approverSurface,
        record.approverDeviceId,
        record.status,
        record.createdAt,
        record.expiresAt,
        record.approvedAt,
        record.approvedByDeviceId,
        record.unlockAccountKey,
        record.rejectedAt,
        record.rejectionReasonCode,
        record.consumedAt,
        record.consumedByDeviceId,
      ],
    );
    return { ...record };
  }

  async findByRequestId(requestId: string): Promise<UnlockGrantRecord | null> {
    return selectOne<UnlockGrantRecord>(
      this.db,
      `SELECT request_id AS requestId,
              user_id AS userId,
              deployment_fingerprint AS deploymentFingerprint,
              server_origin AS serverOrigin,
              requester_surface AS requesterSurface,
              requester_device_id AS requesterDeviceId,
              requester_public_key AS requesterPublicKey,
              requester_client_nonce AS requesterClientNonce,
              approver_surface AS approverSurface,
              approver_device_id AS approverDeviceId,
              status AS status,
              created_at AS createdAt,
              expires_at AS expiresAt,
              approved_at AS approvedAt,
              approved_by_device_id AS approvedByDeviceId,
              unlock_account_key AS unlockAccountKey,
              rejected_at AS rejectedAt,
              rejection_reason_code AS rejectionReasonCode,
              consumed_at AS consumedAt,
              consumed_by_device_id AS consumedByDeviceId
       FROM unlock_grants
       WHERE request_id = ?`,
      [requestId],
    );
  }

  async listPendingForApprover(
    userId: string,
    approverSurface: UnlockGrantRecord['approverSurface'],
    approverDeviceId: string,
    nowIso: string,
    limit: number,
  ): Promise<UnlockGrantRecord[]> {
    return selectMany<UnlockGrantRecord>(
      this.db,
      `SELECT request_id AS requestId,
              user_id AS userId,
              deployment_fingerprint AS deploymentFingerprint,
              server_origin AS serverOrigin,
              requester_surface AS requesterSurface,
              requester_device_id AS requesterDeviceId,
              requester_public_key AS requesterPublicKey,
              requester_client_nonce AS requesterClientNonce,
              approver_surface AS approverSurface,
              approver_device_id AS approverDeviceId,
              status AS status,
              created_at AS createdAt,
              expires_at AS expiresAt,
              approved_at AS approvedAt,
              approved_by_device_id AS approvedByDeviceId,
              unlock_account_key AS unlockAccountKey,
              rejected_at AS rejectedAt,
              rejection_reason_code AS rejectionReasonCode,
              consumed_at AS consumedAt,
              consumed_by_device_id AS consumedByDeviceId
       FROM unlock_grants
       WHERE user_id = ?
         AND approver_surface = ?
         AND approver_device_id = ?
         AND status = 'pending'
         AND expires_at > ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, approverSurface, approverDeviceId, nowIso, Math.max(1, limit)],
    );
  }

  async approve(input: {
    requestId: string;
    expectedStatus: UnlockGrantStatus;
    approvedAt: string;
    approvedByDeviceId: string;
    unlockAccountKey: string | null;
  }): Promise<UnlockGrantRecord | null> {
    const changed = await executeOneWithChanges(
      this.db,
      `UPDATE unlock_grants
       SET status = 'approved',
           approved_at = ?,
           approved_by_device_id = ?,
           unlock_account_key = ?,
           rejected_at = NULL,
           rejection_reason_code = NULL
       WHERE request_id = ?
         AND status = ?`,
      [input.approvedAt, input.approvedByDeviceId, input.unlockAccountKey, input.requestId, input.expectedStatus],
    );
    if (changed !== 1) {
      return null;
    }
    return this.findByRequestId(input.requestId);
  }

  async reject(input: {
    requestId: string;
    expectedStatus: UnlockGrantStatus;
    rejectedAt: string;
    reasonCode: string | null;
  }): Promise<UnlockGrantRecord | null> {
    const changed = await executeOneWithChanges(
      this.db,
      `UPDATE unlock_grants
       SET status = 'rejected',
           unlock_account_key = NULL,
           rejected_at = ?,
           rejection_reason_code = ?
       WHERE request_id = ?
         AND status = ?`,
      [input.rejectedAt, input.reasonCode, input.requestId, input.expectedStatus],
    );
    if (changed !== 1) {
      return null;
    }
    return this.findByRequestId(input.requestId);
  }

  async consume(input: {
    requestId: string;
    expectedStatus: UnlockGrantStatus;
    consumedAt: string;
    consumedByDeviceId: string;
  }): Promise<UnlockGrantRecord | null> {
    const changed = await executeOneWithChanges(
      this.db,
      `UPDATE unlock_grants
       SET status = 'consumed',
           consumed_at = ?,
           consumed_by_device_id = ?
       WHERE request_id = ?
         AND status = ?`,
      [input.consumedAt, input.consumedByDeviceId, input.requestId, input.expectedStatus],
    );
    if (changed !== 1) {
      return null;
    }
    return this.findByRequestId(input.requestId);
  }
}

class CloudflareExtensionSessionRecoverSecretRepository
  implements ExtensionSessionRecoverSecretRepository
{
  constructor(private readonly db: D1DatabaseLike) {}

  async findByDeviceId(deviceId: string): Promise<ExtensionSessionRecoverSecretRecord | null> {
    return selectOne<ExtensionSessionRecoverSecretRecord>(
      this.db,
      `SELECT user_id AS userId,
              device_id AS deviceId,
              secret_hash AS secretHash,
              updated_at AS updatedAt
       FROM extension_session_recover_secrets
       WHERE device_id = ?`,
      [deviceId],
    );
  }

  async upsert(
    record: ExtensionSessionRecoverSecretRecord,
  ): Promise<ExtensionSessionRecoverSecretRecord> {
    await executeOne(
      this.db,
      `INSERT INTO extension_session_recover_secrets (device_id, user_id, secret_hash, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         user_id = excluded.user_id,
         secret_hash = excluded.secret_hash,
         updated_at = excluded.updated_at`,
      [record.deviceId, record.userId, record.secretHash, record.updatedAt],
    );
    return { ...record };
  }

  async removeByDeviceId(deviceId: string): Promise<void> {
    await executeOne(this.db, `DELETE FROM extension_session_recover_secrets WHERE device_id = ?`, [
      deviceId,
    ]);
  }

  async removeByUserId(userId: string): Promise<void> {
    await executeOne(this.db, `DELETE FROM extension_session_recover_secrets WHERE user_id = ?`, [userId]);
  }
}

class CloudflareExtensionPairingRepository implements ExtensionPairingRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: ExtensionPairingRecord): Promise<ExtensionPairingRecord> {
    await executeOne(
      this.db,
      `INSERT INTO extension_pairings (
          pairing_id,
          code_hash,
          user_id,
          deployment_fingerprint,
          server_origin,
          auth_salt,
          encrypted_account_bundle,
          account_key_wrapped,
          local_unlock_envelope,
          created_at,
          expires_at,
          consumed_at,
          consumed_by_device_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.pairingId,
        record.codeHash,
        record.userId,
        record.deploymentFingerprint,
        record.serverOrigin,
        record.authSalt,
        record.encryptedAccountBundle,
        record.accountKeyWrapped,
        record.localUnlockEnvelope,
        record.createdAt,
        record.expiresAt,
        record.consumedAt,
        record.consumedByDeviceId,
      ],
    );
    return { ...record };
  }

  async findByCodeHash(codeHash: string, nowIso: string): Promise<ExtensionPairingRecord | null> {
    return selectOne<ExtensionPairingRecord>(
      this.db,
      `SELECT pairing_id AS pairingId,
              code_hash AS codeHash,
              user_id AS userId,
              deployment_fingerprint AS deploymentFingerprint,
              server_origin AS serverOrigin,
              auth_salt AS authSalt,
              encrypted_account_bundle AS encryptedAccountBundle,
              account_key_wrapped AS accountKeyWrapped,
              local_unlock_envelope AS localUnlockEnvelope,
              created_at AS createdAt,
              expires_at AS expiresAt,
              consumed_at AS consumedAt,
              consumed_by_device_id AS consumedByDeviceId
       FROM extension_pairings
       WHERE code_hash = ?
         AND consumed_at IS NULL
         AND expires_at > ?`,
      [codeHash, nowIso],
    );
  }

  async findByCodeHashAny(codeHash: string): Promise<ExtensionPairingRecord | null> {
    return selectOne<ExtensionPairingRecord>(
      this.db,
      `SELECT pairing_id AS pairingId,
              code_hash AS codeHash,
              user_id AS userId,
              deployment_fingerprint AS deploymentFingerprint,
              server_origin AS serverOrigin,
              auth_salt AS authSalt,
              encrypted_account_bundle AS encryptedAccountBundle,
              account_key_wrapped AS accountKeyWrapped,
              local_unlock_envelope AS localUnlockEnvelope,
              created_at AS createdAt,
              expires_at AS expiresAt,
              consumed_at AS consumedAt,
              consumed_by_device_id AS consumedByDeviceId
       FROM extension_pairings
       WHERE code_hash = ?`,
      [codeHash],
    );
  }

  async consume(input: {
    pairingId: string;
    consumedAt: string;
    consumedByDeviceId: string;
  }): Promise<ExtensionPairingRecord | null> {
    const changed = await executeOneWithChanges(
      this.db,
      `UPDATE extension_pairings
       SET consumed_at = ?, consumed_by_device_id = ?
       WHERE pairing_id = ?
         AND consumed_at IS NULL`,
      [input.consumedAt, input.consumedByDeviceId, input.pairingId],
    );
    if (changed !== 1) {
      return null;
    }
    return selectOne<ExtensionPairingRecord>(
      this.db,
      `SELECT pairing_id AS pairingId,
              code_hash AS codeHash,
              user_id AS userId,
              deployment_fingerprint AS deploymentFingerprint,
              server_origin AS serverOrigin,
              auth_salt AS authSalt,
              encrypted_account_bundle AS encryptedAccountBundle,
              account_key_wrapped AS accountKeyWrapped,
              local_unlock_envelope AS localUnlockEnvelope,
              created_at AS createdAt,
              expires_at AS expiresAt,
              consumed_at AS consumedAt,
              consumed_by_device_id AS consumedByDeviceId
       FROM extension_pairings
       WHERE pairing_id = ?`,
      [input.pairingId],
    );
  }
}

class CloudflareExtensionLinkRequestRepository implements ExtensionLinkRequestRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: ExtensionLinkRequestRecord): Promise<ExtensionLinkRequestRecord> {
    await executeOne(
      this.db,
      `INSERT INTO extension_link_requests (
          request_id,
          user_id,
          deployment_fingerprint,
          server_origin,
          request_public_key,
          client_nonce,
          short_code,
          fingerprint_phrase,
          device_name_hint,
          auth_salt,
          encrypted_account_bundle,
          account_key_wrapped,
          local_unlock_envelope,
          status,
          created_at,
          expires_at,
          approved_at,
          approved_by_user_id,
          approved_by_device_id,
          rejected_at,
          rejection_reason_code,
          consumed_at,
          consumed_by_device_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.requestId,
        record.userId,
        record.deploymentFingerprint,
        record.serverOrigin,
        record.requestPublicKey,
        record.clientNonce,
        record.shortCode,
        record.fingerprintPhrase,
        record.deviceNameHint,
        record.authSalt,
        record.encryptedAccountBundle,
        record.accountKeyWrapped,
        record.localUnlockEnvelope,
        record.status,
        record.createdAt,
        record.expiresAt,
        record.approvedAt,
        record.approvedByUserId,
        record.approvedByDeviceId,
        record.rejectedAt,
        record.rejectionReasonCode,
        record.consumedAt,
        record.consumedByDeviceId,
      ],
    );
    return { ...record };
  }

  async findByRequestId(requestId: string): Promise<ExtensionLinkRequestRecord | null> {
    return selectOne<ExtensionLinkRequestRecord>(
      this.db,
      `SELECT request_id AS requestId,
              user_id AS userId,
              deployment_fingerprint AS deploymentFingerprint,
              server_origin AS serverOrigin,
              request_public_key AS requestPublicKey,
              client_nonce AS clientNonce,
              short_code AS shortCode,
              fingerprint_phrase AS fingerprintPhrase,
              device_name_hint AS deviceNameHint,
              auth_salt AS authSalt,
              encrypted_account_bundle AS encryptedAccountBundle,
              account_key_wrapped AS accountKeyWrapped,
              local_unlock_envelope AS localUnlockEnvelope,
              status AS status,
              created_at AS createdAt,
              expires_at AS expiresAt,
              approved_at AS approvedAt,
              approved_by_user_id AS approvedByUserId,
              approved_by_device_id AS approvedByDeviceId,
              rejected_at AS rejectedAt,
              rejection_reason_code AS rejectionReasonCode,
              consumed_at AS consumedAt,
              consumed_by_device_id AS consumedByDeviceId
       FROM extension_link_requests
       WHERE request_id = ?`,
      [requestId],
    );
  }

  async listRecent(nowIso: string, limit: number): Promise<ExtensionLinkRequestRecord[]> {
    return selectMany<ExtensionLinkRequestRecord>(
      this.db,
      `SELECT request_id AS requestId,
              user_id AS userId,
              deployment_fingerprint AS deploymentFingerprint,
              server_origin AS serverOrigin,
              request_public_key AS requestPublicKey,
              client_nonce AS clientNonce,
              short_code AS shortCode,
              fingerprint_phrase AS fingerprintPhrase,
              device_name_hint AS deviceNameHint,
              auth_salt AS authSalt,
              encrypted_account_bundle AS encryptedAccountBundle,
              account_key_wrapped AS accountKeyWrapped,
              local_unlock_envelope AS localUnlockEnvelope,
              status AS status,
              created_at AS createdAt,
              expires_at AS expiresAt,
              approved_at AS approvedAt,
              approved_by_user_id AS approvedByUserId,
              approved_by_device_id AS approvedByDeviceId,
              rejected_at AS rejectedAt,
              rejection_reason_code AS rejectionReasonCode,
              consumed_at AS consumedAt,
              consumed_by_device_id AS consumedByDeviceId
       FROM extension_link_requests
       WHERE expires_at > ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [nowIso, Math.max(1, limit)],
    );
  }

  async approve(input: {
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
  }): Promise<ExtensionLinkRequestRecord | null> {
    const changed = await executeOneWithChanges(
      this.db,
      `UPDATE extension_link_requests
       SET status = 'approved',
           approved_at = ?,
           approved_by_user_id = ?,
           approved_by_device_id = ?,
           user_id = ?,
           auth_salt = ?,
           encrypted_account_bundle = ?,
           account_key_wrapped = ?,
           local_unlock_envelope = ?,
           rejected_at = NULL,
           rejection_reason_code = NULL
       WHERE request_id = ?
         AND status = ?`,
      [
        input.approvedAt,
        input.approvedByUserId,
        input.approvedByDeviceId,
        input.userId,
        input.authSalt,
        input.encryptedAccountBundle,
        input.accountKeyWrapped,
        input.localUnlockEnvelope,
        input.requestId,
        input.expectedStatus,
      ],
    );
    if (changed !== 1) {
      return null;
    }
    return this.findByRequestId(input.requestId);
  }

  async reject(input: {
    requestId: string;
    expectedStatus: ExtensionLinkRequestStatus;
    rejectedAt: string;
    reasonCode: string | null;
  }): Promise<ExtensionLinkRequestRecord | null> {
    const changed = await executeOneWithChanges(
      this.db,
      `UPDATE extension_link_requests
       SET status = 'rejected',
           rejected_at = ?,
           rejection_reason_code = ?
       WHERE request_id = ?
         AND status = ?`,
      [input.rejectedAt, input.reasonCode, input.requestId, input.expectedStatus],
    );
    if (changed !== 1) {
      return null;
    }
    return this.findByRequestId(input.requestId);
  }

  async consume(input: {
    requestId: string;
    expectedStatus: ExtensionLinkRequestStatus;
    consumedAt: string;
    consumedByDeviceId: string;
  }): Promise<ExtensionLinkRequestRecord | null> {
    const changed = await executeOneWithChanges(
      this.db,
      `UPDATE extension_link_requests
       SET status = 'consumed',
           consumed_at = ?,
           consumed_by_device_id = ?
       WHERE request_id = ?
         AND status = ?`,
      [input.consumedAt, input.consumedByDeviceId, input.requestId, input.expectedStatus],
    );
    if (changed !== 1) {
      return null;
    }
    return this.findByRequestId(input.requestId);
  }
}

class CloudflareSiteIconCacheRepository implements SiteIconCacheRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async listByDomains(domains: string[]): Promise<SiteIconCacheRecord[]> {
    const normalized = Array.from(
      new Set(
        domains
          .filter((domain) => typeof domain === 'string')
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0),
      ),
    );
    if (normalized.length === 0) {
      return [];
    }

    const placeholders = normalized.map(() => '?').join(', ');
    return selectMany<SiteIconCacheRecord>(
      this.db,
      `SELECT domain AS domain,
              data_url AS dataUrl,
              source_url AS sourceUrl,
              updated_at AS updatedAt,
              fetched_at AS fetchedAt
       FROM site_icon_cache
       WHERE domain IN (${placeholders})`,
      normalized,
    );
  }

  async findByDomain(domain: string): Promise<SiteIconCacheRecord | null> {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    return selectOne<SiteIconCacheRecord>(
      this.db,
      `SELECT domain AS domain,
              data_url AS dataUrl,
              source_url AS sourceUrl,
              updated_at AS updatedAt,
              fetched_at AS fetchedAt
       FROM site_icon_cache
       WHERE domain = ?`,
      [normalized],
    );
  }

  async upsert(record: SiteIconCacheRecord): Promise<SiteIconCacheRecord> {
    const normalized: SiteIconCacheRecord = {
      ...record,
      domain: record.domain.trim().toLowerCase(),
    };
    await executeOne(
      this.db,
      `INSERT INTO site_icon_cache (domain, data_url, source_url, fetched_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(domain)
       DO UPDATE SET
         data_url = excluded.data_url,
         source_url = excluded.source_url,
         fetched_at = excluded.fetched_at,
         updated_at = excluded.updated_at`,
      [
        normalized.domain,
        normalized.dataUrl,
        normalized.sourceUrl,
        normalized.fetchedAt,
        normalized.updatedAt,
      ],
    );
    return normalized;
  }
}

class CloudflareManualSiteIconOverrideRepository implements ManualSiteIconOverrideRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async listByUserId(userId: string): Promise<ManualSiteIconOverrideRecord[]> {
    return selectMany<ManualSiteIconOverrideRecord>(
      this.db,
      `SELECT user_id AS userId,
              domain AS domain,
              data_url AS dataUrl,
              source AS source,
              updated_at AS updatedAt
       FROM manual_site_icon_overrides
       WHERE user_id = ?
       ORDER BY domain ASC`,
      [userId],
    );
  }

  async listByUserIdAndDomains(
    userId: string,
    domains: string[],
  ): Promise<ManualSiteIconOverrideRecord[]> {
    const normalized = Array.from(
      new Set(
        domains
          .filter((domain) => typeof domain === 'string')
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0),
      ),
    );
    if (normalized.length === 0) {
      return [];
    }
    const placeholders = normalized.map(() => '?').join(', ');
    return selectMany<ManualSiteIconOverrideRecord>(
      this.db,
      `SELECT user_id AS userId,
              domain AS domain,
              data_url AS dataUrl,
              source AS source,
              updated_at AS updatedAt
       FROM manual_site_icon_overrides
       WHERE user_id = ?
         AND domain IN (${placeholders})
       ORDER BY domain ASC`,
      [userId, ...normalized],
    );
  }

  async findByUserIdAndDomain(
    userId: string,
    domain: string,
  ): Promise<ManualSiteIconOverrideRecord | null> {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return selectOne<ManualSiteIconOverrideRecord>(
      this.db,
      `SELECT user_id AS userId,
              domain AS domain,
              data_url AS dataUrl,
              source AS source,
              updated_at AS updatedAt
       FROM manual_site_icon_overrides
       WHERE user_id = ?
         AND domain = ?`,
      [userId, normalized],
    );
  }

  async upsert(record: ManualSiteIconOverrideRecord): Promise<ManualSiteIconOverrideRecord> {
    const normalized: ManualSiteIconOverrideRecord = {
      ...record,
      domain: record.domain.trim().toLowerCase(),
    };
    await executeOne(
      this.db,
      `INSERT INTO manual_site_icon_overrides (user_id, domain, data_url, source, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, domain)
       DO UPDATE SET
         data_url = excluded.data_url,
         source = excluded.source,
         updated_at = excluded.updated_at`,
      [
        normalized.userId,
        normalized.domain,
        normalized.dataUrl,
        normalized.source,
        normalized.updatedAt,
      ],
    );
    return normalized;
  }

  async remove(userId: string, domain: string): Promise<boolean> {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    const changed = await executeOneWithChanges(
      this.db,
      `DELETE FROM manual_site_icon_overrides
       WHERE user_id = ?
         AND domain = ?`,
      [userId, normalized],
    );
    return changed === 1;
  }
}

class CloudflareAuthRateLimitRepository implements AuthRateLimitRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async increment(input: {
    key: string;
    nowIso: string;
    windowSeconds: number;
  }): Promise<AuthRateLimitRecord> {
    const current = await this.get(input.key);
    const nextWindowEndsAt = new Date(
      Date.parse(input.nowIso) + input.windowSeconds * 1000,
    ).toISOString();
    if (!current || current.windowEndsAt <= input.nowIso) {
      await executeOne(
        this.db,
        `INSERT INTO auth_rate_limits (rate_limit_key, attempt_count, window_started_at, window_ends_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(rate_limit_key)
         DO UPDATE SET attempt_count = excluded.attempt_count,
                       window_started_at = excluded.window_started_at,
                       window_ends_at = excluded.window_ends_at`,
        [input.key, 1, input.nowIso, nextWindowEndsAt],
      );
      return {
        key: input.key,
        attemptCount: 1,
        windowStartedAt: input.nowIso,
        windowEndsAt: nextWindowEndsAt,
      };
    }

    const nextAttemptCount = current.attemptCount + 1;
    await executeOne(
      this.db,
      `UPDATE auth_rate_limits
       SET attempt_count = ?, window_started_at = ?, window_ends_at = ?
       WHERE rate_limit_key = ?`,
      [nextAttemptCount, current.windowStartedAt, current.windowEndsAt, input.key],
    );
    return {
      key: input.key,
      attemptCount: nextAttemptCount,
      windowStartedAt: current.windowStartedAt,
      windowEndsAt: current.windowEndsAt,
    };
  }

  async get(key: string): Promise<AuthRateLimitRecord | null> {
    return selectOne<AuthRateLimitRecord>(
      this.db,
      `SELECT rate_limit_key AS key,
              attempt_count AS attemptCount,
              window_started_at AS windowStartedAt,
              COALESCE(window_ends_at, window_started_at) AS windowEndsAt
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
          blob_key, owner_user_id, item_id, file_name, lifecycle_state, envelope, content_type, size,
          idempotency_key, upload_token, expires_at, uploaded_at, attached_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.key,
        record.ownerUserId,
        record.itemId,
        record.fileName,
        record.lifecycleState,
        record.envelope,
        record.contentType,
        record.size,
        record.idempotencyKey,
        record.uploadToken,
        record.expiresAt,
        record.uploadedAt,
        record.attachedAt,
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
              file_name AS fileName,
              lifecycle_state AS lifecycleState, envelope, content_type AS contentType,
              size, idempotency_key AS idempotencyKey, upload_token AS uploadToken,
              expires_at AS expiresAt, uploaded_at AS uploadedAt, attached_at AS attachedAt,
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
              file_name AS fileName,
              lifecycle_state AS lifecycleState, envelope, content_type AS contentType,
              size, idempotency_key AS idempotencyKey, upload_token AS uploadToken,
              expires_at AS expiresAt, uploaded_at AS uploadedAt, attached_at AS attachedAt,
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
              file_name AS fileName,
              lifecycle_state AS lifecycleState, envelope, content_type AS contentType,
              size, idempotency_key AS idempotencyKey, upload_token AS uploadToken,
              expires_at AS expiresAt, uploaded_at AS uploadedAt, attached_at AS attachedAt,
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

  async markAttached(input: {
    key: string;
    ownerUserId: string;
    itemId: string;
    updatedAt: string;
    attachedAt: string;
  }): Promise<AttachmentBlobRecord> {
    const current = await this.get(input.key);
    if (!current || current.ownerUserId !== input.ownerUserId) {
      throw new Error('attachment_not_found');
    }
    if (current.itemId !== input.itemId) {
      throw new Error('attachment_already_bound_to_other_item');
    }
    if (current.lifecycleState === 'attached') {
      return current;
    }
    if (current.lifecycleState !== 'uploaded') {
      throw new Error('attachment_upload_incomplete');
    }

    const changedRows = await executeOneWithChanges(
      this.db,
      `UPDATE attachment_blobs
       SET lifecycle_state = ?, attached_at = ?, updated_at = ?, expires_at = NULL, upload_token = NULL
       WHERE blob_key = ? AND owner_user_id = ? AND item_id = ? AND lifecycle_state = ?`,
      ['attached', input.attachedAt, input.updatedAt, input.key, input.ownerUserId, input.itemId, 'uploaded'],
    );

    if (changedRows === 0) {
      const latest = await this.get(input.key);
      if (!latest || latest.ownerUserId !== input.ownerUserId) {
        throw new Error('attachment_not_found');
      }
      if (latest.itemId !== input.itemId) {
        throw new Error('attachment_already_bound_to_other_item');
      }
      if (latest.lifecycleState === 'attached') {
        return latest;
      }
      throw new Error('attachment_upload_incomplete');
    }

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
              revision,
              COALESCE(encrypted_payload, '') AS encryptedPayload,
              COALESCE(created_at, deleted_at) AS createdAt,
              COALESCE(updated_at, deleted_at) AS updatedAt,
              deleted_at AS deletedAt
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
              revision,
              COALESCE(encrypted_payload, '') AS encryptedPayload,
              COALESCE(created_at, deleted_at) AS createdAt,
              COALESCE(updated_at, deleted_at) AS updatedAt,
              deleted_at AS deletedAt
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

  async delete(itemId: string, ownerUserId: string, deletedAtIso: string): Promise<boolean> {
    const current = await this.findByItemId(itemId, ownerUserId);
    if (!current) {
      return false;
    }

    const tombstoneRevision = current.revision + 1;
    if (typeof this.db.batch === 'function') {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT OR REPLACE INTO vault_item_tombstones (
               item_id, owner_user_id, item_type, revision, encrypted_payload, created_at, updated_at, deleted_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            itemId,
            ownerUserId,
            current.itemType,
            tombstoneRevision,
            current.encryptedPayload,
            current.createdAt,
            current.updatedAt,
            deletedAtIso,
          ),
        this.db
          .prepare(`DELETE FROM vault_items WHERE item_id = ? AND owner_user_id = ?`)
          .bind(itemId, ownerUserId),
      ]);
    } else {
      await executeOne(
        this.db,
        `INSERT OR REPLACE INTO vault_item_tombstones (
           item_id, owner_user_id, item_type, revision, encrypted_payload, created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          itemId,
          ownerUserId,
          current.itemType,
          tombstoneRevision,
          current.encryptedPayload,
          current.createdAt,
          current.updatedAt,
          deletedAtIso,
        ],
      );
      await executeOne(
        this.db,
        `DELETE FROM vault_items WHERE item_id = ? AND owner_user_id = ?`,
        [itemId, ownerUserId],
      );
    }
    return true;
  }

  async restore(inputRecord: {
    itemId: string;
    ownerUserId: string;
    restoredAtIso: string;
    restoreRetentionDays: number;
  }): Promise<{
    status: 'success_changed' | 'success_no_op' | 'restore_window_expired' | 'not_found';
    item: VaultItemRecord | null;
  }> {
    const restoreWindowMillis = inputRecord.restoreRetentionDays * 24 * 60 * 60 * 1000;
    const active = await this.findByItemId(inputRecord.itemId, inputRecord.ownerUserId);
    const tombstone = await this.findTombstoneByItemId(inputRecord.itemId, inputRecord.ownerUserId);

    if (active) {
      if (tombstone) {
        if (typeof this.db.batch === 'function') {
          await this.db.batch([
            this.db
              .prepare(`DELETE FROM vault_item_tombstones WHERE item_id = ? AND owner_user_id = ?`)
              .bind(inputRecord.itemId, inputRecord.ownerUserId),
          ]);
        } else {
          await executeOne(
            this.db,
            `DELETE FROM vault_item_tombstones WHERE item_id = ? AND owner_user_id = ?`,
            [inputRecord.itemId, inputRecord.ownerUserId],
          );
        }
      }
      return {
        status: 'success_no_op',
        item: active,
      };
    }

    if (!tombstone) {
      return {
        status: 'not_found',
        item: null,
      };
    }

    const deletedAtMillis = Date.parse(tombstone.deletedAt);
    const restoredAtMillis = Date.parse(inputRecord.restoredAtIso);
    if (
      !tombstone.encryptedPayload ||
      !Number.isFinite(deletedAtMillis) ||
      !Number.isFinite(restoredAtMillis) ||
      deletedAtMillis + restoreWindowMillis < restoredAtMillis
    ) {
      return {
        status: 'restore_window_expired',
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

    if (typeof this.db.batch === 'function') {
      await this.db.batch([
        this.db.prepare(
          `INSERT OR REPLACE INTO vault_items (
             item_id, owner_user_id, item_type, revision, encrypted_payload, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          restoredItem.itemId,
          restoredItem.ownerUserId,
          restoredItem.itemType,
          restoredItem.revision,
          restoredItem.encryptedPayload,
          restoredItem.createdAt,
          restoredItem.updatedAt,
        ),
        this.db
          .prepare(
            `DELETE FROM vault_item_tombstones
             WHERE item_id = ? AND owner_user_id = ?`,
          )
          .bind(inputRecord.itemId, inputRecord.ownerUserId),
      ]);
      return {
        status: 'success_changed',
        item: restoredItem,
      };
    }

    await this.db.exec('BEGIN TRANSACTION');
    try {
      await executeOne(
        this.db,
        `INSERT OR REPLACE INTO vault_items (
           item_id, owner_user_id, item_type, revision, encrypted_payload, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          restoredItem.itemId,
          restoredItem.ownerUserId,
          restoredItem.itemType,
          restoredItem.revision,
          restoredItem.encryptedPayload,
          restoredItem.createdAt,
          restoredItem.updatedAt,
        ],
      );
      await executeOne(
        this.db,
        `DELETE FROM vault_item_tombstones
         WHERE item_id = ? AND owner_user_id = ?`,
        [inputRecord.itemId, inputRecord.ownerUserId],
      );

      await this.db.exec('COMMIT');
      return {
        status: 'success_changed',
        item: restoredItem,
      };
    } catch (error) {
      try {
        await this.db.exec('ROLLBACK');
      } catch {
        // Preserve original error.
      }
      throw error;
    }
  }
}

export async function applyCloudflareMigrations(db: D1DatabaseLike): Promise<void> {
  const migrations = await loadCloudflareMigrations();

  for (const migration of migrations) {
    for (const statement of migration.statements) {
      try {
        await db.prepare(statement).run();
      } catch (error) {
        const normalizedStatement = statement.trim().toLowerCase().replace(/\s+/g, ' ');
        const isAlterAddColumn =
          normalizedStatement.startsWith('alter table') && normalizedStatement.includes(' add column ');
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
        const isDuplicateColumn = message.includes('duplicate column name');
        if (isAlterAddColumn && isDuplicateColumn) {
          continue;
        }
        throw error;
      }
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
  const sessionPolicies = new CloudflareSessionPolicyRepository(input.db);
  const extensionPairings = new CloudflareExtensionPairingRepository(input.db);
  const extensionLinkRequests = new CloudflareExtensionLinkRequestRepository(input.db);
  const surfaceLinks = new CloudflareSurfaceLinkRepository(input.db);
  const unlockGrants = new CloudflareUnlockGrantRepository(input.db);
  const extensionSessionRecoverSecrets = new CloudflareExtensionSessionRecoverSecretRepository(input.db);
  const siteIconCache = new CloudflareSiteIconCacheRepository(input.db);
  const manualSiteIconOverrides = new CloudflareManualSiteIconOverrideRepository(input.db);
  const vaultItems = new CloudflareVaultItemRepository(input.db);

  return {
    deploymentState,
    invites,
    users,
    devices,
    sessions,
    sessionPolicies,
    extensionPairings,
    extensionLinkRequests,
    surfaceLinks,
    unlockGrants,
    extensionSessionRecoverSecrets,
    siteIconCache,
    manualSiteIconOverrides,
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
    async revokeDeviceAndSessionsAtomic(inputRecord: RevokeDeviceAndSessionsAtomicInput): Promise<void> {
      const device = await devices.findById(inputRecord.deviceId);
      if (!device || device.userId !== inputRecord.userId) {
        return;
      }

      if (typeof input.db.batch === 'function') {
        await input.db.batch([
          input.db.prepare(
            `UPDATE trusted_devices
             SET device_state = 'revoked', revoked_at = ?
             WHERE device_id = ? AND user_id = ?`,
          ).bind(inputRecord.revokedAtIso, inputRecord.deviceId, inputRecord.userId),
          input.db.prepare(
            `UPDATE sessions
             SET revoked_at = ?
             WHERE user_id = ? AND device_id = ?`,
          ).bind(inputRecord.revokedAtIso, inputRecord.userId, inputRecord.deviceId),
          input.db.prepare(
            `DELETE FROM surface_links
             WHERE user_id = ?
               AND (web_device_id = ? OR extension_device_id = ?)`,
          ).bind(inputRecord.userId, inputRecord.deviceId, inputRecord.deviceId),
          input.db.prepare(
            `DELETE FROM extension_session_recover_secrets
             WHERE device_id = ?`,
          ).bind(inputRecord.deviceId),
        ]);
        return;
      }

      await input.db.exec('BEGIN TRANSACTION');
      try {
        await executeOne(
          input.db,
          `UPDATE trusted_devices
           SET device_state = 'revoked', revoked_at = ?
           WHERE device_id = ? AND user_id = ?`,
          [inputRecord.revokedAtIso, inputRecord.deviceId, inputRecord.userId],
        );
        await executeOne(
          input.db,
          `UPDATE sessions
           SET revoked_at = ?
           WHERE user_id = ? AND device_id = ?`,
          [inputRecord.revokedAtIso, inputRecord.userId, inputRecord.deviceId],
        );
        await executeOne(
          input.db,
          `DELETE FROM surface_links
           WHERE user_id = ?
             AND (web_device_id = ? OR extension_device_id = ?)`,
          [inputRecord.userId, inputRecord.deviceId, inputRecord.deviceId],
        );
        await executeOne(
          input.db,
          `DELETE FROM extension_session_recover_secrets
           WHERE device_id = ?`,
          [inputRecord.deviceId],
        );
        await input.db.exec('COMMIT');
      } catch (error) {
        try {
          await input.db.exec('ROLLBACK');
        } catch {
          // Preserve original error.
        }
        throw error;
      }
    },
    async rotatePasswordAtomic(inputRecord: RotatePasswordAtomicInput): Promise<RotatePasswordAtomicResult> {
      const currentUser = await users.findByUserId(inputRecord.userId);
      if (!currentUser) {
        throw new Error('user_not_found');
      }
      if (currentUser.authVerifier !== inputRecord.currentAuthVerifier) {
        throw new Error('invalid_credentials');
      }
      if (currentUser.bundleVersion !== inputRecord.expectedBundleVersion) {
        throw new Error('stale_bundle_version');
      }
      const currentSession = await sessions.findBySessionId(inputRecord.currentSessionId);
      if (
        !currentSession ||
        currentSession.userId !== inputRecord.userId ||
        currentSession.revokedAt !== null
      ) {
        throw new Error('unauthorized');
      }
      const currentDevice = await devices.findById(currentSession.deviceId);
      if (
        !currentDevice ||
        currentDevice.userId !== inputRecord.userId ||
        currentDevice.deviceState !== 'active'
      ) {
        throw new Error('unauthorized');
      }

      const nextBundleVersion = currentUser.bundleVersion + 1;
      if (typeof input.db.batch === 'function') {
        const results = (await input.db.batch([
          input.db.prepare(
            `UPDATE user_accounts
             SET auth_salt = ?, auth_verifier = ?, encrypted_account_bundle = ?, account_key_wrapped = ?,
                 bundle_version = ?, updated_at = ?
             WHERE user_id = ? AND auth_verifier = ? AND bundle_version = ?`,
          ).bind(
            inputRecord.nextAuthSalt,
            inputRecord.nextAuthVerifier,
            inputRecord.nextEncryptedAccountBundle,
            inputRecord.nextAccountKeyWrapped,
            nextBundleVersion,
            inputRecord.updatedAtIso,
            inputRecord.userId,
            inputRecord.currentAuthVerifier,
            inputRecord.expectedBundleVersion,
          ),
          input.db.prepare(
            `UPDATE sessions
             SET revoked_at = ?
             WHERE user_id = ?
               AND EXISTS (
                 SELECT 1
                 FROM user_accounts
                 WHERE user_id = ? AND bundle_version = ? AND auth_verifier = ?
               )`,
          ).bind(
            inputRecord.revokedAtIso,
            inputRecord.userId,
            inputRecord.userId,
            nextBundleVersion,
            inputRecord.nextAuthVerifier,
          ),
          input.db.prepare(
            `INSERT INTO sessions (
               session_id, user_id, device_id, csrf_token, created_at, expires_at, recent_reauth_at, revoked_at, rotated_from_session_id
             )
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1
               FROM user_accounts
               WHERE user_id = ? AND bundle_version = ? AND auth_verifier = ?
             )`,
          ).bind(
            inputRecord.newSession.sessionId,
            inputRecord.newSession.userId,
            inputRecord.newSession.deviceId,
            inputRecord.newSession.csrfToken,
            inputRecord.newSession.createdAt,
            inputRecord.newSession.expiresAt,
            inputRecord.newSession.recentReauthAt,
            inputRecord.newSession.revokedAt,
            inputRecord.newSession.rotatedFromSessionId,
            inputRecord.userId,
            nextBundleVersion,
            inputRecord.nextAuthVerifier,
          ),
          input.db.prepare(
            `DELETE FROM extension_session_recover_secrets
             WHERE user_id = ?`,
          ).bind(inputRecord.userId),
        ])) as unknown[];

        const updateChanges = extractChangedRows(results[0]);
        const insertChanges = extractChangedRows(results[2]);
        if (updateChanges !== 1 || insertChanges !== 1) {
          throw new Error('stale_bundle_version');
        }
      } else {
        await input.db.exec('BEGIN TRANSACTION');
        try {
          const changed = await executeOneWithChanges(
            input.db,
            `UPDATE user_accounts
             SET auth_salt = ?, auth_verifier = ?, encrypted_account_bundle = ?, account_key_wrapped = ?,
                 bundle_version = ?, updated_at = ?
             WHERE user_id = ? AND auth_verifier = ? AND bundle_version = ?`,
            [
              inputRecord.nextAuthSalt,
              inputRecord.nextAuthVerifier,
              inputRecord.nextEncryptedAccountBundle,
              inputRecord.nextAccountKeyWrapped,
              nextBundleVersion,
              inputRecord.updatedAtIso,
              inputRecord.userId,
              inputRecord.currentAuthVerifier,
              inputRecord.expectedBundleVersion,
            ],
          );
          if (changed !== 1) {
            throw new Error('stale_bundle_version');
          }

          await executeOne(
            input.db,
            `UPDATE sessions
             SET revoked_at = ?
             WHERE user_id = ?`,
            [inputRecord.revokedAtIso, inputRecord.userId],
          );

          await executeOne(
            input.db,
            `INSERT INTO sessions (
               session_id, user_id, device_id, csrf_token, created_at, expires_at, recent_reauth_at, revoked_at, rotated_from_session_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              inputRecord.newSession.sessionId,
              inputRecord.newSession.userId,
              inputRecord.newSession.deviceId,
              inputRecord.newSession.csrfToken,
              inputRecord.newSession.createdAt,
              inputRecord.newSession.expiresAt,
              inputRecord.newSession.recentReauthAt,
              inputRecord.newSession.revokedAt,
              inputRecord.newSession.rotatedFromSessionId,
            ],
          );
          await executeOne(
            input.db,
            `DELETE FROM extension_session_recover_secrets
             WHERE user_id = ?`,
            [inputRecord.userId],
          );

          await input.db.exec('COMMIT');
        } catch (error) {
          try {
            await input.db.exec('ROLLBACK');
          } catch {
            // Preserve original error.
          }
          throw error;
        }
      }

      const updatedUser = await users.findByUserId(inputRecord.userId);
      if (!updatedUser) {
        throw new Error('user_not_found');
      }
      return {
        user: updatedUser,
        session: inputRecord.newSession,
      };
    },
  };
}

export function createFallbackCloudflareStorage(): VaultLiteStorage {
  return createInMemoryVaultLiteStorage();
}
