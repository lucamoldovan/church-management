import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext, isStaff } from '@/lib/cloudflare/auth-context'
import { dbFindOne, dbInsert, dbUpdate } from '@/lib/cloudflare/api-db'
import { consumeRateLimit, rateLimited, writeAuditLog } from '@/lib/cloudflare/security'

export const runtime = 'edge'

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)

export async function POST(request: NextRequest) {
  try {
    const rate = await consumeRateLimit(request, 'payments-checkout', 10, 60)
    if (!rate.allowed) return rateLimited(rate.retryAfter)
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { registration_id } = await request.json()
    if (!isUuid(registration_id)) return NextResponse.json({ error: 'Invalid registration_id' }, { status: 400 })

    const reg = await dbFindOne<Record<string, unknown>>('registrations', { id: registration_id })
    if (!reg) return NextResponse.json({ error: 'Inregistrare negasita' }, { status: 404 })
    const canManage = isStaff(auth.role)
    if (String(reg.user_id) !== auth.userId && !canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (String(reg.payment_status || '') === 'paid') return NextResponse.json({ already_paid: true })

    const amount = Number(reg.package_price || 0)
    if (amount <= 0) {
      await dbUpdate('registrations', { payment_status: 'paid', payment_method: 'online', amount_paid: 0, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { id: registration_id })
      return NextResponse.json({ free: true })
    }

    const existing = await dbFindOne<Record<string, unknown>>('payment_transactions', { registration_id })
    if (existing && ['initiated', 'pending'].includes(String(existing.payment_status)) && existing.session_id) {
      const existingStripeKey = process.env.STRIPE_SECRET_KEY
      if (existingStripeKey) {
        const existingSession = await new Stripe(existingStripeKey).checkout.sessions.retrieve(String(existing.session_id))
        if (existingSession.status === 'open' && existingSession.url) {
          return NextResponse.json({ url: existingSession.url, session_id: existingSession.id, existing: true })
        }
      }
      await dbUpdate('payment_transactions', { payment_status: 'cancelled', status: 'expired', updated_at: new Date().toISOString() }, { session_id: String(existing.session_id) })
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    const stripe = new Stripe(stripeKey)
    const requestOrigin = new URL(request.url).origin
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: `${requestOrigin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${requestOrigin}/dashboard`,
      line_items: [{ price_data: { currency: 'ron', unit_amount: Math.round(amount * 100), product_data: { name: String(reg.event_title || 'Bilet eveniment'), description: reg.package_name ? String(reg.package_name) : undefined } }, quantity: 1 }],
      metadata: { registration_id: String(registration_id), user_id: String(reg.user_id || ''), event_title: String(reg.event_title || '') },
    })

    await dbInsert('payment_transactions', {
      user_id: reg.user_id, registration_id, session_id: session.id, amount,
      currency: 'ron', status: 'initiated', payment_status: 'pending', metadata: session.metadata || {},
    })
    await writeAuditLog(auth, 'payment.checkout_created', 'payment_transactions', session.id, { registration_id, amount })
    return NextResponse.json({ url: session.url, session_id: session.id })
  } catch (err) {
    console.error('[payments/checkout]', err)
    return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 })
  }
}
