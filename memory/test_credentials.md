# Test Credentials

## Supabase (CONFIGURED — live project)
- Project ref: ptayzwskyjtomnitkfur
- NEXT_PUBLIC_SUPABASE_URL=https://ptayzwskyjtomnitkfur.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_WtTnXg3UZIBKjVMBclp4hw_JngerNO1  (publishable/public key)
- RLS enabled on all tables. Role helpers: is_admin()/is_staff(). handle_new_user trigger auto-creates profiles on signup.

## App admin account
- Email: luca2009moldovan17@gmail.com  (email_confirmed = yes, role = super_admin)
- Password: owned by user (NOT shared with agent) — agent cannot E2E test authenticated/admin flows without it.

## Notes
- Email confirmation is ENABLED in Supabase. New signups must confirm before login (or owner can set
  auth.users.email_confirmed_at manually). If a user's profile row is missing/role null, upsert by id:
    insert into public.profiles (id,email,role) select id,email,'super_admin' from auth.users where email='...'
    on conflict (id) do update set role='super_admin', email=excluded.email;
- Seeded data: 6 events + 10 event_packages; study_groups seed provided (user runs manually).
