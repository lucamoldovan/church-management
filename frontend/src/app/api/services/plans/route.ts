import { NextResponse } from 'next/server'
import { getAuthContext, isStaff } from '@/lib/auth'
import { getEnv } from '@/lib/cloudflare'

export const runtime = 'edge'

export async function GET() {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isStaff(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const env = await getEnv()
  const token = env.PLANNING_CENTER_TOKEN
  if (!token) return NextResponse.json({ configured: false, plans: [] })
  const res = await fetch('https://api.planningcenteronline.com/services/v2/plans?per_page=25', {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
  })
  const data = await res.json() as any
  if (!res.ok) return NextResponse.json({ configured: true, plans: [], error: data?.errors?.[0]?.detail || 'Planning Center request failed.' }, { status: res.status })
  return NextResponse.json({
    configured: true,
    plans: (data.data || []).map((p: any) => ({
      id: p.id,
      title: p.attributes?.title || 'Fără titlu',
      dates: p.attributes?.dates || null,
      service_type: p.attributes?.service_type_name || null,
      created_at: p.attributes?.created_at || null,
    })),
  })
}
