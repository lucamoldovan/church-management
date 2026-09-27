# Casa Pâinii — Church Management Platform

Cloudflare-native church management platform for Casa Pâinii.

## Stack

- Next.js 16 + TypeScript
- Cloudflare Workers + OpenNext
- Cloudflare D1 — primary database
- Better Auth — authentication and sessions
- Cloudflare R2 — uploaded media
- Cloudflare Email Service — transactional email
- Stripe — payments
- Google Calendar / YouTube / Facebook / Planning Center integrations

There is no Python backend and no Supabase dependency.

## Structure

```
church-management/
├── frontend/
│   ├── src/app/              # Pages and API routes
│   ├── src/lib/              # Cloudflare, auth and data helpers
│   ├── migrations/           # D1 migrations
│   ├── wrangler.toml         # D1/R2/Email bindings
│   └── package.json
└── .env.example
```

## Local setup

```bash
cd frontend
npm install
```

Create the D1 database and set its ID in `frontend/wrangler.toml`, then run:

```bash
npm run db:migrate
npm run dev
```

For the Workers runtime:

```bash
npm run preview
```

## Cloudflare resources

Create/configure:

1. D1 database named `church-management`
2. R2 bucket named `church-management-media`
3. Email Service sending domain
4. Workers Paid plan for outbound Email Service
5. Better Auth secret

Then replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml`.

Cloudflare's Workers platform exposes D1/R2 and other resources through bindings, and Email Service provides an `EMAIL` binding for transactional mail. citeturn2search7turn5search0

## Environment variables

| Variable | Required |
|---|---|
| `BETTER_AUTH_SECRET` | Yes |
| `BETTER_AUTH_URL` | Yes |
| `EMAIL_FROM` | Yes for email |
| `STRIPE_SECRET_KEY` | Payments |
| `STRIPE_WEBHOOK_SECRET` | Payments |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GOOGLE_CALENDAR_ID` | Google Calendar |
| `YOUTUBE_API_KEY` | YouTube Live |
| `YOUTUBE_CHANNEL_ID` | YouTube Live |
| `PLANNING_CENTER_TOKEN` | Planning Center |
| `FB_PAGE_ID` | Facebook |
| `FB_PAGE_ACCESS_TOKEN` | Facebook |
| `EVENT_TIMEZONE` | Optional, defaults to Europe/Bucharest |

Never commit secrets.

## Database

The D1 migration creates the application database, including members, roles, events, registrations, bracelets, check-ins, groups, sermons, payments, integrations, Planning Center service data, production/Connector state, audit logs and Control Center data.

Better Auth uses the same D1 database for its user/session/account/verification tables. citeturn0search1turn3search0

## Deployment

In Cloudflare Workers Builds:

- Root directory: `frontend`
- Build command: `npm install && npm run build:cf`

The repository intentionally keeps OpenNext because this project already uses that deployment path. Cloudflare currently recommends vinext for new Next.js applications, while continuing to document OpenNext for existing applications. citeturn2search1

## Security

- Better Auth handles authentication.
- Protected API routes validate sessions server-side.
- Staff/admin capabilities are checked server-side.
- D1 is never exposed directly to the browser.
- R2 uploads require authenticated staff access.
- Stripe webhooks verify their signatures.
- OAuth callbacks validate state.
