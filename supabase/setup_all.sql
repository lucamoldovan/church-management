-- Casa Pâinii Church Management — Supabase one-shot setup
-- Generated from the cloudflare-migration branch.
-- Run this entire file once in Supabase SQL Editor.
-- Safe to re-run: the repository migrations are designed to be idempotent.



-- ================================================================
-- SOURCE: supabase/schema.sql
-- ================================================================

-- =====================================================================
-- Casa Pâinii — Church Platform: Full Schema (idempotent, run in Supabase SQL Editor)
-- Safe to re-run. Extends existing tables (profiles, registrations, sermons,
-- livestream_config) and adds all new modules + role-based RLS.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- PROFILES (extend existing) + ROLES
-- roles: super_admin, leadership, event_manager, group_leader, checkin_staff, volunteer, member
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists role text not null default 'member';
alter table public.profiles add column if not exists nfc_id text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists emergency_contact text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
do $$ begin
  alter table public.profiles add constraint profiles_nfc_id_key unique (nfc_id);
exception when duplicate_table or duplicate_object then null; end $$;

-- role helper (security definer to avoid RLS recursion)
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'anon');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_name() in ('super_admin','leadership');
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_name() in ('super_admin','leadership','event_manager','checkin_staff');
$$;

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- DEPARTMENTS
-- ---------------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- EVENTS (+ approval workflow fields)
-- status: draft, submitted, under_review, approved, rejected, published
-- ---------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text default 'service',           -- service, conference, camp, youth, special
  start_at timestamptz,
  end_at timestamptz,
  date_label text,                              -- human label e.g. "14-21 Iulie 2026"
  time_label text,
  location text,
  poster_url text,
  capacity int default 0,
  registration_deadline timestamptz,
  is_free boolean default true,
  base_price numeric(10,2) default 0,
  category text,
  department_id uuid references public.departments(id) on delete set null,
  expected_attendance int,
  budget_notes text,
  status text not null default 'published',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- event_packages is the canonical table name used by all frontend code.
-- ticket_types is kept as a view for backward compatibility.
create table if not exists public.event_packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  capacity int default 0,
  attendance_type text default 'full',          -- full, partial, day_pass
  includes_meals boolean default false,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create or replace view public.ticket_types as
  select * from public.event_packages;

-- ---------------------------------------------------------------------
-- REGISTRATIONS / TICKETS (extend existing)
-- ---------------------------------------------------------------------
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  event_title text,
  package_name text,
  package_price numeric(10,2) default 0,
  status text default 'confirmed',
  payment_status text default 'unpaid',
  attendee_id text,
  checked_in boolean default false,
  created_at timestamptz not null default now()
);
alter table public.registrations add column if not exists event_id uuid references public.events(id) on delete set null;
alter table public.registrations add column if not exists package_id uuid references public.event_packages(id) on delete set null;
alter table public.registrations add column if not exists ticket_type_id uuid references public.event_packages(id) on delete set null;
alter table public.registrations add column if not exists qr_token text default encode(gen_random_bytes(16),'hex');
alter table public.registrations add column if not exists checked_in_at timestamptz;
do $$ begin
  alter table public.registrations add constraint registrations_attendee_id_key unique (attendee_id);
exception when duplicate_table or duplicate_object then null; end $$;
do $$ begin
  alter table public.registrations add constraint registrations_qr_token_key unique (qr_token);
exception when duplicate_table or duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- CHECK-INS (entry + meal tracking, duplicate-proof)
-- ---------------------------------------------------------------------
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  scanned_by uuid references public.profiles(id) on delete set null,
  type text not null default 'entry',           -- entry, meal
  meal text,                                     -- breakfast, lunch, dinner (when type='meal')
  day_date date not null default current_date,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table public.checkins add constraint checkins_unique_use unique (registration_id, type, meal, day_date);
exception when duplicate_table or duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- STUDY GROUPS
-- ---------------------------------------------------------------------
create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  leader_id uuid references public.profiles(id) on delete set null,
  -- Legacy column names (kept for compat)
  day_of_week text,
  time_label text,
  location text,
  -- Column names used by all frontend code
  meeting_day text,
  meeting_time text,
  meeting_location text,
  is_active boolean default true,
  member_count int default 0,
  capacity int default 0,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',        -- pending, approved, rejected
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.group_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.group_meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  present boolean not null default true,
  unique (meeting_id, user_id)
);

create table if not exists public.group_announcements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SERMONS (extend existing) + LIVESTREAM CONFIG (exists)
-- ---------------------------------------------------------------------
create table if not exists public.sermons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  speaker text,
  date date,
  description text,
  youtube_url text,
  thumbnail_url text,
  category text,
  tags text[],
  published boolean default true,
  created_at timestamptz not null default now()
);
alter table public.sermons add column if not exists published boolean default true;

