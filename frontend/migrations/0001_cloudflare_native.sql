-- Cloudflare-native database for Church Management
-- D1 / SQLite. Apply this migration to a fresh D1 database.
-- Better Auth 1.7.x stores authentication state in the tables below.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_idx ON session(userId);
CREATE INDEX IF NOT EXISTS session_token_idx ON session(token);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(providerId, accountId)
);
CREATE INDEX IF NOT EXISTS account_user_idx ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  bio TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  nfc_id TEXT UNIQUE,
  date_of_birth TEXT,
  department TEXT,
  emergency_contact TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);

CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, event_type TEXT DEFAULT 'service', start_at TEXT, end_at TEXT,
  date_label TEXT, time_label TEXT, date TEXT, time TEXT, location TEXT, poster_url TEXT, capacity INTEGER DEFAULT 0, registration_deadline TEXT,
  is_free INTEGER NOT NULL DEFAULT 1, base_price REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0, category TEXT, department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  department TEXT, expected_attendance INTEGER, budget_notes TEXT, resource_notes TEXT, facility_requirements TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published', review_comments TEXT, reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TEXT, created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL, publish_google INTEGER NOT NULL DEFAULT 0,
  publish_facebook INTEGER NOT NULL DEFAULT 0, google_event_id TEXT, facebook_post_id TEXT, publish_log TEXT DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_start_idx ON events(start_at);
