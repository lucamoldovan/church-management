# Development plan

This roadmap covers the complete Veyra platform. Checkboxes describe repository implementation and validation, not merely design decisions.

## Phase 1 — Native receiver foundation

- [x] C++20 project and CMake configuration
- [x] Dependency discovery for SDL2, spdlog, nlohmann/json, and the NDI SDK
- [x] Local configuration loading and validation
- [x] Structured logging
- [x] Clean startup/shutdown path
- [x] SDK-independent configuration tests in GitHub Actions
- [x] Compile the SDL renderer independently of the proprietary NDI SDK in CI

## Phase 2 — NDI discovery and receiving

- [x] Initialize and shut down the NDI runtime
- [x] Discover sources on the local network
- [x] Copy source names and addresses before the finder updates its list
- [x] Select a source by configured address or exact name
- [x] Connect and receive video frames
- [x] Ignore audio and metadata deliberately
- [x] Keep the receiver alive to use the SDK's reconnect behavior
- [ ] Validate source disappearance and reappearance with a real NDI sender

## Phase 3 — Video presentation and reliability

- [x] SDL2 fullscreen output
- [x] UYVY and BGRA frame handling
- [x] UYVY-to-BGRA fallback when the SDL renderer cannot use UYVY
- [x] Bounded latest-frame slot between capture and rendering
- [x] Preserve source aspect ratio
- [x] Frame-staleness detection and black-screen state
- [x] Cooperative capture-thread shutdown
- [x] State and health logging for discovery/playback transitions
- [ ] Measure 1920×1080 at 30 FPS on the target Mac mini
- [ ] Validate display recovery after renderer/device reset on target hardware
- [ ] Verify NDI reconnect timing and behavior during LAN interruption
- [ ] Build the complete player against the official NDI SDK on Debian 13
- [ ] Run a 24-hour playback test

## Phase 4 — Platform architecture and contracts

- [x] Restore the full-product scope in the architecture documentation
- [x] Define dashboard sections and local-server responsibilities
- [x] Define separate receiver/server failure behavior
- [x] Define per-device fallback and local-cache requirements
- [x] Specify versioned server API and WebSocket event contract in the control-plane draft
- [x] Specify device identity, pairing, and authentication
- [x] Specify and implement media storage, upload limits, and asset validation
- [x] Implement playlist schema, ordering, and per-item durations
- [x] Specify per-device source and fallback-playlist assignment
- [ ] Specify command acknowledgement, timeout, and retry behavior
- [x] Define initial database schema version and transactional migration mechanism
- [x] Add forward migration and populated version-1 database upgrade test

## Phase 5 — Local server

- [x] Create the initial TypeScript/Fastify server workspace and development scripts
- [x] Add versioned health endpoint and graceful shutdown
- [x] Add server type-check/build and endpoint tests to GitHub Actions
- [x] Commit npm lockfiles and use reproducible npm ci installs in CI
- [x] Add SQLite database initialization with WAL, foreign keys, and transactional schema migrations through version 6
- [x] Implement first-run administrator setup with a one-time setup key
- [x] Implement scrypt password hashing and opaque database-backed sessions
- [x] Add HttpOnly, SameSite=Strict session cookies and login rate limiting
- [x] Add setup, login, session inspection, and logout tests
- [x] Implement one-time pairing-code generation and single-use receiver enrollment API
- [x] Implement C++ receiver pairing, TLS-verified heartbeats, source reporting, retry/backoff, and protected credential storage
- [x] Require TLS before binding the server to non-loopback interfaces
- [x] Issue per-device credentials and store only credential hashes
- [x] Implement bearer-authenticated heartbeat ingestion and online/stale/offline state
- [x] Implement receiver-reported source snapshots and aggregated NDI source inventory
- [x] Implement per-device source assignment and versioned receiver configuration
- [x] Implement authenticated media upload, local storage, metadata, content delivery, and safe deletion
- [x] Implement playlist CRUD, ordered items, and validated display durations
- [x] Implement per-device fallback playlist assignment API
- [x] Implement versioned configuration and assigned-media manifest endpoints
- [x] Keep heartbeat reporting independent from large media downloads and cancel sync on shutdown
- [ ] Implement live WebSocket events and narrowly scoped remote commands
- [x] Add server tests for pairing, one-time code use, protected inventory, heartbeat updates, credential revocation, media uploads, playlist editing, and backups
- [x] Add a populated legacy database migration test
- [x] Add credential revocation and safe removal API tests
- [ ] Add broader API contract and abuse-case tests

