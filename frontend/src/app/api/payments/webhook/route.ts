import { NextRequest, NextResponse } from 'next/server'
import { getEnv } from '@/lib/cloudflare'

// Edge runtime - compatible with Cloudflare Pages
// We verify the Stripe webhook signature manually using SubtleCrypto
// instead of stripe.webhooks.constructEvent (which requires Node.js crypto)
export const runtime = 'edge'

import { d1Rest } from '@/lib/d1-rest'

async function sbFetch(path: string, options?: RequestInit) { return d1Rest(path, options) }

/**
 * Verify Stripe webhook signature using SubtleCrypto (edge-compatible).
 * Stripe signs with HMAC-SHA256. The signature header format is:
 *   t=<timestamp>,v1=<hex_signature>[,v1=<hex_signature>...]
 */
async function verifyStripeSignature(
  body: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = sigHeader.split(',')
    const tPart = parts.find(p => p.startsWith('t='))
    const v1Parts = parts.filter(p => p.startsWith('v1='))
    if (!tPart || v1Parts.length === 0) return false

    const timestamp = tPart.slice(2)
    const signedPayload = `${timestamp}.${body}`

    const enc = new TextEncoder()
    const keyData = enc.encode(secret)
    const msgData = enc.encode(signedPayload)

    const key = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, msgData)
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Check if any v1 signature matches
    const valid = v1Parts.some(p => p.slice(3) === computed)

    // Also check timestamp tolerance (5 minutes)
    const ts = parseInt(timestamp, 10)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > 300) return false

    return valid
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const env = await getEnv()
  const stripeKey = env.STRIPE_SECRET_KEY
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const body = await request.text()
  const sig = request.headers.get('stripe-signature') || ''

  const valid = await verifyStripeSignature(body, sig, webhookSecret)
  if (!valid) {
    console.error('[webhook] signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

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
    const sessionId = session.id as string

    if (registrationId) {
      await sbFetch(`registrations?id=eq.${registrationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: 'paid' }),
      })
      await sbFetch(`payment_transactions?session_id=eq.${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: 'paid', status: 'complete' }),
      })
    }
  }

  return NextResponse.json({ received: true })
}
