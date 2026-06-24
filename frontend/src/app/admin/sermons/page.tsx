'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, X } from 'lucide-react'

interface S { id: string; title: string; speaker: string | null; date: string | null; description: string | null; youtube_url: string | null; thumbnail_url: string | null; category: string | null; tags: string[] | null; published: boolean }
const empty = { title: '', speaker: '', date: '', description: '', youtube_url: '', thumbnail_url: '', category: '', tags: '', published: true }

export default function AdminSermons() {
  const [items, setItems] = useState<S[]>([])
  const [editing, setEditing] = useState<typeof empty & { id?: string } | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const { data } = await createClient().from('sermons').select('*').order('date', { ascending: false })
    setItems((data as S[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return; setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const payload = {
      title: editing.title, speaker: editing.speaker, date: editing.date || null, description: editing.description,
      youtube_url: editing.youtube_url, thumbnail_url: editing.thumbnail_url, category: editing.category,
      tags: editing.tags ? editing.tags.split(',').map(t => t.trim()).filter(Boolean) : [], published: editing.published,
    }
    const res = editing.id ? await supabase.from('sermons').update(payload).eq('id', editing.id) : await supabase.from('sermons').insert(payload)
    if (res.error) { setMsg(`Eroare: ${res.error.message}`); return }
    setEditing(null); load()
  }
  const remove = async (id: string) => { const { createClient } = await import('@/lib/supabase/client'); await createClient().from('sermons').delete().eq('id', id); load() }

  return (
    <div data-testid="admin-sermons">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl font-bold">Predici</h1>
        <button data-testid="admin-sermon-new" onClick={() => setEditing({ ...empty })} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90"><Plus className="h-4 w-4" /> Predică nouă</button>
      </div>
      {msg && <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-2xl text-sm mb-4">{msg}</div>}
      <div className="flex flex-col gap-3">
        {items.map(s => (
          <div key={s.id} className="bg-card border border-border/60 rounded-2xl p-5 flex items-center justify-between gap-4 soft-shadow">
            <div className="min-w-0"><div className="flex items-center gap-2"><h3 className="font-heading font-semibold truncate">{s.title}</h3>{!s.published && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">draft</span>}</div><p className="text-sm text-muted-foreground truncate">{s.speaker} · {s.date} · {s.category}</p></div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setEditing({ id: s.id, title: s.title || '', speaker: s.speaker || '', date: s.date || '', description: s.description || '', youtube_url: s.youtube_url || '', thumbnail_url: s.thumbnail_url || '', category: s.category || '', tags: (s.tags || []).join(', '), published: s.published })} className="p-2 rounded-full hover:bg-secondary/60"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(s.id)} className="p-2 rounded-full hover:bg-destructive/10 text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-muted-foreground text-sm py-10 text-center">Nicio predică.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="bg-card rounded-3xl p-7 w-full max-w-lg soft-shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5"><h2 className="font-heading text-xl font-bold">{editing.id ? 'Editează' : 'Predică nouă'}</h2><button type="button" onClick={() => setEditing(null)} className="p-2 rounded-full hover:bg-secondary/60"><X className="h-5 w-5" /></button></div>
            <div className="flex flex-col gap-3">
              <input required placeholder="Titlu" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" data-testid="sermon-form-title" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Vorbitor" value={editing.speaker} onChange={e => setEditing({ ...editing, speaker: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
                <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              </div>
              <textarea placeholder="Descriere" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={2} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              <input placeholder="YouTube URL" value={editing.youtube_url} onChange={e => setEditing({ ...editing, youtube_url: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              <input placeholder="Thumbnail URL" value={editing.thumbnail_url} onChange={e => setEditing({ ...editing, thumbnail_url: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Categorie" value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
                <input placeholder="Tag-uri (separate prin ,)" value={editing.tags} onChange={e => setEditing({ ...editing, tags: e.target.value })} className="px-4 py-2.5 border border-border rounded-xl bg-background text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.published} onChange={e => setEditing({ ...editing, published: e.target.checked })} /> Publicat</label>
              <button type="submit" data-testid="sermon-form-save" className="bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 mt-2">Salvează</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
