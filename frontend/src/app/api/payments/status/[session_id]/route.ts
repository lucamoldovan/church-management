import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

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
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase error ${res.status}: ${text}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ session_id: string }> }
) {
  try {
    const { session_id } = await params

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    }

    const stripe = new Stripe(stripeKey)
    const session = await stripe.checkout.sessions.retrieve(session_id)

    const status = session.status || 'unknown'
    const paymentStatus = session.payment_status || 'unknown'
    const now = new Date().toISOString()

    // Update transaction record
    await sbFetch(`payment_transactions?session_id=eq.${session_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, payment_status: paymentStatus, updated_at: now }),
    })

    // If paid, mark the registration
    if (paymentStatus === 'paid') {
      const txs = await sbFetch(
        `payment_transactions?session_id=eq.${session_id}&select=registration_id`
      )
      if (txs && txs[0]?.registration_id) {
        await sbFetch(`registrations?id=eq.${txs[0].registration_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ payment_status: 'paid' }),
        })
      }
    }

    return NextResponse.json({
      status,
      payment_status: paymentStatus,
      amount_total: session.amount_total,
      currency: session.currency,
    })
  } catch (err) {
    console.error('[payments/status]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
