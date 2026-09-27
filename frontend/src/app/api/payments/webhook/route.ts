import { NextRequest, NextResponse } from 'next/server'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

async function verifyStripeSignature(body: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = sigHeader.split(',')
    const tPart = parts.find(p => p.startsWith('t='))
    const v1Parts = parts.filter(p => p.startsWith('v1='))
    if (!tPart || v1Parts.length === 0) return false

    const timestamp = tPart.slice(2)
    const signedPayload = `${timestamp}.${body}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

    const ts = Number(timestamp)
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false
    return v1Parts.some(p => p.slice(3) === computed)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const env = await getEnv()
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const body = await request.text()
  const valid = await verifyStripeSignature(body, request.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET)
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })

  let event: { type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const metadata = session.metadata as Record<string, string> | undefined
    const registrationId = metadata?.registration_id
    const sessionId = typeof session.id === 'string' ? session.id : null

    if (registrationId && sessionId) {
      await env.CHURCH_DB.batch([
        env.CHURCH_DB.prepare('UPDATE registrations SET payment_status=? WHERE id=?').bind('paid', registrationId),
        env.CHURCH_DB.prepare('UPDATE payment_transactions SET payment_status=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE session_id=?')
          .bind('paid', 'complete', sessionId),
      ])
    }
  }

  return NextResponse.json({ received: true })
}
