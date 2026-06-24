# Test Credentials

## Supabase (CONFIGURED — live project)
- Project ref: ptayzwskyjtomnitkfur
- NEXT_PUBLIC_SUPABASE_URL=https://ptayzwskyjtomnitkfur.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_WtTnXg3UZIBKjVMBclp4hw_JngerNO1  (public/publishable key — safe for client)
- Tables present with data: registrations, sermons, livestream_config. `profiles` empty.
- Public reads work (verified via /live rendering real sermon/category data).

## Auth note
- Email confirmation is ENABLED on this project → newly signed-up users must click the email link before they can log in.
- A test user was created via the signup API (UNCONFIRMED, cannot log in until verified):
  - email: qa.tester+casapainii@gmail.com
  - password: TestPass123!
- To enable full authenticated-flow testing (dashboard, event registration), either:
  (a) disable "Confirm email" in Supabase → Authentication → Providers → Email, or
  (b) provide a pre-confirmed test account.
