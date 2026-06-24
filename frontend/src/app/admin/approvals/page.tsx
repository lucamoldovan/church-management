'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckCircle2, XCircle, Send, MessageSquare, Eye, Users, Wallet, Boxes, MapPin } from 'lucide-react'
import { STATUS_LABELS, statusBadge } from '@/lib/eventOptions'

interface Ev {
  id: string; title: string; description: string | null; category: string | null; status: string
  department: string | null; created_at: string; location: string | null; date: string | null; time: string | null
  expected_attendance: number | null; budget_notes: string | null; resource_notes: string | null
  facility_requirements: string[] | null; poster_url: string | null; review_comments: string | null
}
const PENDING = ['draft', 'submitted', 'under_review', 'rejected', 'approved']

export default function AdminApprovals() {
  const [events, setEvents] = useState<Ev[]>([])
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const { data } = await createClient().from('events').select('*').in('status', PENDING).order('created_at', { ascending: false })
    setEvents((data as Ev[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  const review = async (id: string, status: string, withComment = false) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const payload: Record<string, unknown> = { status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }
    if (withComment) payload.review_comments = comment
    const { error } = await supabase.from('events').update(payload).eq('id', id)
    setMsg(error ? error.message : `Status setat: ${STATUS_LABELS[status] || status}`)
    setComment('')
    load()
  }

  return (
    <div data-testid="admin-approvals">
      <h1 className="font-heading text-3xl font-bold mb-2">Aprobări evenimente</h1>
      <p className="text-muted-foreground mb-6">Cereri de evenimente care așteaptă aprobare sau publicare.</p>
      {msg && <div className="bg-primary/10 text-primary px-4 py-3 rounded-2xl text-sm mb-4">{msg}</div>}
      <div className="flex flex-col gap-3">
        {events.map(ev => (
          <div key={ev.id} data-testid={`approval-row-${ev.id}`} className="bg-card border border-border/60 rounded-2xl p-5 soft-shadow">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {ev.poster_url && <img src={ev.poster_url} alt="" className="h-11 w-11 rounded-xl object-cover shrink-0" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><h3 className="font-heading font-semibold truncate">{ev.title}</h3><span className={`text-xs px-2.5 py-0.5 rounded-full ${statusBadge(ev.status)}`}>{STATUS_LABELS[ev.status] || ev.status}</span></div>
                  <p className="text-sm text-muted-foreground truncate">{ev.category} · {ev.department || '—'} · {ev.date || 'fără dată'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setExpanded(expanded === ev.id ? null : ev.id)} data-testid={`approval-details-${ev.id}`} className="inline-flex items-center gap-1.5 text-sm bg-card border border-border px-3 py-2 rounded-full hover:bg-secondary/60"><Eye className="h-4 w-4" /> Detalii</button>
                <button onClick={() => review(ev.id, 'under_review')} className="inline-flex items-center gap-1.5 text-sm bg-secondary px-3 py-2 rounded-full hover:bg-secondary/70">În analiză</button>
                <button onClick={() => review(ev.id, 'approved')} data-testid={`approval-approve-${ev.id}`} className="inline-flex items-center gap-1.5 text-sm bg-secondary px-3 py-2 rounded-full hover:bg-secondary/70"><CheckCircle2 className="h-4 w-4" /> Aprobă</button>
                <button onClick={() => review(ev.id, 'published')} data-testid={`approval-publish-${ev.id}`} className="inline-flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-2 rounded-full hover:bg-primary/90"><Send className="h-4 w-4" /> Publică</button>
                <button onClick={() => review(ev.id, 'rejected')} className="inline-flex items-center gap-1.5 text-sm text-destructive px-3 py-2 rounded-full hover:bg-destructive/10"><XCircle className="h-4 w-4" /> Respinge</button>
              </div>
            </div>

            {expanded === ev.id && (
              <div data-testid={`approval-detail-panel-${ev.id}`} className="mt-4 pt-4 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {ev.description && <p className="md:col-span-2 text-muted-foreground">{ev.description}</p>}
                <div className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" /><span>{ev.location || '—'}{ev.time ? ` · ${ev.time}` : ''}</span></div>
                <div className="flex items-start gap-2"><Users className="h-4 w-4 mt-0.5 text-primary shrink-0" /><span>Participanți estimați: {ev.expected_attendance || '—'}</span></div>
                <div className="flex items-start gap-2"><Wallet className="h-4 w-4 mt-0.5 text-primary shrink-0" /><span>Buget: {ev.budget_notes || '—'}</span></div>
                <div className="flex items-start gap-2"><Boxes className="h-4 w-4 mt-0.5 text-primary shrink-0" /><span>Resurse: {ev.resource_notes || '—'}</span></div>
                <div className="md:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Cerințe spațiu & dotări</div>
                  {ev.facility_requirements && ev.facility_requirements.length ? (
                    <div className="flex flex-wrap gap-1.5">{ev.facility_requirements.map(f => <span key={f} className="text-xs px-2.5 py-1 rounded-full bg-secondary">{f}</span>)}</div>
                  ) : <span className="text-muted-foreground">Niciuna specificată</span>}
                </div>
                {ev.review_comments && <div className="md:col-span-2 bg-secondary/40 rounded-xl p-3 text-muted-foreground"><strong className="text-foreground">Comentariu anterior:</strong> {ev.review_comments}</div>}
                <div className="md:col-span-2 flex gap-2">
                  <input value={expanded === ev.id ? comment : ''} onChange={e => setComment(e.target.value)} placeholder="Comentariu / cere modificări..." data-testid={`approval-comment-${ev.id}`} className="flex-1 px-4 py-2.5 border border-border rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
                  <button onClick={() => review(ev.id, 'draft', true)} data-testid={`approval-request-changes-${ev.id}`} className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-white px-4 py-2.5 rounded-full hover:bg-amber-600 whitespace-nowrap"><MessageSquare className="h-4 w-4" /> Cere modificări</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {events.length === 0 && <p className="text-muted-foreground text-sm py-10 text-center">Nimic de aprobat — toate evenimentele sunt publicate.</p>}
      </div>
    </div>
  )
}
