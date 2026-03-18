ALTER TABLE vault_item_tombstones ADD COLUMN encrypted_payload TEXT;
ALTER TABLE vault_item_tombstones ADD COLUMN created_at TEXT;
ALTER TABLE vault_item_tombstones ADD COLUMN updated_at TEXT;
