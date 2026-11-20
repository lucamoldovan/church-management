# Church Operations architecture

## Product boundary

Church Operations is an internal staff application for one church. It is not a public website or hosted SaaS application. The church runs the application server and database on hardware it controls.

The browser dashboard is the only management interface. NDI receiver software remains a native process on each display endpoint because NDI decoding, hardware video presentation and fullscreen output do not belong in a browser.

## Runtime topology

Staff browsers -- HTTPS --> Local Church Operations server
NDI receivers -- HTTPS/LAN --> Local Church Operations server
ProPresenter computer -- HTTP/LAN --> Local Church Operations server
Planning Center API -- HTTPS --> Local Church Operations server

The server owns authentication, staff permissions, church records, device credentials, media metadata and integration configuration. The React dashboard is served by the same Fastify origin in production. During development, Vite runs separately and proxies API requests to Fastify.

## Components

### Dashboard

React + TypeScript + Vite. It contains one staff workspace with these sections:

- Overview: staff, services, events, groups, NDI devices, discovered sources and media counts.
- Services: local service records and Planning Center Services import.
- Staff: internal accounts, role labels, department and activation status.
- Events and Groups: basic local operational records.
- ProPresenter: live presentation and current-slide information.
- NDI screens: receiver inventory, pairing, health and assignments.
- NDI sources: discovered senders reported by receivers.
- Media and Playlists: local assets and per-device fallback playlists.
- System: local server health and configuration information.

There is no public member portal in this application.

### Local server

Node.js 22+, Fastify 5 and SQLite using better-sqlite3. The server serves both the built dashboard and /api/v1 endpoints. SQLite runs in WAL mode; database and media directories use restrictive filesystem permissions.

The default bind is loopback-only. Binding to a LAN interface is rejected unless both a TLS certificate and private key are configured. This protects staff sessions and receiver credentials on the local network.

### NDI receiver

The existing Veyra C++20 receiver engine is retained under the receiver directory. It discovers NDI sources, receives video, renders fullscreen through SDL2 and reports device health and discovered sources to the local server. The receiver is a separate native application, not a browser component.

NDI audio remains disabled. Receiver fallback behavior and device configuration remain controlled by the local server, while the receiver keeps its own cached media so playback can continue during a temporary server outage.

### Integrations

Planning Center is initially used as a read/sync source for future Services plans and their ordered service items. A single-church Personal Access Token is configured on the server, never in browser code. Imported records are stored locally. The long-term direction is to replace Planning Center with native service, people, group and volunteer modules.

ProPresenter is queried by the local server for version, active presentation, current slide text and slide index using its documented HTTP endpoints. This connector is read-only and does not assume a bearer token. The ProPresenter API can expose powerful control endpoints, so restrict its listener to trusted production-network hosts. The browser only talks to the Church Operations API and never directly accesses the production computer.

## Data ownership

SQLite and media files live on the church server. No Cloudflare Workers, D1, R2, OpenNext, Supabase or hosted application database is required. Planning Center is an optional upstream data source during the transition, and ProPresenter is an optional LAN integration.

Backups must include the SQLite database, media directory, receiver pairing secret, TLS private key and local environment configuration. Store backups separately from the server itself.

## Security boundaries

- All dashboard routes require an authenticated staff session.
- Staff accounts have a role and active/disabled state.
- Creating staff accounts and syncing Planning Center require administrator access.
- Passwords are stored as scrypt hashes; session cookies are HttpOnly and SameSite Strict.
- Receiver credentials are separate from staff sessions and can be revoked.
- External integration secrets remain server-side.
- Non-loopback server binding requires TLS.

## Current implementation boundaries

Implemented in this branch: local server/dashboard foundation, staff accounts, basic service/event/group records, Planning Center future-service import, ProPresenter live status polling, NDI receiver control plane, device pairing, source aggregation, media and playlist management.

Not yet migrated from the old public-facing project: event registration and payment workflows, QR/NFC attendee check-in, full group attendance, pastoral care, and the old public livestream/sermon pages. Those should only be added if they serve the staff-only operations scope.
