CREATE TABLE IF NOT EXISTS extension_pairings (
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
  ON extension_pairings (expires_at);
