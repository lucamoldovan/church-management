'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import { formatPrice } from '@/lib/eventImages'

interface Ev {
  id: string; title: string; description: string | null; category: string | null
  location: string | null; date: string | null; time: string | null
  price: number | null; capacity: number | null; status: string; department: string | null
}
const empty = { title: '', description: '', category: '', location: '', date: '', time: '', price: 0, capacity: 0, status: 'published', department: '' }
const STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'published']

export default function AdminEvents() {
  const [events, setEvents] = useState<Ev[]>([])
  const [editing, setEditing] = useState<typeof empty & { id?: string } | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    setEvents((data as Ev[]) || [])
  }, [])

  useEffect(() => { load() }, [load])

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

  return (
    <div data-testid="admin-events">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl font-bold">Evenimente</h1>
        <button data-testid="admin-event-new" onClick={() => setEditing({ ...empty })}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Eveniment nou
        </button>
      </div>

      {msg && <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-2xl text-sm mb-4">{msg}</div>}

      <div className="flex flex-col gap-3">
        {events.map(ev => (
          <div key={ev.id} data-testid={`admin-event-row-${ev.id}`} className="bg-card border border-border/60 rounded-2xl p-5 flex items-center justify-between gap-4 soft-shadow">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-semibold truncate">{ev.title}</h3>
                <span className={`text-xs px-2.5 py-0.5 rounded-full ${ev.status === 'published' ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>{ev.status}</span>
              </div>
              <p className="text-sm text-muted-foreground truncate">{ev.category} · {ev.location} · {formatPrice(ev.price)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button data-testid={`admin-event-edit-${ev.id}`} onClick={() => setEditing({ id: ev.id, title: ev.title || '', description: ev.description || '', category: ev.category || '', location: ev.location || '', date: ev.date || '', time: ev.time || '', price: Number(ev.price) || 0, capacity: Number(ev.capacity) || 0, status: ev.status || 'published', department: ev.department || '' })}
                className="p-2 rounded-full hover:bg-secondary/60" aria-label="Editează"><Pencil className="h-4 w-4" /></button>
              <button data-testid={`admin-event-delete-${ev.id}`} onClick={() => remove(ev.id)} className="p-2 rounded-full hover:bg-destructive/10 text-destructive" aria-label="Șterge"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {events.length === 0 && <p className="text-muted-foreground text-sm py-10 text-center">Niciun eveniment. Creează primul.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="admin-event-modal">
          <form onSubmit={save} className="bg-card rounded-3xl p-7 w-full max-w-lg soft-shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-xl font-bold">{editing.id ? 'Editează eveniment' : 'Eveniment nou'}</h2>
              <button type="button" onClick={() => setEditing(null)} className="p-2 rounded-full hover:bg-secondary/60"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <input required data-testid="event-form-title" placeholder="Titlu" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              <textarea placeholder="Descriere" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Categorie" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
                <input placeholder="Locație" value={editing.location} onChange={e => setEditing({ ...editing, location: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
                <input type="time" value={editing.time} onChange={e => setEditing({ ...editing, time: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Preț (RON)" value={editing.price} onChange={e => setEditing({ ...editing, price: Number(e.target.value) })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
                <input type="number" placeholder="Capacitate" value={editing.capacity} onChange={e => setEditing({ ...editing, capacity: Number(e.target.value) })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Departament" value={editing.department} onChange={e => setEditing({ ...editing, department: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
                <select data-testid="event-form-status" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm">
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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
