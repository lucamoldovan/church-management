import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/cloudflare/auth-context'
import { authorizeDbOperation, executeDbOperation, getD1, type DbOperation } from '@/lib/cloudflare/db'
import { consumeRateLimit, rateLimited } from '@/lib/cloudflare/security'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const rate = await consumeRateLimit(request, 'db-api', 120, 60)
    if (!rate.allowed) return rateLimited(rate.retryAfter)
    const operation = await request.json() as DbOperation
    const auth = await getAuthContext()
    const user = auth ? { id: auth.user.id, email: auth.user.email, role: auth.role } : null
    const operationTable = typeof operation.table === 'string' ? operation.table : ''
    if (operationTable === 'contact_messages') {
      const contactRate = await consumeRateLimit(request, 'contact-messages', 5, 300)
      if (!contactRate.allowed) return rateLimited(contactRate.retryAfter)
    }
    await authorizeDbOperation(operation, user)
    const result = await executeDbOperation(getD1(), operation)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database request failed'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400
    return NextResponse.json({ data: null, error: { message, code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'DB_ERROR' } }, { status })
  }
}
