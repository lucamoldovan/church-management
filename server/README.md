# Veyra local server

TypeScript/Fastify service and SQLite-backed control plane for the Veyra local-network platform.

## Requirements

- Node.js 22 or newer
- npm

## Development

From this directory:

```bash
npm ci
npm run dev
```

The development server listens on `127.0.0.1:8787` by default.

On first launch, the server creates a local SQLite database and prints a one-time setup key in the server terminal. Keep that key private and enter it on the dashboard to create the first administrator. The key is stored in `data/setup-key` with owner-only permissions until setup succeeds, then deleted. A separate 32-byte pairing secret is generated in `data/pairing-secret` with owner-only permissions and must be backed up with the database; losing it invalidates outstanding pairing codes.

Check the health endpoint:

```bash
curl http://127.0.0.1:8787/api/v1/health
```

## Build and test

```bash
npm run build
npm test
npm start
```


## Backups

With the server database and pairing secret in their configured locations, create a consistent SQLite backup while the server is running:

```bash
npm run backup -- /path/to/secure-backup-directory
```

The command uses SQLite's online backup API and copies the pairing secret and media directory alongside the database. It creates owner-only backup files and a small manifest. Store the backup directory somewhere protected; the pairing secret is sensitive and must not be published or committed.

To restore, stop the Veyra server first, then restore the database file to `VEYRA_DATABASE_PATH` and the matching pairing-secret file to `VEYRA_PAIRING_SECRET_PATH`. Keep the database and pairing secret from the same backup together. The backup utility includes the server database, matching pairing secret, and the local media directory. Restore all three from the same backup set.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VEYRA_HOST` | `127.0.0.1` | Bind address |
| `VEYRA_PORT` | `8787` | HTTP port |
| `LOG_LEVEL` | `info` | Fastify/Pino log level |
| `VEYRA_DATABASE_PATH` | `data/veyra.sqlite` | SQLite database path |
| `VEYRA_SETUP_KEY_PATH` | `data/setup-key` | First-run setup key file |
| `VEYRA_PAIRING_SECRET_PATH` | `data/pairing-secret` | Secret key used to HMAC pairing-code verifiers; back up securely with the database |
| `VEYRA_MEDIA_DIRECTORY` | `data/media` | Local image asset directory |
| `VEYRA_TLS_CERT_PATH` | unset | PEM certificate path; required with the private key for non-loopback binds |
| `VEYRA_TLS_KEY_PATH` | unset | PEM private key path; required with the certificate for non-loopback binds |
| `VEYRA_COOKIE_SECURE` | `false` on loopback HTTP; `true` with TLS | Force Secure session cookies |

The service binds to loopback by default. The SQLite database must live in a dedicated directory (not a shared system directory); Veyra restricts that directory to owner access and the database file to owner read/write. Binding to any non-loopback address is rejected unless both TLS certificate and private-key paths are configured. TLS uses a minimum of TLS 1.2, and session cookies are automatically marked Secure when TLS is enabled. Use a certificate trusted by the receiver devices; do not disable TLS or place bearer credentials on plaintext LAN HTTP.

## Current scope

Implemented:

- Fastify application factory for isolated tests.
- SQLite database with WAL mode, foreign keys, and persistent local storage; its dedicated data directory is restricted to owner access and the database file to owner read/write.
- First-run administrator setup protected by a random one-time key printed to server logs.
- Scrypt password hashing, opaque random session tokens stored as SHA-256 hashes, HttpOnly/SameSite=Strict cookies, and 30-day session expiry.
- Rate-limited setup and login endpoints, plus session inspection and logout.
- Authenticated device inventory and one-time, 12-digit pairing codes (10-minute expiry), stored as HMAC-SHA-256 verifiers using a separate 32-byte local secret file.
- Single-use receiver pairing that returns a device ID and one-time device credential; only a hash of the credential is stored.
- Bearer-authenticated receiver heartbeats and derived online/stale/offline state. Online means a heartbeat within 45 seconds, stale means 46–120 seconds, and offline means older than 120 seconds. Source snapshots older than 120 seconds are omitted from the aggregated source inventory.
- Operator-controlled device credential revocation and safe removal of revoked device records.
- Per-device NDI source and fallback-playlist assignments with monotonically increasing configuration versions.
- Receiver-authenticated configuration and assigned-media manifest polling, plus media downloads restricted to assets in that receiver's assigned fallback playlist.
- Per-device NDI discovery snapshots reported through heartbeats and an authenticated aggregated source inventory endpoint.
- Transactional SQLite schema migrations through version 6, including a populated version-1 upgrade test.
- Authenticated local image uploads for PNG, JPEG, and WebP, with content-signature checks, a 20 MB limit, SHA-256 metadata, and owner-only file storage.
- Authenticated media listing, inline content delivery, and safe deletion blocked while a playlist references the asset.
- Playlist CRUD with ordered image items and validated per-item display durations from 1 to 3600 seconds.
- Configurable bind address and port, TLS-enforced non-loopback binding, security response headers, health endpoint, and graceful shutdown.
- Automated server build and API tests in GitHub Actions.

The C++ receiver client now implements one-time pairing, TLS-verified bearer heartbeats, discovery snapshots, bounded retry/backoff, owner-only credential storage, versioned configuration polling, SHA-256-verified media downloads, persistent cache loading, and timed image fallback. The receiver sync client and renderer compile in SDK-independent CI, but the complete native player has not yet been built against the official NDI SDK.

The server now exposes `PUT /api/v1/devices/:id/config`, receiver `GET /api/v1/receiver/config`, `GET /api/v1/receiver/media-manifest`, and authenticated `GET /api/v1/receiver/media/:mediaId`. The receiver now polls these endpoints, verifies and caches assigned assets, activates complete manifests atomically, and renders timed image fallback playlists. Each assigned playlist is limited to 512 MiB. The receiver temporarily retains the previous verified snapshot while switching playback, then prunes obsolete assets after the next successful synchronization. WebSocket events, remote commands, and production dashboard serving are also not implemented.
