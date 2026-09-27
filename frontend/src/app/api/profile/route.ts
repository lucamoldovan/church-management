import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'

export const runtime = 'edge'

export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const env = await (await import('@/lib/cloudflare')).getEnv()
  const profile = await env.CHURCH_DB.prepare(
    'SELECT id, full_name, email, phone, role, nfc_id, department, avatar_url AS photo_url, date_of_birth, emergency_contact FROM profiles WHERE id = ?'
  ).bind(auth.userId).first()
  return NextResponse.json(profile ?? null)
}
