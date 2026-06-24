'use client'

import { useEffect, useState, useCallback } from 'react'
import { Save, Plus, Trash2 } from 'lucide-react'

interface L { id: string; platform: string; url: string | null; is_active: boolean; display_order: number | null }

export default function AdminSocial() {
  const [items, setItems] = useState<L[]>([])
  const [msg, setMsg] = useState('')
  const [adding, setAdding] = useState({ platform: '', url: '' })

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const { data } = await createClient().from('social_media').select('*').order('display_order')
    setItems((data as L[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  const update = async (id: string, patch: Partial<L>) => {
    const { createClient } = await import('@/lib/supabase/client')
    const { error } = await createClient().from('social_media').update(patch).eq('id', id)
    setMsg(error ? error.message : 'Salvat!')
    setItems(items.map(i => i.id === id ? { ...i, ...patch } : i))
  }
  const add = async () => {
    if (!adding.platform) return
    const { createClient } = await import('@/lib/supabase/client')
    await createClient().from('social_media').insert({ platform: adding.platform, url: adding.url, is_active: true, display_order: items.length + 1 })
    setAdding({ platform: '', url: '' }); load()
  }
  const remove = async (id: string) => { const { createClient } = await import('@/lib/supabase/client'); await createClient().from('social_media').delete().eq('id', id); load() }

  return (
    <div data-testid="admin-social" className="max-w-2xl">
      <h1 className="font-heading text-3xl font-bold mb-6">Social Media</h1>
      {msg && <div className="bg-primary/10 text-primary px-4 py-3 rounded-2xl text-sm mb-4">{msg}</div>}
      <div className="flex flex-col gap-3 mb-6">
        {items.map(l => (
          <div key={l.id} className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3 soft-shadow">
            <span className="text-sm font-medium w-24 capitalize shrink-0">{l.platform}</span>
            <input value={l.url || ''} onChange={e => setItems(items.map(i => i.id === l.id ? { ...i, url: e.target.value } : i))} onBlur={e => update(l.id, { url: e.target.value })} placeholder="URL" className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" data-testid={`social-url-${l.platform}`} />
            <label className="flex items-center gap-1.5 text-xs shrink-0"><input type="checkbox" checked={l.is_active} onChange={e => update(l.id, { is_active: e.target.checked })} /> activ</label>
            <button onClick={() => remove(l.id)} className="p-2 rounded-full hover:bg-destructive/10 text-destructive shrink-0"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="bg-secondary/40 rounded-2xl p-4 flex items-center gap-3">
        <input placeholder="platformă (ex: instagram)" value={adding.platform} onChange={e => setAdding({ ...adding, platform: e.target.value })} className="px-3 py-2 border border-border rounded-lg bg-background text-sm" />
        <input placeholder="URL" value={adding.url} onChange={e => setAdding({ ...adding, url: e.target.value })} className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm" />
        <button onClick={add} className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-semibold"><Plus className="h-4 w-4" /> Adaugă</button>
      </div>
    </div>
  )
}
