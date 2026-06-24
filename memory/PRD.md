# Casa Pâinii — Church Management Platform

## Stack
Next.js 16 (App Router, TS) + Supabase (Postgres + Auth + RLS). Runs via supervisor: `yarn start` → `next dev -p 3000`.
Supabase project ref: ptayzwskyjtomnitkfur. Keys in /app/frontend/.env (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY = publishable).

## Database (applied via SQL editor by user)
Existing tables: profiles (id, full_name, email, phone, date_of_birth, emergency_contact, department, photo_url, role, nfc_id),
events (title, description, location, date, time, capacity, price, category, poster_url, status, department, created_by),
event_packages (= ticket types: event_id, name, price, description), registrations (event_title, user_id, package_name,
package_price, status, payment_status, attendee_id, checked_in + ADDED: event_id, package_id, qr_token, checked_in_at),
study_groups (leader_id, meeting_day, meeting_time, meeting_location, capacity, member_count, is_active),
group_memberships (group_id, user_id, status), group_attendance (group_id, user_id, meeting_date, present),
group_announcements (group_id, leader_id, title, content), sermons, livestream_config, social_media (platform, url, is_active, display_order).
ADDED tables: checkins (entry+meal, duplicate-proof), notifications, payment_transactions.
ADDED: role helpers current_role_name()/is_admin()/is_staff(), handle_new_user trigger (auto profile on signup),
full RBAC RLS on all tables. Roles: super_admin, leadership, event_manager, group_leader, checkin_staff, volunteer, member.
Migration files: /app/supabase/schema.sql (v1, superseded) — actual applied SQL pasted in chat (reconciled v2).
Super admin: luca2009moldovan17@gmail.com.

## Implemented — Phase 1 (June 2026)
- Warm→navy UI redesign (Outfit/DM Sans, oklch tokens) across all pages.
- DB-backed Events: home hero/grid, events list (search+filter), event detail (+packages) — all read from Supabase.
- Registration writes to registrations with event_id/package_id/qr_token; dashboard shows QR code (qrcode.react) per ticket.
- Auth: email/password + Google OAuth (existing); ADDED password reset (/reset-password) + set new (/update-password); profile auto-created on signup via trigger.
- Profile page (/profile): edit name, phone, dob, department, emergency contact; shows role + nfc_id.
- Role-aware Navbar (Admin/Dashboard/Profile/Logout when logged in).
- Admin panel (role-gated, staff only): overview stats, Events CRUD (+status workflow draft→published), Users role management.

## NOT yet built (next phases) — user requested "build everything"
- P0 Study Groups UI: browse, join request, leave, leader approve/manage members, per-meeting attendance, announcements.
- P0 Check-in: QR/NFC scanner UI (camera), duplicate prevention, meal tracking (breakfast/lunch/dinner per day by ticket type) — tables ready (checkins).
- P0 Stripe payments: checkout for paid tickets, webhook → payment_status, refunds, invoices, payment history. Needs server layer (FastAPI at /app/backend OR Next route handlers) + Supabase service_role key + STRIPE key (system key available).
- P1 Admin: Sermons CRUD, Livestream config, Social media links, Event approvals queue, Departments, Attendance analytics dashboards.
- P1 Event extras: poster/media upload (object storage), multi-ticket cart, registration deadline enforcement, capacity enforcement.
- P2 Notifications (deferred by user): email (Resend/SendGrid) + in-app + push + WhatsApp. notifications table ready.
- Deferred: Apple OAuth (needs Apple dev account).

## Testing notes
- Email confirmation is ENABLED in Supabase → can't E2E test authenticated/admin flows without a confirmed login.
- Public DB-backed pages testable after running the events seed (provided in chat).
