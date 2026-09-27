import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''

async function sbFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const redirectUri = `${url.protocol}//${url.host}/api/oauth/calendar/callback`
  const adminUrl = `${url.protocol}//${url.host}/admin/integrations`

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!code || !clientId || !clientSecret) {
    return NextResponse.redirect(`${adminUrl}?google=error`)
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tok = await tokenRes.json()
    if (tok.error || !tok.access_token) {
      return NextResponse.redirect(`${adminUrl}?google=error`)
    }

    const expiry = new Date(
      Date.now() + (tok.expires_in || 3600) * 1000
    ).toISOString()
    tok.expiry = expiry

    await sbFetch('integration_tokens', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'google_calendar',
        tokens: tok,
        updated_at: new Date().toISOString(),
      }),
    })

    return NextResponse.redirect(`${adminUrl}?google=connected`)
  } catch {
    return NextResponse.redirect(`${adminUrl}?google=error`)
  }
}
