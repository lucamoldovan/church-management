import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

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
    if (!env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    }

    const tx = await env.CHURCH_DB.prepare(
      'SELECT user_id,registration_id FROM payment_transactions WHERE session_id=?'
    ).bind(session_id).first<{ user_id: string; registration_id: string | null }>()

    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    if (String(tx.user_id) !== auth.userId && !isStaff(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY)
    const session = await stripe.checkout.sessions.retrieve(session_id)
    const status = session.status || 'unknown'
    const paymentStatus = session.payment_status || 'unknown'

    await env.CHURCH_DB.prepare(
      'UPDATE payment_transactions SET status=?,payment_status=?,updated_at=CURRENT_TIMESTAMP WHERE session_id=?'
    ).bind(status, paymentStatus, session_id).run()

    if (paymentStatus === 'paid' && tx.registration_id) {
      await env.CHURCH_DB.prepare('UPDATE registrations SET payment_status=? WHERE id=?')
        .bind('paid', tx.registration_id)
        .run()
    }

    return NextResponse.json({
      status,
      payment_status: paymentStatus,
      amount_total: session.amount_total,
      currency: session.currency,
    })
  } catch (err) {
    console.error('[payments/status]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
