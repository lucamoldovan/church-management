import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { registration_id?: unknown }\n    const { registration_id } = body
    if (!isUuid(registration_id)) {
      return NextResponse.json({ error: 'Invalid registration_id' }, { status: 400 })
    }

    const env = await getEnv()
    const reg = await env.CHURCH_DB.prepare('SELECT * FROM registrations WHERE id=?')
      .bind(registration_id)
      .first<Record<string, unknown>>()

    if (!reg) return NextResponse.json({ error: 'Inregistrare negasita' }, { status: 404 })

    const canManage = isStaff(auth.role)
    if (String(reg.user_id) !== auth.userId && !canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const amount = Number(reg.package_price || 0)
    if (amount <= 0) {
      await env.CHURCH_DB.prepare('UPDATE registrations SET payment_status=? WHERE id=?')
        .bind('paid', registration_id)
        .run()
      return NextResponse.json({ free: true })
    }

    if (!env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY)
    const origin = new URL(request.url).origin
    const metadata: Record<string, string> = {
      registration_id: String(registration_id),
      user_id: String(reg.user_id || ''),
      event_title: String(reg.event_title || ''),
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard`,
      line_items: [{
        price_data: {
          currency: 'ron',
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: String(reg.event_title || 'Bilet eveniment'),
            description: reg.package_name ? String(reg.package_name) : undefined,
          },
        },
        quantity: 1,
      }],
      metadata,
    })

    await env.CHURCH_DB.prepare(
      'INSERT INTO payment_transactions (id,user_id,registration_id,session_id,amount,currency,status,payment_status,metadata) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(
      crypto.randomUUID(),
      reg.user_id,
      registration_id,
      session.id,
      amount,
      'ron',
      'initiated',
      'pending',
      JSON.stringify(metadata),
    ).run()

    return NextResponse.json({ url: session.url, session_id: session.id })
  } catch (err) {
    console.error('[payments/checkout]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
