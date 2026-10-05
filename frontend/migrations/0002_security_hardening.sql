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

CREATE TABLE IF NOT EXISTS rateLimit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  lastRequest INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rateLimit_key_idx ON rateLimit(key);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_active_user_event_idx
  ON registrations(user_id, event_id)
  WHERE user_id IS NOT NULL AND event_id IS NOT NULL AND status NOT IN ('cancelled', 'refunded');

CREATE TRIGGER IF NOT EXISTS registrations_capacity_insert
BEFORE INSERT ON registrations
WHEN NEW.event_id IS NOT NULL
  AND NEW.status NOT IN ('cancelled', 'refunded')
  AND COALESCE((SELECT capacity FROM events WHERE id = NEW.event_id), 0) > 0
  AND (SELECT COUNT(*) FROM registrations WHERE event_id = NEW.event_id AND status NOT IN ('cancelled', 'refunded'))
      >= (SELECT capacity FROM events WHERE id = NEW.event_id)
BEGIN
  SELECT RAISE(ABORT, 'EVENT_FULL');
END;

CREATE TRIGGER IF NOT EXISTS registrations_capacity_update
BEFORE UPDATE OF event_id, status ON registrations
WHEN NEW.event_id IS NOT NULL
  AND NEW.status NOT IN ('cancelled', 'refunded')
  AND COALESCE((SELECT capacity FROM events WHERE id = NEW.event_id), 0) > 0
  AND (SELECT COUNT(*) FROM registrations WHERE event_id = NEW.event_id AND status NOT IN ('cancelled', 'refunded') AND id != OLD.id)
      >= (SELECT capacity FROM events WHERE id = NEW.event_id)
BEGIN
  SELECT RAISE(ABORT, 'EVENT_FULL');
END;

CREATE TRIGGER IF NOT EXISTS registrations_package_capacity_insert
BEFORE INSERT ON registrations
WHEN NEW.package_id IS NOT NULL
  AND NEW.status NOT IN ('cancelled', 'refunded')
  AND COALESCE((SELECT capacity FROM event_packages WHERE id = NEW.package_id), 0) > 0
  AND (SELECT COUNT(*) FROM registrations WHERE package_id = NEW.package_id AND status NOT IN ('cancelled', 'refunded'))
      >= (SELECT capacity FROM event_packages WHERE id = NEW.package_id)
BEGIN
  SELECT RAISE(ABORT, 'PACKAGE_FULL');
END;

CREATE TRIGGER IF NOT EXISTS registrations_package_capacity_update
BEFORE UPDATE OF package_id, status ON registrations
WHEN NEW.package_id IS NOT NULL
  AND NEW.status NOT IN ('cancelled', 'refunded')
  AND COALESCE((SELECT capacity FROM event_packages WHERE id = NEW.package_id), 0) > 0
  AND (SELECT COUNT(*) FROM registrations WHERE package_id = NEW.package_id AND status NOT IN ('cancelled', 'refunded') AND id != OLD.id)
      >= (SELECT capacity FROM event_packages WHERE id = NEW.package_id)
BEGIN
  SELECT RAISE(ABORT, 'PACKAGE_FULL');
END;

CREATE UNIQUE INDEX IF NOT EXISTS bracelet_assignments_active_registration_idx ON bracelet_assignments(registration_id) WHERE registration_id IS NOT NULL AND released_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_active_registration_idx ON payment_transactions(registration_id) WHERE registration_id IS NOT NULL AND payment_status IN ('initiated', 'pending');
