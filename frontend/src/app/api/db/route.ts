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

    if (operationTable === 'contact_messages') {
      const contactRate = await consumeRateLimit(request, 'contact-messages', 5, 300)
      if (!contactRate.allowed) return rateLimited(contactRate.retryAfter)
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
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400
    return NextResponse.json({ data: null, error: { message, code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'DB_ERROR' } }, { status })
  }
}
