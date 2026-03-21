CREATE TABLE IF NOT EXISTS extension_link_requests (
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
  ON extension_link_requests (expires_at);
