-- =====================================================================
-- PHASE 6 — Bracelet usage history (assignment audit log per event)
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- Bracelet display states (unassigned/assigned/active/deactivated) are
-- DERIVED from bracelets.active + registrations.bracelet_code/checked_in,
-- so no enum column is needed.
-- =====================================================================

create table if not exists public.bracelet_assignments (
  id uuid primary key default gen_random_uuid(),
  bracelet_code text not null,
  registration_id uuid references public.registrations(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  attendee_id text,
  attendee_name text,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);
create index if not exists bracelet_assignments_code_idx on public.bracelet_assignments (bracelet_code);
create index if not exists bracelet_assignments_event_idx on public.bracelet_assignments (event_id);

alter table public.bracelet_assignments enable row level security;
drop policy if exists ba_staff on public.bracelet_assignments;
create policy ba_staff on public.bracelet_assignments for all
  using (public.is_staff()) with check (public.is_staff());
