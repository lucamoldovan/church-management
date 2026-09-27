# Casa Painii - Church Management Platform

A full-stack church management platform for **Casa Painii Ocna Mures** (Pentecostal church).

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript) |
| Database & Auth | Supabase (Postgres + RLS + Auth) |
| Payments | Stripe |
| Deployment | Cloudflare Workers (via @opennextjs/cloudflare) |

## Features

- Member profiles and role-based authentication
- Events with registration, ticketing, and approval workflow
- Stripe payment integration (online + cash at event)
- QR code tickets and NFC bracelet check-in system
- Study groups with attendance tracking
- Admin dashboard with analytics
- Sermon library and livestream configuration
- Google Calendar and Facebook auto-publishing
- Role-based access control (super_admin, leadership, event_manager, group_leader, checkin_staff, volunteer, member)

## Project Structure

```
church-management/
├── frontend/          # Next.js application (deploy this)
│   ├── src/
│   │   ├── app/       # App Router pages + API routes
│   │   ├── components/
│   │   ├── hooks/
│   │   └── lib/
│   ├── wrangler.toml  # Cloudflare Workers config
│   └── package.json
├── supabase/
│   ├── schema.sql     # Main schema - run this first
│   └── migrations/    # Phase migrations - run in order
├── backend/           # Legacy Python FastAPI (deprecated - replaced by Next.js API routes)
└── .env.example       # Environment variable template
```

## Local Development

### Prerequisites

- Node.js 18+
- A Supabase project (supabase.com)
- A Stripe account (stripe.com)

### 1. Clone and install

```bash
git clone https://gitlab.com/casa-painii-group1/church-management.git
cd church-management/frontend
npm install
```

### 2. Configure environment variables

Create `frontend/.env.local` (copy from `.env.example` at the repo root):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Set up the database

In your Supabase SQL Editor, run these files **in order**:

1. `supabase/schema.sql` - main schema, RLS policies, seed data
2. `supabase/migrations/phase1_payments.sql` - cash payment columns
3. `supabase/migrations/phase2_bracelets.sql` - NFC bracelet inventory
4. `supabase/migrations/phase3_event_planning.sql` - event approval workflow
5. `supabase/migrations/phase5_integrations.sql` - Google/Facebook integration tokens
6. `supabase/migrations/phase6_bracelet_history.sql` - bracelet assignment history
7. `supabase/migrations/phase7_schema_fixes.sql` - study_groups column alignment
8. `supabase/migrations/phase8_missing_tables.sql` - social_media, contact_messages

Then promote yourself to super admin:

```sql
UPDATE public.profiles SET role = 'super_admin' WHERE email = 'your@email.com';
```

Create the Storage bucket manually in Supabase dashboard:
- Storage > New bucket > Name: **posters** > Public: **enabled**

### 4. Run locally

```bash
cd frontend
npm run dev
```

Open http://localhost:3000

---

## Cloudflare Deployment

This project deploys as a **Cloudflare Worker** using `@opennextjs/cloudflare`.

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Build for Cloudflare

```bash
cd frontend
npm install
npm run build:cf
```

This runs `npx @opennextjs/cloudflare build` which produces `.open-next/`.

### 3. Deploy

```bash
wrangler deploy
```

Or connect your GitLab repository to Cloudflare Workers in the dashboard:
- **Framework**: Next.js (via OpenNext)
- **Build command**: `cd frontend && npm install && npx @opennextjs/cloudflare build`
- **Output**: handled by wrangler.toml

### 4. Set environment variables in Cloudflare

Go to **Cloudflare Workers > your worker > Settings > Variables** and add:

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `STRIPE_SECRET_KEY` | Yes (payments) | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes (payments) | Stripe webhook signing secret |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `GOOGLE_CALENDAR_ID` | No | Google Calendar ID (default: `primary`) |
| `FB_PAGE_ID` | No | Facebook Page ID |
| `FB_PAGE_ACCESS_TOKEN` | No | Facebook Page access token |
| `EVENT_TIMEZONE` | No | Timezone for events (default: `Europe/Bucharest`) |

### 5. Configure Stripe webhook

In the Stripe Dashboard:

1. Go to **Developers > Webhooks > Add endpoint**
2. URL: `https://your-worker.workers.dev/api/payments/webhook`
3. Events to listen for: `checkout.session.completed`
4. Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET`

### 6. Configure Google Calendar OAuth (optional)

In Google Cloud Console:

1. Create a project and enable the **Google Calendar API**
2. Create **OAuth 2.0 credentials** (Web application)
3. Add authorized redirect URI: `https://your-worker.workers.dev/api/oauth/calendar/callback`
4. Copy Client ID and Secret and set as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
5. In the admin panel, go to **Integrations** and click **Connect Google Calendar**

---

## Required Cloudflare Resources

- **Cloudflare Workers** - hosts the Next.js app and API routes

No D1, R2, KV, or other Cloudflare resources are needed. Supabase handles the database, auth, and file storage.

---

## Database Schema Overview

All tables have Row Level Security (RLS) enabled.

| Table | Description |
|---|---|
| `profiles` | User profiles with roles |
| `events` | Church events with approval workflow |
| `ticket_types` | Ticket packages per event |
| `registrations` | Event registrations with QR tokens |
| `checkins` | Entry and meal check-in records |
| `bracelets` | NFC bracelet inventory |
| `bracelet_assignments` | Bracelet assignment history |
| `study_groups` | Small groups |
| `group_members` | Group membership |
| `group_meetings` | Meeting records |
| `group_attendance` | Per-meeting attendance |
| `sermons` | Sermon library |
| `livestream_config` | Live stream settings |
| `payment_transactions` | Stripe payment records |
| `notifications` | In-app notifications |
| `social_media` | Social media links |
| `contact_messages` | Contact form submissions |
| `integration_tokens` | Google/Facebook OAuth tokens |

## Roles

| Role | Access |
|---|---|
| `super_admin` | Full access to everything |
| `leadership` | Full admin access |
| `event_manager` | Manage events and check-in |
| `group_leader` | Manage their own group |
| `checkin_staff` | Check-in and bracelet operations |
| `volunteer` | Basic member access |
| `member` | Own profile and registrations |
