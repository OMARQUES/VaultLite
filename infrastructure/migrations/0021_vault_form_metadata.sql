CREATE TABLE IF NOT EXISTS vault_form_metadata (
  metadata_id TEXT PRIMARY KEY,
  owner_user_id TEXT NULL,
  item_id TEXT NULL,
  item_scope_key TEXT NOT NULL,
  origin TEXT NOT NULL,
  form_fingerprint TEXT NOT NULL,
  field_fingerprint TEXT NOT NULL,
  frame_scope TEXT NOT NULL,
  field_role TEXT NOT NULL,
  selector_css TEXT NOT NULL,
  selector_fallbacks_json TEXT NOT NULL,
  autocomplete_token TEXT NULL,
  input_type TEXT NULL,
  field_name TEXT NULL,
  field_id TEXT NULL,
  label_text_normalized TEXT NULL,
  placeholder_normalized TEXT NULL,
  confidence TEXT NOT NULL,
  selector_status TEXT NOT NULL,
  source_device_id TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_confirmed_at TEXT NULL,
  UNIQUE (origin, form_fingerprint, field_fingerprint, field_role, item_scope_key)
);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_origin
  ON vault_form_metadata (origin, updated_at DESC, metadata_id DESC);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_item_origin
  ON vault_form_metadata (item_id, origin, updated_at DESC, metadata_id DESC);

CREATE INDEX IF NOT EXISTS idx_vault_form_metadata_origin_confidence
  ON vault_form_metadata (origin, confidence, updated_at DESC, metadata_id DESC);
