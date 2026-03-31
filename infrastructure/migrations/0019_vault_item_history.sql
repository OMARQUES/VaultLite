CREATE TABLE IF NOT EXISTS vault_item_history (
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
  ON vault_item_history (owner_user_id, created_at DESC, history_id DESC);
