import { getCloudflareContext } from '@opennextjs/cloudflare'
import { betterAuth } from 'better-auth'

export function getAuth() {
  const { env } = getCloudflareContext()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || env.APP_BASE_URL || undefined
  const googleClientId = process.env.GOOGLE_CLIENT_ID
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

  return betterAuth({
    database: env.CHURCH_DB,
    baseURL: appUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      sendResetPassword: async ({ user, url }) => {
        if (!env.EMAIL) {
          console.error('[auth] Cloudflare Email Service binding EMAIL is not configured.')
          return
        }
        await env.EMAIL.send({
          to: user.email,
          from: process.env.AUTH_EMAIL_FROM || 'noreply@casapainii.ro',
          subject: 'Resetează parola — Casa Pâinii',
          text: `Salut ${user.name},\n\nResetează parola folosind acest link:\n${url}\n\nDacă nu ai cerut resetarea parolei, ignoră acest email.`,
          html: `<p>Salut ${user.name},</p><p>Poți reseta parola folosind butonul de mai jos:</p><p><a href="${url}">Resetează parola</a></p><p>Dacă nu ai cerut resetarea parolei, ignoră acest email.</p>`,
        })
      },
    },
    socialProviders: googleClientId && googleClientSecret ? {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      },
    } : undefined,
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
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const now = new Date().toISOString()
            await env.CHURCH_DB.prepare(`
              INSERT OR IGNORE INTO profiles (id, full_name, email, role, created_at)
              VALUES (?, ?, ?, 'member', ?)
            `).bind(user.id, user.name, user.email, now).run()
          },
        },
      },
    },
    advanced: {
      database: {
        validateSchema: false,
      },
    },
    telemetry: { enabled: false },
  })
}
