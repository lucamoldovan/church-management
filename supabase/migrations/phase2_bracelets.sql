-- =====================================================================
-- PHASE 2 — NFC Bracelet inventory & check-in assignment
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- =====================================================================

-- Pre-made bracelet inventory. `code` = the scannable NFC/QR code printed on the band.
create table if not exists public.bracelets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  active boolean default true,
  created_at timestamptz not null default now()
);

alter table public.bracelets enable row level security;
drop policy if exists bracelets_staff on public.bracelets;
create policy bracelets_staff on public.bracelets for all
  using (public.is_staff()) with check (public.is_staff());

-- Bracelet assigned to an attendee for a specific event (at check-in).
alter table public.registrations add column if not exists bracelet_code text;
alter table public.registrations add column if not exists bracelet_assigned_at timestamptz;

-- A bracelet can only be assigned to one attendee per event.
create unique index if not exists registrations_event_bracelet_uniq
  on public.registrations (event_id, bracelet_code) where bracelet_code is not null;
