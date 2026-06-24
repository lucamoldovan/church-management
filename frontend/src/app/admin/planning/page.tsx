'use client'

import { useEffect, useState, useCallback } from 'react'
import { CalendarRange, AlertTriangle, Boxes, CalendarClock, ClipboardList, CheckCircle2 } from 'lucide-react'
import { STATUS_LABELS, statusBadge } from '@/lib/eventOptions'

interface Ev {
  id: string; title: string; status: string; date: string | null; time: string | null
  location: string | null; department: string | null; facility_requirements: string[] | null
}

interface Conflict { date: string; type: string; resource: string; events: string[] }

const PENDING = ['draft', 'submitted', 'under_review']

export default function AdminPlanning() {
  const [events, setEvents] = useState<Ev[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const { data } = await createClient().from('events').select('id, title, status, date, time, location, department, facility_requirements').order('date', { ascending: true })
    setEvents((data as Ev[]) || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const today = new Date().toISOString().slice(0, 10)
  const active = events.filter(e => e.status !== 'rejected')

  const pending = events.filter(e => PENDING.includes(e.status)).length
  const approved = events.filter(e => e.status === 'approved' || e.status === 'published').length
  const upcoming = active.filter(e => e.date && e.date >= today)

  // Conflict detection: same date + shared facility OR shared location
  const byDate: Record<string, Ev[]> = {}
  active.filter(e => e.date).forEach(e => { (byDate[e.date as string] ||= []).push(e) })
  const conflicts: Conflict[] = []
  Object.entries(byDate).forEach(([date, evs]) => {
    if (evs.length < 2) return
    const facMap: Record<string, string[]> = {}
    evs.forEach(e => (e.facility_requirements || []).forEach(f => (facMap[f] ||= []).push(e.title)))
    Object.entries(facMap).forEach(([f, titles]) => { if (titles.length > 1) conflicts.push({ date, type: 'Dotare / spațiu', resource: f, events: titles }) })
    const locMap: Record<string, string[]> = {}
    evs.forEach(e => { if (e.location) (locMap[e.location] ||= []).push(e.title) })
    Object.entries(locMap).forEach(([loc, titles]) => { if (titles.length > 1) conflicts.push({ date, type: 'Locație', resource: loc, events: titles }) })
  })

  // Resource allocation: facility -> upcoming events using it
  const allocation: Record<string, { title: string; date: string | null }[]> = {}
  upcoming.forEach(e => (e.facility_requirements || []).forEach(f => (allocation[f] ||= []).push({ title: e.title, date: e.date })))

  const cards = [
    { label: 'Cereri în așteptare', value: pending, icon: ClipboardList },
    { label: 'Aprobate / publicate', value: approved, icon: CheckCircle2 },
    { label: 'Evenimente viitoare', value: upcoming.length, icon: CalendarClock },
    { label: 'Conflicte detectate', value: conflicts.length, icon: AlertTriangle },
  ]

  return (
    <div data-testid="admin-planning">
      <div className="flex items-center gap-2 mb-6"><CalendarRange className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Planificare</h1></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} data-testid={`planning-stat-${c.label}`} className="bg-card border border-border/60 rounded-3xl p-5 soft-shadow">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary mb-3"><Icon className="h-4 w-4" /></span>
              <div className="font-heading text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
            </div>
          )
        })}
      </div>

      {loading ? <p className="text-muted-foreground text-sm">Se încarcă...</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conflicts */}
          <div className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> Conflicte de programare</h2>
            {conflicts.length === 0 ? (
              <p data-testid="planning-no-conflicts" className="text-sm text-muted-foreground">Niciun conflict detectat. 🎉</p>
            ) : (
              <div className="flex flex-col gap-3">
                {conflicts.map((c, i) => (
                  <div key={i} data-testid={`planning-conflict-${i}`} className="border border-amber-200 bg-amber-50 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1"><span className="text-sm font-semibold text-amber-800">{c.resource}</span><span className="text-xs text-amber-700">{new Date(c.date).toLocaleDateString('ro-RO')}</span></div>
                    <div className="text-xs text-amber-700 mb-1.5">{c.type} · {c.events.length} evenimente suprapuse</div>
                    <div className="flex flex-wrap gap-1.5">{c.events.map((t, j) => <span key={j} className="text-xs px-2.5 py-1 rounded-full bg-white border border-amber-200">{t}</span>)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resource allocation */}
          <div className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" /> Alocare resurse & spații</h2>
            {Object.keys(allocation).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio resursă rezervată pentru evenimentele viitoare.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {Object.entries(allocation).map(([res, evs]) => (
                  <div key={res} data-testid={`planning-resource-${res}`}>
                    <div className="flex justify-between text-sm mb-1"><span className="font-medium">{res}</span><span className="text-primary font-semibold">{evs.length}</span></div>
                    <div className="flex flex-wrap gap-1.5">{evs.map((e, i) => <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-secondary">{e.title}{e.date ? ` · ${new Date(e.date).toLocaleDateString('ro-RO')}` : ''}</span>)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming events */}
          <div className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow lg:col-span-2">
            <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" /> Evenimente viitoare</h2>
            {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Niciun eveniment viitor programat.</p> : (
              <div className="flex flex-col divide-y divide-border/50">
                {upcoming.map(e => (
                  <div key={e.id} data-testid={`planning-upcoming-${e.id}`} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0"><div className="font-medium text-sm truncate">{e.title}</div><div className="text-xs text-muted-foreground">{e.location || '—'} · {e.department || '—'}</div></div>
                    <div className="flex items-center gap-2 shrink-0"><span className={`text-xs px-2.5 py-1 rounded-full ${statusBadge(e.status)}`}>{STATUS_LABELS[e.status] || e.status}</span><span className="text-xs text-muted-foreground w-24 text-right">{e.date ? new Date(e.date).toLocaleDateString('ro-RO') : ''}{e.time ? ` ${e.time.slice(0, 5)}` : ''}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
