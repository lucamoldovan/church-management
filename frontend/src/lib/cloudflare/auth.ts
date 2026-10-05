import { getCloudflareContext } from '@opennextjs/cloudflare'
import { betterAuth } from 'better-auth'
import { importPKCS8, SignJWT } from 'jose'

async function generateAppleClientSecret(clientId: string, teamId: string, keyId: string, privateKey: string) {
  const key = await importPKCS8(privateKey.replace(/\\n/g, '\n'), 'ES256')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key)
}

export function getAuth() {
  const { env } = getCloudflareContext()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || env.APP_BASE_URL || undefined
  const googleClientId = process.env.GOOGLE_CLIENT_ID
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appleClientId = process.env.APPLE_CLIENT_ID
  const appleTeamId = process.env.APPLE_TEAM_ID
  const appleKeyId = process.env.APPLE_KEY_ID
  const applePrivateKey = process.env.APPLE_PRIVATE_KEY
  const bootstrapAdminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  const socialProviders = {
    ...(googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {}),
    ...(appleClientId && appleTeamId && appleKeyId && applePrivateKey
      ? {
          apple: async () => ({
            clientId: appleClientId,
            clientSecret: await generateAppleClientSecret(
              appleClientId,
              appleTeamId,
              appleKeyId,
              applePrivateKey,
            ),
            appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER || undefined,
          }),
        }
      : {}),
  }

  return betterAuth({
    database: env.CHURCH_DB,
    baseURL: appUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
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
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        if (!env.EMAIL) {
          console.error('[auth] Cloudflare Email Service binding EMAIL is not configured.')
          return
        }
        await env.EMAIL.send({
          to: user.email,
          from: process.env.AUTH_EMAIL_FROM || 'noreply@casapainii.ro',
          subject: 'Verifică adresa de email — Casa Pâinii',
          text: `Salut ${user.name},\n\nVerifică adresa de email folosind acest link:\n${url}\n\nLinkul este valabil timp de 1 oră.`,
          html: `<p>Salut ${user.name},</p><p>Verifică adresa de email folosind butonul de mai jos:</p><p><a href="${url}">Verifică emailul</a></p><p>Linkul este valabil timp de 1 oră.</p>`,
        })
      },
    },
    trustedOrigins: [appUrl, 'https://appleid.apple.com'].filter((value): value is string => Boolean(value)),
    socialProviders: Object.keys(socialProviders).length ? socialProviders : undefined,
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'member', input: false, returned: true },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const now = new Date().toISOString()
            const role = bootstrapAdminEmail && user.email.toLowerCase() === bootstrapAdminEmail ? 'super_admin' : 'member'
            await env.CHURCH_DB.prepare(`INSERT OR IGNORE INTO profiles (id, full_name, email, role, created_at) VALUES (?, ?, ?, ?, ?)`)
              .bind(user.id, user.name, user.email, role, now).run()
            if (role === 'super_admin') await env.CHURCH_DB.prepare('UPDATE user SET role = ? WHERE id = ?').bind(role, user.id).run()
          },
        },
      },
    },
    advanced: { database: { validateSchema: false } },
    telemetry: { enabled: false },
  })
}
