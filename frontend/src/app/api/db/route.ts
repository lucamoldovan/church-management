import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/cloudflare/auth-context'
import { authorizeDbOperation, executeDbOperation, getD1, type DbOperation } from '@/lib/cloudflare/db'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const operation = await request.json() as DbOperation
    const auth = await getAuthContext()
    const user = auth ? { id: auth.user.id, email: auth.user.email, role: auth.role } : null
    await authorizeDbOperation(operation, user)
    const result = await executeDbOperation(getD1(), operation)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database request failed'
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 400
    return NextResponse.json({ data: null, error: { message, code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'DB_ERROR' } }, { status })
  }
}
