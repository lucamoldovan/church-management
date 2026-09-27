interface CloudflareEnv {
  CHURCH_DB: D1Database
  MEDIA: R2Bucket
  EMAIL: SendEmail
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}
