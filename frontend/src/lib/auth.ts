import { headers } from 'next/headers'
import { getAuth } from '@/lib/cloudflare/auth'
import { getD1 } from '@/lib/cloudflare/db'

export interface AuthContext {
  userId: string
  email: string
  role: string | null
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getAuth().api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const profile = await getD1().prepare('SELECT role FROM profiles WHERE id = ? LIMIT 1').bind(session.user.id).first<{ role: string | null }>()
  return {
    userId: session.user.id,
    email: session.user.email,
    role: profile?.role ?? 'member',
  }
}

export function isStaff(role: string | null) {
  return ['super_admin', 'leadership', 'event_manager', 'checkin_staff'].includes(role ?? '')
}

export function isAdmin(role: string | null) {
  return ['super_admin', 'leadership'].includes(role ?? '')
}
