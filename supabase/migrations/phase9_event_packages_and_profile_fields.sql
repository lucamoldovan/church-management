-- =====================================================================
-- PHASE 9 — Canonical table names + missing profile columns
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
--
-- Resolves:
--   1. event_packages vs ticket_types: the entire frontend queries
--      event_packages. This migration makes event_packages the real
--      physical table and ticket_types a compatibility view.
--   2. registrations.package_id: the register page inserts package_id
--      but the schema only had ticket_type_id.
--   3. profiles: adds date_of_birth, department, emergency_contact
--      which the profile UI reads and writes.
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. EVENT PACKAGES
-- If ticket_types exists as a real table (from schema.sql fresh run),
-- rename it to event_packages. If event_packages already exists, skip.
-- -----------------------------------------------------------------------
do $$ begin
  -- Only rename if ticket_types exists AND event_packages does not
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ticket_types'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'event_packages'
  ) then
    alter table public.ticket_types rename to event_packages;
  end if;
end $$;

-- If event_packages still doesn't exist (e.g. neither table was created),
-- create it from scratch.
create table if not exists public.event_packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  capacity int default 0,
  attendance_type text default 'full',   -- full, partial, day_pass
  includes_meals boolean default false,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- Enable RLS on event_packages (idempotent)
alter table public.event_packages enable row level security;

-- Drop old policy names that may reference ticket_types
drop policy if exists ticket_types_read on public.event_packages;
drop policy if exists ticket_types_write on public.event_packages;
drop policy if exists event_packages_read on public.event_packages;
drop policy if exists event_packages_write on public.event_packages;

create policy event_packages_read on public.event_packages
  for select using (true);
create policy event_packages_write on public.event_packages
  for all using (public.is_staff()) with check (public.is_staff());

-- Create ticket_types as a view so schema.sql seed data (which inserts
-- into ticket_types) still works on a fresh DB run after this migration.
-- Drop the view first if it already exists.
drop view if exists public.ticket_types;
create or replace view public.ticket_types as
  select * from public.event_packages;

-- -----------------------------------------------------------------------
-- 2. REGISTRATIONS: add package_id column
-- The register page inserts package_id (FK to event_packages).
-- The schema had ticket_type_id; keep both for compatibility.
-- -----------------------------------------------------------------------
alter table public.registrations
  add column if not exists package_id uuid references public.event_packages(id) on delete set null;

-- Backfill package_id from ticket_type_id where package_id is null
update public.registrations
  set package_id = ticket_type_id
  where package_id is null and ticket_type_id is not null;

-- -----------------------------------------------------------------------
-- 3. PROFILES: add missing columns used by the profile UI
-- -----------------------------------------------------------------------
alter table public.profiles
  add column if not exists date_of_birth date;
alter table public.profiles
  add column if not exists department text;
alter table public.profiles
  add column if not exists emergency_contact text;
