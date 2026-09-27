import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

const SCOPES = 'https://www.googleapis.com/auth/calendar'
const STATE_COOKIE = 'google_oauth_state'

function getRedirectUri(request: NextRequest): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}/api/oauth/calendar/callback`
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const env = await getEnv()
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google credentials not configured.' }, { status: 503 })
  }

  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(request),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const response = NextResponse.json({
    authorization_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  })

  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: new URL(request.url).protocol === 'https:',
    sameSite: 'lax',
    path: '/api/oauth/calendar/callback',
    maxAge: 10 * 60,
  })

  return response
}
