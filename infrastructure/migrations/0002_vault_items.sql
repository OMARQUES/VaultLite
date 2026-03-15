CREATE TABLE IF NOT EXISTS vault_items (
  item_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_items_owner_created_at
  ON vault_items (owner_user_id, created_at);
