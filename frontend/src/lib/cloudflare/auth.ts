import { getCloudflareContext } from '@opennextjs/cloudflare'
import { betterAuth } from 'better-auth'

/**
 * Cloudflare-native auth factory.
 * Better Auth receives the request-scoped D1 binding directly.
 * Do not create a global auth/database instance: Workers bindings are request-scoped.
 */
export function getAuth() {
  const { env } = getCloudflareContext()

  return betterAuth({
    database: env.CHURCH_DB,
    baseURL: process.env.NEXT_PUBLIC_APP_URL || undefined,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'member',
          input: false,
          returned: true,
        },
      },
    },
    advanced: {
      database: {
        validateSchema: false,
      },
    },
    telemetry: {
      enabled: false,
    },
  })
}
