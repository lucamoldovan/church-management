# Veyra architecture

## Product vision

**Veyra — Network video. Simplified.**

Veyra is a local-network video and display platform. Its first deployment environment is churches, but the product is general-purpose and is not defined by that environment.

The platform combines:

- A browser-based dashboard for operators.
- A local server that acts as the management authority.
- Lightweight receiver devices that play NDI video and locally cached fallback content.

The receiver remains useful on its own: playback must not depend on the dashboard, the server, or an internet connection.

## Confirmed product decisions

| Area | Decision |
|---|---|
| Server hosting | Local, on the customer's network |
| Device communication | LAN |
| Receiver fallback | Per-device |
| NDI audio | Disabled; video only |
| Internet dependency | None for normal local operation |
| Initial receiver target | Debian 13 on x86_64, including the Late-2014 Mac mini |

The dashboard and server are part of the product scope. The repository now includes the dashboard foundation and a local server with persistent SQLite storage and operator authentication. The server can now create one-time pairing codes, register devices, accept authenticated heartbeats, expose a protected device inventory, store local image assets, manage ordered playlists with per-image durations, and aggregate NDI source snapshots reported by receivers. The C++ receiver client now implements pairing, TLS-verified heartbeats, retry/backoff, protected credential storage, NDI source snapshots, versioned configuration polling, verified media synchronization, and cached image fallback. The server aggregates source snapshots and the dashboard displays them. Per-device NDI source and fallback-playlist assignments are implemented, along with versioned receiver configuration, assigned-media manifests, and authenticated media download endpoints. The native receiver polls these endpoints, verifies and caches assets, and renders timed fallback image playlists when its selected NDI source is unavailable.

## System topology

```text
                    Local network (LAN)
  +------------------------------------------------------+
  |                                                      |
  |  Operator browser                                    |
  |       |                                              |
  |       v                                              |
  |  +--------------------+      +-------------------+  |
  |  | Veyra Dashboard    |<---->| Veyra Local Server|  |
  |  | Devices / Sources  | API  | Auth / Database   |  |
  |  | Media / Playlists  | WS   | Sync / Commands   |  |
  |  | System / Logs      |      | Device registry   |  |
  |  +--------------------+      +---------+---------+  |
  |                                         |            |
  |                    +--------------------+---------+  |
  |                    |                    |         |  |
  |                    v                    v         v  |
  |              +-----------+        +-----------+  ... |
  |              | Receiver  |        | Receiver  |      |
  |              | NDI video |        | NDI video |      |
  |              | Local     |        | Local     |      |
  |              | fallback  |        | fallback  |      |
  |              +-----------+        +-----------+      |
  |                                                      |
  +------------------------------------------------------+
```

The dashboard is the operator interface. The local server owns shared configuration, device registration, media catalogues, playlists, and command coordination. Each receiver owns its playback process and local cache.

## Main components

### 1. Veyra Receiver

A small native Linux process responsible for reliable display output.

Current implementation:

- C++20, CMake, official NDI SDK, SDL2.
- LAN NDI discovery and source selection.
- Video-only NDI capture (no audio or metadata capture).
- Fullscreen rendering with aspect-ratio preservation.
- A bounded latest-frame slot between capture and rendering.
- Local JSON configuration.
- Frame-staleness detection and a black-screen state.
- Independent libcurl control-plane client for one-time pairing, TLS-verified bearer heartbeats, discovery snapshots, and bounded retry/backoff.
- Versioned configuration and assigned-media manifest polling on a separate worker thread.
- SHA-256 and size verification, atomic asset writes, atomic manifest activation, and a bounded 512 MiB local cache.
- Timed PNG/JPEG/WebP fallback slides that continue during NDI or server outages, then automatically yield to recovered NDI video.
- Device token and cache persistence with owner-only filesystem permissions.
- Graceful shutdown and systemd deployment support.

Remaining receiver work:

- Receive and acknowledge allowlisted remote commands over a persistent channel.
- Add richer health metrics and playback diagnostics.
- Add explicit failure-injection tests for interrupted downloads, corrupt caches, and version mismatches.
- Build the complete player against the official NDI SDK and validate source recovery, fallback, and server outages on target hardware.

The receiver must not require the dashboard or server to remain running for normal playback.

### 2. Veyra Local Server

A service running on the customer's local network. It is the management authority, not part of the critical video-rendering path.

Responsibilities:

- Local operator authentication and sessions.
- Device registration, identity, and last-seen state.
- Device heartbeats and status aggregation.
- NDI source inventory and source assignment.
- Media upload, storage, and library metadata.
- Playlist and per-device assignment management.
- Configuration distribution and synchronization.
- Remote commands, including changing source, selecting a playlist, requesting a resync, and restarting the receiver process.
- Playback state, health metrics, logs, and diagnostics.

The server exposes a versioned health endpoint, local operator setup/session routes, protected device inventory, one-time receiver pairing, authenticated heartbeats with source snapshots, an aggregated NDI source inventory endpoint, local image upload/storage, playlist CRUD, device credential revocation, per-device source and fallback assignments, versioned receiver configuration, assigned-media manifests, and receiver-authenticated asset downloads. The C++ client verifies TLS, stores its bearer credential locally, synchronizes the assigned state, and caches fallback images. Remote commands and WebSocket events remain planned.

