ALTER TABLE attachment_blobs ADD COLUMN idempotency_key TEXT;
ALTER TABLE attachment_blobs ADD COLUMN upload_token TEXT;
ALTER TABLE attachment_blobs ADD COLUMN expires_at TEXT;
ALTER TABLE attachment_blobs ADD COLUMN uploaded_at TEXT;

CREATE INDEX IF NOT EXISTS idx_attachment_blobs_owner_item_created_at
  ON attachment_blobs (owner_user_id, item_id, created_at);

CREATE INDEX IF NOT EXISTS idx_attachment_blobs_owner_item_idempotency
  ON attachment_blobs (owner_user_id, item_id, idempotency_key);
