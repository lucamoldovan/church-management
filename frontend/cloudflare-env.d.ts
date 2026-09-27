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
    }
  }
}

export {}
