CREATE TABLE IF NOT EXISTS site_icon_cache (
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
  ON manual_site_icon_overrides (domain);
