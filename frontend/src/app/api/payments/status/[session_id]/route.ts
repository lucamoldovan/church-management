import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext, isStaff } from '@/lib/cloudflare/auth-context'
import { dbFindOne, dbUpdate } from '@/lib/cloudflare/api-db'

export const runtime = 'edge'

const isStripeCheckoutSessionId = (value: unknown): value is string => typeof value === 'string' && /^cs_[A-Za-z0-9_-]+$/.test(value)

export async function GET(_request: NextRequest, { params }: { params: Promise<{ session_id: string }> }) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { session_id } = await params
    if (!isStripeCheckoutSessionId(session_id)) return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

    const tx = await dbFindOne<Record<string, unknown>>('payment_transactions', { session_id })
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    if (String(tx.user_id) !== auth.userId && !isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const stripe = new Stripe(stripeKey)
    const session = await stripe.checkout.sessions.retrieve(session_id)
    const status = session.status || 'unknown'
    const paymentStatus = session.payment_status || 'unknown'
    const now = new Date().toISOString()
    await dbUpdate('payment_transactions', { status, payment_status: paymentStatus, updated_at: now }, { session_id })
    if (paymentStatus === 'paid' && tx.registration_id) await dbUpdate('registrations', { payment_status: 'paid' }, { id: tx.registration_id })

    return NextResponse.json({ status, payment_status: paymentStatus, amount_total: session.amount_total, currency: session.currency })
  } catch (err) {
    console.error('[payments/status]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
