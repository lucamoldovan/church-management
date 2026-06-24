'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, X } from 'lucide-react'

interface G { id: string; name: string; description: string | null; meeting_day: string | null; meeting_time: string | null; meeting_location: string | null; capacity: number | null; leader_id: string | null; is_active: boolean }
interface P { id: string; full_name: string | null; email: string | null }
const empty = { name: '', description: '', meeting_day: '', meeting_time: '', meeting_location: '', capacity: 0, leader_id: '', is_active: true }

export default function AdminGroups() {
  const [groups, setGroups] = useState<G[]>([])
  const [profiles, setProfiles] = useState<P[]>([])
  const [editing, setEditing] = useState<typeof empty & { id?: string } | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const [{ data: g }, { data: p }] = await Promise.all([
      supabase.from('study_groups').select('*').order('name'),
      supabase.from('profiles').select('id, full_name, email'),
    ])
    setGroups((g as G[]) || [])
    setProfiles((p as P[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return; setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const payload = {
      name: editing.name, description: editing.description, meeting_day: editing.meeting_day,
      meeting_time: editing.meeting_time || null, meeting_location: editing.meeting_location,
      capacity: Number(editing.capacity) || 0, leader_id: editing.leader_id || null, is_active: editing.is_active,
    }
    const res = editing.id ? await supabase.from('study_groups').update(payload).eq('id', editing.id) : await supabase.from('study_groups').insert(payload)
    if (res.error) { setMsg(`Eroare: ${res.error.message}`); return }
    setEditing(null); load()
  }
  const remove = async (id: string) => {
    const { createClient } = await import('@/lib/supabase/client')
    await createClient().from('study_groups').delete().eq('id', id); load()
  }

  return (
    <div data-testid="admin-groups">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl font-bold">Grupuri de studiu</h1>
        <button data-testid="admin-group-new" onClick={() => setEditing({ ...empty })} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90"><Plus className="h-4 w-4" /> Grup nou</button>
      </div>
      {msg && <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-2xl text-sm mb-4">{msg}</div>}
      <div className="flex flex-col gap-3">
        {groups.map(g => (
          <div key={g.id} data-testid={`admin-group-row-${g.id}`} className="bg-card border border-border/60 rounded-2xl p-5 flex items-center justify-between gap-4 soft-shadow">
            <div className="min-w-0"><h3 className="font-heading font-semibold truncate">{g.name}</h3><p className="text-sm text-muted-foreground truncate">{g.meeting_day} · {g.meeting_location} {g.is_active ? '' : '· inactiv'}</p></div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setEditing({ id: g.id, name: g.name || '', description: g.description || '', meeting_day: g.meeting_day || '', meeting_time: g.meeting_time || '', meeting_location: g.meeting_location || '', capacity: Number(g.capacity) || 0, leader_id: g.leader_id || '', is_active: g.is_active })} className="p-2 rounded-full hover:bg-secondary/60"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(g.id)} className="p-2 rounded-full hover:bg-destructive/10 text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-muted-foreground text-sm py-10 text-center">Niciun grup.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="bg-card rounded-3xl p-7 w-full max-w-lg soft-shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5"><h2 className="font-heading text-xl font-bold">{editing.id ? 'Editează grup' : 'Grup nou'}</h2><button type="button" onClick={() => setEditing(null)} className="p-2 rounded-full hover:bg-secondary/60"><X className="h-5 w-5" /></button></div>
            <div className="flex flex-col gap-3">
              <input required placeholder="Nume" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" data-testid="group-form-name" />
              <textarea placeholder="Descriere" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={2} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Ziua (ex: Marți)" value={editing.meeting_day} onChange={e => setEditing({ ...editing, meeting_day: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
                <input type="time" value={editing.meeting_time} onChange={e => setEditing({ ...editing, meeting_time: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Locație" value={editing.meeting_location} onChange={e => setEditing({ ...editing, meeting_location: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
                <input type="number" placeholder="Capacitate" value={editing.capacity} onChange={e => setEditing({ ...editing, capacity: Number(e.target.value) })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              </div>
              <select value={editing.leader_id} onChange={e => setEditing({ ...editing, leader_id: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" data-testid="group-form-leader">
                <option value="">— Alege lider —</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Activ</label>
              <button type="submit" data-testid="group-form-save" className="bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 mt-2">Salvează</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
