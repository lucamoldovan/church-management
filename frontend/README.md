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
