# Casa Pâinii — Church Management Platform

## Stack
Frontend: Next.js 16 (App Router, TS) + Supabase (Postgres + Auth + RLS) — supervisor `yarn start` → `next dev -p 3000`.
Backend: FastAPI at /app/backend on :8001 (supervisor), ONLY for Stripe payments. Frontend calls same-origin `/api/*` → ingress → 8001.
Supabase ref: ptayzwskyjtomnitkfur. Frontend .env: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY (publishable).
Backend .env: STRIPE_API_KEY=sk_test_emergent (system), SUPABASE_URL, SUPABASE_SERVICE_KEY (sb_secret_..., server-side only).

## DB (Supabase, RLS on all). Roles: super_admin, leadership, event_manager, group_leader, checkin_staff, volunteer, member.
Tables: profiles, events, event_packages(=ticket types), registrations(+event_id,package_id,qr_token,checked_in_at),
checkins(entry+meal duplicate-proof), study_groups, group_memberships, group_attendance, group_announcements,
sermons, livestream_config, social_media, notifications, payment_transactions, contact_messages.
Helpers: current_role_name()/is_admin()/is_staff(); handle_new_user trigger (auto profile on signup).
Super admin: luca2009moldovan17@gmail.com.

## Implemented (June 2026)
- UI redesign (navy theme, Outfit/DM Sans).
- Public: Home (DB events + hero carousel), Events (search/filter, DB), Event detail (+packages), About (/about), Contact (/contact, form→contact_messages + social + map), Groups (/groups), Watch Live.
- Auth: email/password + Google OAuth; password reset (/reset-password) + update (/update-password); auto-profile.
- Member: register → ticket; **paid tickets → Stripe Checkout** → /payment/success polls /api/payments/status → marks paid; Dashboard with **QR code** tickets; Profile (/profile).
- Study Groups: browse, join request, leader approve/attendance/announcements.
- Admin (role-gated): Overview, Events CRUD (+approval status), Approvals queue, Groups CRUD, Check-in (QR/NFC code + meal tracking, duplicate-proof), Sermons CRUD, Livestream config, Social media, Notifications broadcast (in-app), Analytics (revenue/tickets/checkins/per-event), Users roles.
- Stripe backend: POST /api/payments/checkout (server-derived amount), GET /api/payments/status/{id}, POST /api/webhook/stripe. VERIFIED creating live test sessions.

## Spec expansion — Phases 1–5 (June 24 2026)
**LIVE SCHEMA NOTE:** live DB uses `event_packages` (not ticket_types) and `events` has columns date/time/price/department(text). schema.sql is stale — trust the live DB.
- **Phase 1 — Payment options:** registration offers Online (Stripe) vs "Pay at event" (cash). New cols on registrations: payment_method, amount_paid, paid_at, paid_by. Statuses: unpaid|pending|paid|partial. Staff "Încasează numerar" at check-in. New Admin → Participanți (/admin/attendees) with payment-status filter + inline cash collection. (Phase 1 migration APPLIED.)
- **Phase 2 — NFC bracelets:** new `bracelets` inventory table; registrations gain bracelet_code + bracelet_assigned_at (unique per event). Admin → Brățări (/admin/bracelets): bulk add, filter, release/reassign, activate. Check-in assigns bracelet by scanning bracelet or attendee QR (held-bracelet flow). No bracelet generated at registration (digital QR kept).
- **Phase 3 — Event request & approval:** events gain expected_attendance, budget_notes, resource_notes, facility_requirements[], review_comments, reviewed_by/at. Admin → Evenimente form is now a full proposal form with **poster upload to Supabase Storage bucket `posters`** + facility checklist (lib/eventOptions.ts). Approvals page shows full request details + statuses + comments + "Cere modificări".
- **Phase 4 — Planning dashboard:** /admin/planning — pending/approved/upcoming counts, resource allocation, upcoming list, and **conflict detection** (same-date shared facility or location).
- **Phase 5 — Auto-publishing:** backend `integrations.py` — Google Calendar OAuth (connect + push) and Facebook Page photo post. `integration_tokens` table; events gain publish_google/publish_facebook/google_event_id/facebook_post_id/publish_log. Admin → Integrări (/admin/integrations) shows status + Google connect. Approvals "Publică pe canale" triggers POST /api/events/{id}/publish. Degrades gracefully when keys absent. Future channels (Instagram/WhatsApp/Email/Push) stubbed in UI.

## ⚠️ Pending user actions
- Run `/app/supabase/migrations/_consolidated_phases_2_3_5.sql` in Supabase SQL Editor (Phase 1 already applied).
- Phase 5 credentials (backend/.env): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (+register redirect `{BASE}/api/oauth/calendar/callback`), optional GOOGLE_CALENDAR_ID; FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN.
- Provide a staff test login (or disable email confirm) so admin/auth flows can be auto-tested. NOT yet E2E tested by agent.

## Verified
- All routes HTTP 200. Public events/live render live DB data. Stripe checkout session creation verified via curl.
- NOT auto-tested E2E: authenticated/admin UI flows (email confirmation on; agent has no confirmed password). Owner verifying manually.

## Remaining / backlog
- Notifications: email/push/WhatsApp (only in-app built; email provider deferred by user).
- Event extras: poster/media upload (object storage), multi-ticket cart, capacity/deadline enforcement.
- Refund UI + invoice PDF (payment_transactions table ready; Stripe refund endpoint TODO).
- Apple OAuth (needs Apple dev account).
- In-app notification bell in navbar (broadcast + storage done; bell UI TODO).

## Action needed from user
- Run contact_messages SQL (provided in chat) for the contact form to save.
- To E2E test admin/auth: disable Confirm email in Supabase OR share a confirmed test login.
- Local runs: after each push, `git pull` + `npm install` in frontend/ (new deps: qrcode.react).