CREATE INDEX IF NOT EXISTS events_status_idx ON events(status);
CREATE INDEX IF NOT EXISTS events_google_idx ON events(google_event_id);
CREATE TABLE IF NOT EXISTS event_packages (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT,
  price REAL NOT NULL DEFAULT 0, capacity INTEGER DEFAULT 0, attendance_type TEXT DEFAULT 'full', includes_meals INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS event_packages_event_idx ON event_packages(event_id);
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
  event_title TEXT, package_id TEXT REFERENCES event_packages(id) ON DELETE SET NULL, package_name TEXT, package_price REAL DEFAULT 0,
  ticket_type_id TEXT REFERENCES event_packages(id) ON DELETE SET NULL, status TEXT DEFAULT 'confirmed', payment_status TEXT DEFAULT 'unpaid',
  payment_method TEXT DEFAULT 'online', amount_paid REAL DEFAULT 0, paid_at TEXT, paid_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  attendee_id TEXT UNIQUE, qr_token TEXT UNIQUE, checked_in INTEGER NOT NULL DEFAULT 0, checked_in_at TEXT, bracelet_code TEXT,
  bracelet_assigned_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS registrations_user_idx ON registrations(user_id);
CREATE INDEX IF NOT EXISTS registrations_event_idx ON registrations(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_bracelet_idx ON registrations(event_id, bracelet_code) WHERE bracelet_code IS NOT NULL;
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY, registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE, event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  scanned_by TEXT REFERENCES profiles(id) ON DELETE SET NULL, type TEXT NOT NULL DEFAULT 'entry', meal TEXT, day_date TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(registration_id, type, meal, day_date)
);
CREATE INDEX IF NOT EXISTS checkins_event_idx ON checkins(event_id);
CREATE TABLE IF NOT EXISTS bracelets (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bracelet_assignments (
  id TEXT PRIMARY KEY, bracelet_code TEXT NOT NULL, registration_id TEXT REFERENCES registrations(id) ON DELETE SET NULL,
  event_id TEXT REFERENCES events(id) ON DELETE SET NULL, attendee_id TEXT, attendee_name TEXT, assigned_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TEXT NOT NULL, released_at TEXT
);
CREATE INDEX IF NOT EXISTS bracelet_assignments_code_idx ON bracelet_assignments(bracelet_code);
CREATE INDEX IF NOT EXISTS bracelet_assignments_event_idx ON bracelet_assignments(event_id);
CREATE INDEX IF NOT EXISTS bracelet_assignments_registration_idx ON bracelet_assignments(registration_id);
CREATE UNIQUE INDEX IF NOT EXISTS bracelet_assignments_active_code_idx
  ON bracelet_assignments(bracelet_code)
  WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS checkins_registration_idx ON checkins(registration_id);
CREATE INDEX IF NOT EXISTS registrations_bracelet_idx ON registrations(bracelet_code);
CREATE INDEX IF NOT EXISTS registrations_qr_token_idx ON registrations(qr_token);


CREATE TABLE IF NOT EXISTS study_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, leader_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  day_of_week TEXT, time_label TEXT, location TEXT, meeting_day TEXT, meeting_time TEXT, meeting_location TEXT,
  is_active INTEGER NOT NULL DEFAULT 1, member_count INTEGER DEFAULT 0, capacity INTEGER DEFAULT 0, image_url TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', joined_at TEXT NOT NULL, UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members(user_id);
CREATE TABLE IF NOT EXISTS group_meetings (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE, date TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS group_attendance (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES group_meetings(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, present INTEGER NOT NULL DEFAULT 1, UNIQUE(meeting_id, user_id));
CREATE TABLE IF NOT EXISTS group_announcements (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE, author_id TEXT REFERENCES profiles(id) ON DELETE SET NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS sermons (id TEXT PRIMARY KEY, title TEXT NOT NULL, speaker TEXT, date TEXT, description TEXT, youtube_url TEXT, thumbnail_url TEXT, category TEXT, tags TEXT DEFAULT '[]', published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS livestream_config (id TEXT PRIMARY KEY, youtube_url TEXT, facebook_url TEXT, is_active INTEGER NOT NULL DEFAULT 0, next_stream_date TEXT, next_stream_title TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS social_media (id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT, is_active INTEGER NOT NULL DEFAULT 1, display_order INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS social_links (id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS contact_messages (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT, message TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT, type TEXT DEFAULT 'info', read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL, registration_id TEXT REFERENCES registrations(id) ON DELETE SET NULL,
  session_id TEXT UNIQUE, amount REAL, currency TEXT DEFAULT 'ron', status TEXT DEFAULT 'initiated', payment_status TEXT DEFAULT 'pending',
  metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS integration_tokens (provider TEXT PRIMARY KEY, tokens TEXT DEFAULT '{}', config TEXT DEFAULT '{}', updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS service_plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, planning_center_id TEXT UNIQUE, scheduled_start TEXT, scheduled_end TEXT, actual_start TEXT, actual_end TEXT, status TEXT NOT NULL DEFAULT 'planned', metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS service_items (id TEXT PRIMARY KEY, service_plan_id TEXT NOT NULL REFERENCES service_plans(id) ON DELETE CASCADE, position INTEGER NOT NULL, title TEXT NOT NULL, item_type TEXT, duration_seconds INTEGER, planning_center_id TEXT, propresenter_id TEXT, metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS service_items_plan_idx ON service_items(service_plan_id, position);
CREATE TABLE IF NOT EXISTS volunteer_assignments (id TEXT PRIMARY KEY, service_plan_id TEXT REFERENCES service_plans(id) ON DELETE CASCADE, user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL, team TEXT, role TEXT, planning_center_id TEXT, status TEXT DEFAULT 'scheduled', metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS connector_devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, device_type TEXT NOT NULL, token_hash TEXT UNIQUE, enabled INTEGER NOT NULL DEFAULT 1, last_seen_at TEXT, metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS production_events (id TEXT PRIMARY KEY, service_plan_id TEXT REFERENCES service_plans(id) ON DELETE SET NULL, device_id TEXT REFERENCES connector_devices(id) ON DELETE SET NULL, source TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT DEFAULT '{}', occurred_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS production_events_service_idx ON production_events(service_plan_id, occurred_at);
CREATE TABLE IF NOT EXISTS live_production_state (id INTEGER PRIMARY KEY CHECK (id = 1), service_plan_id TEXT REFERENCES service_plans(id) ON DELETE SET NULL, current_item_id TEXT REFERENCES service_items(id) ON DELETE SET NULL, presentation_name TEXT, content_type TEXT, current_slide INTEGER, slide_count INTEGER, song_title TEXT, song_section TEXT, current_lyrics TEXT, timer_name TEXT, timer_seconds_remaining INTEGER, timer_running INTEGER NOT NULL DEFAULT 0, service_started_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS control_center_layouts (id TEXT PRIMARY KEY, user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, name TEXT NOT NULL, layout TEXT NOT NULL DEFAULT '{}', is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL, action TEXT NOT NULL, resource TEXT, resource_id TEXT, metadata TEXT DEFAULT '{}', created_at TEXT NOT NULL);
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

INSERT OR IGNORE INTO departments (id, name, description, created_at) VALUES
  ('dept-youth', 'Tineret', 'Departamentul de tineret', datetime('now')),
  ('dept-kids', 'Copii', 'Lucrarea cu copiii', datetime('now')),
  ('dept-worship', 'Worship', 'Echipa de închinare', datetime('now')),
  ('dept-admin', 'Administrativ', 'Coordonare generală', datetime('now'));
INSERT OR IGNORE INTO social_media (id, platform, url, is_active, display_order) VALUES
  ('social-youtube', 'youtube', 'https://www.youtube.com/@BisericaCasaPainii', 1, 1),
  ('social-facebook', 'facebook', 'https://www.facebook.com/CasaPainii.OcnaMures/', 1, 2),
  ('social-instagram', 'instagram', '', 0, 3),
  ('social-tiktok', 'tiktok', '', 0, 4),
  ('social-whatsapp', 'whatsapp', '', 0, 5);

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
