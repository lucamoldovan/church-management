import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const runtime = 'edge'

export async function GET() {
  const checks: Record<string, boolean> = {}
  try {
    const { env } = getCloudflareContext()
    checks.database = Boolean(env.CHURCH_DB)
    if (env.CHURCH_DB) {
      try { await env.CHURCH_DB.prepare('SELECT 1').first(); checks.database = true } catch { checks.database = false }
    }
    checks.media = Boolean(env.MEDIA)
    checks.email = Boolean(env.EMAIL)
    checks.authSecret = Boolean(process.env.BETTER_AUTH_SECRET)
    checks.appUrl = Boolean(process.env.NEXT_PUBLIC_APP_URL || env.APP_BASE_URL)
    checks.stripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ status: 'not_ready', checks }, { status: 503 })
  }

  const ready = Object.values(checks).every(Boolean)
  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready', checks },
    { status: ready ? 200 : 503 },
  )
}
