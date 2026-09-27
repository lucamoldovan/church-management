-- =====================================================================
-- PHASE 8 — Missing tables: social_media, contact_messages
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- =====================================================================

-- social_media: used by contact page, live page, and admin social page.
-- (schema.sql created social_links; the frontend uses social_media)
create table if not exists public.social_media (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text,
  is_active boolean default true,
  display_order int default 0
);
alter table public.social_media enable row level security;
drop policy if exists social_media_read on public.social_media;
create policy social_media_read on public.social_media for select using (true);
drop policy if exists social_media_admin on public.social_media;
create policy social_media_admin on public.social_media for all
  using (public.is_admin()) with check (public.is_admin());

-- Seed social media links (only if table is empty)
insert into public.social_media (platform, url, is_active, display_order)
select * from (values
  ('youtube',   'https://www.youtube.com/@BisericaCasaPainii', true,  1),
  ('facebook',  'https://www.facebook.com/CasaPainii.OcnaMures/', true, 2),
  ('instagram', '', false, 3),
  ('tiktok',    '', false, 4),
  ('whatsapp',  '', false, 5)
) as v(platform, url, is_active, display_order)
where not exists (select 1 from public.social_media);

-- contact_messages: used by the contact form
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists contact_insert on public.contact_messages;
create policy contact_insert on public.contact_messages for insert with check (true);
drop policy if exists contact_admin_read on public.contact_messages;
create policy contact_admin_read on public.contact_messages for select using (public.is_admin());
