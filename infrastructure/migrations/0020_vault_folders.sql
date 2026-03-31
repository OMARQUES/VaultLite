CREATE TABLE IF NOT EXISTS vault_folders (
  owner_user_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_user_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_folders_owner_updated
  ON vault_folders (owner_user_id, updated_at DESC, folder_id);

CREATE TABLE IF NOT EXISTS vault_folder_assignments (
  owner_user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_vault_folder_assignments_owner_folder
  ON vault_folder_assignments (owner_user_id, folder_id, updated_at DESC, item_id);
