-- Incremental security hardening for databases that already applied 0001.
PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(resource, resource_id, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits(expires_at);

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  payload_hash TEXT
);
