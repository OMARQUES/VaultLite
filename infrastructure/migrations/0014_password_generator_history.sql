CREATE TABLE IF NOT EXISTS password_generator_history (
  user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_password_generator_history_user_updated
  ON password_generator_history (user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_password_generator_history_user_created
  ON password_generator_history (user_id, created_at);
