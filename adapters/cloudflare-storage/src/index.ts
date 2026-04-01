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
  IconIngestJobRecord,
  IconIngestJobRepository,
  IconObjectRecord,
  IconObjectRepository,
  UserIconStateRecord,
  UserIconStateRepository,
  UserIconItemDomainRepository,
  UserIconReindexSessionRecord,
  IconObjectClass,
  ManualSiteIconOverrideRecord,
  ManualSiteIconOverrideRepository,
  PasswordGeneratorHistoryRecord,
  PasswordGeneratorHistoryRepository,
  RealtimeOutboxRecord,
  RealtimeOutboxRepository,
  RealtimeOneTimeTokenRepository,
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
  WebBootstrapGrantRecord,
  WebBootstrapGrantRepository,
  UnlockGrantRecord,
  UnlockGrantRepository,
  UnlockGrantStatus,
  SessionRecord,
  SessionRepository,
  RotatePasswordAtomicInput,
  RotatePasswordAtomicResult,
  RevokeDeviceAndSessionsAtomicInput,
  AutomaticIconRegistryRecord,
  AutomaticIconRegistryRepository,
  SiteIconCacheRecord,
  SiteIconCacheRepository,
  UserAccountRecord,
  UserAccountRepository,
  VaultItemRecord,
  VaultItemHistoryRecord,
  VaultItemHistoryRepository,
  VaultFolderRecord,
  VaultFolderAssignmentRecord,
  VaultFormFieldRole,
  VaultFormMetadataConfidence,
  VaultFormMetadataRecord,
  VaultFormMetadataRepository,
  VaultFolderRepository,
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
// D1 in local/runtime can reject large IN() bind lists; keep a conservative chunk size.
const D1_SAFE_IN_CLAUSE_CHUNK = 90;
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
  {
    id: '0013_lock_revision_web_bootstrap_grants',
    filename: '0013_lock_revision_web_bootstrap_grants.sql',
    sql: `ALTER TABLE surface_links ADD COLUMN lock_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE unlock_grants ADD COLUMN lock_revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS web_bootstrap_grants (
  grant_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deployment_fingerprint TEXT NOT NULL,
  server_origin TEXT NOT NULL,
  extension_device_id TEXT NOT NULL,
  web_device_id TEXT NOT NULL,
  requester_public_key TEXT NOT NULL,
  requester_client_nonce TEXT NOT NULL,
  web_challenge TEXT NOT NULL,
  unlock_account_key TEXT NOT NULL,
  lock_revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT NULL,
  consumed_by_device_id TEXT NULL,
  revoked_at TEXT NULL,
  revocation_reason_code TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_web_bootstrap_grants_target
  ON web_bootstrap_grants (user_id, web_device_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_web_bootstrap_grants_extension
  ON web_bootstrap_grants (user_id, extension_device_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_web_bootstrap_grants_expires
  ON web_bootstrap_grants (expires_at);`,
  },
  {
    id: '0014_password_generator_history',
    filename: '0014_password_generator_history.sql',
    sql: `CREATE TABLE IF NOT EXISTS password_generator_history (
  user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_password_generator_history_user_updated
  ON password_generator_history (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_password_generator_history_user_created
  ON password_generator_history (user_id, created_at);`,
  },
  {
    id: '0015_realtime_outbox',
    filename: '0015_realtime_outbox.sql',
    sql: `CREATE TABLE IF NOT EXISTS realtime_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  aggregate_id TEXT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  source_device_id TEXT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_outbox_user_pending_created
  ON realtime_outbox (user_id, published_at, created_at, id);

CREATE INDEX IF NOT EXISTS idx_realtime_outbox_published_at
  ON realtime_outbox (published_at);`,
  },
  {
    id: '0016_realtime_one_time_tokens',
    filename: '0016_realtime_one_time_tokens.sql',
    sql: `CREATE TABLE IF NOT EXISTS realtime_one_time_tokens (
  token_key TEXT PRIMARY KEY,
  consumed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_one_time_tokens_expires_at
  ON realtime_one_time_tokens (expires_at);`,
  },
  {
    id: '0017_icons_state_v43',
    filename: '0017_icons_state_v43.sql',
    sql: `CREATE TABLE IF NOT EXISTS icon_objects (
  object_id TEXT PRIMARY KEY,
  object_class TEXT NOT NULL,
  owner_user_id TEXT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_icon_objects_class_sha
  ON icon_objects (object_class, sha256);

CREATE INDEX IF NOT EXISTS idx_icon_objects_owner_class_sha
  ON icon_objects (owner_user_id, object_class, sha256);

CREATE TABLE IF NOT EXISTS user_icon_state (
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  status TEXT NOT NULL,
  object_id TEXT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_user_icon_state_user_updated
  ON user_icon_state (user_id, updated_at, domain);

CREATE INDEX IF NOT EXISTS idx_user_icon_state_object
  ON user_icon_state (object_id);

CREATE TABLE IF NOT EXISTS user_icon_versions (
  user_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_icon_item_domain_heads (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_revision INTEGER NOT NULL,
  generation_id TEXT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, device_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_user_icon_item_domain_heads_user_device_generation
  ON user_icon_item_domain_heads (user_id, device_id, generation_id);

CREATE TABLE IF NOT EXISTS user_icon_item_domains (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  item_id TEXT NOT NULL,
  host TEXT NOT NULL,
  item_revision INTEGER NOT NULL,
  generation_id TEXT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, device_id, item_id, host)
);

CREATE INDEX IF NOT EXISTS idx_user_icon_item_domains_user_host
  ON user_icon_item_domains (user_id, host);

CREATE INDEX IF NOT EXISTS idx_user_icon_item_domains_user_device_generation
  ON user_icon_item_domains (user_id, device_id, generation_id);

CREATE TABLE IF NOT EXISTS user_icon_reindex_sessions (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS icon_ingest_jobs (
  job_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  object_class TEXT NOT NULL,
  status TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  object_id TEXT NULL,
  error_code TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_icon_ingest_jobs_status_created
  ON icon_ingest_jobs (status, created_at, job_id);

CREATE INDEX IF NOT EXISTS idx_icon_ingest_jobs_user_status
  ON icon_ingest_jobs (user_id, status, created_at);`,
  },
  {
    id: '0018_automatic_icon_registry',
    filename: '0018_automatic_icon_registry.sql',
    sql: `CREATE TABLE IF NOT EXISTS automatic_icon_registry (
  domain TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  object_id TEXT NULL,
  source_url TEXT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT NOT NULL,
  next_eligible_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automatic_icon_registry_next_eligible
  ON automatic_icon_registry (next_eligible_at, domain);

CREATE INDEX IF NOT EXISTS idx_automatic_icon_registry_status
  ON automatic_icon_registry (status, updated_at);`,
  },
  {
    id: '0019_vault_item_history',
    filename: '0019_vault_item_history.sql',
    sql: `CREATE TABLE IF NOT EXISTS vault_item_history (
  history_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_revision INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  encrypted_diff_payload TEXT NULL,
  source_device_id TEXT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_item_history_owner_item_created
  ON vault_item_history (owner_user_id, item_id, created_at DESC, history_id DESC);

CREATE INDEX IF NOT EXISTS idx_vault_item_history_owner_created
  ON vault_item_history (owner_user_id, created_at DESC, history_id DESC);`,
  },
  {
    id: '0020_vault_folders',
    filename: '0020_vault_folders.sql',
    sql: `CREATE TABLE IF NOT EXISTS vault_folders (
  owner_user_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_user_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_folders_owner_updated
  ON vault_folders (owner_user_id, updated_at DESC, folder_id);

CREATE TABLE IF NOT EXISTS vault_folder_assignments (
  owner_user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_folder_assignments_owner_folder
  ON vault_folder_assignments (owner_user_id, folder_id, updated_at DESC, item_id);`,
  },
  {
    id: '0021_vault_form_metadata',
    filename: '0021_vault_form_metadata.sql',
    sql: `CREATE TABLE IF NOT EXISTS vault_form_metadata (
  metadata_id TEXT PRIMARY KEY,
  owner_user_id TEXT NULL,
  item_id TEXT NULL,
  item_scope_key TEXT NOT NULL,
  origin TEXT NOT NULL,
  form_fingerprint TEXT NOT NULL,
  field_fingerprint TEXT NOT NULL,
  frame_scope TEXT NOT NULL,
  field_role TEXT NOT NULL,
  selector_css TEXT NOT NULL,
  selector_fallbacks_json TEXT NOT NULL,
  autocomplete_token TEXT NULL,
  input_type TEXT NULL,
  field_name TEXT NULL,
  field_id TEXT NULL,
  label_text_normalized TEXT NULL,
  placeholder_normalized TEXT NULL,
  confidence TEXT NOT NULL,
  selector_status TEXT NOT NULL,
  source_device_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_confirmed_at TEXT NULL,
  UNIQUE (origin, form_fingerprint, field_fingerprint, field_role, item_scope_key)
);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_origin
  ON vault_form_metadata (origin, updated_at DESC, metadata_id DESC);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_item_origin
  ON vault_form_metadata (item_id, origin, updated_at DESC, metadata_id DESC);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_origin_confidence
  ON vault_form_metadata (origin, confidence, updated_at DESC, metadata_id DESC);`,
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
    const missingMigrationSource =
      message.includes('no such file or directory') ||
      message.includes('invalid url string') ||
      message.includes('access to the file system is not allowed');
    const filesystemModuleUnavailable =
      (message.includes('node:fs') || message.includes('fs/promises')) &&
      (message.includes('no such module') ||
        message.includes('not implemented') ||
        message.includes('not available') ||
        message.includes('unsupported'));
    if (
      isDefaultSource &&
      (missingMigrationSource || filesystemModuleUnavailable)
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

const VAULT_FORM_METADATA_CONFIDENCE_RANK: Record<VaultFormMetadataConfidence, number> = {
  heuristic: 0,
  filled: 1,
  submitted_confirmed: 2,
  user_corrected: 3,
};

type VaultFormMetadataRow = {
  metadataId: string;
  ownerUserId: string | null;
  itemId: string | null;
  origin: string;
  formFingerprint: string;
  fieldFingerprint: string;
  frameScope: 'top' | 'same_origin_iframe';
  fieldRole: VaultFormFieldRole;
  selectorCss: string;
  selectorFallbacksJson: string;
  autocompleteToken: string | null;
  inputType: string | null;
  fieldName: string | null;
  fieldId: string | null;
  labelTextNormalized: string | null;
  placeholderNormalized: string | null;
  confidence: VaultFormMetadataConfidence;
  selectorStatus: 'active' | 'suspect' | 'retired';
  sourceDeviceId: string | null;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt: string | null;
};

function normalizeVaultFormMetadataRecord(record: VaultFormMetadataRecord): VaultFormMetadataRecord {
  return {
    ...record,
    ownerUserId: record.ownerUserId ?? null,
    itemId: record.itemId ?? null,
    selectorFallbacks: [...record.selectorFallbacks],
    autocompleteToken: record.autocompleteToken ?? null,
    inputType: record.inputType ?? null,
    fieldName: record.fieldName ?? null,
    fieldId: record.fieldId ?? null,
    labelTextNormalized: record.labelTextNormalized ?? null,
    placeholderNormalized: record.placeholderNormalized ?? null,
    sourceDeviceId: record.sourceDeviceId ?? null,
    lastConfirmedAt: record.lastConfirmedAt ?? null,
  };
}

function buildVaultFormMetadataItemScopeKey(itemId: string | null): string {
  return itemId ?? '';
}

function parseVaultFormMetadataRecord(row: VaultFormMetadataRow): VaultFormMetadataRecord {
  let selectorFallbacks: string[] = [];
  try {
    const parsed = JSON.parse(row.selectorFallbacksJson);
    if (Array.isArray(parsed)) {
      selectorFallbacks = parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    selectorFallbacks = [];
  }
  return normalizeVaultFormMetadataRecord({
    metadataId: row.metadataId,
    ownerUserId: row.ownerUserId,
    itemId: row.itemId,
    origin: row.origin,
    formFingerprint: row.formFingerprint,
    fieldFingerprint: row.fieldFingerprint,
    frameScope: row.frameScope,
    fieldRole: row.fieldRole,
    selectorCss: row.selectorCss,
    selectorFallbacks,
    autocompleteToken: row.autocompleteToken,
    inputType: row.inputType,
    fieldName: row.fieldName,
    fieldId: row.fieldId,
    labelTextNormalized: row.labelTextNormalized,
    placeholderNormalized: row.placeholderNormalized,
    confidence: row.confidence,
    selectorStatus: row.selectorStatus,
    sourceDeviceId: row.sourceDeviceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastConfirmedAt: row.lastConfirmedAt,
  });
}

function compareVaultFormMetadataPriority(
  left: VaultFormMetadataRecord,
  right: VaultFormMetadataRecord,
): number {
  const confidenceDelta =
    VAULT_FORM_METADATA_CONFIDENCE_RANK[left.confidence] -
    VAULT_FORM_METADATA_CONFIDENCE_RANK[right.confidence];
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  const confirmedDelta = (left.lastConfirmedAt ?? '').localeCompare(right.lastConfirmedAt ?? '');
  if (confirmedDelta !== 0) {
    return confirmedDelta;
  }
  const updatedDelta = left.updatedAt.localeCompare(right.updatedAt);
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  return left.metadataId.localeCompare(right.metadataId);
}

function sortVaultFormMetadataRecords(records: VaultFormMetadataRecord[]): VaultFormMetadataRecord[] {
  return [...records].sort((left, right) => {
    const priorityDelta = compareVaultFormMetadataPriority(right, left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return right.metadataId.localeCompare(left.metadataId);
  });
}

function buildVaultFormMetadataPruneWeight(record: VaultFormMetadataRecord): number {
  if (record.selectorStatus === 'retired') {
    return 0;
  }
  if (record.selectorStatus === 'suspect') {
    return 1;
  }
  return 2 + VAULT_FORM_METADATA_CONFIDENCE_RANK[record.confidence];
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
      `INSERT INTO surface_links (
          user_id,
          web_device_id,
          extension_device_id,
          lock_revision,
          created_at,
          updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, web_device_id, extension_device_id) DO UPDATE SET
         lock_revision = excluded.lock_revision,
         updated_at = excluded.updated_at`,
      [
        record.userId,
        record.webDeviceId,
        record.extensionDeviceId,
        Number.isFinite(record.lockRevision) ? record.lockRevision : 0,
        record.createdAt,
        record.updatedAt,
      ],
    );
    return {
      ...record,
      lockRevision: Number.isFinite(record.lockRevision) ? record.lockRevision : 0,
    };
  }

  async findByWebDeviceId(userId: string, webDeviceId: string): Promise<SurfaceLinkRecord | null> {
    return selectOne<SurfaceLinkRecord>(
      this.db,
      `SELECT user_id AS userId,
              web_device_id AS webDeviceId,
              extension_device_id AS extensionDeviceId,
              lock_revision AS lockRevision,
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
              lock_revision AS lockRevision,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM surface_links
       WHERE user_id = ? AND extension_device_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userId, extensionDeviceId],
    );
  }

  async findByPair(
    userId: string,
    webDeviceId: string,
    extensionDeviceId: string,
  ): Promise<SurfaceLinkRecord | null> {
    return selectOne<SurfaceLinkRecord>(
      this.db,
      `SELECT user_id AS userId,
              web_device_id AS webDeviceId,
              extension_device_id AS extensionDeviceId,
              lock_revision AS lockRevision,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM surface_links
       WHERE user_id = ?
         AND web_device_id = ?
         AND extension_device_id = ?
       LIMIT 1`,
      [userId, webDeviceId, extensionDeviceId],
    );
  }

  async listByDeviceId(userId: string, deviceId: string): Promise<SurfaceLinkRecord[]> {
    return selectMany<SurfaceLinkRecord>(
      this.db,
      `SELECT user_id AS userId,
              web_device_id AS webDeviceId,
              extension_device_id AS extensionDeviceId,
              lock_revision AS lockRevision,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM surface_links
       WHERE user_id = ?
         AND (web_device_id = ? OR extension_device_id = ?)
       ORDER BY updated_at DESC`,
      [userId, deviceId, deviceId],
    );
  }

  async bumpLockRevisionByDevice(input: {
    userId: string;
    deviceId: string;
    updatedAtIso: string;
  }): Promise<number> {
    await executeOne(
      this.db,
      `UPDATE surface_links
       SET lock_revision = lock_revision + 1,
           updated_at = ?
       WHERE user_id = ?
         AND (web_device_id = ? OR extension_device_id = ?)`,
      [input.updatedAtIso, input.userId, input.deviceId, input.deviceId],
    );
    const row = await selectOne<{ maxLockRevision: number | null }>(
      this.db,
      `SELECT MAX(lock_revision) AS maxLockRevision
       FROM surface_links
       WHERE user_id = ?
         AND (web_device_id = ? OR extension_device_id = ?)`,
      [input.userId, input.deviceId, input.deviceId],
    );
    return Number.isFinite(row?.maxLockRevision ?? NaN) ? Number(row?.maxLockRevision ?? 0) : 0;
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
          lock_revision,
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
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        record.lockRevision,
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
              lock_revision AS lockRevision,
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
              lock_revision AS lockRevision,
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

  async revokePendingByDeviceWithLockRevision(input: {
    userId: string;
    deviceId: string;
    minLockRevisionExclusive: number;
    revokedAt: string;
    reasonCode: string | null;
  }): Promise<number> {
    return executeOneWithChanges(
      this.db,
      `UPDATE unlock_grants
       SET status = 'rejected',
           unlock_account_key = NULL,
           rejected_at = ?,
           rejection_reason_code = ?
       WHERE user_id = ?
         AND status = 'pending'
         AND lock_revision < ?
         AND (requester_device_id = ? OR approver_device_id = ?)`,
      [
        input.revokedAt,
        input.reasonCode,
        input.userId,
        input.minLockRevisionExclusive,
        input.deviceId,
        input.deviceId,
      ],
    );
  }
}

class CloudflareWebBootstrapGrantRepository implements WebBootstrapGrantRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: WebBootstrapGrantRecord): Promise<WebBootstrapGrantRecord> {
    await executeOne(
      this.db,
      `INSERT INTO web_bootstrap_grants (
          grant_id,
          user_id,
          deployment_fingerprint,
          server_origin,
          extension_device_id,
          web_device_id,
          requester_public_key,
          requester_client_nonce,
          web_challenge,
          unlock_account_key,
          lock_revision,
          status,
          created_at,
          expires_at,
          consumed_at,
          consumed_by_device_id,
          revoked_at,
          revocation_reason_code
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.grantId,
        record.userId,
        record.deploymentFingerprint,
        record.serverOrigin,
        record.extensionDeviceId,
        record.webDeviceId,
        record.requesterPublicKey,
        record.requesterClientNonce,
        record.webChallenge,
        record.unlockAccountKey,
        record.lockRevision,
        record.status,
        record.createdAt,
        record.expiresAt,
        record.consumedAt,
        record.consumedByDeviceId,
        record.revokedAt,
        record.revocationReasonCode,
      ],
    );
    return { ...record };
  }

  async findByGrantId(grantId: string): Promise<WebBootstrapGrantRecord | null> {
    return selectOne<WebBootstrapGrantRecord>(
      this.db,
      `SELECT grant_id AS grantId,
              user_id AS userId,
              deployment_fingerprint AS deploymentFingerprint,
              server_origin AS serverOrigin,
              extension_device_id AS extensionDeviceId,
              web_device_id AS webDeviceId,
              requester_public_key AS requesterPublicKey,
              requester_client_nonce AS requesterClientNonce,
              web_challenge AS webChallenge,
              unlock_account_key AS unlockAccountKey,
              lock_revision AS lockRevision,
              status AS status,
              created_at AS createdAt,
              expires_at AS expiresAt,
              consumed_at AS consumedAt,
              consumed_by_device_id AS consumedByDeviceId,
              revoked_at AS revokedAt,
              revocation_reason_code AS revocationReasonCode
       FROM web_bootstrap_grants
       WHERE grant_id = ?`,
      [grantId],
    );
  }

  async consume(input: {
    grantId: string;
    expectedStatus: 'pending' | 'consumed' | 'revoked';
    consumedAt: string;
    consumedByDeviceId: string;
  }): Promise<WebBootstrapGrantRecord | null> {
    const changed = await executeOneWithChanges(
      this.db,
      `UPDATE web_bootstrap_grants
       SET status = 'consumed',
           consumed_at = ?,
           consumed_by_device_id = ?,
           revoked_at = NULL,
           revocation_reason_code = NULL
       WHERE grant_id = ?
         AND status = ?`,
      [input.consumedAt, input.consumedByDeviceId, input.grantId, input.expectedStatus],
    );
    if (changed !== 1) {
      return null;
    }
    return this.findByGrantId(input.grantId);
  }

  async revokePendingByDeviceWithLockRevision(input: {
    userId: string;
    deviceId: string;
    minLockRevisionExclusive: number;
    revokedAt: string;
    reasonCode: string | null;
  }): Promise<number> {
    return executeOneWithChanges(
      this.db,
      `UPDATE web_bootstrap_grants
       SET status = 'revoked',
           revoked_at = ?,
           revocation_reason_code = ?
       WHERE user_id = ?
         AND status = 'pending'
         AND lock_revision < ?
         AND (extension_device_id = ? OR web_device_id = ?)`,
      [
        input.revokedAt,
        input.reasonCode,
        input.userId,
        input.minLockRevisionExclusive,
        input.deviceId,
        input.deviceId,
      ],
    );
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

class CloudflareAutomaticIconRegistryRepository implements AutomaticIconRegistryRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async listByDomains(domains: string[]): Promise<AutomaticIconRegistryRecord[]> {
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
    const records = new Map<string, AutomaticIconRegistryRecord>();
    for (let index = 0; index < normalized.length; index += D1_SAFE_IN_CLAUSE_CHUNK) {
      const chunk = normalized.slice(index, index + D1_SAFE_IN_CLAUSE_CHUNK);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await selectMany<AutomaticIconRegistryRecord>(
        this.db,
        `SELECT domain AS domain,
                status AS status,
                object_id AS objectId,
                source_url AS sourceUrl,
                fail_count AS failCount,
                last_checked_at AS lastCheckedAt,
                next_eligible_at AS nextEligibleAt,
                updated_at AS updatedAt
         FROM automatic_icon_registry
         WHERE domain IN (${placeholders})`,
        chunk,
      );
      for (const row of rows) {
        records.set(row.domain, row);
      }
    }
    return Array.from(records.values()).sort((left, right) => left.domain.localeCompare(right.domain));
  }

  async findByDomain(domain: string): Promise<AutomaticIconRegistryRecord | null> {
    const normalized = domain.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return selectOne<AutomaticIconRegistryRecord>(
      this.db,
      `SELECT domain AS domain,
              status AS status,
              object_id AS objectId,
              source_url AS sourceUrl,
              fail_count AS failCount,
              last_checked_at AS lastCheckedAt,
              next_eligible_at AS nextEligibleAt,
              updated_at AS updatedAt
       FROM automatic_icon_registry
       WHERE domain = ?`,
      [normalized],
    );
  }

  async upsert(record: AutomaticIconRegistryRecord): Promise<AutomaticIconRegistryRecord> {
    const normalized: AutomaticIconRegistryRecord = {
      ...record,
      domain: record.domain.trim().toLowerCase(),
      status: record.status === 'ready' ? 'ready' : record.status === 'absent' ? 'absent' : 'pending',
      objectId: record.objectId ?? null,
      sourceUrl: record.sourceUrl ?? null,
      failCount: Math.max(0, Math.trunc(record.failCount)),
    };
    await executeOne(
      this.db,
      `INSERT INTO automatic_icon_registry (
         domain,
         status,
         object_id,
         source_url,
         fail_count,
         last_checked_at,
         next_eligible_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(domain)
       DO UPDATE SET
         status = excluded.status,
         object_id = excluded.object_id,
         source_url = excluded.source_url,
         fail_count = excluded.fail_count,
         last_checked_at = excluded.last_checked_at,
         next_eligible_at = excluded.next_eligible_at,
         updated_at = excluded.updated_at`,
      [
        normalized.domain,
        normalized.status,
        normalized.objectId,
        normalized.sourceUrl,
        normalized.failCount,
        normalized.lastCheckedAt,
        normalized.nextEligibleAt,
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
    const records = new Map<string, ManualSiteIconOverrideRecord>();
    for (let index = 0; index < normalized.length; index += D1_SAFE_IN_CLAUSE_CHUNK) {
      const chunk = normalized.slice(index, index + D1_SAFE_IN_CLAUSE_CHUNK);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await selectMany<ManualSiteIconOverrideRecord>(
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
        [userId, ...chunk],
      );
      for (const row of rows) {
        records.set(row.domain, row);
      }
    }
    return Array.from(records.values()).sort((left, right) => left.domain.localeCompare(right.domain));
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

class CloudflareIconObjectRepository implements IconObjectRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: IconObjectRecord): Promise<IconObjectRecord> {
    const normalized: IconObjectRecord = {
      ...record,
      objectId: record.objectId.trim(),
      ownerUserId: record.ownerUserId ?? null,
      sha256: record.sha256.trim().toLowerCase(),
      r2Key: record.r2Key.trim(),
      contentType: record.contentType.trim().toLowerCase(),
      byteLength: Math.max(0, Math.trunc(record.byteLength)),
    };
    await executeOne(
      this.db,
      `INSERT INTO icon_objects (
         object_id, object_class, owner_user_id, sha256, r2_key, content_type, byte_length, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(object_id) DO UPDATE SET
         object_class = excluded.object_class,
         owner_user_id = excluded.owner_user_id,
         sha256 = excluded.sha256,
         r2_key = excluded.r2_key,
         content_type = excluded.content_type,
         byte_length = excluded.byte_length,
         updated_at = excluded.updated_at`,
      [
        normalized.objectId,
        normalized.objectClass,
        normalized.ownerUserId,
        normalized.sha256,
        normalized.r2Key,
        normalized.contentType,
        normalized.byteLength,
        normalized.createdAt,
        normalized.updatedAt,
      ],
    );
    return normalized;
  }

  async findByObjectId(objectId: string): Promise<IconObjectRecord | null> {
    return selectOne<IconObjectRecord>(
      this.db,
      `SELECT object_id AS objectId,
              object_class AS objectClass,
              owner_user_id AS ownerUserId,
              sha256 AS sha256,
              r2_key AS r2Key,
              content_type AS contentType,
              byte_length AS byteLength,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM icon_objects
       WHERE object_id = ?`,
      [objectId.trim()],
    );
  }

  async findByClassAndSha256(input: {
    objectClass: IconObjectClass;
    sha256: string;
    ownerUserId?: string | null;
  }): Promise<IconObjectRecord | null> {
    const sha256 = input.sha256.trim().toLowerCase();
    if (input.objectClass === 'manual_private') {
      return selectOne<IconObjectRecord>(
        this.db,
        `SELECT object_id AS objectId,
                object_class AS objectClass,
                owner_user_id AS ownerUserId,
                sha256 AS sha256,
                r2_key AS r2Key,
                content_type AS contentType,
                byte_length AS byteLength,
                created_at AS createdAt,
                updated_at AS updatedAt
         FROM icon_objects
         WHERE object_class = ?
           AND owner_user_id = ?
           AND sha256 = ?
         LIMIT 1`,
        [input.objectClass, input.ownerUserId ?? null, sha256],
      );
    }
    return selectOne<IconObjectRecord>(
      this.db,
      `SELECT object_id AS objectId,
              object_class AS objectClass,
              owner_user_id AS ownerUserId,
              sha256 AS sha256,
              r2_key AS r2Key,
              content_type AS contentType,
              byte_length AS byteLength,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM icon_objects
       WHERE object_class = ?
         AND sha256 = ?
       LIMIT 1`,
      [input.objectClass, sha256],
    );
  }

  async removeByObjectId(objectId: string): Promise<boolean> {
    const changed = await executeOneWithChanges(
      this.db,
      `DELETE FROM icon_objects
       WHERE object_id = ?`,
      [objectId.trim()],
    );
    return changed > 0;
  }

  async listOrphanCandidates(input: {
    notReferencedAfterIso: string;
    limit: number;
  }): Promise<IconObjectRecord[]> {
    const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(2_000, Math.trunc(input.limit))) : 200;
    return selectMany<IconObjectRecord>(
      this.db,
      `SELECT io.object_id AS objectId,
              io.object_class AS objectClass,
              io.owner_user_id AS ownerUserId,
              io.sha256 AS sha256,
              io.r2_key AS r2Key,
              io.content_type AS contentType,
              io.byte_length AS byteLength,
              io.created_at AS createdAt,
              io.updated_at AS updatedAt
       FROM icon_objects io
       LEFT JOIN user_icon_state s ON s.object_id = io.object_id
       WHERE s.object_id IS NULL
         AND io.updated_at <= ?
       ORDER BY io.updated_at ASC, io.object_id ASC
       LIMIT ?`,
      [input.notReferencedAfterIso, safeLimit],
    );
  }
}

class CloudflareUserIconStateRepository implements UserIconStateRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async listByUserId(userId: string): Promise<UserIconStateRecord[]> {
    return selectMany<UserIconStateRecord>(
      this.db,
      `SELECT user_id AS userId,
              domain AS domain,
              status AS status,
              object_id AS objectId,
              updated_at AS updatedAt
       FROM user_icon_state
       WHERE user_id = ?
       ORDER BY domain ASC`,
      [userId],
    );
  }

  async listByUserIdAndDomains(userId: string, domains: string[]): Promise<UserIconStateRecord[]> {
    const normalizedDomains = Array.from(
      new Set(
        domains
          .filter((domain) => typeof domain === 'string')
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0),
      ),
    );
    if (normalizedDomains.length === 0) {
      return [];
    }
    const records = new Map<string, UserIconStateRecord>();
    for (let index = 0; index < normalizedDomains.length; index += D1_SAFE_IN_CLAUSE_CHUNK) {
      const chunk = normalizedDomains.slice(index, index + D1_SAFE_IN_CLAUSE_CHUNK);
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await selectMany<UserIconStateRecord>(
        this.db,
        `SELECT user_id AS userId,
                domain AS domain,
                status AS status,
                object_id AS objectId,
                updated_at AS updatedAt
         FROM user_icon_state
         WHERE user_id = ?
           AND domain IN (${placeholders})
         ORDER BY domain ASC`,
        [userId, ...chunk],
      );
      for (const row of rows) {
        records.set(row.domain, row);
      }
    }
    return Array.from(records.values()).sort((left, right) => left.domain.localeCompare(right.domain));
  }

  async findByUserIdAndDomain(userId: string, domain: string): Promise<UserIconStateRecord | null> {
    const normalizedDomain = domain.trim().toLowerCase();
    if (!normalizedDomain) {
      return null;
    }
    return selectOne<UserIconStateRecord>(
      this.db,
      `SELECT user_id AS userId,
              domain AS domain,
              status AS status,
              object_id AS objectId,
              updated_at AS updatedAt
       FROM user_icon_state
       WHERE user_id = ?
         AND domain = ?`,
      [userId, normalizedDomain],
    );
  }

  async upsert(record: UserIconStateRecord): Promise<{ record: UserIconStateRecord; changed: boolean }> {
    const normalized: UserIconStateRecord = {
      ...record,
      domain: record.domain.trim().toLowerCase(),
      objectId: record.objectId ?? null,
    };
    const existing = await this.findByUserIdAndDomain(normalized.userId, normalized.domain);
    const changed =
      !existing ||
      existing.status !== normalized.status ||
      existing.objectId !== normalized.objectId;
    if (!changed && existing) {
      return {
        record: existing,
        changed: false,
      };
    }
    await executeOne(
      this.db,
      `INSERT INTO user_icon_state (user_id, domain, status, object_id, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, domain)
       DO UPDATE SET
         status = excluded.status,
         object_id = excluded.object_id,
         updated_at = excluded.updated_at`,
      [
        normalized.userId,
        normalized.domain,
        normalized.status,
        normalized.objectId,
        normalized.updatedAt,
      ],
    );
    return {
      record: normalized,
      changed,
    };
  }

  async remove(input: { userId: string; domain: string; updatedAt: string }): Promise<boolean> {
    const normalizedDomain = input.domain.trim().toLowerCase();
    if (!normalizedDomain) {
      return false;
    }
    const changed = await executeOneWithChanges(
      this.db,
      `DELETE FROM user_icon_state
       WHERE user_id = ?
         AND domain = ?`,
      [input.userId, normalizedDomain],
    );
    return changed > 0;
  }

  async getVersion(userId: string): Promise<number> {
    const row = await selectOne<{ version: number }>(
      this.db,
      `SELECT version AS version
       FROM user_icon_versions
       WHERE user_id = ?`,
      [userId],
    );
    return row?.version ?? 0;
  }

  async bumpVersion(input: { userId: string; updatedAt: string }): Promise<number> {
    await executeOne(
      this.db,
      `INSERT INTO user_icon_versions (user_id, version, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(user_id)
       DO UPDATE SET
         version = user_icon_versions.version + 1,
         updated_at = excluded.updated_at`,
      [input.userId, input.updatedAt],
    );
    return this.getVersion(input.userId);
  }
}

class CloudflareUserIconItemDomainRepository implements UserIconItemDomainRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async replaceItemHosts(input: {
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
  }> {
    const normalizedItemId = input.itemId.trim();
    const normalizedHosts = Array.from(
      new Set(
        input.hosts
          .filter((host): host is string => typeof host === 'string')
          .map((host) => host.trim().toLowerCase())
          .filter((host) => host.length > 0),
      ),
    );
    const head = await selectOne<{ itemRevision: number; generationId: string | null }>(
      this.db,
      `SELECT item_revision AS itemRevision,
              generation_id AS generationId
       FROM user_icon_item_domain_heads
       WHERE user_id = ?
         AND device_id = ?
         AND item_id = ?`,
      [input.userId, input.deviceId, normalizedItemId],
    );
    if (head && input.itemRevision < head.itemRevision) {
      return {
        result: 'success_no_op_stale_revision',
        changed: false,
      };
    }
    const existingHosts = await selectMany<{ host: string }>(
      this.db,
      `SELECT host AS host
       FROM user_icon_item_domains
       WHERE user_id = ?
         AND device_id = ?
         AND item_id = ?
       ORDER BY host ASC`,
      [input.userId, input.deviceId, normalizedItemId],
    );
    const existingHostValues = existingHosts.map((entry) => entry.host).sort();
    const nextHosts = [...normalizedHosts].sort();
    const hostsChanged =
      existingHostValues.length !== nextHosts.length ||
      existingHostValues.some((value, index) => value !== nextHosts[index]);
    const revisionChanged = !head || head.itemRevision !== input.itemRevision;
    const generationId = input.generationId ?? head?.generationId ?? null;
    const changed = hostsChanged || revisionChanged;
    if (!changed) {
      return {
        result: 'success_no_op',
        changed: false,
      };
    }

    const statements: D1PreparedStatementLike[] = [
      this.db.prepare(
        `INSERT INTO user_icon_item_domain_heads (
           user_id, device_id, surface, item_id, item_revision, generation_id, last_seen_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, device_id, item_id)
         DO UPDATE SET
           surface = excluded.surface,
           item_revision = excluded.item_revision,
           generation_id = excluded.generation_id,
           last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at`,
      ).bind(
        input.userId,
        input.deviceId,
        input.surface,
        normalizedItemId,
        input.itemRevision,
        generationId,
        input.updatedAt,
        input.updatedAt,
      ),
    ];
    if (hostsChanged) {
      statements.push(
        this.db.prepare(
          `DELETE FROM user_icon_item_domains
           WHERE user_id = ?
             AND device_id = ?
             AND item_id = ?`,
        ).bind(input.userId, input.deviceId, normalizedItemId),
      );
      for (const host of normalizedHosts) {
        statements.push(
          this.db.prepare(
            `INSERT INTO user_icon_item_domains (
               user_id, device_id, surface, item_id, host, item_revision, generation_id, last_seen_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, device_id, item_id, host)
             DO UPDATE SET
               surface = excluded.surface,
               item_revision = excluded.item_revision,
               generation_id = excluded.generation_id,
               last_seen_at = excluded.last_seen_at,
               updated_at = excluded.updated_at`,
          ).bind(
            input.userId,
            input.deviceId,
            input.surface,
            normalizedItemId,
            host,
            input.itemRevision,
            generationId,
            input.updatedAt,
            input.updatedAt,
          ),
        );
      }
    } else {
      statements.push(
        this.db.prepare(
          `UPDATE user_icon_item_domains
           SET surface = ?,
               item_revision = ?,
               generation_id = ?,
               last_seen_at = ?,
               updated_at = ?
           WHERE user_id = ?
             AND device_id = ?
             AND item_id = ?`,
        ).bind(
          input.surface,
          input.itemRevision,
          generationId,
          input.updatedAt,
          input.updatedAt,
          input.userId,
          input.deviceId,
          normalizedItemId,
        ),
      );
    }
    if (typeof this.db.batch === 'function') {
      await this.db.batch(statements);
    } else {
      await this.db.exec('BEGIN TRANSACTION');
      try {
        for (const statement of statements) {
          await statement.run();
        }
        await this.db.exec('COMMIT');
      } catch (error) {
        try {
          await this.db.exec('ROLLBACK');
        } catch {
          // Preserve original error.
        }
        throw error;
      }
    }
    return {
      result: changed ? 'success_changed' : 'success_no_op',
      changed,
    };
  }

  async startReindex(input: {
    userId: string;
    deviceId: string;
    surface: 'web' | 'extension';
    generationId: string;
    startedAt: string;
  }): Promise<UserIconReindexSessionRecord> {
    await executeOne(
      this.db,
      `INSERT INTO user_icon_reindex_sessions (
         user_id, device_id, surface, generation_id, started_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, device_id)
       DO UPDATE SET
         surface = excluded.surface,
         generation_id = excluded.generation_id,
         started_at = excluded.started_at,
         updated_at = excluded.updated_at`,
      [
        input.userId,
        input.deviceId,
        input.surface,
        input.generationId,
        input.startedAt,
        input.startedAt,
      ],
    );
    return {
      userId: input.userId,
      deviceId: input.deviceId,
      surface: input.surface,
      generationId: input.generationId,
      startedAt: input.startedAt,
      updatedAt: input.startedAt,
    };
  }

  async upsertReindexChunk(input: {
    userId: string;
    deviceId: string;
    surface: 'web' | 'extension';
    generationId: string;
    entries: Array<{ itemId: string; itemRevision: number; hosts: string[] }>;
    updatedAt: string;
  }): Promise<{ acceptedItems: number }> {
    const session = await selectOne<{ generationId: string }>(
      this.db,
      `SELECT generation_id AS generationId
       FROM user_icon_reindex_sessions
       WHERE user_id = ?
         AND device_id = ?`,
      [input.userId, input.deviceId],
    );
    if (!session || session.generationId !== input.generationId) {
      return { acceptedItems: 0 };
    }
    let acceptedItems = 0;
    for (const entry of input.entries) {
      const replaced = await this.replaceItemHosts({
        userId: input.userId,
        deviceId: input.deviceId,
        surface: input.surface,
        itemId: entry.itemId,
        itemRevision: entry.itemRevision,
        hosts: entry.hosts,
        generationId: input.generationId,
        updatedAt: input.updatedAt,
      });
      if (replaced.result !== 'success_no_op_stale_revision') {
        acceptedItems += 1;
      }
    }
    await executeOne(
      this.db,
      `UPDATE user_icon_reindex_sessions
       SET updated_at = ?
       WHERE user_id = ?
         AND device_id = ?
         AND generation_id = ?`,
      [input.updatedAt, input.userId, input.deviceId, input.generationId],
    );
    return { acceptedItems };
  }

  async commitReindex(input: {
    userId: string;
    deviceId: string;
    surface: 'web' | 'extension';
    generationId: string;
    updatedAt: string;
  }): Promise<{ changed: boolean }> {
    const session = await selectOne<{ generationId: string }>(
      this.db,
      `SELECT generation_id AS generationId
       FROM user_icon_reindex_sessions
       WHERE user_id = ?
         AND device_id = ?`,
      [input.userId, input.deviceId],
    );
    if (!session || session.generationId !== input.generationId) {
      return { changed: false };
    }
    const headsToDelete = await selectMany<{ itemId: string }>(
      this.db,
      `SELECT item_id AS itemId
       FROM user_icon_item_domain_heads
       WHERE user_id = ?
         AND device_id = ?
         AND (generation_id IS NULL OR generation_id <> ?)`,
      [input.userId, input.deviceId, input.generationId],
    );
    if (headsToDelete.length > 0) {
      const statements: D1PreparedStatementLike[] = [];
      for (const row of headsToDelete) {
        statements.push(
          this.db.prepare(
            `DELETE FROM user_icon_item_domains
             WHERE user_id = ?
               AND device_id = ?
               AND item_id = ?`,
          ).bind(input.userId, input.deviceId, row.itemId),
        );
        statements.push(
          this.db.prepare(
            `DELETE FROM user_icon_item_domain_heads
             WHERE user_id = ?
               AND device_id = ?
               AND item_id = ?`,
          ).bind(input.userId, input.deviceId, row.itemId),
        );
      }
      statements.push(
        this.db.prepare(
          `DELETE FROM user_icon_reindex_sessions
           WHERE user_id = ?
             AND device_id = ?
             AND generation_id = ?`,
        ).bind(input.userId, input.deviceId, input.generationId),
      );
      if (typeof this.db.batch === 'function') {
        await this.db.batch(statements);
      } else {
        await this.db.exec('BEGIN TRANSACTION');
        try {
          for (const statement of statements) {
            await statement.run();
          }
          await this.db.exec('COMMIT');
        } catch (error) {
          try {
            await this.db.exec('ROLLBACK');
          } catch {
            // Preserve original error.
          }
          throw error;
        }
      }
      return { changed: true };
    }
    await executeOne(
      this.db,
      `DELETE FROM user_icon_reindex_sessions
       WHERE user_id = ?
         AND device_id = ?
         AND generation_id = ?`,
      [input.userId, input.deviceId, input.generationId],
    );
    return { changed: false };
  }

  async listEffectiveHostsByUserId(userId: string): Promise<string[]> {
    const rows = await selectMany<{ host: string }>(
      this.db,
      `SELECT DISTINCT host AS host
       FROM user_icon_item_domains
       WHERE user_id = ?
       ORDER BY host ASC`,
      [userId],
    );
    return rows.map((entry) => entry.host);
  }
}

class CloudflareIconIngestJobRepository implements IconIngestJobRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: IconIngestJobRecord): Promise<IconIngestJobRecord> {
    const normalized: IconIngestJobRecord = {
      ...record,
      domain: record.domain.trim().toLowerCase(),
      sha256: record.sha256.trim().toLowerCase(),
      r2Key: record.r2Key.trim(),
      objectId: record.objectId ?? null,
      errorCode: record.errorCode ?? null,
    };
    await executeOne(
      this.db,
      `INSERT INTO icon_ingest_jobs (
         job_id, user_id, domain, object_class, status, sha256, r2_key, object_id, error_code, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.jobId,
        normalized.userId,
        normalized.domain,
        normalized.objectClass,
        normalized.status,
        normalized.sha256,
        normalized.r2Key,
        normalized.objectId,
        normalized.errorCode,
        normalized.createdAt,
        normalized.updatedAt,
      ],
    );
    return normalized;
  }

  async updateStatus(input: {
    jobId: string;
    status: IconIngestJobRecord['status'];
    objectId?: string | null;
    errorCode?: string | null;
    updatedAt: string;
  }): Promise<IconIngestJobRecord | null> {
    const current = await this.findByJobId(input.jobId);
    if (!current) {
      return null;
    }
    const nextObjectId =
      Object.prototype.hasOwnProperty.call(input, 'objectId') && input.objectId !== undefined
        ? (input.objectId ?? null)
        : current.objectId;
    const nextErrorCode =
      Object.prototype.hasOwnProperty.call(input, 'errorCode') && input.errorCode !== undefined
        ? (input.errorCode ?? null)
        : current.errorCode;
    await executeOne(
      this.db,
      `UPDATE icon_ingest_jobs
       SET status = ?,
           object_id = ?,
           error_code = ?,
           updated_at = ?
       WHERE job_id = ?`,
      [input.status, nextObjectId, nextErrorCode, input.updatedAt, input.jobId],
    );
    return this.findByJobId(input.jobId);
  }

  async findByJobId(jobId: string): Promise<IconIngestJobRecord | null> {
    return selectOne<IconIngestJobRecord>(
      this.db,
      `SELECT job_id AS jobId,
              user_id AS userId,
              domain AS domain,
              object_class AS objectClass,
              status AS status,
              sha256 AS sha256,
              r2_key AS r2Key,
              object_id AS objectId,
              error_code AS errorCode,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM icon_ingest_jobs
       WHERE job_id = ?`,
      [jobId],
    );
  }

  async listByStatus(input: {
    status: IconIngestJobRecord['status'];
    limit: number;
  }): Promise<IconIngestJobRecord[]> {
    const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(2_000, Math.trunc(input.limit))) : 200;
    return selectMany<IconIngestJobRecord>(
      this.db,
      `SELECT job_id AS jobId,
              user_id AS userId,
              domain AS domain,
              object_class AS objectClass,
              status AS status,
              sha256 AS sha256,
              r2_key AS r2Key,
              object_id AS objectId,
              error_code AS errorCode,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM icon_ingest_jobs
       WHERE status = ?
       ORDER BY created_at ASC, job_id ASC
       LIMIT ?`,
      [input.status, safeLimit],
    );
  }

  async delete(jobId: string): Promise<boolean> {
    const changed = await executeOneWithChanges(
      this.db,
      `DELETE FROM icon_ingest_jobs
       WHERE job_id = ?`,
      [jobId],
    );
    return changed > 0;
  }
}

class CloudflarePasswordGeneratorHistoryRepository implements PasswordGeneratorHistoryRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async listByUserId(userId: string, limit: number): Promise<PasswordGeneratorHistoryRecord[]> {
    const normalizedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(500, Math.trunc(limit)))
      : 200;
    return selectMany<PasswordGeneratorHistoryRecord>(
      this.db,
      `SELECT user_id AS userId,
              entry_id AS entryId,
              encrypted_payload AS encryptedPayload,
              created_at AS createdAt,
              updated_at AS updatedAt
       FROM password_generator_history
       WHERE user_id = ?
       ORDER BY updated_at DESC, entry_id DESC
       LIMIT ?`,
      [userId, normalizedLimit],
    );
  }

  async upsert(record: PasswordGeneratorHistoryRecord): Promise<PasswordGeneratorHistoryRecord> {
    const normalized: PasswordGeneratorHistoryRecord = {
      ...record,
      entryId: record.entryId.trim(),
    };
    await executeOne(
      this.db,
      `INSERT INTO password_generator_history (user_id, entry_id, encrypted_payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, entry_id)
       DO UPDATE SET
         encrypted_payload = excluded.encrypted_payload,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at`,
      [
        normalized.userId,
        normalized.entryId,
        normalized.encryptedPayload,
        normalized.createdAt,
        normalized.updatedAt,
      ],
    );
    return normalized;
  }

  async pruneByUserId(userId: string, limit: number): Promise<void> {
    const normalizedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(500, Math.trunc(limit)))
      : 200;
    await executeOne(
      this.db,
      `DELETE FROM password_generator_history
       WHERE user_id = ?
         AND entry_id IN (
           SELECT entry_id
           FROM password_generator_history
           WHERE user_id = ?
           ORDER BY updated_at DESC, entry_id DESC
           LIMIT -1 OFFSET ?
         )`,
      [userId, userId, normalizedLimit],
    );
  }
}

class CloudflareRealtimeOutboxRepository implements RealtimeOutboxRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async enqueue(record: RealtimeOutboxRecord): Promise<RealtimeOutboxRecord> {
    await executeOne(
      this.db,
      `INSERT INTO realtime_outbox (
          id, user_id, topic, aggregate_id, idempotency_key, event_id, occurred_at,
          source_device_id, payload_json, created_at, published_at, attempt_count, last_error
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key)
       DO NOTHING`,
      [
        record.id,
        record.userId,
        record.topic,
        record.aggregateId,
        record.idempotencyKey,
        record.eventId,
        record.occurredAt,
        record.sourceDeviceId,
        record.payloadJson,
        record.createdAt,
        record.publishedAt,
        Math.max(0, Math.trunc(record.attemptCount)),
        record.lastError,
      ],
    );
    const persisted = await selectOne<RealtimeOutboxRecord>(
      this.db,
      `SELECT id, user_id AS userId, topic, aggregate_id AS aggregateId, idempotency_key AS idempotencyKey,
              event_id AS eventId, occurred_at AS occurredAt, source_device_id AS sourceDeviceId,
              payload_json AS payloadJson, created_at AS createdAt, published_at AS publishedAt,
              attempt_count AS attemptCount, last_error AS lastError
       FROM realtime_outbox
       WHERE idempotency_key = ?`,
      [record.idempotencyKey],
    );
    if (!persisted) {
      throw new Error('realtime_outbox_enqueue_failed');
    }
    return persisted;
  }

  async listPendingByUserId(userId: string, limit: number): Promise<RealtimeOutboxRecord[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 100;
    return selectMany<RealtimeOutboxRecord>(
      this.db,
      `SELECT id, user_id AS userId, topic, aggregate_id AS aggregateId, idempotency_key AS idempotencyKey,
              event_id AS eventId, occurred_at AS occurredAt, source_device_id AS sourceDeviceId,
              payload_json AS payloadJson, created_at AS createdAt, published_at AS publishedAt,
              attempt_count AS attemptCount, last_error AS lastError
       FROM realtime_outbox
       WHERE user_id = ? AND published_at IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
      [userId, safeLimit],
    );
  }

  async markPublished(input: {
    id: string;
    publishedAt: string;
  }): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE realtime_outbox
       SET published_at = ?, last_error = NULL
       WHERE id = ?`,
      [input.publishedAt, input.id],
    );
  }

  async markFailed(input: {
    id: string;
    failedAt: string;
    lastError: string;
  }): Promise<void> {
    await executeOne(
      this.db,
      `UPDATE realtime_outbox
       SET attempt_count = attempt_count + 1,
           last_error = ?
       WHERE id = ?`,
      [input.lastError, input.id],
    );
  }

  async deletePublishedBefore(input: {
    cutoffIso: string;
    limit: number;
  }): Promise<number> {
    const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(1_000, Math.trunc(input.limit))) : 500;
    return executeOneWithChanges(
      this.db,
      `DELETE FROM realtime_outbox
       WHERE id IN (
         SELECT id
         FROM realtime_outbox
         WHERE published_at IS NOT NULL AND published_at <= ?
         ORDER BY published_at ASC, id ASC
         LIMIT ?
       )`,
      [input.cutoffIso, safeLimit],
    );
  }
}

class CloudflareRealtimeOneTimeTokenRepository implements RealtimeOneTimeTokenRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async consume(input: {
    tokenKey: string;
    consumedAt: string;
    expiresAt: string;
  }): Promise<{ consumed: boolean }> {
    await this.pruneExpired({
      nowIso: input.consumedAt,
      limit: 500,
    });
    try {
      await executeOne(
        this.db,
        `INSERT INTO realtime_one_time_tokens (token_key, consumed_at, expires_at)
         VALUES (?, ?, ?)`,
        [input.tokenKey, input.consumedAt, input.expiresAt],
      );
      return { consumed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (message.includes('unique constraint failed') || message.includes('constraint failed')) {
        return { consumed: false };
      }
      throw error;
    }
  }

  async pruneExpired(input: {
    nowIso: string;
    limit: number;
  }): Promise<number> {
    const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(1_000, Math.trunc(input.limit))) : 500;
    return executeOneWithChanges(
      this.db,
      `DELETE FROM realtime_one_time_tokens
       WHERE token_key IN (
         SELECT token_key
         FROM realtime_one_time_tokens
         WHERE expires_at <= ?
         ORDER BY expires_at ASC, token_key ASC
         LIMIT ?
       )`,
      [input.nowIso, safeLimit],
    );
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

  async listByOwner(ownerUserId: string): Promise<AttachmentBlobRecord[]> {
    return selectMany<AttachmentBlobRecord>(
      this.db,
      `SELECT blob_key AS key, owner_user_id AS ownerUserId, item_id AS itemId,
              file_name AS fileName,
              lifecycle_state AS lifecycleState, envelope, content_type AS contentType,
              size, idempotency_key AS idempotencyKey, upload_token AS uploadToken,
              expires_at AS expiresAt, uploaded_at AS uploadedAt, attached_at AS attachedAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM attachment_blobs
       WHERE owner_user_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [ownerUserId],
    );
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

