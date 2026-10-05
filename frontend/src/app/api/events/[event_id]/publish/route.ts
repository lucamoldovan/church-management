/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/cloudflare/auth-context'
import { dbFindOne, dbUpdate } from '@/lib/cloudflare/api-db'
import { decryptJson, encryptJson } from '@/lib/cloudflare/security'

export const runtime = 'edge'
const TIMEZONE = process.env.EVENT_TIMEZONE || 'Europe/Bucharest'

function buildEventTimes(event: Record<string, unknown>) {
  const date = event.date as string | null
  const time = event.time as string | null
  if (!date) return null
  if (time) {
    const startDt = new Date(`${date}T${time}`)
    const endDt = new Date(startDt.getTime() + 2 * 60 * 60 * 1000)
    return { start: { dateTime: startDt.toISOString(), timeZone: TIMEZONE }, end: { dateTime: endDt.toISOString(), timeZone: TIMEZONE } }
  }
  return { start: { date }, end: { date } }
}

async function getGoogleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const row = await dbFindOne<Record<string, unknown>>('integration_tokens', { provider: 'google_calendar' })
  const tok = await decryptJson<Record<string, any>>(row?.tokens)
  if (!tok.refresh_token) return null
  if (tok.expiry && new Date(tok.expiry).getTime() > Date.now() + 60000) return tok.access_token || null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: tok.refresh_token, grant_type: 'refresh_token' }),
  })
  const fresh = await res.json()
  if (!fresh.access_token) return null
  const updated = { ...tok, access_token: fresh.access_token, expiry: new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString() }
  await dbUpdate('integration_tokens', { tokens: await encryptJson(updated), updated_at: new Date().toISOString() }, { provider: 'google_calendar' })
  return fresh.access_token
}

async function publishToGoogle(event: Record<string, unknown>, calendarId: string) {
  const accessToken = await getGoogleAccessToken()
  if (!accessToken) throw new Error('Google Calendar nu este conectat.')
  const times = buildEventTimes(event)
  if (!times) throw new Error('Evenimentul nu are data.')
  const body = { summary: event.title, description: `${event.description || ''}\n\nLocatie: ${event.location || ''}`, location: event.location || '', ...times }
  const existingId = event.google_event_id as string | null
  const path = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  const res = existingId
    ? await fetch(`${path}/${encodeURIComponent(existingId)}`, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    : await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Google Calendar error')
  return data.id
}

async function publishToFacebook(event: Record<string, unknown>, link: string) {
  const pageId = process.env.FB_PAGE_ID
  const pageToken = process.env.FB_PAGE_ACCESS_TOKEN
  if (!pageId || !pageToken) throw new Error('Facebook nu este configurat.')
  if (!event.poster_url) throw new Error('Lipseste posterul.')
  const formData = new URLSearchParams({ url: String(event.poster_url), message: `${event.title}\n\n${event.description || ''}\n\nInscrie-te aici: ${link}`, access_token: pageToken })
  const res = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(pageId)}/photos`, { method: 'POST', body: formData })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Eroare Facebook')
  return data.post_id || data.id
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ event_id: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { event_id } = await params
    const event = await dbFindOne<Record<string, unknown>>('events', { id: event_id })
    if (!event) return NextResponse.json({ error: 'Eveniment negasit' }, { status: 404 })
    if (!['approved', 'published'].includes(String(event.status))) return NextResponse.json({ error: 'Evenimentul trebuie aprobat înainte de publicare.' }, { status: 409 })
    const link = `${new URL(request.url).origin}/events/${event_id}`
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'
    const log: Record<string, unknown> = {}
    const update: Record<string, unknown> = {}
    if (event.publish_google) {
      try { const id = await publishToGoogle(event, calendarId); update.google_event_id = id; log.google = { ok: true, id } }
      catch (e) { log.google = { ok: false, error: (e as Error).message } }
    }
    if (event.publish_facebook) {
      try { const id = await publishToFacebook(event, link); update.facebook_post_id = id; log.facebook = { ok: true, id } }
      catch (e) { log.facebook = { ok: false, error: (e as Error).message } }
    }
    if (Object.keys(log).length) { update.publish_log = log; await dbUpdate('events', update, { id: event_id }) }
    return NextResponse.json({ published: true, log })
  } catch (err) {
    console.error('[events/publish]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
