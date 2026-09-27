PRAGMA foreign_keys=ON;

-- Fields used by the event publishing UI/API.
ALTER TABLE events ADD COLUMN publish_facebook INTEGER DEFAULT 0;
ALTER TABLE events ADD COLUMN facebook_post_id TEXT;
ALTER TABLE events ADD COLUMN publish_log TEXT;

-- Keep the Google Calendar connector deterministic: one stored credential set.
CREATE UNIQUE INDEX IF NOT EXISTS integration_tokens_provider_account_idx
  ON integration_tokens(provider, account_id);

-- R2-backed media metadata can be referenced from application records without Supabase Storage.
CREATE TABLE IF NOT EXISTS media_objects (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  bucket TEXT NOT NULL DEFAULT 'church-management-media',
  filename TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS media_objects_uploader_idx ON media_objects(uploaded_by);