create table if not exists public.livestream_config (
  id uuid primary key default gen_random_uuid(),
  youtube_url text,
  facebook_url text,
  is_active boolean default false,
  next_stream_date timestamptz,
  next_stream_title text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SOCIAL MEDIA (used by contact page, live page, admin social page)
-- social_links kept as legacy; social_media is the active table
-- ---------------------------------------------------------------------
create table if not exists public.social_media (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text,
  is_active boolean default true,
  display_order int default 0
);

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text,
  is_active boolean default true,
  sort_order int default 0
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  type text default 'info',
  read boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  registration_id uuid references public.registrations(id) on delete set null,
  session_id text unique,
  amount numeric(10,2),
  currency text default 'ron',
  status text default 'initiated',               -- initiated, complete, expired
  payment_status text default 'pending',          -- pending, paid, failed, refunded
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.events enable row level security;
alter table public.event_packages enable row level security;
alter table public.registrations enable row level security;
alter table public.checkins enable row level security;
alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_meetings enable row level security;
alter table public.group_attendance enable row level security;
alter table public.group_announcements enable row level security;
alter table public.sermons enable row level security;
alter table public.livestream_config enable row level security;
alter table public.social_media enable row level security;
alter table public.social_links enable row level security;
alter table public.notifications enable row level security;
alter table public.contact_messages enable row level security;
alter table public.payment_transactions enable row level security;

-- PROFILES
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using (auth.uid() = id or public.is_admin());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (auth.uid() = id or public.is_admin());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- DEPARTMENTS (public read, admin write)
drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select using (true);
drop policy if exists departments_admin on public.departments;
create policy departments_admin on public.departments for all using (public.is_admin()) with check (public.is_admin());

-- EVENTS (public sees published; staff manage)
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events for select using (status = 'published' or public.is_staff() or created_by = auth.uid());
drop policy if exists events_staff_write on public.events;
create policy events_staff_write on public.events for all
  using (public.is_staff() or created_by = auth.uid())
  with check (public.is_staff() or created_by = auth.uid());

-- EVENT PACKAGES
drop policy if exists event_packages_read on public.event_packages;
create policy event_packages_read on public.event_packages for select using (true);
drop policy if exists event_packages_write on public.event_packages;
create policy event_packages_write on public.event_packages for all using (public.is_staff()) with check (public.is_staff());

-- REGISTRATIONS (own; staff read/manage all)
drop policy if exists reg_own_read on public.registrations;
create policy reg_own_read on public.registrations for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists reg_own_insert on public.registrations;
create policy reg_own_insert on public.registrations for insert with check (user_id = auth.uid());
drop policy if exists reg_own_update on public.registrations;
create policy reg_own_update on public.registrations for update using (user_id = auth.uid() or public.is_staff()) with check (true);
drop policy if exists reg_staff_all on public.registrations;
create policy reg_staff_all on public.registrations for all using (public.is_staff()) with check (public.is_staff());

-- CHECKINS (staff only)
drop policy if exists checkins_staff on public.checkins;
create policy checkins_staff on public.checkins for all using (public.is_staff()) with check (public.is_staff());

-- STUDY GROUPS (public read; admin or leader manage)
drop policy if exists groups_read on public.study_groups;
create policy groups_read on public.study_groups for select using (true);
drop policy if exists groups_admin on public.study_groups;
create policy groups_admin on public.study_groups for all
  using (public.is_admin() or leader_id = auth.uid())
  with check (public.is_admin() or leader_id = auth.uid());

-- GROUP MEMBERS (own + leader/admin)
drop policy if exists gm_read on public.group_members;
create policy gm_read on public.group_members for select
  using (user_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.study_groups g where g.id = group_id and g.leader_id = auth.uid()));
drop policy if exists gm_insert on public.group_members;
create policy gm_insert on public.group_members for insert with check (user_id = auth.uid());
drop policy if exists gm_manage on public.group_members;
create policy gm_manage on public.group_members for update
  using (public.is_admin() or exists (select 1 from public.study_groups g where g.id = group_id and g.leader_id = auth.uid()))
  with check (true);
drop policy if exists gm_delete on public.group_members;
create policy gm_delete on public.group_members for delete
  using (user_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.study_groups g where g.id = group_id and g.leader_id = auth.uid()));

-- GROUP MEETINGS / ATTENDANCE / ANNOUNCEMENTS (leader/admin manage, members read)
drop policy if exists meetings_rw on public.group_meetings;
create policy meetings_rw on public.group_meetings for all
  using (public.is_admin() or exists (select 1 from public.study_groups g where g.id = group_id and g.leader_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.study_groups g where g.id = group_id and g.leader_id = auth.uid()));
