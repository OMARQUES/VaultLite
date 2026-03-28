CREATE TABLE IF NOT EXISTS automatic_icon_registry (
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
  ON automatic_icon_registry (status, updated_at);
