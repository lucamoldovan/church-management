import { NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const env = await getEnv()
  let googleConnected = false
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const row = await env.CHURCH_DB.prepare(
      "SELECT tokens FROM integration_tokens WHERE provider = ? AND account_id = ? LIMIT 1"
    ).bind('google_calendar', 'default').first<{ tokens: string | null }>()
    try { googleConnected = !!(row?.tokens && JSON.parse(row.tokens).refresh_token) } catch {}
  }

  return NextResponse.json({
    google: { configured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), connected: googleConnected, calendar_id: env.GOOGLE_CALENDAR_ID || 'primary' },
    facebook: { configured: !!(env.FB_PAGE_ID && env.FB_PAGE_ACCESS_TOKEN), page_id: env.FB_PAGE_ID || null },
    youtube: { configured: !!(env.YOUTUBE_API_KEY && env.YOUTUBE_CHANNEL_ID), channel_id: env.YOUTUBE_CHANNEL_ID || null },
  })
}
