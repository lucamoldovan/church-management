import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/cloudflare/auth-context'
import { authorizeDbOperation, executeDbOperation, getD1, type DbOperation } from '@/lib/cloudflare/db'
import { consumeRateLimit, rateLimited, writeAuditLog } from '@/lib/cloudflare/security'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > 256 * 1024) return NextResponse.json({ data: null, error: { message: 'Request too large', code: 'PAYLOAD_TOO_LARGE' } }, { status: 413 })
    const rate = await consumeRateLimit(request, 'db-api', 120, 60)
    if (!rate.allowed) return rateLimited(rate.retryAfter)
    const operation = await request.json() as DbOperation
    if (!operation || typeof operation !== 'object' || typeof operation.table !== 'string' || !['select', 'insert', 'update', 'delete', 'upsert'].includes(operation.operation)) {
      return NextResponse.json({ data: null, error: { message: 'Invalid database operation', code: 'INVALID_OPERATION' } }, { status: 400 })
    }
    const auth = await getAuthContext()
    const user = auth ? { id: auth.user.id, email: auth.user.email, role: auth.role } : null
    const operationTable = typeof operation.table === 'string' ? operation.table : ''

    if (operationTable === 'registrations' && operation.operation === 'insert' && auth) {
      const values = (Array.isArray(operation.values) ? operation.values : [operation.values]) as Record<string, unknown>[]
      const normalized: Record<string, unknown>[] = []
      for (const value of values) {
        if (!value || typeof value !== 'object') throw new Error('Invalid registration')
        const eventId = typeof value.event_id === 'string' ? value.event_id : ''
        if (!eventId) throw new Error('event_id is required')
        const event = await getD1().prepare('SELECT id, title, price, capacity, status FROM events WHERE id = ? LIMIT 1').bind(eventId).first<Record<string, unknown>>()
        if (!event || String(event.status) !== 'published') throw new Error('Event is not available')
        const packageId = typeof value.package_id === 'string' ? value.package_id : null
        let packageName = 'Intrare standard'
        let packagePrice = Number(event.price || 0)
        if (packageId) {
          const pkg = await getD1().prepare('SELECT id, name, price, capacity FROM event_packages WHERE id = ? AND event_id = ? LIMIT 1').bind(packageId, eventId).first<Record<string, unknown>>()
          if (!pkg) throw new Error('Invalid event package')
          packageName = String(pkg.name || packageName)
          packagePrice = Number(pkg.price || 0)
        }
        const existing = await getD1().prepare("SELECT id FROM registrations WHERE user_id = ? AND event_id = ? AND status NOT IN ('cancelled', 'refunded') LIMIT 1").bind(auth.user.id, eventId).first()
        if (existing) throw new Error('You are already registered for this event')
        const capacity = Number(event.capacity || 0)
        if (capacity > 0) {
          const count = await getD1().prepare("SELECT COUNT(*) AS count FROM registrations WHERE event_id = ? AND status NOT IN ('cancelled', 'refunded')").bind(eventId).first<{ count: number }>()
          if (Number(count?.count || 0) >= capacity) throw new Error('Event is full')
        }
        const method = value.payment_method === 'cash' ? 'cash' : 'online'
        normalized.push({
          ...value,
          id: crypto.randomUUID(),
          user_id: auth.user.id,
          event_id: eventId,
          event_title: String(event.title || ''),
          package_id: packageId,
          package_name: packageName,
          package_price: packagePrice,
          status: 'confirmed',
          payment_method: packagePrice <= 0 ? 'online' : method,
          payment_status: packagePrice <= 0 ? 'paid' : method === 'cash' ? 'pending' : 'unpaid',
          amount_paid: packagePrice <= 0 ? packagePrice : 0,
          paid_at: packagePrice <= 0 ? new Date().toISOString() : null,
          attendee_id: `ATT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          qr_token: crypto.randomUUID(),
        })
      }
      operation.values = normalized
    }

    if (operationTable === 'bracelet_assignments' && operation.operation === 'insert' && auth?.isStaff) {
      const values = (Array.isArray(operation.values) ? operation.values : [operation.values]) as Record<string, unknown>[]
      operation.values = values.map(value => ({ ...value, id: crypto.randomUUID(), assigned_by: auth.user.id, assigned_at: new Date().toISOString() }))
    }

    if (operationTable === 'group_members' && operation.operation === 'insert' && auth && !auth.isStaff) {
      const values = (Array.isArray(operation.values) ? operation.values : [operation.values]) as Record<string, unknown>[]
      operation.values = values.map(value => ({
        ...value,
        id: crypto.randomUUID(),
        user_id: auth.user.id,
        status: 'pending',
        joined_at: new Date().toISOString(),
      }))
    }

    if (operationTable === 'checkins' && operation.operation === 'insert' && auth) {
      const values = (Array.isArray(operation.values) ? operation.values : [operation.values]) as Record<string, unknown>[]
      operation.values = values.map(value => ({ ...value, id: crypto.randomUUID(), scanned_by: auth.user.id, created_at: new Date().toISOString() }))
    }

    if (operationTable === 'checkins' && operation.operation === 'insert') {
      const values = (Array.isArray(operation.values) ? operation.values : [operation.values]) as Record<string, unknown>[]
      for (const value of values) {
        const registrationId = typeof value?.registration_id === 'string' ? value.registration_id : ''
        if (!registrationId) throw new Error('registration_id is required')
        const registration = await getD1().prepare('SELECT package_price, payment_status FROM registrations WHERE id = ? LIMIT 1').bind(registrationId).first<{ package_price: number; payment_status: string }>()
        if (!registration) throw new Error('Registration not found')
        if (Number(registration.package_price || 0) > 0 && String(registration.payment_status) !== 'paid') throw new Error('Payment must be completed before check-in')
      }
    }

    if (operationTable === 'contact_messages' && operation.operation === 'insert') {
      const contactRate = await consumeRateLimit(request, 'contact-messages', 5, 300)
      if (!contactRate.allowed) return rateLimited(contactRate.retryAfter)
      const values = (Array.isArray(operation.values) ? operation.values : [operation.values]) as Record<string, unknown>[]
      if (!values.length || values.length > 1) throw new Error('Invalid contact message')
      const value = values[0] || {}
      const name = typeof value.name === 'string' ? value.name.trim() : ''
      const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
      const subject = typeof value.subject === 'string' ? value.subject.trim() : ''
      const message = typeof value.message === 'string' ? value.message.trim() : ''
      if (!name || name.length > 120 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 320 || subject.length > 200 || !message || message.length > 5000) throw new Error('Invalid contact message')
      operation.values = { id: crypto.randomUUID(), name, email, subject: subject || null, message, created_at: new Date().toISOString() }
    }
    await authorizeDbOperation(operation, user)
    const result = await executeDbOperation(getD1(), operation)
    if (auth && operation.operation !== 'select' && ['registrations', 'bracelet_assignments', 'checkins', 'payment_transactions', 'events', 'group_members', 'profiles', 'notifications'].includes(operation.table)) {
      const resourceId = operation.filters?.find(f => f.column === 'id' && f.op === 'eq')?.value
      await writeAuditLog(auth, `db.${operation.operation}`, operation.table, typeof resourceId === 'string' ? resourceId : null, { count: result.count ?? null })
    }
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database request failed'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : /EVENT_FULL|PACKAGE_FULL|UNIQUE constraint failed/i.test(message) ? 409 : 400
    const safeMessage = message === 'EVENT_FULL'
      ? 'Evenimentul este complet.'
      : message === 'PACKAGE_FULL'
        ? 'Pachetul este complet.'
        : /UNIQUE constraint failed/i.test(message)
          ? 'Operațiunea intră în conflict cu o înregistrare existentă.'
          : status === 401 || status === 403
            ? message
            : 'Cererea de bază de date nu a putut fi procesată.'
    return NextResponse.json({ data: null, error: { message: safeMessage, code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 409 ? 'CONFLICT' : 'DB_ERROR' } }, { status })
  }
}
