import { headers } from 'next/headers'
import { getAuth } from './auth'
import { getD1 } from './db'

export type AuthRole = 'member' | 'checkin_staff' | 'event_manager' | 'leadership' | 'super_admin'

export interface AuthContext {
  session: NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>>>
  user: AuthContext['session']['user']
  profile: Record<string, unknown> | null
  role: AuthRole
  isAdmin: boolean
  isStaff: boolean
}

const ADMIN_ROLES: AuthRole[] = ['super_admin', 'leadership']
const STAFF_ROLES: AuthRole[] = ['super_admin', 'leadership', 'event_manager', 'checkin_staff']

export function isAdmin(role: string | null | undefined) {
  return ADMIN_ROLES.includes((role ?? 'member') as AuthRole)
}

export function isStaff(role: string | null | undefined) {
  return STAFF_ROLES.includes((role ?? 'member') as AuthRole)
}

/**
 * Server-side source of truth for authentication and authorization.
 * Roles are read from D1 profiles rather than trusted from client input.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const auth = getAuth()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const db = getD1()
  const result = await db
    .prepare('SELECT * FROM profiles WHERE id = ? LIMIT 1')
    .bind(session.user.id)
    .first<Record<string, unknown>>()

  const role = ((result?.role as AuthRole | undefined) ?? 'member') as AuthRole

  return {
    session,
    user: session.user,
    profile: result ?? null,
    role,
    isAdmin: isAdmin(role),
    isStaff: isStaff(role),
  }
}

export async function requireAuth() {
  const context = await getAuthContext()
  if (!context) throw new Response('Unauthorized', { status: 401 })
  return context
}

export async function requireStaff() {
  const context = await requireAuth()
  if (!context.isStaff) throw new Response('Forbidden', { status: 403 })
  return context
}

export async function requireAdmin() {
  const context = await requireAuth()
  if (!context.isAdmin) throw new Response('Forbidden', { status: 403 })
  return context
}
