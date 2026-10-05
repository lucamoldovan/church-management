interface CloudflareEnv {
  CHURCH_DB: D1Database
  MEDIA: R2Bucket
  EMAIL: SendEmail
  APP_BASE_URL?: string
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_APP_URL?: string
      BETTER_AUTH_SECRET?: string
      GOOGLE_CLIENT_ID?: string
      GOOGLE_CLIENT_SECRET?: string
      APPLE_CLIENT_ID?: string
      APPLE_TEAM_ID?: string
      APPLE_KEY_ID?: string
      APPLE_PRIVATE_KEY?: string
      APPLE_APP_BUNDLE_IDENTIFIER?: string
      AUTH_EMAIL_FROM?: string
      BOOTSTRAP_ADMIN_EMAIL?: string
    }
  }
}

export {}