The server currently uses a local SQLite database in WAL mode with versioned migrations through schema version 6. The initial operator authentication uses scrypt password hashes, random opaque session tokens stored as hashes, HttpOnly/SameSite=Strict cookies, and rate-limited setup/login routes. The server defaults to loopback binding. It is not a cloud service; do not introduce an internet account, external database, or mandatory third-party runtime dependency.

### 3. Veyra Dashboard

A browser-based operator interface that communicates with the local server. The current development build runs through Vite. The NDI Sources page displays receiver-reported source inventory; the Media Library and Playlists pages use the local server for image uploads, content previews, ordered playlist editing, and per-image durations; production static serving is still to be implemented.

Current sections:

- **Devices:** device list, online/stale/offline state, pairing, credential revocation, and removal.
- **Sources:** receiver-reported NDI source inventory and per-device NDI source assignment.
- **Media:** local image uploads, previews, metadata, and deletion with playlist-reference protection.
- **Playlists:** ordered image sequences with editable per-image display durations.
- **System:** local server health and storage state.
- **System:** server health, receiver diagnostics, logs, and platform settings.

Per-device actions currently include assigning the NDI source and fallback playlist. Planned actions include restarting the Veyra receiver process, requesting manual resynchronization, and viewing detailed device logs.

The dashboard should make the state of each device understandable at a glance. It must distinguish server reachability from receiver playback state; an offline server does not necessarily mean a receiver is offline.

## Playback, caching, and fallback

There are two distinct failure cases and they must not be conflated.

### NDI source unavailable

1. The receiver detects that fresh NDI video is no longer arriving.
2. It transitions to the fallback assigned to that specific receiver.
3. The fallback playlist is played from the receiver's local cache.
4. The receiver continues checking for its assigned NDI source.
5. When the source returns, the receiver resumes NDI playback according to the recovery policy.

### Local server unavailable

1. The receiver keeps its last successfully applied configuration.
2. It continues current playback.
3. If its NDI source becomes unavailable, it can still use its locally cached fallback playlist.
4. It queues or retries state synchronization until the server is reachable again.

A receiver must never need to fetch fallback media at the moment a failure occurs. Required fallback assets and configuration must already be local.

### Per-device ownership

Each receiver has its own fallback assignment and local cache. A fallback configured for one display must not silently replace another device's fallback. The server distributes assignments; the receiver stores the last valid version locally.

The initial fallback content scope includes image-based sequences with explicit ordering and display durations. Any additional media types should be added only after their playback and caching requirements are defined.

## Communication and trust boundaries

- Dashboard-to-server traffic stays on the LAN.
- Receiver-to-server traffic stays on the LAN.
- NDI discovery and video transport remain separate from the management API.
- The receiver's playback loop must not block on server requests.
- Device identity and authentication are implemented for pairing and heartbeats; remote commands still need a narrow, versioned contract.
- Remote commands need acknowledgements, timeouts, and observable outcomes.
- Configuration and media updates should be versioned and applied atomically so a partial download cannot corrupt the last working state.

Do not expose an unauthenticated remote shell or arbitrary command execution. A restart action should invoke a narrowly defined receiver operation, not accept arbitrary shell text.

## Proposed implementation boundaries

These are implementation proposals, not immutable product requirements:

- Keep the existing native C++ receiver as its own component.
- Implement the local server as a separate service.
- Implement the dashboard as a separate web application.
- Use a small embedded database for local server state.
- Use a typed, versioned HTTP API plus WebSockets for live state and commands.
- Keep receiver configuration and cached fallback data on disk.

The current implementation uses Node.js 22+, TypeScript, Fastify 5, React 19, Vite 6, and SQLite via better-sqlite3. The database and initial framework choices are therefore settled for the current development phase. Remote commands, WebSocket events, long-term media retention policy beyond active-cache pruning, and production deployment still require explicit design and validation.

## Repository status

The repository now contains a native NDI receiver foundation, a Fastify/SQLite local server, and a React/Vite dashboard. Implemented capabilities include operator authentication, device pairing and revocation, TLS-verified C++ heartbeats with NDI source snapshots, an aggregated source inventory, local media uploads, ordered playlists with per-image durations, database/media backups, and a responsive dashboard for devices, sources, media, and playlists. Remaining major work includes the complete NDI SDK build, target hardware validation, remote commands, WebSocket updates, detailed diagnostics, media quotas/retention, and production dashboard packaging.

The full NDI player has not yet been built against an installed official NDI SDK or tested with a real sender on the target Mac mini. The control-plane client is compiled and integration-tested independently, but that does not verify the complete player. Do not describe the platform as production-ready until the receiver, server, dashboard, offline behavior, and target hardware have all been validated.

## Target environment

- Debian 13, 64-bit x86_64, XFCE/X11 during initial development.
- Apple Mac mini (Late 2014), Intel Core i5-4278U, 8 GB RAM, Intel Iris 5100.
- Initial display target: 1920×1080 at 30 FPS.
- Wired LAN preferred.
- The target machine has a mechanical HDD; development must not assume an SSD.

## Third-party licensing

The official NDI SDK is proprietary. Keep its headers and binaries out of the repository unless the applicable license explicitly permits redistribution. Review all third-party licenses before packaging Veyra for distribution.
