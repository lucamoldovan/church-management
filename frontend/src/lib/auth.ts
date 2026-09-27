import { headers } from 'next/headers'
import { getEnv } from './cloudflare'
import { betterAuth } from 'better-auth'

export interface AuthContext { userId: string; role: string | null }

export async function getAuth() {
  const env = await getEnv()
  return betterAuth({
    database: env.CHURCH_DB,
    baseURL: env.BETTER_AUTH_URL || undefined,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await env.EMAIL.send({
          to: user.email,
          from: 'noreply@yourdomain.com',
          subject: 'Resetează parola - Casa Pâinii',
          text: 'Accesează linkul pentru a reseta parola: ' + url,
          html: '<p>Accesează linkul pentru a reseta parola:</p><p><a href="' + url + '">Resetează parola</a></p>',
        })
      },
    },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    } : undefined,
    databaseHooks: {
      user: { create: { after: async (user) => {
        await env.CHURCH_DB.prepare('INSERT OR IGNORE INTO profiles (id,email,full_name,role) VALUES (?,?,?,?)')
          .bind(user.id,user.email,user.name || null,'member').run()
      }}}
    }
  })
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const auth = await getAuth()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const row = await (await getEnv()).CHURCH_DB.prepare('SELECT role FROM profiles WHERE id=?').bind(session.user.id).first<{role:string}>()
  return { userId: session.user.id, role: row?.role ?? 'member' }
}
export function isStaff(role:string|null){return ['super_admin','leadership','event_manager','checkin_staff'].includes(role??'')}
export function isAdmin(role:string|null){return ['super_admin','leadership'].includes(role??'')}