drop policy if exists meetings_read on public.group_meetings;
create policy meetings_read on public.group_meetings for select using (true);

drop policy if exists attendance_rw on public.group_attendance;
create policy attendance_rw on public.group_attendance for all
  using (public.is_admin() or exists (
    select 1 from public.group_meetings m join public.study_groups g on g.id = m.group_id
    where m.id = meeting_id and g.leader_id = auth.uid()))
  with check (true);

drop policy if exists ann_read on public.group_announcements;
create policy ann_read on public.group_announcements for select using (true);
drop policy if exists ann_write on public.group_announcements;
create policy ann_write on public.group_announcements for all
  using (public.is_admin() or exists (select 1 from public.study_groups g where g.id = group_id and g.leader_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.study_groups g where g.id = group_id and g.leader_id = auth.uid()));

-- SERMONS (public read published; admin write)
drop policy if exists sermons_read on public.sermons;
create policy sermons_read on public.sermons for select using (published = true or public.is_admin());
drop policy if exists sermons_admin on public.sermons;
create policy sermons_admin on public.sermons for all using (public.is_admin()) with check (public.is_admin());

-- LIVESTREAM CONFIG (public read; admin write)
drop policy if exists live_read on public.livestream_config;
create policy live_read on public.livestream_config for select using (true);
drop policy if exists live_admin on public.livestream_config;
create policy live_admin on public.livestream_config for all using (public.is_admin()) with check (public.is_admin());

-- SOCIAL MEDIA
drop policy if exists social_media_read on public.social_media;
create policy social_media_read on public.social_media for select using (true);
drop policy if exists social_media_admin on public.social_media;
create policy social_media_admin on public.social_media for all using (public.is_admin()) with check (public.is_admin());

-- SOCIAL LINKS (legacy)
drop policy if exists social_read on public.social_links;
create policy social_read on public.social_links for select using (true);
drop policy if exists social_admin on public.social_links;
create policy social_admin on public.social_links for all using (public.is_admin()) with check (public.is_admin());

-- CONTACT MESSAGES
drop policy if exists contact_insert on public.contact_messages;
create policy contact_insert on public.contact_messages for insert with check (true);
drop policy if exists contact_admin_read on public.contact_messages;
create policy contact_admin_read on public.contact_messages for select using (public.is_admin());

-- NOTIFICATIONS (own; admin can create for anyone)
drop policy if exists notif_own on public.notifications;
create policy notif_own on public.notifications for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (user_id = auth.uid()) with check (true);
drop policy if exists notif_admin_write on public.notifications;
create policy notif_admin_write on public.notifications for insert with check (public.is_admin() or user_id = auth.uid());

-- PAYMENTS (own read; staff read all). Writes happen server-side via service role.
drop policy if exists pay_read on public.payment_transactions;
create policy pay_read on public.payment_transactions for select using (user_id = auth.uid() or public.is_staff());

-- =====================================================================
-- SEED DATA
-- =====================================================================
insert into public.departments (name, description) values
  ('Tineret','Departamentul de tineret'),
  ('Copii','Lucrarea cu copiii'),
  ('Worship','Echipa de închinare'),
  ('Administrativ','Coordonare generală')
on conflict do nothing;

insert into public.social_media (platform, url, is_active, display_order) values
  ('youtube',   'https://www.youtube.com/@BisericaCasaPainii', true,  1),
  ('facebook',  'https://www.facebook.com/CasaPainii.OcnaMures/', true, 2),
  ('instagram', '', false, 3),
  ('tiktok',    '', false, 4),
  ('whatsapp',  '', false, 5)
on conflict do nothing;

