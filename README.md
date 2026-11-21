# Church Operations

A staff-only church operations and media platform. The dashboard, API, database and NDI receiver control plane are designed to run on infrastructure owned by the church.

## Architecture

- **Dashboard:** React + TypeScript + Vite. One staff application for church operations and production.
- **Local API:** Node.js 22+ + Fastify.
- **Database:** SQLite via better-sqlite3. Stored locally with restrictive filesystem permissions.
- **NDI screens:** Native Linux receiver based on the existing Veyra NDI receiver engine and control-plane protocol.
- **ProPresenter:** Server-side live status plus allowlisted Previous cue, Next cue and Clear slide controls for administrator/production staff.
- **Planning Center:** Current source of truth for people, team memberships, service plans and scheduled assignments. Church Operations keeps a local read-only working copy; replacing Planning Center is not part of the current phase.

There are no Cloudflare Workers, D1, R2, OpenNext, Supabase or hosted application dependencies in this branch. The only external network connections are optional integrations configured by the church (currently Planning Center and the ProPresenter machine on the LAN).

## Local development

Requirements: Node.js 22+, npm, and (for native NDI receivers) CMake, a C++20 compiler, SDL2 and the NDI SDK 6.

```bash
npm install
npm run dev
```

The API runs on `http://127.0.0.1:8787` and the Vite dashboard on `http://127.0.0.1:5173`. The Vite server proxies `/api` requests to the local API.

The first launch prints a one-time setup key in the API terminal. Use it to create the first administrator account in the dashboard. Additional staff accounts can then be created from **Staff**.

## Single-server deployment

Build the dashboard and API:

```bash
npm run build
npm start
```

The Fastify server serves the built dashboard and API from one origin. The default bind is loopback-only. To make the app available to staff devices on the church LAN, configure a trusted local TLS certificate and set:

```env
CHURCH_HOST=0.0.0.0
CHURCH_TLS_CERT_PATH=/path/to/church-server.crt
CHURCH_TLS_KEY_PATH=/path/to/church-server.key
```

The server deliberately refuses to bind to a non-loopback interface without TLS. Configure the certificate on the devices that access the staff dashboard.

## Integrations

Set these values in the local server environment (never in browser code):

- `PLANNING_CENTER_APP_ID`
- `PLANNING_CENTER_SECRET`
- `PROPRESENTER_URL` (for example, the ProPresenter machine's LAN address and configured API port)

Planning Center uses a Personal Access Token for this single-church server integration. Credentials are kept server-side. The current sync imports the paginated People directory (names and Planning Center IDs only), Services teams and positions, team memberships, and future service plans with their ordered items, scheduled people, service times and item assignments. Planning Center remains authoritative; the local copy is used by Church Operations and is never written back to Planning Center.

## NDI receivers

Build and install the receiver from `receiver/` on a supported Linux display machine. The receiver remains a separate native process because NDI decoding and fullscreen display output cannot run inside a browser tab. It pairs with the local server and is managed from the **NDI screens** section of the staff dashboard.

See [docs/architecture.md](docs/architecture.md) and [docs/control-plane-contract.md](docs/control-plane-contract.md) for the receiver/server contract. For installation, use the [Debian 13 deployment runbook](docs/debian13-deployment.md), the [NDI hardware validation checklist](docs/ndi-validation.md), and the [ProPresenter / Planning Center setup guide](docs/propresenter-setup.md).

The public CI compiles and tests the receiver's renderer and control-plane components without the proprietary NDI SDK. The complete NDI player still requires a build against the installed official SDK and a real sender/display test on the target hardware.
