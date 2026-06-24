'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Trash2, Pencil, X, Upload, ImageIcon } from 'lucide-react'
import { formatPrice } from '@/lib/eventImages'
import { FACILITY_OPTIONS, EVENT_STATUSES, STATUS_LABELS, statusBadge } from '@/lib/eventOptions'

interface Ev {
  id: string; title: string; description: string | null; category: string | null
  location: string | null; date: string | null; time: string | null
  price: number | null; capacity: number | null; status: string; department: string | null
  expected_attendance: number | null; budget_notes: string | null; resource_notes: string | null
  facility_requirements: string[] | null; poster_url: string | null
}

const empty = {
  title: '', description: '', category: '', location: '', date: '', time: '', price: 0, capacity: 0,
  status: 'draft', department: '', expected_attendance: 0, budget_notes: '', resource_notes: '',
  facility_requirements: [] as string[], poster_url: '',
}
type Form = typeof empty & { id?: string }

export default function AdminEvents() {
  const [events, setEvents] = useState<Ev[]>([])
  const [editing, setEditing] = useState<Form | null>(null)
  const [msg, setMsg] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    setEvents((data as Ev[]) || [])
  }, [])

  useEffect(() => { load() }, [load])

  const uploadPoster = async (file: File) => {
    setUploading(true); setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `posters/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('posters').upload(path, file, { upsert: true })
    if (error) { setMsg(`Eroare poster: ${error.message}`); setUploading(false); return }
    const { data } = supabase.storage.from('posters').getPublicUrl(path)
    setEditing(prev => prev ? { ...prev, poster_url: data.publicUrl } : prev)
    setUploading(false)
  }

  const toggleFacility = (f: string) => {
    if (!editing) return
    const has = editing.facility_requirements.includes(f)
    setEditing({ ...editing, facility_requirements: has ? editing.facility_requirements.filter(x => x !== f) : [...editing.facility_requirements, f] })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return; setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      title: editing.title, description: editing.description, category: editing.category,
      location: editing.location, date: editing.date || null, time: editing.time || null,
      price: Number(editing.price) || 0, capacity: Number(editing.capacity) || 0,
      status: editing.status, department: editing.department,
      expected_attendance: Number(editing.expected_attendance) || null,
      budget_notes: editing.budget_notes, resource_notes: editing.resource_notes,
      facility_requirements: editing.facility_requirements, poster_url: editing.poster_url || null,
    }
    const res = editing.id
      ? await supabase.from('events').update(payload).eq('id', editing.id)
      : await supabase.from('events').insert({ ...payload, created_by: user?.id })
    if (res.error) { setMsg(`Eroare: ${res.error.message}`); return }
    setEditing(null); load()
  }

  const remove = async (id: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('events').delete().eq('id', id)
    load()
  }

  const editEv = (ev: Ev) => setEditing({
    id: ev.id, title: ev.title || '', description: ev.description || '', category: ev.category || '',
    location: ev.location || '', date: ev.date || '', time: ev.time || '', price: Number(ev.price) || 0,
    capacity: Number(ev.capacity) || 0, status: ev.status || 'draft', department: ev.department || '',
    expected_attendance: Number(ev.expected_attendance) || 0, budget_notes: ev.budget_notes || '',
    resource_notes: ev.resource_notes || '', facility_requirements: ev.facility_requirements || [], poster_url: ev.poster_url || '',
  })

  const field = 'px-4 py-2.5 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40'

  return (
    <div data-testid="admin-events">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl font-bold">Evenimente</h1>
        <button data-testid="admin-event-new" onClick={() => setEditing({ ...empty })}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Propune eveniment
        </button>
      </div>

      {msg && <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-2xl text-sm mb-4">{msg}</div>}

      <div className="flex flex-col gap-3">
        {events.map(ev => (
          <div key={ev.id} data-testid={`admin-event-row-${ev.id}`} className="bg-card border border-border/60 rounded-2xl p-5 flex items-center justify-between gap-4 soft-shadow">
            <div className="flex items-center gap-4 min-w-0">
              {ev.poster_url ? <img src={ev.poster_url} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" /> : <div className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center shrink-0"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-semibold truncate">{ev.title}</h3>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full ${statusBadge(ev.status)}`}>{STATUS_LABELS[ev.status] || ev.status}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{ev.category} · {ev.department || '—'} · {ev.location} · {formatPrice(ev.price)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button data-testid={`admin-event-edit-${ev.id}`} onClick={() => editEv(ev)}
                className="p-2 rounded-full hover:bg-secondary/60" aria-label="Editează"><Pencil className="h-4 w-4" /></button>
              <button data-testid={`admin-event-delete-${ev.id}`} onClick={() => remove(ev.id)} className="p-2 rounded-full hover:bg-destructive/10 text-destructive" aria-label="Șterge"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {events.length === 0 && <p className="text-muted-foreground text-sm py-10 text-center">Niciun eveniment. Propune primul.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="admin-event-modal">
          <form onSubmit={save} className="bg-card rounded-3xl p-7 w-full max-w-2xl soft-shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-xl font-bold">{editing.id ? 'Editează eveniment' : 'Propunere eveniment'}</h2>
              <button type="button" onClick={() => setEditing(null)} className="p-2 rounded-full hover:bg-secondary/60"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <input required data-testid="event-form-title" placeholder="Titlu eveniment" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className={field} />
              <textarea placeholder="Descriere" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} className={field} />
              <div className="grid grid-cols-2 gap-3">
                <input data-testid="event-form-department" placeholder="Departament" value={editing.department} onChange={e => setEditing({ ...editing, department: e.target.value })} className={field} />
                <input placeholder="Categorie" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} className={field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground ml-1">Data propusă</label><input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} className={`${field} w-full`} /></div>
                <div><label className="text-xs text-muted-foreground ml-1">Ora propusă</label><input type="time" value={editing.time} onChange={e => setEditing({ ...editing, time: e.target.value })} className={`${field} w-full`} /></div>
              </div>
              <input placeholder="Locație" value={editing.location} onChange={e => setEditing({ ...editing, location: e.target.value })} className={field} />
              <div className="grid grid-cols-3 gap-3">
                <input type="number" placeholder="Preț (RON)" value={editing.price} onChange={e => setEditing({ ...editing, price: Number(e.target.value) })} className={field} />
                <input type="number" placeholder="Capacitate" value={editing.capacity} onChange={e => setEditing({ ...editing, capacity: Number(e.target.value) })} className={field} />
                <input type="number" data-testid="event-form-attendance" placeholder="Participanți estimați" value={editing.expected_attendance} onChange={e => setEditing({ ...editing, expected_attendance: Number(e.target.value) })} className={field} />
              </div>

              {/* Poster upload */}
              <div className="border border-border/60 rounded-2xl p-4">
                <div className="text-sm font-medium mb-2 flex items-center gap-1.5"><ImageIcon className="h-4 w-4 text-primary" /> Poster</div>
                <div className="flex items-center gap-3">
                  {editing.poster_url && <img src={editing.poster_url} alt="poster" className="h-16 w-16 rounded-xl object-cover" />}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" data-testid="event-form-poster-input" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPoster(f) }} />
                  <button type="button" data-testid="event-form-poster-button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 bg-secondary px-4 py-2 rounded-full text-sm font-medium hover:bg-secondary/70 disabled:opacity-50">
                    <Upload className="h-4 w-4" /> {uploading ? 'Se încarcă...' : editing.poster_url ? 'Schimbă posterul' : 'Încarcă poster'}
                  </button>
                </div>
              </div>

              <textarea data-testid="event-form-budget" placeholder="Cerințe de buget (ex. catering 2000 RON, materiale...)" value={editing.budget_notes} onChange={e => setEditing({ ...editing, budget_notes: e.target.value })} rows={2} className={field} />
              <textarea data-testid="event-form-resources" placeholder="Cerințe de resurse (voluntari, echipamente specifice...)" value={editing.resource_notes} onChange={e => setEditing({ ...editing, resource_notes: e.target.value })} rows={2} className={field} />

              {/* Facility & space requirements */}
              <div className="border border-border/60 rounded-2xl p-4">
                <div className="text-sm font-medium mb-3">Cerințe spațiu & dotări</div>
                <div className="grid grid-cols-2 gap-2">
                  {FACILITY_OPTIONS.map(f => (
                    <label key={f} data-testid={`event-form-facility-${f}`} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={editing.facility_requirements.includes(f)} onChange={() => toggleFacility(f)} className="h-4 w-4 rounded accent-primary" />
                      {f}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground ml-1">Status</label>
                <select data-testid="event-form-status" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} className={`${field} w-full`}>
                  {EVENT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>

              <button type="submit" data-testid="event-form-save" className="bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 transition-colors mt-2">Salvează</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
