# Casa Pâinii — Church Management Platform

A full-stack church management platform for Casa Pâinii.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 16 (App Router, TypeScript) |
| Database & Auth | Supabase (Postgres + RLS + Auth + Storage) |
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
│   ├── src/lib/           # Supabase/auth helpers
│   ├── open-next.config.ts
│   ├── wrangler.toml
│   └── package.json
├── supabase/
│   ├── schema.sql
│   └── migrations/
└── .env.example
```

## Local Development

### 1. Install

```bash
cd frontend
npm install
```

Create `frontend/.env.local` from the repository root `.env.example`.

### 2. Database

Run these SQL files in order in the Supabase SQL Editor:

1. `supabase/schema.sql`
2. `supabase/migrations/phase1_payments.sql`
3. `supabase/migrations/phase2_bracelets.sql`
4. `supabase/migrations/phase3_event_planning.sql`
5. `supabase/migrations/phase5_integrations.sql`
6. `supabase/migrations/phase6_bracelet_history.sql`
7. `supabase/migrations/phase7_schema_fixes.sql`
8. `supabase/migrations/phase8_missing_tables.sql`
9. `supabase/migrations/phase9_event_packages_and_profile_fields.sql`

The `posters` Supabase Storage bucket must exist and be public if Facebook/event-poster publishing is enabled.

### 3. Run

```bash
cd frontend
npm run dev
```

## Cloudflare Workers Deployment

Cloudflare currently supports Next.js on Workers through multiple paths; this repository intentionally uses the **OpenNext adapter** for the existing Next.js application.

### Option A — Cloudflare Workers Builds

Connect the GitHub repository to Cloudflare Workers Builds.

Set the project root to:

```
frontend
```

Build command:

```bash
npm install && npm run build:cf
```

Deploy command:

```bash
npx wrangler deploy
```

Cloudflare Workers Builds supports a separate build command and deploy command. citeturn0search7

### Option B — Wrangler locally

```bash
cd frontend
npm install
npm run preview
npm run deploy
```

`preview` builds and runs the application through the Workers/OpenNext runtime; `deploy` builds and deploys it.

## Required Cloudflare Variables / Secrets

Configure these in Cloudflare **Build Variables and Secrets** / Worker environment settings:

| Variable | Required | Type |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Variable |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Variable |
| `SUPABASE_SERVICE_KEY` | Yes | Secret |
| `STRIPE_SECRET_KEY` | Yes for payments | Secret |
| `STRIPE_WEBHOOK_SECRET` | Yes for payments | Secret |
| `GOOGLE_CLIENT_ID` | Optional | Variable |
| `GOOGLE_CLIENT_SECRET` | Optional | Secret |
| `GOOGLE_CALENDAR_ID` | Optional | Variable |
| `FB_PAGE_ID` | Optional | Variable |
| `FB_PAGE_ACCESS_TOKEN` | Optional | Secret |
| `EVENT_TIMEZONE` | Optional | Variable |

**Never commit service-role, Stripe, OAuth, or Facebook secrets.**

## Stripe Webhook

Create a Stripe webhook endpoint:

```
https://YOUR_DOMAIN/api/payments/webhook
```

Listen for:

- `checkout.session.completed`

Set its signing secret as `STRIPE_WEBHOOK_SECRET`.

## Google Calendar OAuth

Create a Google OAuth 2.0 Web application and add:

```
https://YOUR_DOMAIN/api/oauth/calendar/callback
```

Then configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The OAuth flow uses an HTTP-only state cookie to bind the callback to the initiating browser session.

## Security Model

- Supabase Auth identifies the current user.
- Sensitive API routes enforce authentication and staff/owner authorization.
- Server-side Supabase access uses `SUPABASE_SERVICE_KEY`, which must remain secret.
- Stripe webhooks verify the Stripe signature before changing payment state.
- Google OAuth callbacks require an authenticated staff user and validate OAuth state.
- Public/client Supabase keys are safe to expose; service-role and third-party secrets are not.

## Database Notes

The canonical event package table is `event_packages`. The phase 9 migration provides a compatibility view named `ticket_types`.

Important tables include:

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
