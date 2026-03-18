ALTER TABLE invites ADD COLUMN token_hash TEXT;
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
  ON audit_events (created_at);
