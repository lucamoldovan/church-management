import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''
const TIMEZONE = process.env.EVENT_TIMEZONE || 'Europe/Bucharest'

async function sbFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const rows = await sbFetch('integration_tokens?provider=eq.google_calendar&select=tokens')
  if (!rows || !rows[0]?.tokens?.refresh_token) return null

  const tok = rows[0].tokens
  // Use existing token if still valid (with 60s buffer)
  if (tok.expiry && new Date(tok.expiry).getTime() > Date.now() + 60000) {
    return tok.access_token
  }

  // Refresh the token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const newTok = await res.json()
  if (!newTok.access_token) return null

  const expiry = new Date(Date.now() + (newTok.expires_in || 3600) * 1000).toISOString()
  const updated = { ...tok, access_token: newTok.access_token, expiry }
  await sbFetch('integration_tokens?provider=eq.google_calendar', {
    method: 'PATCH',
    body: JSON.stringify({ tokens: updated }),
  })

  return newTok.access_token
}

function buildEventTimes(event: Record<string, unknown>) {
  const date = event.date as string | null
  const time = event.time as string | null
  if (!date) return null

  if (time) {
    const startDt = new Date(`${date}T${time}`)
    const endDt = new Date(startDt.getTime() + 2 * 60 * 60 * 1000)
    return {
      start: { dateTime: startDt.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: endDt.toISOString(), timeZone: TIMEZONE },
    }
  }
  return {
    start: { date },
    end: { date },
  }
}

async function publishToGoogle(
  event: Record<string, unknown>,
  calendarId: string
): Promise<string> {
  const accessToken = await getGoogleAccessToken()
  if (!accessToken) throw new Error('Google Calendar nu este conectat.')

  const times = buildEventTimes(event)
  if (!times) throw new Error('Evenimentul nu are data.')

  const body = {
    summary: event.title,
    description: `${event.description || ''}\n\nLocatie: ${event.location || ''}`,
    location: event.location || '',
    ...times,
  }

  const existingId = event.google_event_id as string | null
  const calPath = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`

  const res = existingId
    ? await fetch(`${calPath}/${existingId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    : await fetch(calPath, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Google Calendar error')
  return data.id
}

async function publishToFacebook(
  event: Record<string, unknown>,
  link: string
): Promise<string> {
  const pageId = process.env.FB_PAGE_ID
  const pageToken = process.env.FB_PAGE_ACCESS_TOKEN
  if (!pageId || !pageToken) throw new Error('Facebook nu este configurat.')
  if (!event.poster_url) throw new Error('Lipseste posterul (imagine publica necesara).')

  const message = `${event.title}\n\n${event.description || ''}\n\nInscrie-te aici: ${link}`
  const formData = new URLSearchParams({
    url: event.poster_url as string,
    message,
    access_token: pageToken,
  })

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/photos`,
    { method: 'POST', body: formData }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Eroare Facebook')
  return data.post_id || data.id
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ event_id: string }> }
) {
  try {
    const { event_id } = await params
    const { origin } = await request.json()

    const rows = await sbFetch(`events?id=eq.${event_id}&select=*`)
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Eveniment negasit' }, { status: 404 })
    }
    const event = rows[0]
    const link = `${origin}/events/${event_id}`
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

    const log: Record<string, unknown> = {}
    const update: Record<string, unknown> = {}

    if (event.publish_google) {
      try {
        const gid = await publishToGoogle(event, calendarId)
        update.google_event_id = gid
        log.google = { ok: true, id: gid }
      } catch (e) {
        log.google = { ok: false, error: (e as Error).message }
      }
    }

    if (event.publish_facebook) {
      try {
        const fid = await publishToFacebook(event, link)
        update.facebook_post_id = fid
        log.facebook = { ok: true, id: fid }
      } catch (e) {
        log.facebook = { ok: false, error: (e as Error).message }
      }
    }

    if (Object.keys(log).length > 0) {
      update.publish_log = log
      await sbFetch(`events?id=eq.${event_id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      })
    }

    return NextResponse.json({ published: true, log })
  } catch (err) {
    console.error('[events/publish]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
