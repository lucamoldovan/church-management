import Database from "better-sqlite3";
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type VeyraDatabase = Database.Database;

const CURRENT_SCHEMA_VERSION = 8;

export function openDatabase(databasePath = process.env.VEYRA_DATABASE_PATH ?? "data/veyra.sqlite"): VeyraDatabase {
  const resolvedPath = databasePath === ":memory:" ? databasePath : resolve(databasePath);

  if (resolvedPath !== ":memory:") {
    const directory = dirname(resolvedPath);
    const absoluteDirectory = resolve(directory);
    const homeDirectory = process.env.HOME ? resolve(process.env.HOME) : "";
    if (absoluteDirectory === process.cwd() || (homeDirectory && absoluteDirectory === homeDirectory)) {
      throw new Error("Veyra database must live in a dedicated private subdirectory");
    }
    const unsafeTargets = new Set([
      "/", "/tmp", "/var", "/var/cache", "/var/lib", "/home", "/root",
      "/etc", "/usr", "/opt", "/run", "/mnt", "/media", "/dev", "/proc",
      "/sys", "/boot",
    ]);
    if (unsafeTargets.has(absoluteDirectory)) {
      throw new Error("Veyra database must live in a dedicated private directory");
    }
    mkdirSync(absoluteDirectory, { recursive: true, mode: 0o700 });
    const directoryInfo = lstatSync(absoluteDirectory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw new Error("Veyra database directory must be a real directory, not a symlink");
    }
    chmodSync(absoluteDirectory, 0o700);

    if (existsSync(resolvedPath)) {
      const databaseInfo = lstatSync(resolvedPath);
      if (!databaseInfo.isFile() || databaseInfo.isSymbolicLink()) {
        throw new Error("Veyra database path must be a regular file, not a symlink");
      }
      chmodSync(resolvedPath, 0o600);
    } else {
      const descriptor = openSync(resolvedPath, "wx", 0o600);
      closeSync(descriptor);
    }
  }

  const database = new Database(resolvedPath);
  if (resolvedPath !== ":memory:") chmodSync(resolvedPath, 0o600);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  const currentVersion = database.pragma("user_version", { simple: true }) as number;
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    database.close();
    throw new Error(
      `Database schema version ${currentVersion} is newer than this Veyra server supports (${CURRENT_SCHEMA_VERSION})`,
    );
  }

  const migrate = database.transaction(() => {
    if (currentVersion < 1) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS operators (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL COLLATE NOCASE UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          operator_id TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS sessions_operator_id_idx ON sessions(operator_id);
        CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS pairing_codes (
          id TEXT PRIMARY KEY,
          code_hash TEXT NOT NULL UNIQUE,
          created_by TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS pairing_codes_expires_at_idx ON pairing_codes(expires_at);

        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          device_token_hash TEXT NOT NULL UNIQUE,
          platform TEXT NOT NULL DEFAULT 'unknown',
          software_version TEXT NOT NULL DEFAULT 'unknown',
          last_seen_at TEXT,
          last_ip TEXT,
          playback_mode TEXT NOT NULL DEFAULT 'unknown',
          ndi_source_name TEXT,
          uptime_seconds INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS devices_last_seen_at_idx ON devices(last_seen_at);
      `);
      database.pragma("user_version = 1");
    }

    if (currentVersion < 2) {
      database.exec(`
        ALTER TABLE devices ADD COLUMN credential_revoked_at TEXT;
        CREATE INDEX IF NOT EXISTS devices_credential_revoked_at_idx
          ON devices(credential_revoked_at);
      `);
      database.pragma("user_version = 2");
    }

    if (currentVersion < 3) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS media_assets (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          storage_key TEXT NOT NULL UNIQUE,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
          sha256 TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS media_assets_created_at_idx
          ON media_assets(created_at DESC);

        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS playlists_name_idx
          ON playlists(name COLLATE NOCASE);

        CREATE TABLE IF NOT EXISTS playlist_items (
          id TEXT PRIMARY KEY,
          playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
          position INTEGER NOT NULL CHECK (position >= 0),
          duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 1 AND 3600),
          UNIQUE (playlist_id, position)
        );

        CREATE INDEX IF NOT EXISTS playlist_items_media_id_idx
          ON playlist_items(media_id);
      `);
      database.pragma("user_version = 3");
    }

    if (currentVersion < 4) {
      database.exec(`
        ALTER TABLE devices
          ADD COLUMN discovered_sources_json TEXT NOT NULL DEFAULT '[]';
      `);
      database.pragma("user_version = 4");
    }
    if (currentVersion < 5) {
      database.exec(`
        ALTER TABLE devices ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE devices ADD COLUMN assigned_ndi_source_name TEXT;
        ALTER TABLE devices ADD COLUMN assigned_ndi_source_address TEXT;
        ALTER TABLE devices ADD COLUMN fallback_playlist_id TEXT REFERENCES playlists(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS devices_fallback_playlist_id_idx
          ON devices(fallback_playlist_id);
      `);
      database.pragma("user_version = 5");
    }

    if (currentVersion < 6) {
      database.exec(`
        ALTER TABLE playlists ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
        CREATE TRIGGER IF NOT EXISTS devices_fallback_playlist_deleted
        BEFORE DELETE ON playlists
        BEGIN
          UPDATE devices
          SET config_version = config_version + 1,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE fallback_playlist_id = OLD.id;
        END;
      `);
      database.pragma("user_version = 6");
    }

    if (currentVersion < 7) {
      const operatorColumns = new Set(
        (database.pragma("table_info(operators)") as Array<{ name: string }>).map((column) => column.name),
      );
      if (!operatorColumns.has("display_name")) database.exec("ALTER TABLE operators ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
      if (!operatorColumns.has("role")) database.exec("ALTER TABLE operators ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
      if (!operatorColumns.has("department")) database.exec("ALTER TABLE operators ADD COLUMN department TEXT");
      if (!operatorColumns.has("active")) database.exec("ALTER TABLE operators ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
      database.exec(
`

        UPDATE operators SET display_name = username WHERE display_name = '';

        CREATE TABLE IF NOT EXISTS church_services (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          starts_at TEXT,
          ends_at TEXT,
          status TEXT NOT NULL DEFAULT 'planned',
          location TEXT,
          notes TEXT,
          source TEXT NOT NULL DEFAULT 'local',
          external_id TEXT UNIQUE,
          raw_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS church_services_starts_idx ON church_services(starts_at);

        CREATE TABLE IF NOT EXISTS church_service_items (
          id TEXT PRIMARY KEY,
          service_id TEXT NOT NULL REFERENCES church_services(id) ON DELETE CASCADE,
          position INTEGER NOT NULL DEFAULT 0,
          title TEXT NOT NULL,
          item_type TEXT NOT NULL DEFAULT 'other',
          duration_seconds INTEGER,
          assigned_to TEXT,
          notes TEXT,
          external_id TEXT UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS church_service_items_service_idx ON church_service_items(service_id, position);

        CREATE TABLE IF NOT EXISTS church_events (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          starts_at TEXT,
          ends_at TEXT,
          location TEXT,
          capacity INTEGER,
          status TEXT NOT NULL DEFAULT 'planned',
          source TEXT NOT NULL DEFAULT 'local',
          external_id TEXT UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS church_events_starts_idx ON church_events(starts_at);

        CREATE TABLE IF NOT EXISTS church_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          leader TEXT,
          meeting_day TEXT,
          meeting_time TEXT,
          location TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          source TEXT NOT NULL DEFAULT 'local',
          external_id TEXT UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS church_group_members (
          group_id TEXT NOT NULL REFERENCES church_groups(id) ON DELETE CASCADE,
          operator_id TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
          joined_at TEXT NOT NULL,
          PRIMARY KEY(group_id, operator_id)
        );

        CREATE TABLE IF NOT EXISTS propresenter_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          connected INTEGER NOT NULL DEFAULT 0,
          version TEXT,
          presentation_name TEXT,
          slide_index INTEGER,
          slide_count INTEGER,
          slide_text TEXT,
          last_checked_at TEXT,
          error TEXT
        );
      `);
      database.pragma("user_version = 7");
    }

    if (currentVersion < 8) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS service_people (
          id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, first_name TEXT, last_name TEXT, photo_url TEXT, raw_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS service_teams (
          id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sequence INTEGER, archived_at TEXT, raw_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS service_positions (
          id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, team_id TEXT NOT NULL REFERENCES service_teams(id) ON DELETE CASCADE, name TEXT NOT NULL, sequence INTEGER, raw_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL, UNIQUE(team_id, name)
        );
        CREATE TABLE IF NOT EXISTS service_team_memberships (
          id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES service_people(id) ON DELETE CASCADE, position_id TEXT NOT NULL REFERENCES service_positions(id) ON DELETE CASCADE, schedule_preference TEXT, raw_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL, UNIQUE(person_id, position_id)
        );
        CREATE TABLE IF NOT EXISTS service_team_leaders (
          id TEXT PRIMARY KEY, external_id TEXT NOT NULL UNIQUE, team_id TEXT NOT NULL REFERENCES service_teams(id) ON DELETE CASCADE,
          person_id TEXT NOT NULL REFERENCES service_people(id) ON DELETE CASCADE, raw_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL,
          UNIQUE(team_id, person_id)
        );
        CREATE TABLE IF NOT EXISTS service_plan_teams (
          service_id TEXT NOT NULL REFERENCES church_services(id) ON DELETE CASCADE, team_id TEXT NOT NULL REFERENCES service_teams(id) ON DELETE CASCADE, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(service_id, team_id)
        );
        CREATE TABLE IF NOT EXISTS service_plan_times (
          id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES church_services(id) ON DELETE CASCADE, external_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, starts_at TEXT, ends_at TEXT, time_type TEXT, raw_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS service_plan_assignments (
          id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES church_services(id) ON DELETE CASCADE, person_id TEXT NOT NULL REFERENCES service_people(id) ON DELETE CASCADE, team_id TEXT REFERENCES service_teams(id) ON DELETE SET NULL, position_id TEXT REFERENCES service_positions(id) ON DELETE SET NULL, position_name TEXT, status TEXT, notes TEXT, plan_person_external_id TEXT NOT NULL UNIQUE, raw_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS service_plan_assignments_service_idx ON service_plan_assignments(service_id, team_id, position_name);
        CREATE TABLE IF NOT EXISTS service_assignment_times (
          assignment_id TEXT NOT NULL REFERENCES service_plan_assignments(id) ON DELETE CASCADE, plan_time_id TEXT NOT NULL REFERENCES service_plan_times(id) ON DELETE CASCADE, PRIMARY KEY(assignment_id, plan_time_id)
        );
        CREATE TABLE IF NOT EXISTS service_item_assignments (
          id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES church_service_items(id) ON DELETE CASCADE, assignable_type TEXT NOT NULL, assignable_external_id TEXT NOT NULL, person_id TEXT REFERENCES service_people(id) ON DELETE SET NULL, position_id TEXT REFERENCES service_positions(id) ON DELETE SET NULL, display_name TEXT, external_id TEXT NOT NULL UNIQUE, raw_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS service_live_state (
          service_id TEXT PRIMARY KEY REFERENCES church_services(id) ON DELETE CASCADE, matched_item_id TEXT REFERENCES church_service_items(id) ON DELETE SET NULL, match_method TEXT, presentation_name TEXT, current_slide_text TEXT, current_slide_uuid TEXT, connected INTEGER NOT NULL DEFAULT 0, observed_at TEXT, stale_at TEXT, message TEXT
        );
        CREATE INDEX IF NOT EXISTS service_live_state_observed_idx ON service_live_state(observed_at);
      `);
      const churchServiceColumns = new Set((database.pragma("table_info(church_services)") as Array<{ name: string }>).map((column) => column.name));
      if (!churchServiceColumns.has("service_type_external_id")) database.exec("ALTER TABLE church_services ADD COLUMN service_type_external_id TEXT");
      if (!churchServiceColumns.has("service_type_name")) database.exec("ALTER TABLE church_services ADD COLUMN service_type_name TEXT");
      const churchServiceItemColumns = new Set((database.pragma("table_info(church_service_items)") as Array<{ name: string }>).map((column) => column.name));
      if (!churchServiceItemColumns.has("song_external_id")) database.exec("ALTER TABLE church_service_items ADD COLUMN song_external_id TEXT");
      if (!churchServiceItemColumns.has("arrangement_external_id")) database.exec("ALTER TABLE church_service_items ADD COLUMN arrangement_external_id TEXT");
      if (!churchServiceItemColumns.has("service_position")) database.exec("ALTER TABLE church_service_items ADD COLUMN service_position TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS church_service_items_song_idx ON church_service_items(song_external_id)");
      database.pragma("user_version = 8");
    }
  });

  try {
    migrate();
    const now = new Date().toISOString();
    database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
    database.prepare("DELETE FROM pairing_codes WHERE expires_at <= ? OR used_at IS NOT NULL").run(now);
  } catch (error) {
    database.close();
    throw error;
  }

  return database;
}
