import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

const STATE_COOKIE = 'google_oauth_state'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const adminUrl = `${url.origin}/admin/integrations`
  const auth = await getAuthContext()
  if (!auth) return NextResponse.redirect(`${adminUrl}?google=unauthorized`)
  if (!isStaff(auth.role)) return NextResponse.redirect(`${adminUrl}?google=forbidden`)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = request.cookies.get(STATE_COOKIE)?.value
  const error = url.searchParams.get('error')
  const redirectUri = `${url.origin}/api/oauth/calendar/callback`

  const responseFor = (flag: string) => {
    const response = NextResponse.redirect(`${adminUrl}?google=${flag}`)
    response.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', path: '/api/oauth/calendar/callback', maxAge: 0 })
    return response
  }
  if (error || !code || !state || !expectedState || state !== expectedState) return responseFor('error')

  const env = await getEnv()
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return responseFor('error')

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const tok = await tokenRes.json() as any
    if (tok.error || !tok.access_token) return responseFor('error')

    const expiry = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString()
    tok.expiry = expiry
    await env.CHURCH_DB.prepare(
      "INSERT INTO integration_tokens (id,provider,account_id,tokens,access_token,refresh_token,expires_at,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(provider,account_id) DO UPDATE SET tokens=excluded.tokens,access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP"
    ).bind(crypto.randomUUID(), 'google_calendar', 'default', JSON.stringify(tok), tok.access_token, tok.refresh_token || null, expiry).run()

    return responseFor('connected')
  } catch {
    return responseFor('error')
  }
}