## Phase 6 — Dashboard

- [x] Create the React/TypeScript/Vite dashboard workspace
- [x] Add responsive application shell and primary workspace navigation
- [x] Add overview, Devices, NDI Sources, Media Library, Playlists, and System pages
- [x] Connect live server health indicator to the local API
- [x] Add dashboard TypeScript and production build to GitHub Actions
- [x] Create shared API types and client helpers
- [x] Implement first-run setup, login, session persistence, and logout
- [x] Implement protected device inventory with 15-second refresh and live status
- [x] Add receiver credential status, revocation, and removal controls
- [x] Implement NDI source inventory page
- [x] Implement per-device source assignment controls
- [x] Implement media library uploads, previews, and deletion
- [x] Implement playlist editor with ordering and editable image durations
- [x] Implement per-device fallback playlist assignment
- [ ] Implement device configuration and remote actions
- [ ] Implement system health, logs, and diagnostics
- [x] Add responsive layout for desktop and mobile
- [ ] Add accessibility review and dashboard interaction tests

## Phase 7 — Receiver management and offline-first behavior

- [x] Add receiver identity and pairing flow
- [x] Add LAN communication client with TLS verification and bounded reconnect/backoff
- [x] Add heartbeat and playback/source reporting
- [ ] Add detailed receiver health diagnostics
- [x] Poll and apply versioned remote NDI configuration safely
- [x] Synchronize assigned fallback manifests and commit active cache state atomically
- [x] Implement owner-only local media cache with SHA-256 verification and atomic asset writes
- [x] Render cached image fallback playlists with per-item durations
- [x] Switch to cached fallback when the assigned NDI source is unavailable
- [x] Continue from the last verified local cache when the local server is unavailable
- [x] Resume NDI automatically when the selected source returns
- [x] Retry synchronization and apply the latest state after server connectivity returns
- [x] Test that a failed media download leaves the previous verified cache snapshot active
- [x] Test that corrupted cached assets are rejected and can be re-fetched
- [ ] Test broader interruption timing, stale commands, and version mismatches

## Phase 8 — Integration and deployment

- [x] Add a target Mac mini build and validation checklist
- [x] Add secure SQLite, pairing-secret, and media-directory backup utility with restore instructions
- [ ] Build a repeatable local development environment
- [ ] Package the server and dashboard for local-network deployment
- [ ] Package and install the receiver as a managed service
- [x] Provide backup and restore for SQLite data, pairing secret, and media assets
- [ ] Include server configuration and TLS key/certificate backup guidance
- [ ] Test multiple receivers on one LAN
- [ ] Test server outage while receivers are playing
- [ ] Test NDI source outage with per-device fallback
- [ ] Test simultaneous server and source outages
- [ ] Test recovery and synchronization after outages
- [ ] Measure CPU, memory, network usage, dropped frames, and latency
- [ ] Test on the target Mac mini and run a 24-hour stability test
- [ ] Document installation, updates, backup, and recovery

## Engineering rules

1. The local server is the management authority; the receiver is the playback authority for its own display.
2. Normal playback must not depend on the dashboard, local server availability, or internet access.
3. Keep the receiver independent of server request latency and dashboard implementation details.
4. Treat NDI video transport and Veyra management traffic as separate concerns.
5. Keep fallback assets and the last valid configuration local to each receiver.
6. Version API messages, configuration, and media manifests; reject incompatible data safely.
7. Use bounded queues, explicit timeouts, retries, and observable state transitions.
8. Never claim target-hardware performance or end-to-end reliability until it has been measured.
9. Keep NDI SDK acquisition separate from the source tree unless redistribution is explicitly permitted.
10. Review every change and run all available checks before moving to the next phase.
