/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/cloudflare/auth-context'
import { dbFindMany, dbFindOne, dbInsert, dbUpdate } from '@/lib/cloudflare/api-db'
import { decryptJson, encryptJson } from '@/lib/cloudflare/security'

export const runtime = 'edge'

async function getToken() {
  const row = await dbFindOne<Record<string, unknown>>('integration_tokens', { provider: 'google_calendar' })
  const tokens = await decryptJson<Record<string, any>>(row?.tokens)
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (tokens.refresh_token && clientId && clientSecret && (!tokens.access_token || !tokens.expiry || Date.parse(tokens.expiry) < Date.now() + 60000)) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refresh_token, grant_type: 'refresh_token' }),
    })
    const fresh = await tokenRes.json()
    if (fresh.access_token) {
      const merged = { ...tokens, ...fresh, expiry: new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString() }
      await dbUpdate('integration_tokens', { tokens: await encryptJson(merged), updated_at: new Date().toISOString() }, { provider: 'google_calendar' })
      return merged.access_token
    }
  }
  return tokens.access_token || null
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const token = await getToken()
  if (!token) return NextResponse.json({ error: 'Google Calendar is not connected.' }, { status: 503 })
  const url = new URL(request.url)
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'
  const params = new URLSearchParams({ timeMin: url.searchParams.get('timeMin') || new Date().toISOString(), timeMax: url.searchParams.get('timeMax') || new Date(Date.now() + 1000 * 60 * 60 * 24 * 120).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '100' })
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Google Calendar request failed.' }, { status: res.status })
  return NextResponse.json({ events: (data.items || []).map((e: any) => ({ id: e.id, title: e.summary || 'Fără titlu', description: e.description || '', location: e.location || '', start: e.start?.dateTime || e.start?.date || null, end: e.end?.dateTime || e.end?.date || null, htmlLink: e.htmlLink || null })) })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (!body.google_id || !body.title) return NextResponse.json({ error: 'google_id and title are required.' }, { status: 400 })
  const existing = await dbFindOne<{ id: string }>('events', { google_event_id: body.google_id })
  if (existing) return NextResponse.json({ imported: false, event_id: existing.id, message: 'Evenimentul este deja importat.' })
  const start = body.start ? new Date(body.start).toISOString() : null
  const end = body.end ? new Date(body.end).toISOString() : null
  const event = await dbInsert('events', { title: body.title, description: body.description || null, location: body.location || null, start_at: start, end_at: end, date_label: start?.slice(0, 10) || null, time_label: start?.slice(11, 16) || null, status: 'draft', google_event_id: body.google_id, publish_google: 0, is_free: 1, base_price: 0, created_by: auth.userId })
  return NextResponse.json({ imported: true, event })
}
