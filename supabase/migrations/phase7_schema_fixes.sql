-- =====================================================================
-- PHASE 7 — Schema fixes: align study_groups columns with frontend
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- =====================================================================

-- The admin groups page uses meeting_day, meeting_time, meeting_location,
-- and is_active. The original schema used day_of_week, time_label, location.
-- Add the expected columns (keeping old ones for backward compat).
alter table public.study_groups add column if not exists meeting_day text;
alter table public.study_groups add column if not exists meeting_time text;
alter table public.study_groups add column if not exists meeting_location text;
alter table public.study_groups add column if not exists is_active boolean default true;
alter table public.study_groups add column if not exists member_count int default 0;

-- Backfill from old column names if they exist and new ones are null
update public.study_groups set meeting_day = day_of_week where meeting_day is null and day_of_week is not null;
update public.study_groups set meeting_time = time_label where meeting_time is null and time_label is not null;
update public.study_groups set meeting_location = location where meeting_location is null and location is not null;

-- Supabase Storage: create the 'posters' bucket if it doesn't exist.
-- NOTE: Run this manually in the Supabase dashboard if the bucket doesn't exist:
--   Storage > New bucket > Name: posters > Public: true
-- The RLS policies in phase3_event_planning.sql handle access control.

-- Fix: group_members RLS - ensure members can read their own group memberships
-- (analytics page queries group_members, not group_memberships)
drop policy if exists gm_read on public.group_members;
create policy gm_read on public.group_members for select
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.study_groups g
      where g.id = group_id and g.leader_id = auth.uid()
    )
  );
