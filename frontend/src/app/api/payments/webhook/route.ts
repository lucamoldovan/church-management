import { NextRequest, NextResponse } from 'next/server'
import { dbUpdate } from '@/lib/cloudflare/api-db'

export const runtime = 'edge'

async function verifyStripeSignature(body: string, sigHeader: string, secret: string) {
  try {
    const parts = sigHeader.split(',')
    const tPart = parts.find(p => p.startsWith('t='))
    const v1Parts = parts.filter(p => p.startsWith('v1='))
    if (!tPart || !v1Parts.length) return false
    const timestamp = tPart.slice(2)
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    const ts = Number(timestamp)
    return Math.abs(Math.floor(Date.now() / 1000) - ts) <= 300 && v1Parts.some(p => p.slice(3) === computed)
  } catch { return false }
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  const body = await request.text()
  const valid = await verifyStripeSignature(body, request.headers.get('stripe-signature') || '', webhookSecret)
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })

  let event: { type: string; data: { object: Record<string, unknown> } }
  try { event = JSON.parse(body) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const metadata = session.metadata as Record<string, string> | undefined
    const registrationId = metadata?.registration_id
    const sessionId = String(session.id || '')
    if (registrationId) {
      await dbUpdate('registrations', { payment_status: 'paid' }, { id: registrationId })
      if (sessionId) await dbUpdate('payment_transactions', { payment_status: 'paid', status: 'complete', updated_at: new Date().toISOString() }, { session_id: sessionId })
    }
  }
  return NextResponse.json({ received: true })
}
