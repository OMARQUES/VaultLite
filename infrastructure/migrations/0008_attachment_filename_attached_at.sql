ALTER TABLE attachment_blobs ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE attachment_blobs ADD COLUMN attached_at TEXT;
