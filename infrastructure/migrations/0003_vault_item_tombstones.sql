CREATE TABLE IF NOT EXISTS vault_item_tombstones (
  item_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (item_id, owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_item_tombstones_owner_deleted_at
  ON vault_item_tombstones (owner_user_id, deleted_at);
