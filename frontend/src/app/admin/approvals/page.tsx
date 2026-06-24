'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, Send } from 'lucide-react'

interface Ev { id: string; title: string; category: string | null; status: string; department: string | null; created_at: string }
const PENDING = ['draft', 'submitted', 'under_review', 'rejected', 'approved']

export default function AdminApprovals() {
  const [events, setEvents] = useState<Ev[]>([])
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const { data } = await createClient().from('events').select('*').in('status', PENDING).order('created_at', { ascending: false })
    setEvents((data as Ev[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  const setStatus = async (id: string, status: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    const { error } = await createClient().from('events').update({ status }).eq('id', id)
    setMsg(error ? error.message : `Status setat: ${status}`)
    load()
  }

  return (
    <div data-testid="admin-approvals">
      <h1 className="font-heading text-3xl font-bold mb-2">Aprobări evenimente</h1>
      <p className="text-muted-foreground mb-6">Cereri de evenimente care așteaptă aprobare sau publicare.</p>
      {msg && <div className="bg-primary/10 text-primary px-4 py-3 rounded-2xl text-sm mb-4">{msg}</div>}
      <div className="flex flex-col gap-3">
        {events.map(ev => (
          <div key={ev.id} data-testid={`approval-row-${ev.id}`} className="bg-card border border-border/60 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 soft-shadow">
            <div>
              <div className="flex items-center gap-2"><h3 className="font-heading font-semibold">{ev.title}</h3><span className="text-xs px-2.5 py-0.5 rounded-full bg-secondary">{ev.status}</span></div>
              <p className="text-sm text-muted-foreground">{ev.category} · {ev.department || '—'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStatus(ev.id, 'approved')} className="inline-flex items-center gap-1.5 text-sm bg-secondary px-3 py-2 rounded-full hover:bg-secondary/70"><CheckCircle2 className="h-4 w-4" /> Aprobă</button>
              <button onClick={() => setStatus(ev.id, 'published')} data-testid={`approval-publish-${ev.id}`} className="inline-flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-2 rounded-full hover:bg-primary/90"><Send className="h-4 w-4" /> Publică</button>
              <button onClick={() => setStatus(ev.id, 'rejected')} className="inline-flex items-center gap-1.5 text-sm text-destructive px-3 py-2 rounded-full hover:bg-destructive/10"><XCircle className="h-4 w-4" /> Respinge</button>
            </div>
          </div>
        ))}
        {events.length === 0 && <p className="text-muted-foreground text-sm py-10 text-center">Nimic de aprobat — toate evenimentele sunt publicate.</p>}
      </div>
    </div>
  )
}
