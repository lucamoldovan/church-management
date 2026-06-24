-- =====================================================================
-- CONSOLIDATED MIGRATION — Phases 2, 3, 5 (Phase 1 already applied)
-- Run once in Supabase SQL Editor. Idempotent / safe to re-run.
-- =====================================================================

-- ---------- PHASE 2: NFC Bracelets ----------
create table if not exists public.bracelets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text,
  active boolean default true,
  created_at timestamptz not null default now()
);
alter table public.bracelets enable row level security;
drop policy if exists bracelets_staff on public.bracelets;
create policy bracelets_staff on public.bracelets for all using (public.is_staff()) with check (public.is_staff());
alter table public.registrations add column if not exists bracelet_code text;
alter table public.registrations add column if not exists bracelet_assigned_at timestamptz;
create unique index if not exists registrations_event_bracelet_uniq
  on public.registrations (event_id, bracelet_code) where bracelet_code is not null;

-- ---------- PHASE 3: Event planning + approval ----------
alter table public.events add column if not exists expected_attendance int;
alter table public.events add column if not exists budget_notes text;
alter table public.events add column if not exists resource_notes text;
alter table public.events add column if not exists facility_requirements text[] default '{}';
alter table public.events add column if not exists poster_url text;
alter table public.events add column if not exists review_comments text;
alter table public.events add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.events add column if not exists reviewed_at timestamptz;

-- storage policies for 'posters' bucket (bucket already created)
drop policy if exists posters_read on storage.objects;
create policy posters_read on storage.objects for select using (bucket_id = 'posters');
drop policy if exists posters_insert on storage.objects;
create policy posters_insert on storage.objects for insert to authenticated with check (bucket_id = 'posters');
drop policy if exists posters_update on storage.objects;
create policy posters_update on storage.objects for update to authenticated using (bucket_id = 'posters');
drop policy if exists posters_delete on storage.objects;
create policy posters_delete on storage.objects for delete to authenticated using (bucket_id = 'posters');

-- ---------- PHASE 5: Auto-publishing integrations ----------
create table if not exists public.integration_tokens (
  provider text primary key,
  tokens jsonb default '{}'::jsonb,
  config jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.integration_tokens enable row level security;
drop policy if exists integ_read on public.integration_tokens;
create policy integ_read on public.integration_tokens for select using (public.is_admin());
alter table public.events add column if not exists publish_google boolean default false;
alter table public.events add column if not exists publish_facebook boolean default false;
alter table public.events add column if not exists google_event_id text;
alter table public.events add column if not exists facebook_post_id text;
alter table public.events add column if not exists publish_log jsonb default '{}'::jsonb;
