ALTER TABLE auth_rate_limits ADD COLUMN window_ends_at TEXT;

UPDATE auth_rate_limits
SET window_ends_at = window_started_at
WHERE window_ends_at IS NULL;
