CREATE TABLE IF NOT EXISTS icon_objects (
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
  ON icon_ingest_jobs (user_id, status, created_at);
