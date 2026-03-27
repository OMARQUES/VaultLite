CREATE TABLE IF NOT EXISTS realtime_one_time_tokens (
  token_key TEXT PRIMARY KEY,
  consumed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_one_time_tokens_expires_at
  ON realtime_one_time_tokens (expires_at);