-- Seed the 6 demo events + ticket types (only if events table is empty)
do $$
declare e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid; e6 uuid;
begin
  if not exists (select 1 from public.events) then
    insert into public.events (title, description, event_type, date_label, time_label, location, category, capacity, is_free, base_price, status)
    values
      ('Tabără de Vară 2026','O săptămână de credință, distracție și părtășie pentru toate vârstele.','camp','14-21 Iulie 2026','09:00','Ocna Mureș','Tabără',60,false,150,'published') returning id into e1;
    insert into public.events (title, description, event_type, date_label, time_label, location, category, capacity, is_free, base_price, status)
    values ('Conferință de Tineret','Conferința anuală de tineret cu worship și predici.','conference','3 August 2026','10:00','Sala principală','Conferință',200,true,0,'published') returning id into e2;
    insert into public.events (title, description, event_type, date_label, time_label, location, category, capacity, is_free, base_price, status)
    values ('Serviciu Duminical','Vino alături de noi la worship și studiul Cuvântului în fiecare dimineață de Duminică.','service','În fiecare Duminică','10:00','Casa Pâinii','Serviciu',300,true,0,'published') returning id into e3;
    insert into public.events (title, description, event_type, date_label, time_label, location, category, capacity, is_free, base_price, status)
    values ('Întâlnire de Tineret','Seară de worship, jocuri și părtășie pentru tineri.','youth','În fiecare Vineri','18:00','Casa Pâinii','Tineret',80,true,0,'published') returning id into e4;
    insert into public.events (title, description, event_type, date_label, time_label, location, category, capacity, is_free, base_price, status)
    values ('Conferință de Familie','Conferință dedicată familiilor creștine.','conference','15 Septembrie 2026','10:00','Sala principală','Conferință',120,false,50,'published') returning id into e5;
    insert into public.events (title, description, event_type, date_label, time_label, location, category, capacity, is_free, base_price, status)
    values ('Tabără de Copii','Tabără pentru copii cu activități, jocuri și studiu biblic.','camp','1-5 August 2026','09:00','Ocna Mureș','Tabără',50,false,100,'published') returning id into e6;

    -- Seed into event_packages (canonical table name)
    insert into public.event_packages (event_id, name, description, price, attendance_type, includes_meals, sort_order) values
      (e1,'Tabără completă','Toate zilele taberei, mese incluse',150,'full',true,1),
      (e1,'Weekend','Vineri seară până Duminică',80,'partial',true,2),
      (e1,'O zi','O singură zi la alegere',30,'day_pass',true,3),
      (e2,'Intrare liberă','Eveniment gratuit pentru toți tinerii',0,'full',false,1),
      (e3,'Intrare liberă','Toți sunt bineveniți',0,'full',false,1),
      (e4,'Intrare liberă','Gratuit pentru toți tinerii',0,'full',false,1),
      (e5,'Familie','Până la 4 membri de familie',50,'full',false,1),
      (e5,'Individual','O persoană',20,'full',false,2),
      (e6,'Tabără completă','Toate zilele, mese incluse',100,'full',true,1),
      (e6,'Jumătate','Primele sau ultimele 2 zile',60,'partial',true,2);
  end if;
end $$;

-- DONE. After running, set yourself as super admin:
--   update public.profiles set role = 'super_admin' where email = 'YOUR_EMAIL_HERE';


-- ================================================================
-- SOURCE: supabase/migrations/phase1_payments.sql
-- ================================================================

-- =====================================================================
-- PHASE 1 — Payment Options (online vs cash "pay at event")
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- Matches LIVE schema: registrations(event_packages, events.price/date/time/department).
-- =====================================================================

-- payment_method: 'online' (Stripe / future providers) | 'cash' (pay at event)
alter table public.registrations add column if not exists payment_method text default 'online';

-- amount collected so far (supports partial payments in the future)
alter table public.registrations add column if not exists amount_paid numeric(10,2) default 0;

-- when & who collected the payment (cash collected by staff at check-in)
alter table public.registrations add column if not exists paid_at timestamptz;
alter table public.registrations add column if not exists paid_by uuid references public.profiles(id) on delete set null;

-- payment_status semantics now: 'unpaid' | 'pending' | 'paid' | 'partial'
--   unpaid  = online intended, not completed
--   pending = cash, awaiting collection at the event
--   paid    = fully paid
--   partial = partially paid (future)

-- Backfill: existing paid rows get amount_paid = package_price
update public.registrations
  set amount_paid = package_price
  where payment_status = 'paid' and (amount_paid is null or amount_paid = 0);


-- ================================================================
-- SOURCE: supabase/migrations/phase2_bracelets.sql
-- ================================================================

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


-- Ensure the poster storage bucket exists before its policies are created.
insert into storage.buckets (id, name, public)
values ('posters', 'posters', true)
on conflict (id) do update set public = excluded.public;


-- ================================================================
-- SOURCE: supabase/migrations/phase3_event_planning.sql
-- ================================================================

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


-- ================================================================
-- SOURCE: supabase/migrations/phase5_integrations.sql
-- ================================================================

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


-- ================================================================
-- SOURCE: supabase/migrations/phase6_bracelet_history.sql
-- ================================================================

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


-- ================================================================
-- SOURCE: supabase/migrations/phase7_schema_fixes.sql
-- ================================================================

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


-- ================================================================
-- SOURCE: supabase/migrations/phase8_missing_tables.sql
-- ================================================================

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


-- ================================================================
-- SOURCE: supabase/migrations/phase9_event_packages_and_profile_fields.sql
-- ================================================================

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
