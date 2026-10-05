import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext, isStaff } from '@/lib/cloudflare/auth-context'
import { dbFindOne, dbUpdate } from '@/lib/cloudflare/api-db'
import { consumeRateLimit, rateLimited, writeAuditLog } from '@/lib/cloudflare/security'

export const runtime = 'edge'

const isStripeCheckoutSessionId = (value: unknown): value is string => typeof value === 'string' && /^cs_[A-Za-z0-9_-]+$/.test(value)

export async function GET(_request: NextRequest, { params }: { params: Promise<{ session_id: string }> }) {
  try {
    const rate = await consumeRateLimit(_request, 'payments-status', 30, 60)
    if (!rate.allowed) return rateLimited(rate.retryAfter)
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
    if (paymentStatus === 'paid' && tx.registration_id) {
      await dbUpdate('registrations', { payment_status: 'paid', amount_paid: Number(session.amount_total || 0) / 100, paid_at: now }, { id: tx.registration_id })
      await writeAuditLog(auth, 'payment.status_paid', 'payment_transactions', String(tx.id || session_id), { registration_id: tx.registration_id })
    }

    return NextResponse.json({ status, payment_status: paymentStatus, amount_total: session.amount_total, currency: session.currency })
  } catch (err) {
    console.error('[payments/status]', err)
    return NextResponse.json({ error: 'Unable to retrieve payment status' }, { status: 500 })
  }
}
