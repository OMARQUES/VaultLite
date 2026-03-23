ALTER TABLE surface_links ADD COLUMN lock_revision INTEGER NOT NULL DEFAULT 0;

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
  ON web_bootstrap_grants (expires_at);
