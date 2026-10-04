# Casa Pâinii — Church Management Platform

This directory contains the deployable Next.js application.

## Stack

- Next.js App Router + TypeScript
- Cloudflare D1
- Better Auth
- Cloudflare R2
- Cloudflare Email Service
- Stripe payments
- Cloudflare Workers via OpenNext

## Development

```bash
cd frontend
npm install
npm run dev
```

Use the repository root `.env.example` as the environment-variable template.

## Cloudflare build

```bash
cd frontend
npm install
npm run build:cf
wrangler deploy
```

The Worker entrypoint is configured in `wrangler.toml` as `.open-next/worker.js`.

Required Worker bindings are `CHURCH_DB` (D1), `MEDIA` (R2), and `EMAIL` (Cloudflare Email Service).

Never commit authentication, Stripe, OAuth, Facebook, YouTube, or Planning Center secrets.

## Integrations

- **QR check-in:** browser camera scanning uses the native BarcodeDetector API; manual code entry remains available.
- **NFC check-in:** Web NFC is offered where supported. NFC tags need readable NDEF data; browser NFC cannot read arbitrary hardware UID values.
- **YouTube Live:** set `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID`.
- **Google Calendar:** staff can synchronize upcoming Google Calendar events.
- **Planning Center Services:** set `PLANNING_CENTER_TOKEN` to expose service plans.
- **ProPresenter:** production control uses the planned local Church Connector architecture; a Cloudflare Worker cannot directly reach a private church LAN.

This branch intentionally contains no Supabase runtime dependency or Supabase environment configuration.
