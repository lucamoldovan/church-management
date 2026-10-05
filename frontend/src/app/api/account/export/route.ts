import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/cloudflare/auth-context'
import { getD1 } from '@/lib/cloudflare/db'
import { consumeRateLimit, rateLimited } from '@/lib/cloudflare/security'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const rate = await consumeRateLimit(request, 'account-export', 3, 3600)
  if (!rate.allowed) return rateLimited(rate.retryAfter)

  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getD1()
  const userId = auth.user.id
  const [profile, registrations, groups, notifications, payments] = await Promise.all([
    db.prepare('SELECT id, full_name, email, phone, avatar_url, bio, role, nfc_id, date_of_birth, department, emergency_contact, created_at FROM profiles WHERE id = ?').bind(userId).first(),
    db.prepare('SELECT id, event_id, event_title, package_id, package_name, package_price, status, payment_status, payment_method, amount_paid, paid_at, checked_in, checked_in_at, created_at FROM registrations WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all(),
    db.prepare('SELECT gm.id, gm.group_id, gm.status, gm.joined_at, sg.name AS group_name FROM group_members gm JOIN study_groups sg ON sg.id = gm.group_id WHERE gm.user_id = ? ORDER BY gm.joined_at DESC').bind(userId).all(),
    db.prepare('SELECT id, title, body, type, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all(),
    db.prepare('SELECT id, registration_id, session_id, amount, currency, status, payment_status, created_at, updated_at FROM payment_transactions WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all(),
  ])

  return NextResponse.json({
    exported_at: new Date().toISOString(),
    account: { id: auth.user.id, name: auth.user.name, email: auth.user.email, email_verified: auth.user.emailVerified },
    profile: profile ?? null,
    registrations: registrations.results ?? [],
    study_groups: groups.results ?? [],
    notifications: notifications.results ?? [],
    payments: payments.results ?? [],
  })
}
