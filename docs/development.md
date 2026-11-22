# Development

## Requirements

- Node.js 22+
- npm
- For NDI receiver builds: CMake 3.20+, a C++20 compiler, SDL2 and the official NDI SDK 6.
- The receiver's validated target is Debian 13 x86_64.

## Dashboard and API

Install workspace dependencies from the repository root with npm install.

Start the local API and dashboard together with npm run dev.

The Fastify API listens on 127.0.0.1:8787; Vite serves the dashboard on 127.0.0.1:5173 and proxies /api requests to the API.

The first server launch generates a one-time setup key in the server log. Use it to create the first administrator account. Additional staff accounts are created from the Staff section.

## Production build

Run npm run build, then npm start.

The production Fastify process serves the built dashboard and API from one origin. The default host is loopback-only. For LAN access, configure a trusted TLS certificate and key in the root .env file, then set CHURCH_HOST=0.0.0.0. The server intentionally refuses non-loopback binding without TLS.

Copy .env.example to .env. Integration credentials belong only in this file on the server and must not be committed.

## Database and media

The SQLite database defaults to server/data/veyra.sqlite unless VEYRA_DATABASE_PATH is set. Media files default to server/data/media. Both locations are private directories. Back up the database and media folder together.

## NDI receiver

Build on the target Linux receiver with the NDI SDK and SDL2 development packages installed:

cmake -S receiver -B receiver/build -DCMAKE_BUILD_TYPE=Release
cmake --build receiver/build --parallel

Copy receiver/config/receiver.example.json to the receiver's private configuration directory, set the Casa Painii server URL and display name, then pair the receiver using a one-time code generated in the dashboard. Configure the trusted local CA certificate path when the server uses HTTPS.

The receiver is independent of the dashboard process. Do not run NDI frame decoding in the browser.

## CI

GitHub Actions runs workspace installation, dashboard/API builds and API tests. The native receiver still requires a machine with the official NDI SDK for full hardware validation.