function parseVaultItemHistoryCursor(cursor: string | null | undefined): {
  createdAt: string;
  historyId: string;
} | null {
  if (typeof cursor !== 'string' || cursor.length === 0) {
    return null;
  }
  const separator = cursor.indexOf('|');
  if (separator <= 0) {
    return null;
  }
  const createdAt = cursor.slice(0, separator).trim();
  const historyId = cursor.slice(separator + 1).trim();
  if (!createdAt || !historyId) {
    return null;
  }
  return {
    createdAt,
    historyId,
  };
}

function buildVaultItemHistoryCursor(record: Pick<VaultItemHistoryRecord, 'createdAt' | 'historyId'>): string {
  return `${record.createdAt}|${record.historyId}`;
}

class CloudflareVaultItemHistoryRepository implements VaultItemHistoryRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async create(record: VaultItemHistoryRecord): Promise<VaultItemHistoryRecord> {
    const normalized: VaultItemHistoryRecord = {
      ...record,
      encryptedDiffPayload: record.encryptedDiffPayload ?? null,
      sourceDeviceId: record.sourceDeviceId ?? null,
    };
    await executeOne(
      this.db,
      `INSERT INTO vault_item_history (
         history_id,
         owner_user_id,
         item_id,
         item_revision,
         change_type,
         encrypted_diff_payload,
         source_device_id,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.historyId,
        normalized.ownerUserId,
        normalized.itemId,
        normalized.itemRevision,
        normalized.changeType,
        normalized.encryptedDiffPayload,
        normalized.sourceDeviceId,
        normalized.createdAt,
      ],
    );
    return normalized;
  }

  async listByItem(input: {
    ownerUserId: string;
    itemId: string;
    limit: number;
    cursor?: string | null;
  }): Promise<{ records: VaultItemHistoryRecord[]; nextCursor: string | null }> {
    const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(200, Math.trunc(input.limit))) : 50;
    const parsedCursor = parseVaultItemHistoryCursor(input.cursor);
    const rows = parsedCursor
      ? await selectMany<VaultItemHistoryRecord>(
        this.db,
        `SELECT history_id AS historyId,
                owner_user_id AS ownerUserId,
                item_id AS itemId,
                item_revision AS itemRevision,
                change_type AS changeType,
                encrypted_diff_payload AS encryptedDiffPayload,
                source_device_id AS sourceDeviceId,
                created_at AS createdAt
         FROM vault_item_history
         WHERE owner_user_id = ?
           AND item_id = ?
           AND (
             created_at < ?
             OR (created_at = ? AND history_id < ?)
           )
         ORDER BY created_at DESC, history_id DESC
         LIMIT ?`,
        [
          input.ownerUserId,
          input.itemId,
          parsedCursor.createdAt,
          parsedCursor.createdAt,
          parsedCursor.historyId,
          safeLimit + 1,
        ],
      )
      : await selectMany<VaultItemHistoryRecord>(
        this.db,
        `SELECT history_id AS historyId,
                owner_user_id AS ownerUserId,
                item_id AS itemId,
                item_revision AS itemRevision,
                change_type AS changeType,
                encrypted_diff_payload AS encryptedDiffPayload,
                source_device_id AS sourceDeviceId,
                created_at AS createdAt
         FROM vault_item_history
         WHERE owner_user_id = ?
           AND item_id = ?
         ORDER BY created_at DESC, history_id DESC
         LIMIT ?`,
        [input.ownerUserId, input.itemId, safeLimit + 1],
      );
    const hasMore = rows.length > safeLimit;
    const records = hasMore ? rows.slice(0, safeLimit) : rows;
    const nextCursor = hasMore ? buildVaultItemHistoryCursor(records[records.length - 1]) : null;
    return {
      records,
      nextCursor,
    };
  }

  async pruneByOwnerOlderThan(input: {
    ownerUserId: string;
    cutoffIso: string;
    limit: number;
  }): Promise<number> {
    const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(2_000, Math.trunc(input.limit))) : 200;
    const rows = await selectMany<{ historyId: string }>(
      this.db,
      `SELECT history_id AS historyId
       FROM vault_item_history
       WHERE owner_user_id = ?
         AND created_at < ?
       ORDER BY created_at ASC, history_id ASC
       LIMIT ?`,
      [input.ownerUserId, input.cutoffIso, safeLimit],
    );
    if (rows.length === 0) {
      return 0;
    }
    if (typeof this.db.batch === 'function') {
      await this.db.batch(
        rows.map((row) =>
          this.db.prepare(
            `DELETE FROM vault_item_history
             WHERE history_id = ?`,
          ).bind(row.historyId)
        ),
      );
      return rows.length;
    }
    let deleted = 0;
    for (const row of rows) {
      const changed = await executeOneWithChanges(
        this.db,
        `DELETE FROM vault_item_history
         WHERE history_id = ?`,
        [row.historyId],
      );
      deleted += changed;
    }
    return deleted;
  }
}

class CloudflareVaultFormMetadataRepository implements VaultFormMetadataRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async upsert(record: VaultFormMetadataRecord): Promise<VaultFormMetadataRecord> {
    const normalized = normalizeVaultFormMetadataRecord(record);
    const itemScopeKey = buildVaultFormMetadataItemScopeKey(normalized.itemId);
    const existingRow = await selectOne<VaultFormMetadataRow>(
      this.db,
      `SELECT metadata_id AS metadataId,
              owner_user_id AS ownerUserId,
              item_id AS itemId,
              origin,
              form_fingerprint AS formFingerprint,
              field_fingerprint AS fieldFingerprint,
              frame_scope AS frameScope,
              field_role AS fieldRole,
              selector_css AS selectorCss,
              selector_fallbacks_json AS selectorFallbacksJson,
              autocomplete_token AS autocompleteToken,
              input_type AS inputType,
              field_name AS fieldName,
              field_id AS fieldId,
              label_text_normalized AS labelTextNormalized,
              placeholder_normalized AS placeholderNormalized,
              confidence,
              selector_status AS selectorStatus,
              source_device_id AS sourceDeviceId,
              created_at AS createdAt,
              updated_at AS updatedAt,
              last_confirmed_at AS lastConfirmedAt
       FROM vault_form_metadata
       WHERE origin = ?
         AND form_fingerprint = ?
         AND field_fingerprint = ?
         AND field_role = ?
         AND item_scope_key = ?`,
      [
        normalized.origin,
        normalized.formFingerprint,
        normalized.fieldFingerprint,
        normalized.fieldRole,
        itemScopeKey,
      ],
    );
    const existing = existingRow ? parseVaultFormMetadataRecord(existingRow) : null;
    if (existing && compareVaultFormMetadataPriority(normalized, existing) < 0) {
      return existing;
    }

    if (!existing) {
      await executeOne(
        this.db,
        `INSERT INTO vault_form_metadata (
           metadata_id,
           owner_user_id,
           item_id,
           item_scope_key,
           origin,
           form_fingerprint,
           field_fingerprint,
           frame_scope,
           field_role,
           selector_css,
           selector_fallbacks_json,
           autocomplete_token,
           input_type,
           field_name,
           field_id,
           label_text_normalized,
           placeholder_normalized,
           confidence,
           selector_status,
           source_device_id,
           created_at,
           updated_at,
           last_confirmed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.metadataId,
          normalized.ownerUserId,
          normalized.itemId,
          itemScopeKey,
          normalized.origin,
          normalized.formFingerprint,
          normalized.fieldFingerprint,
          normalized.frameScope,
          normalized.fieldRole,
          normalized.selectorCss,
          JSON.stringify(normalized.selectorFallbacks),
          normalized.autocompleteToken,
          normalized.inputType,
          normalized.fieldName,
          normalized.fieldId,
          normalized.labelTextNormalized,
          normalized.placeholderNormalized,
          normalized.confidence,
          normalized.selectorStatus,
          normalized.sourceDeviceId,
          normalized.createdAt,
          normalized.updatedAt,
          normalized.lastConfirmedAt,
        ],
      );
      return normalized;
    }

    await executeOne(
      this.db,
      `UPDATE vault_form_metadata
       SET metadata_id = ?,
           owner_user_id = ?,
           item_id = ?,
           item_scope_key = ?,
           frame_scope = ?,
           selector_css = ?,
           selector_fallbacks_json = ?,
           autocomplete_token = ?,
           input_type = ?,
           field_name = ?,
           field_id = ?,
           label_text_normalized = ?,
           placeholder_normalized = ?,
           confidence = ?,
           selector_status = ?,
           source_device_id = ?,
           created_at = ?,
           updated_at = ?,
           last_confirmed_at = ?
       WHERE origin = ?
         AND form_fingerprint = ?
         AND field_fingerprint = ?
         AND field_role = ?
         AND item_scope_key = ?`,
      [
        normalized.metadataId,
        normalized.ownerUserId,
        normalized.itemId,
        itemScopeKey,
        normalized.frameScope,
        normalized.selectorCss,
        JSON.stringify(normalized.selectorFallbacks),
        normalized.autocompleteToken,
        normalized.inputType,
        normalized.fieldName,
        normalized.fieldId,
        normalized.labelTextNormalized,
        normalized.placeholderNormalized,
        normalized.confidence,
        normalized.selectorStatus,
        normalized.sourceDeviceId,
        normalized.createdAt,
        normalized.updatedAt,
        normalized.lastConfirmedAt,
        normalized.origin,
        normalized.formFingerprint,
        normalized.fieldFingerprint,
        normalized.fieldRole,
        itemScopeKey,
      ],
    );
    return normalized;
  }

  async listByOrigin(input: { origin: string; limit: number }): Promise<{ records: VaultFormMetadataRecord[] }> {
    const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(500, Math.trunc(input.limit))) : 100;
    const rows = await selectMany<VaultFormMetadataRow>(
      this.db,
      `SELECT metadata_id AS metadataId,
              owner_user_id AS ownerUserId,
              item_id AS itemId,
              origin,
              form_fingerprint AS formFingerprint,
              field_fingerprint AS fieldFingerprint,
              frame_scope AS frameScope,
              field_role AS fieldRole,
              selector_css AS selectorCss,
              selector_fallbacks_json AS selectorFallbacksJson,
              autocomplete_token AS autocompleteToken,
              input_type AS inputType,
              field_name AS fieldName,
              field_id AS fieldId,
              label_text_normalized AS labelTextNormalized,
              placeholder_normalized AS placeholderNormalized,
              confidence,
              selector_status AS selectorStatus,
              source_device_id AS sourceDeviceId,
              created_at AS createdAt,
              updated_at AS updatedAt,
              last_confirmed_at AS lastConfirmedAt
       FROM vault_form_metadata
       WHERE origin = ?
       ORDER BY updated_at DESC, metadata_id DESC
       LIMIT ?`,
      [input.origin, safeLimit],
    );
    return { records: sortVaultFormMetadataRecords(rows.map(parseVaultFormMetadataRecord)).slice(0, safeLimit) };
  }

  async listByOrigins(input: {
    origins: string[];
    limitPerOrigin: number;
  }): Promise<VaultFormMetadataRecord[]> {
    if (input.origins.length === 0) {
      return [];
    }
    const safeLimit = Number.isFinite(input.limitPerOrigin)
      ? Math.max(1, Math.min(200, Math.trunc(input.limitPerOrigin)))
      : 50;
    const dedupedOrigins = Array.from(new Set(input.origins));
    const rows: VaultFormMetadataRecord[] = [];
    for (let index = 0; index < dedupedOrigins.length; index += D1_SAFE_IN_CLAUSE_CHUNK) {
      const chunk = dedupedOrigins.slice(index, index + D1_SAFE_IN_CLAUSE_CHUNK);
      const placeholders = chunk.map(() => '?').join(', ');
      const chunkRows = await selectMany<VaultFormMetadataRow>(
        this.db,
        `SELECT metadata_id AS metadataId,
                owner_user_id AS ownerUserId,
                item_id AS itemId,
                origin,
                form_fingerprint AS formFingerprint,
                field_fingerprint AS fieldFingerprint,
                frame_scope AS frameScope,
                field_role AS fieldRole,
                selector_css AS selectorCss,
                selector_fallbacks_json AS selectorFallbacksJson,
                autocomplete_token AS autocompleteToken,
                input_type AS inputType,
                field_name AS fieldName,
                field_id AS fieldId,
                label_text_normalized AS labelTextNormalized,
                placeholder_normalized AS placeholderNormalized,
                confidence,
                selector_status AS selectorStatus,
                source_device_id AS sourceDeviceId,
                created_at AS createdAt,
                updated_at AS updatedAt,
                last_confirmed_at AS lastConfirmedAt
         FROM vault_form_metadata
         WHERE origin IN (${placeholders})
         ORDER BY updated_at DESC, metadata_id DESC`,
        chunk,
      );
      rows.push(...chunkRows.map(parseVaultFormMetadataRecord));
    }
    const grouped = new Map<string, VaultFormMetadataRecord[]>();
    for (const record of rows) {
      const current = grouped.get(record.origin) ?? [];
      current.push(record);
      grouped.set(record.origin, current);
    }
    return dedupedOrigins.flatMap((origin) =>
      sortVaultFormMetadataRecords(grouped.get(origin) ?? []).slice(0, safeLimit),
    );
  }

  async listByItem(input: {
    itemId: string;
    origin: string;
    limit: number;
  }): Promise<{ records: VaultFormMetadataRecord[] }> {
    const safeLimit = Number.isFinite(input.limit) ? Math.max(1, Math.min(200, Math.trunc(input.limit))) : 50;
    const rows = await selectMany<VaultFormMetadataRow>(
      this.db,
      `SELECT metadata_id AS metadataId,
              owner_user_id AS ownerUserId,
              item_id AS itemId,
              origin,
              form_fingerprint AS formFingerprint,
              field_fingerprint AS fieldFingerprint,
              frame_scope AS frameScope,
              field_role AS fieldRole,
              selector_css AS selectorCss,
              selector_fallbacks_json AS selectorFallbacksJson,
              autocomplete_token AS autocompleteToken,
              input_type AS inputType,
              field_name AS fieldName,
              field_id AS fieldId,
              label_text_normalized AS labelTextNormalized,
              placeholder_normalized AS placeholderNormalized,
              confidence,
              selector_status AS selectorStatus,
              source_device_id AS sourceDeviceId,
              created_at AS createdAt,
              updated_at AS updatedAt,
              last_confirmed_at AS lastConfirmedAt
       FROM vault_form_metadata
       WHERE item_id = ?
         AND origin = ?
       ORDER BY updated_at DESC, metadata_id DESC
       LIMIT ?`,
      [input.itemId, input.origin, safeLimit],
    );
    return { records: sortVaultFormMetadataRecords(rows.map(parseVaultFormMetadataRecord)).slice(0, safeLimit) };
  }

  async markSelectorsSuspect(input: {
    origin: string;
    formFingerprint: string;
    fieldFingerprint: string;
    fieldRole: VaultFormFieldRole;
    itemId: string | null;
    updatedAt: string;
  }): Promise<number> {
    return executeOneWithChanges(
      this.db,
      `UPDATE vault_form_metadata
       SET selector_status = 'suspect',
           updated_at = ?
       WHERE origin = ?
         AND form_fingerprint = ?
         AND field_fingerprint = ?
         AND field_role = ?
         AND item_scope_key = ?
         AND selector_status != 'retired'`,
      [
        input.updatedAt,
        input.origin,
        input.formFingerprint,
        input.fieldFingerprint,
        input.fieldRole,
        buildVaultFormMetadataItemScopeKey(input.itemId),
      ],
    );
  }

  async pruneExcessByOrigin(input: { origin: string; maxRecords: number }): Promise<number> {
    const safeMax = Number.isFinite(input.maxRecords) ? Math.max(1, Math.trunc(input.maxRecords)) : 50;
    const rows = await selectMany<VaultFormMetadataRow>(
      this.db,
      `SELECT metadata_id AS metadataId,
              owner_user_id AS ownerUserId,
              item_id AS itemId,
              origin,
              form_fingerprint AS formFingerprint,
              field_fingerprint AS fieldFingerprint,
              frame_scope AS frameScope,
              field_role AS fieldRole,
              selector_css AS selectorCss,
              selector_fallbacks_json AS selectorFallbacksJson,
              autocomplete_token AS autocompleteToken,
              input_type AS inputType,
              field_name AS fieldName,
              field_id AS fieldId,
              label_text_normalized AS labelTextNormalized,
              placeholder_normalized AS placeholderNormalized,
              confidence,
              selector_status AS selectorStatus,
              source_device_id AS sourceDeviceId,
              created_at AS createdAt,
              updated_at AS updatedAt,
              last_confirmed_at AS lastConfirmedAt
       FROM vault_form_metadata
       WHERE origin = ?`,
      [input.origin],
    );
    const records = rows.map(parseVaultFormMetadataRecord);
    if (records.length <= safeMax) {
      return 0;
    }
    const removable = [...records].sort((left, right) => {
      const weightDelta = buildVaultFormMetadataPruneWeight(left) - buildVaultFormMetadataPruneWeight(right);
      if (weightDelta !== 0) {
        return weightDelta;
      }
      const updatedDelta = left.updatedAt.localeCompare(right.updatedAt);
      if (updatedDelta !== 0) {
        return updatedDelta;
      }
      return left.metadataId.localeCompare(right.metadataId);
    });
    const protectedIds = new Set<string>();
    const newestActiveByRole = new Map<VaultFormFieldRole, VaultFormMetadataRecord>();
    for (const record of records.filter((candidate) => candidate.selectorStatus === 'active')) {
      const existing = newestActiveByRole.get(record.fieldRole);
      if (!existing || compareVaultFormMetadataPriority(record, existing) > 0) {
        newestActiveByRole.set(record.fieldRole, record);
      }
    }
    for (const record of newestActiveByRole.values()) {
      protectedIds.add(record.metadataId);
    }
    const toDelete: string[] = [];
    for (const record of removable) {
      if (records.length - toDelete.length <= safeMax) {
        break;
      }
      if (protectedIds.has(record.metadataId)) {
        continue;
      }
      toDelete.push(record.metadataId);
    }
    if (toDelete.length === 0) {
      return 0;
    }
    if (typeof this.db.batch === 'function') {
      await this.db.batch(
        toDelete.map((metadataId) =>
          this.db.prepare(
            `DELETE FROM vault_form_metadata
             WHERE metadata_id = ?`,
          ).bind(metadataId),
        ),
      );
      return toDelete.length;
    }
    let deleted = 0;
    for (const metadataId of toDelete) {
      deleted += await executeOneWithChanges(
        this.db,
        `DELETE FROM vault_form_metadata
         WHERE metadata_id = ?`,
        [metadataId],
      );
    }
    return deleted;
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

class CloudflareVaultFolderRepository implements VaultFolderRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async listByOwnerUserId(ownerUserId: string): Promise<{
    folders: VaultFolderRecord[];
    assignments: VaultFolderAssignmentRecord[];
  }> {
    const [folders, assignments] = await Promise.all([
      selectMany<VaultFolderRecord>(
        this.db,
        `SELECT owner_user_id AS ownerUserId,
                folder_id AS folderId,
                name,
                created_at AS createdAt,
                updated_at AS updatedAt
         FROM vault_folders
         WHERE owner_user_id = ?
         ORDER BY created_at ASC, folder_id ASC`,
        [ownerUserId],
      ),
      selectMany<VaultFolderAssignmentRecord>(
        this.db,
        `SELECT owner_user_id AS ownerUserId,
                item_id AS itemId,
                folder_id AS folderId,
                updated_at AS updatedAt
         FROM vault_folder_assignments
         WHERE owner_user_id = ?
         ORDER BY item_id ASC`,
        [ownerUserId],
      ),
    ]);
    return { folders, assignments };
  }

  async upsertFolder(record: VaultFolderRecord): Promise<VaultFolderRecord> {
    await executeOne(
      this.db,
      `INSERT INTO vault_folders (
         owner_user_id, folder_id, name, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(owner_user_id, folder_id) DO UPDATE SET
         name = excluded.name,
         updated_at = excluded.updated_at`,
      [record.ownerUserId, record.folderId, record.name, record.createdAt, record.updatedAt],
    );
    return (
      (await selectOne<VaultFolderRecord>(
        this.db,
        `SELECT owner_user_id AS ownerUserId,
                folder_id AS folderId,
                name,
                created_at AS createdAt,
                updated_at AS updatedAt
         FROM vault_folders
         WHERE owner_user_id = ? AND folder_id = ?`,
        [record.ownerUserId, record.folderId],
      )) ?? record
    );
  }

  async setAssignment(input: {
    ownerUserId: string;
    itemId: string;
    folderId: string | null;
    updatedAt: string;
  }): Promise<void> {
    if (!input.folderId) {
      await executeOne(
        this.db,
        `DELETE FROM vault_folder_assignments
         WHERE owner_user_id = ? AND item_id = ?`,
        [input.ownerUserId, input.itemId],
      );
      return;
    }
    await executeOne(
      this.db,
      `INSERT INTO vault_folder_assignments (
         owner_user_id, item_id, folder_id, updated_at
       ) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_user_id, item_id) DO UPDATE SET
         folder_id = excluded.folder_id,
         updated_at = excluded.updated_at`,
      [input.ownerUserId, input.itemId, input.folderId, input.updatedAt],
    );
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
  const webBootstrapGrants = new CloudflareWebBootstrapGrantRepository(input.db);
  const extensionSessionRecoverSecrets = new CloudflareExtensionSessionRecoverSecretRepository(input.db);
  const siteIconCache = new CloudflareSiteIconCacheRepository(input.db);
  const automaticIconRegistry = new CloudflareAutomaticIconRegistryRepository(input.db);
  const manualSiteIconOverrides = new CloudflareManualSiteIconOverrideRepository(input.db);
  const iconObjects = new CloudflareIconObjectRepository(input.db);
  const userIconState = new CloudflareUserIconStateRepository(input.db);
  const userIconItemDomains = new CloudflareUserIconItemDomainRepository(input.db);
  const iconIngestJobs = new CloudflareIconIngestJobRepository(input.db);
  const passwordGeneratorHistory = new CloudflarePasswordGeneratorHistoryRepository(input.db);
  const realtimeOutbox = new CloudflareRealtimeOutboxRepository(input.db);
  const realtimeOneTimeTokens = new CloudflareRealtimeOneTimeTokenRepository(input.db);
  const vaultItems = new CloudflareVaultItemRepository(input.db);
  const vaultItemHistory = new CloudflareVaultItemHistoryRepository(input.db);
  const vaultFormMetadata = new CloudflareVaultFormMetadataRepository(input.db);
  const folders = new CloudflareVaultFolderRepository(input.db);

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
    webBootstrapGrants,
    extensionSessionRecoverSecrets,
    siteIconCache,
    automaticIconRegistry,
    manualSiteIconOverrides,
    iconObjects,
    userIconState,
    userIconItemDomains,
    iconIngestJobs,
    passwordGeneratorHistory,
    realtimeOutbox,
    realtimeOneTimeTokens,
    authRateLimits: new CloudflareAuthRateLimitRepository(input.db),
    idempotency: new CloudflareIdempotencyRepository(input.db),
    auditEvents: new CloudflareAuditEventRepository(input.db),
    attachmentBlobs: new CloudflareAttachmentBlobRepository(input.db, input.bucket),
    vaultItems,
    vaultItemHistory,
    vaultFormMetadata,
    folders,
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
          input.db.prepare(
            `DELETE FROM unlock_grants
             WHERE user_id = ?
               AND (requester_device_id = ? OR approver_device_id = ?)`,
          ).bind(inputRecord.userId, inputRecord.deviceId, inputRecord.deviceId),
          input.db.prepare(
            `DELETE FROM web_bootstrap_grants
             WHERE user_id = ?
               AND (extension_device_id = ? OR web_device_id = ?)`,
          ).bind(inputRecord.userId, inputRecord.deviceId, inputRecord.deviceId),
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
        await executeOne(
          input.db,
          `DELETE FROM unlock_grants
           WHERE user_id = ?
             AND (requester_device_id = ? OR approver_device_id = ?)`,
          [inputRecord.userId, inputRecord.deviceId, inputRecord.deviceId],
        );
        await executeOne(
          input.db,
          `DELETE FROM web_bootstrap_grants
           WHERE user_id = ?
             AND (extension_device_id = ? OR web_device_id = ?)`,
          [inputRecord.userId, inputRecord.deviceId, inputRecord.deviceId],
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
