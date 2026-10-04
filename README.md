# Casa Pâinii — Church Management Platform

A full-stack church management platform for Casa Pâinii.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 16 (App Router, TypeScript) |
| Database | Cloudflare D1 |
| Authentication | Better Auth |
| File storage | Cloudflare R2 |
| Transactional email | Cloudflare Email Service |
| Payments | Stripe |
| Deployment | Cloudflare Workers via OpenNext |

The project has **no separate Python backend**. Server-side business logic and API endpoints live in Next.js Route Handlers under `frontend/src/app/api` and run in the Cloudflare Worker.

## Features

- Member profiles and role-based authentication
- Events with registration, ticketing, and approval workflow
- Stripe payment integration (online + cash at event)
- QR code tickets and NFC bracelet check-in system
- Study groups with attendance tracking
- Admin dashboard with analytics
- Sermon library and livestream configuration
- Google Calendar and Facebook auto-publishing
- Role-based access control

## Project Structure

```
church-management/
├── frontend/              # Deployable Next.js application
│   ├── src/app/           # Pages + API Route Handlers
│   ├── src/lib/           # D1, Better Auth, R2 and integration helpers
│   ├── open-next.config.ts
│   ├── wrangler.toml
│   └── package.json
└── .env.example
```

## Local Development

```bash
cd frontend
npm install
npm run dev
```

Use `.env.example` as the template for local environment variables. Production Cloudflare bindings and secrets are configured on the Worker.

## Cloudflare Workers Deployment

Connect the GitHub repository to Cloudflare Workers Builds.

Set the project root to:

```
frontend
```

Build command:

```
npm install && npm run build:cf
```

Deploy command:

```
npx wrangler deploy
```

For local Workers/OpenNext testing:

```bash
cd frontend
npm run preview
npm run deploy
```

## Required Cloudflare Bindings

The Worker expects these bindings:

| Binding | Cloudflare resource | Purpose |
|---|---|---|
| `CHURCH_DB` | D1 database | Application database |
| `MEDIA` | R2 bucket | Uploaded media/files |
| `EMAIL` | Email Service send binding | Transactional email |

These are currently documented in `frontend/wrangler.toml`; attach the real production resources before deployment.

## Required Variables / Secrets

| Variable | Required | Type |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | Secret |
| `NEXT_PUBLIC_APP_URL` or `APP_BASE_URL` | Yes | Variable |
| `AUTH_EMAIL_FROM` | Yes for email | Variable |
| `STRIPE_SECRET_KEY` | Yes for payments | Secret |
| `STRIPE_WEBHOOK_SECRET` | Yes for payments | Secret |
| `GOOGLE_CLIENT_ID` | Optional | Variable |
| `GOOGLE_CLIENT_SECRET` | Optional | Secret |
| `GOOGLE_CALENDAR_ID` | Optional | Variable |
| `FB_PAGE_ID` | Optional | Variable |
| `FB_PAGE_ACCESS_TOKEN` | Optional | Secret |
| `YOUTUBE_API_KEY` | Optional | Secret/Variable |
| `YOUTUBE_CHANNEL_ID` | Optional | Variable |
| `PLANNING_CENTER_TOKEN` | Optional | Secret |
| `BOOTSTRAP_ADMIN_EMAIL` | Optional | Variable |

No Supabase URL, key, service-role secret, Auth client, Storage bucket, or Postgres connection is required by this branch.

## Stripe Webhook

Create a Stripe webhook endpoint:

```
https://YOUR_DOMAIN/api/payments/webhook
```

Listen for:

- `checkout.session.completed`

Set its signing secret as `STRIPE_WEBHOOK_SECRET`.

## Security Model

- Better Auth identifies the current user and manages sessions.
- D1 stores application/auth data.
- Sensitive API routes enforce authentication and server-side authorization.
- R2 is used for application file storage.
- Stripe webhooks verify the Stripe signature before changing payment state.
- OAuth callbacks require authenticated staff access and validate OAuth state.
- Third-party secrets remain server-side.

## Database

The canonical database schema for this migration lives in the Cloudflare D1 schema/migration implementation under `frontend/src/lib/cloudflare/`. Supabase/Postgres schema files are intentionally not part of the target architecture.

Important application tables include:

- `profiles`
- `events`
- `event_packages`
- `registrations`
- `checkins`
- `bracelets`
- `bracelet_assignments`
- `study_groups`
- `group_members`
- `group_meetings`
- `group_attendance`
- `sermons`
- `livestream_config`
- `payment_transactions`
- `notifications`
- `social_media`
- `contact_messages`
- `integration_tokens`

## Integrations

- **QR check-in:** browser camera scanning uses the native BarcodeDetector API; manual code entry remains available.
- **NFC check-in:** Web NFC is used where supported. NFC tags need readable NDEF data; browser NFC cannot read arbitrary hardware UID values.
- **YouTube Live:** set `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID`.
- **Google Calendar:** staff can synchronize upcoming events through the Google OAuth integration.
- **Planning Center Services:** set `PLANNING_CENTER_TOKEN` to expose service plans.
- **ProPresenter:** production control is designed around a local Church Connector because a Cloudflare Worker cannot directly reach a private church LAN.

## Migration Status

This branch is the Cloudflare-native migration branch. Supabase has been removed from the application dependency/runtime architecture. Remaining migration work is tracked separately in the staged migration plan, including D1 schema validation, authorization, R2, email, API, integrations, check-in, production control, bindings, fresh-database testing, and final production audit.
