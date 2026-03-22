CREATE TABLE IF NOT EXISTS session_policies (
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
  ON extension_session_recover_secrets (user_id);
