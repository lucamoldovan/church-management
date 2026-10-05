# Production readiness

## Required Cloudflare resources

Configure these Worker bindings in production:

- `CHURCH_DB` — D1 database
- `MEDIA` — R2 bucket
- `EMAIL` — Cloudflare Email Service send binding

Do not commit production secrets or resource IDs.

## Required secrets / variables

- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `APP_BASE_URL`
- `AUTH_EMAIL_FROM`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Optional social login configuration:

- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Apple: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_APP_BUNDLE_IDENTIFIER`

## Deployment checklist

1. Apply `frontend/migrations/0001_cloudflare_native.sql` to a fresh database, or apply both `0001_cloudflare_native.sql` and `0002_security_hardening.sql` to an existing database that already has the first migration.
2. Configure R2 and Email bindings.
3. Configure all required secrets with Wrangler/Cloudflare.
4. Configure Stripe webhook delivery to `/api/payments/webhook`.
5. Configure Google and Apple OAuth redirect URLs if enabled.
6. Open `/api/health/ready`; every check must be `true`.
7. Run the GitHub Actions CI workflow and require it to pass before merging.
8. Verify email signup, email verification, password reset, Google login and Apple login where configured.
9. Test a free registration, cash registration, Stripe registration, webhook retry, check-in, bracelet assignment and bracelet release.
10. Confirm audit records are created for security-sensitive mutations.

## D1 backups

Take a D1 export before schema changes and before major production migrations. Keep backups outside the application Worker and periodically test restoring a backup into a disposable database.

Example:

```bash
npx wrangler d1 export church-management --remote --output=backups/church-management-YYYY-MM-DD.sql
```

Do not store production backup files in Git.

## Privacy

The application exposes `/api/account/export` for authenticated personal-data export and Better Auth account deletion is enabled. Deletion should be tested with both password-based and OAuth accounts before production launch.

Define a retention policy for operational records (payments, check-ins, audit logs and legal/accounting records) before launch. Data that must be retained for legal or accounting reasons should not be silently deleted with ordinary profile data.

## Security invariants

- Client input never determines registration price.
- Registration capacity is checked server-side.
- Paid events cannot be checked in until payment is recorded.
- Users cannot mutate another user's registrations, payment transactions or notifications.
- Users cannot self-approve study-group membership.
- Update/delete database operations require a filter.
- Stripe webhook events are deduplicated by event ID.
- Sensitive API routes have D1-backed rate limits.
- Audit logs are written for sensitive database mutations.
- Storage uploads are staff-only and size-limited.
