'use client'

import { useEffect, useState, useCallback } from 'react'
import { Shield } from 'lucide-react'

interface P { id: string; full_name: string | null; email: string | null; role: string; phone: string | null }
const ROLES = ['super_admin', 'leadership', 'event_manager', 'group_leader', 'checkin_staff', 'volunteer', 'member']

export default function AdminUsers() {
  const [users, setUsers] = useState<P[]>([])
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase.from('profiles').select('id, full_name, email, role, phone').order('created_at', { ascending: false })
    setUsers((data as P[]) || [])
  }, [])

  useEffect(() => { load() }, [load])

  const changeRole = async (id: string, role: string) => {
    setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) setMsg(`Eroare: ${error.message}`)
    else { setMsg('Rol actualizat'); setUsers(u => u.map(x => x.id === id ? { ...x, role } : x)) }
  }

  return (
    <div data-testid="admin-users">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-3xl font-bold">Utilizatori & Roluri</h1>
      </div>
      {msg && <div className="bg-primary/10 text-primary px-4 py-3 rounded-2xl text-sm mb-4">{msg}</div>}
      <div className="bg-card border border-border/60 rounded-3xl overflow-hidden soft-shadow">
        {users.map(u => (
          <div key={u.id} data-testid={`admin-user-row-${u.id}`} className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border/50 last:border-0">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{u.full_name || '—'}</div>
              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
            </div>
            <select value={u.role} data-testid={`admin-user-role-${u.id}`} onChange={e => changeRole(u.id, e.target.value)}
              className="px-3 py-2 border border-border rounded-full bg-background text-sm shrink-0">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
        {users.length === 0 && <p className="text-muted-foreground text-sm py-10 text-center">Niciun utilizator.</p>}
      </div>
    </div>
  )
}
