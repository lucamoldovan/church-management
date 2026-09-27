import { NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'

export const runtime = 'edge'

import { d1Rest } from '@/lib/d1-rest'

async function sbFetch(path: string, options?: RequestInit) { return d1Rest(path, options) }

export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const googleClientId = process.env.GOOGLE_CLIENT_ID
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
  const googleCalendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'
  const fbPageId = process.env.FB_PAGE_ID
  const fbToken = process.env.FB_PAGE_ACCESS_TOKEN
  const youtubeApiKey = process.env.YOUTUBE_API_KEY
  const youtubeChannelId = process.env.YOUTUBE_CHANNEL_ID

  let googleConnected = false
  if (googleClientId && googleClientSecret) {
    try {
      const rows = await sbFetch('integration_tokens?provider=eq.google_calendar&select=tokens')
      googleConnected = !!(rows && rows[0]?.tokens?.refresh_token)
    } catch {
      // table may not exist yet
    }
  }

  return NextResponse.json({
    google: {
      configured: !!(googleClientId && googleClientSecret),
      connected: googleConnected,
      calendar_id: googleCalendarId,
    },
    facebook: {
      configured: !!(fbPageId && fbToken),
      page_id: fbPageId || null,
    },
    youtube: {
      configured: !!(youtubeApiKey && youtubeChannelId),
      channel_id: youtubeChannelId || null,
    },
  })
}
