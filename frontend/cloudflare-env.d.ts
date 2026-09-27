interface CloudflareEnv {
  CHURCH_DB: D1Database
  MEDIA: R2Bucket
  EMAIL: SendEmail
  EMAIL_FROM?: string
  BETTER_AUTH_EMAIL_FROM?: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_CALENDAR_ID?: string
  FB_PAGE_ID?: string
  FB_PAGE_ACCESS_TOKEN?: string
  YOUTUBE_API_KEY?: string
  YOUTUBE_CHANNEL_ID?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}
