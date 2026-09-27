import { createAuthClient } from 'better-auth/client'

/** Client-side Cloudflare-native authentication client. */
export const authClient = createAuthClient({
  basePath: '/api/auth',
})
