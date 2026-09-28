import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { dbFindOne, dbInsert, dbUpdate } from '@/lib/cloudflare/api-db'

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

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return responseFor('error')
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const tok = await tokenRes.json()
    if (tok.error || !tok.access_token) return responseFor('error')
    tok.expiry = new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString()
    const existing = await dbFindOne('integration_tokens', { provider: 'google_calendar' })
    if (existing) await dbUpdate('integration_tokens', { tokens: tok, updated_at: new Date().toISOString() }, { provider: 'google_calendar' })
    else await dbInsert('integration_tokens', { provider: 'google_calendar', tokens: tok, updated_at: new Date().toISOString() })
    return responseFor('connected')
  } catch {
    return responseFor('error')
  }
}
