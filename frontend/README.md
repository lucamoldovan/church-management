# Casa Pâinii — Church Management Platform

This directory contains the deployable Next.js application.

## Stack

- Next.js App Router + TypeScript
- Supabase Auth, Postgres, RLS and Storage
- Stripe payments
- Cloudflare Workers via OpenNext

## Development

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local` with the variables documented in the repository root `.env.example`.

## Cloudflare build

```bash
cd frontend
npm install
npm run build:cf
wrangler deploy
```

The Worker entrypoint is configured in `wrangler.toml` as `.open-next/worker.js`.

Set production variables/secrets in Cloudflare. Never commit service-role, Stripe, OAuth, or Facebook secrets.

## Database

Run the Supabase schema and migrations from the repository root in order:

1. `supabase/schema.sql`
2. `phase1_payments.sql`
3. `phase2_bracelets.sql`
4. `phase3_event_planning.sql`
5. `phase5_integrations.sql`
6. `phase6_bracelet_history.sql`
7. `phase7_schema_fixes.sql`
8. `phase8_missing_tables.sql`
9. `phase9_event_packages_and_profile_fields.sql`

The `posters` Storage bucket must exist and be public if event poster publishing is enabled.


## Integrations added

- **QR check-in:** browser camera scanning uses the native BarcodeDetector API; the manual code field remains as a fallback.
- **NFC check-in:** Web NFC is offered when the browser/device supports it. NFC tags need readable NDEF data; browser NFC cannot read arbitrary hardware UID values.
- **YouTube Live:** set `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID`. The public Live page checks for an active broadcast periodically and embeds it automatically. YouTube's `search.list` supports filtering a channel to active live broadcasts. 
- **Google Calendar import:** staff can synchronize upcoming Google Calendar events and import missing ones as draft events with one click. After import, the normal event editor can be used to upload the poster and finish the details.
- **Planning Center Services:** set `PLANNING_CENTER_TOKEN` to expose service plans in the new Services admin tab.
- **ProPresenter:** the Services tab includes basic browser control through ProPresenter's local HTTP API: connect/status, previous, next, retrigger, clear and active-presentation inspection. The ProPresenter computer must be reachable from the device running the website; a Cloudflare Worker cannot directly reach a private church LAN.

For ProPresenter, enable the Network/API services in ProPresenter and use the IP address and port shown in its Network settings. ProPresenter publishes an OpenAPI specification for these endpoints.
