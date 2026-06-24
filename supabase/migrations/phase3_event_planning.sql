-- =====================================================================
-- PHASE 3 — Event Request & Planning + Approval workflow
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- =====================================================================

-- Planning / proposal fields on events
alter table public.events add column if not exists expected_attendance int;
alter table public.events add column if not exists budget_notes text;        -- budget requirements
alter table public.events add column if not exists resource_notes text;      -- free-text resource needs
alter table public.events add column if not exists facility_requirements text[] default '{}'; -- checklist
alter table public.events add column if not exists poster_url text;          -- (already exists in most envs)

-- Approval review fields
alter table public.events add column if not exists review_comments text;
alter table public.events add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.events add column if not exists reviewed_at timestamptz;

-- status values: draft | submitted | under_review | approved | rejected | published

-- ---------------------------------------------------------------------
-- STORAGE: 'posters' bucket policies (bucket itself already created)
-- ---------------------------------------------------------------------
drop policy if exists posters_read on storage.objects;
create policy posters_read on storage.objects for select using (bucket_id = 'posters');
drop policy if exists posters_insert on storage.objects;
create policy posters_insert on storage.objects for insert to authenticated with check (bucket_id = 'posters');
drop policy if exists posters_update on storage.objects;
create policy posters_update on storage.objects for update to authenticated using (bucket_id = 'posters');
drop policy if exists posters_delete on storage.objects;
create policy posters_delete on storage.objects for delete to authenticated using (bucket_id = 'posters');
