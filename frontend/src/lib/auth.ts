import { headers } from 'next/headers'
import { getEnv } from './cloudflare'
import { betterAuth } from 'better-auth'

export interface AuthContext {
  userId: string
  role: string | null
}

interface EmailBinding {
  send(message: { to: string; from: string; subject: string; html?: string; text?: string }): Promise<unknown>
}

export async function getAuth() {
  const env = await getEnv()
  const emailBinding = (env as CloudflareEnv & { EMAIL?: EmailBinding }).EMAIL
  const emailFrom = (env as CloudflareEnv & { BETTER_AUTH_EMAIL_FROM?: string }).BETTER_AUTH_EMAIL_FROM

  return betterAuth({
    database: env.CHURCH_DB,
    baseURL: env.BETTER_AUTH_URL || undefined,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        if (!emailBinding || !emailFrom) {
          throw new Error('Password reset email is not configured')
        }
        await emailBinding.send({
          to: user.email,
          from: emailFrom,
          subject: 'Resetează parola — Casa Pâinii',
          html: `<p>Salut, ${user.name || ''}!</p><p>Folosește butonul de mai jos pentru a seta o parolă nouă:</p><p><a href="${url}">Resetează parola</a></p><p>Dacă nu ai cerut această resetare, poți ignora acest email.</p>`,
          text: `Resetează parola: ${url}`,
        })
      },
    },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    } : undefined,
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await env.CHURCH_DB
              .prepare('INSERT OR IGNORE INTO profiles (id,email,full_name,role) VALUES (?,?,?,?)')
              .bind(user.id, user.email, user.name || null, 'member')
              .run()
          },
        },
      },
    },
  })
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const auth = await getAuth()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const row = await (await getEnv()).CHURCH_DB
    .prepare('SELECT role FROM profiles WHERE id=?')
    .bind(session.user.id)
    .first<{ role: string }>()

  return { userId: session.user.id, role: row?.role ?? 'member' }
}

export function isStaff(role: string | null) {
  return ['super_admin', 'leadership', 'event_manager', 'checkin_staff'].includes(role ?? '')
}

export function isAdmin(role: string | null) {
  return ['super_admin', 'leadership'].includes(role ?? '')
}
