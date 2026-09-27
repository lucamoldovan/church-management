import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext, isStaff } from '@/lib/auth'

export const runtime = 'edge'

import { d1Rest } from '@/lib/d1-rest'

async function sbFetch(path: string, options?: RequestInit) { return d1Rest(path, options) }

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { registration_id } = await request.json()
    if (!isUuid(registration_id)) {
      return NextResponse.json({ error: 'Invalid registration_id' }, { status: 400 })
    }

    const regs = await sbFetch(`registrations?id=eq.${encodeURIComponent(registration_id)}&select=*`)
    if (!regs || regs.length === 0) {
      return NextResponse.json({ error: 'Inregistrare negasita' }, { status: 404 })
    }

    const reg = regs[0]
    const canManage = isStaff(auth.role)
    if (String(reg.user_id) !== auth.userId && !canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const amount = parseFloat(reg.package_price || '0')
    if (amount <= 0) {
      await sbFetch(`registrations?id=eq.${encodeURIComponent(registration_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: 'paid' }),
      })
      return NextResponse.json({ free: true })
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

    const stripe = new Stripe(stripeKey)
    const requestOrigin = new URL(request.url).origin
    const successUrl = `${requestOrigin}/payment/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${requestOrigin}/dashboard`
    const metadata: Record<string, string> = {
      registration_id: String(registration_id),
      user_id: String(reg.user_id || ''),
      event_title: String(reg.event_title || ''),
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{
        price_data: {
          currency: 'ron',
          unit_amount: Math.round(amount * 100),
          product_data: { name: reg.event_title || 'Bilet eveniment', description: reg.package_name || undefined },
        },
        quantity: 1,
      }],
      metadata,
    })

    await sbFetch('payment_transactions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' } as Record<string, string>,
      body: JSON.stringify({
        user_id: reg.user_id, registration_id, session_id: session.id, amount,
        currency: 'ron', status: 'initiated', payment_status: 'pending', metadata: JSON.stringify(metadata),
      }),
    })

    return NextResponse.json({ url: session.url, session_id: session.id })
  } catch (err) {
    console.error('[payments/checkout]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
