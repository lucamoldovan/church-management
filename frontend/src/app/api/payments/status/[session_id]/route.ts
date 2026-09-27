import { NextRequest, NextResponse } from 'next/server'
import { getEnv } from '@/lib/cloudflare'
import Stripe from 'stripe'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

import { d1Rest } from '@/lib/d1-rest'

async function sbFetch(path: string, options?: RequestInit) { return d1Rest(path, options) }

const isStripeCheckoutSessionId = (value: unknown): value is string =>
  typeof value === 'string' && /^cs_[A-Za-z0-9_-]+$/.test(value)

export async function GET(_request: NextRequest, { params }: { params: Promise<{ session_id: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { session_id } = await params
    if (!isStripeCheckoutSessionId(session_id)) {
      return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
    }

    const env = await getEnv()
    const stripeKey = env.STRIPE_SECRET_KEY
    if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

    const txs = await sbFetch(`payment_transactions?session_id=eq.${encodeURIComponent(session_id)}&select=user_id,registration_id`)
    if (!txs?.length) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    if (String(txs[0].user_id) !== auth.userId && !isStaff(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const stripe = new Stripe(stripeKey)
    const session = await stripe.checkout.sessions.retrieve(session_id)
    const status = session.status || 'unknown'
    const paymentStatus = session.payment_status || 'unknown'
    const now = new Date().toISOString()

    await sbFetch(`payment_transactions?session_id=eq.${encodeURIComponent(session_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, payment_status: paymentStatus, updated_at: now }),
    })

    if (paymentStatus === 'paid' && txs[0].registration_id) {
      await sbFetch(`registrations?id=eq.${encodeURIComponent(txs[0].registration_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: 'paid' }),
      })
    }

    return NextResponse.json({ status, payment_status: paymentStatus, amount_total: session.amount_total, currency: session.currency })
  } catch (err) {
    console.error('[payments/status]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
