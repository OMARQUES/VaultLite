CREATE TABLE IF NOT EXISTS invites (
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
);
