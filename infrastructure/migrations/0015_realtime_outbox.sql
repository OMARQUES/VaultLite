CREATE TABLE IF NOT EXISTS realtime_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  aggregate_id TEXT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL UNIQUE,
  occurred_at TEXT NOT NULL,
  source_device_id TEXT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_outbox_user_pending_created
  ON realtime_outbox (user_id, published_at, created_at, id);

CREATE INDEX IF NOT EXISTS idx_realtime_outbox_published_at
  ON realtime_outbox (published_at);
