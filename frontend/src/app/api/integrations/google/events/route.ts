import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

async function getGoogleToken(env: CloudflareEnv) {
  const rows = await env.CHURCH_DB.prepare(
    "SELECT tokens FROM integration_tokens WHERE provider = ? AND account_id = ? LIMIT 1"
  ).bind('google_calendar', 'default').all<{ tokens: string | null }>()
  const tokens = rows.results?.[0]?.tokens ? JSON.parse(rows.results[0].tokens) : {}
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  if (tokens.refresh_token && clientId && clientSecret && (!tokens.access_token || !tokens.expiry || Date.parse(tokens.expiry) < Date.now() + 60000)) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }),
    })
    const fresh = await tokenRes.json() as any
    if (fresh.access_token) {
      Object.assign(tokens, fresh, { expiry: new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString() })
      await env.CHURCH_DB.prepare(
        "UPDATE integration_tokens SET tokens = ?, access_token = ?, refresh_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE provider = ? AND account_id = ?"
      ).bind(JSON.stringify(tokens), tokens.access_token, tokens.refresh_token || null, tokens.expiry, 'google_calendar', 'default').run()
    }
  }
  return tokens.access_token || null
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const env = await getEnv()
  const token = await getGoogleToken(env)
  if (!token) return NextResponse.json({ error: 'Google Calendar is not connected.' }, { status: 503 })

  const url = new URL(request.url)
  const calendarId = env.GOOGLE_CALENDAR_ID || 'primary'
  const params = new URLSearchParams({
    timeMin: url.searchParams.get('timeMin') || new Date().toISOString(),
    timeMax: url.searchParams.get('timeMax') || new Date(Date.now() + 1000 * 60 * 60 * 24 * 120).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events?' + params, { headers: { Authorization: 'Bearer ' + token } })
  const data = await res.json() as any
  if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Google Calendar request failed.' }, { status: res.status })
  return NextResponse.json({ events: (data.items || []).map((e: any) => ({ id: e.id, title: e.summary || 'Fără titlu', description: e.description || '', location: e.location || '', start: e.start?.dateTime || e.start?.date || null, end: e.end?.dateTime || e.end?.date || null, htmlLink: e.htmlLink || null })) })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const env = await getEnv()
  const body = await request.json().catch(() => ({})) as any
  if (!body.google_id || !body.title) return NextResponse.json({ error: 'google_id and title are required.' }, { status: 400 })
  const existing = await env.CHURCH_DB.prepare('SELECT id FROM events WHERE google_event_id = ? LIMIT 1').bind(body.google_id).first<{ id: string }>()
  if (existing) return NextResponse.json({ imported: false, event_id: existing.id, message: 'Evenimentul este deja importat.' })

  const start = body.start ? new Date(body.start).toISOString() : null
  const end = body.end ? new Date(body.end).toISOString() : null
  const id = crypto.randomUUID()
  await env.CHURCH_DB.prepare(
    'INSERT INTO events (id,title,description,location,start_at,end_at,date_label,time_label,status,google_event_id,publish_google,is_free,base_price,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, body.title, body.description || null, body.location || null, start, end, start?.slice(0,10) || null, start?.slice(11,16) || null, 'draft', body.google_id, 0, 1, 0, auth.userId).run()

  const event = await env.CHURCH_DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first()
  return NextResponse.json({ imported: true, event })
}
