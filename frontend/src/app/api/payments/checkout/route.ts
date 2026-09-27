import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext, isStaff } from '@/lib/auth'

export const runtime = 'edge'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''

async function sbFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { registration_id, origin } = await request.json()
    if (!registration_id || !origin) {
      return NextResponse.json({ error: 'registration_id and origin are required' }, { status: 400 })
    }

    const regs = await sbFetch(`registrations?id=eq.${registration_id}&select=*`)
    if (!regs || regs.length === 0) return NextResponse.json({ error: 'Inregistrare negasita' }, { status: 404 })

    const reg = regs[0]
    const canManage = isStaff(auth.role)
    if (String(reg.user_id) !== auth.userId && !canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const amount = parseFloat(reg.package_price || '0')
    if (amount <= 0) {
      await sbFetch(`registrations?id=eq.${registration_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: 'paid' }),
      })
      return NextResponse.json({ free: true })
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

    const stripe = new Stripe(stripeKey)
    const successUrl = `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${origin}/dashboard`
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
        currency: 'ron', status: 'initiated', payment_status: 'pending', metadata,
      }),
    })

    return NextResponse.json({ url: session.url, session_id: session.id })
  } catch (err) {
    console.error('[payments/checkout]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
