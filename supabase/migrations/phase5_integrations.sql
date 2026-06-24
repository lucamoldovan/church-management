-- =====================================================================
-- PHASE 5 — Auto-publishing integrations (Google Calendar, Facebook)
-- + architecture hooks for future channels.
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- =====================================================================

-- Stored OAuth tokens / config per provider (written server-side via service role).
create table if not exists public.integration_tokens (
  provider text primary key,                       -- 'google_calendar'
  tokens jsonb default '{}'::jsonb,
  config jsonb default '{}'::jsonb,                 -- e.g. {"calendar_id":"...","email":"..."}
  updated_at timestamptz default now()
);
alter table public.integration_tokens enable row level security;
drop policy if exists integ_read on public.integration_tokens;
create policy integ_read on public.integration_tokens for select using (public.is_admin());

-- Publishing flags + external references on events
alter table public.events add column if not exists publish_google boolean default false;
alter table public.events add column if not exists publish_facebook boolean default false;
alter table public.events add column if not exists google_event_id text;
alter table public.events add column if not exists facebook_post_id text;
alter table public.events add column if not exists publish_log jsonb default '{}'::jsonb;
