'use client'

import { useEffect, useState } from 'react'
import { Radio, Save } from 'lucide-react'

export default function AdminLivestream() {
  const [form, setForm] = useState({ id: '', youtube_url: '', facebook_url: '', is_active: false, next_stream_title: '', next_stream_date: '' })
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const { data } = await createClient().from('livestream_config').select('*').limit(1).maybeSingle()
      if (data) setForm({
        id: data.id, youtube_url: data.youtube_url || '', facebook_url: data.facebook_url || '',
        is_active: data.is_active || false, next_stream_title: data.next_stream_title || '',
        next_stream_date: data.next_stream_date ? data.next_stream_date.slice(0, 16) : '',
      })
      setLoading(false)
    }
    load()
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const payload = {
      youtube_url: form.youtube_url, facebook_url: form.facebook_url, is_active: form.is_active,
      next_stream_title: form.next_stream_title, next_stream_date: form.next_stream_date || null, updated_at: new Date().toISOString(),
    }
    const res = form.id ? await supabase.from('livestream_config').update(payload).eq('id', form.id) : await supabase.from('livestream_config').insert(payload)
    setMsg(res.error ? `Eroare: ${res.error.message}` : 'Salvat!')
  }

  if (loading) return <div className="text-muted-foreground">Se încarcă...</div>

  return (
    <div data-testid="admin-livestream" className="max-w-xl">
      <div className="flex items-center gap-2 mb-6"><Radio className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Configurare Live</h1></div>
      <form onSubmit={save} className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow flex flex-col gap-4">
        {msg && <div className={`px-4 py-3 rounded-2xl text-sm ${msg.startsWith('Eroare') ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{msg}</div>}
        <label className="flex items-center gap-3 bg-secondary/40 rounded-xl px-4 py-3">
          <input type="checkbox" data-testid="live-is-active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
          <span className="text-sm font-medium">Transmisie LIVE activă acum</span>
        </label>
        <div><label className="text-sm font-medium mb-1.5 block">YouTube URL</label><input data-testid="live-youtube" value={form.youtube_url} onChange={e => setForm({ ...form, youtube_url: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm" /></div>
        <div><label className="text-sm font-medium mb-1.5 block">Facebook URL</label><input value={form.facebook_url} onChange={e => setForm({ ...form, facebook_url: e.target.value })} placeholder="https://www.facebook.com/..." className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium mb-1.5 block">Următoarea transmisie</label><input value={form.next_stream_title} onChange={e => setForm({ ...form, next_stream_title: e.target.value })} placeholder="Titlu" className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm" /></div>
          <div><label className="text-sm font-medium mb-1.5 block">Data/ora</label><input type="datetime-local" value={form.next_stream_date} onChange={e => setForm({ ...form, next_stream_date: e.target.value })} className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm" /></div>
        </div>
        <button type="submit" data-testid="live-save" className="self-start inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary/90 mt-2"><Save className="h-4 w-4" /> Salvează</button>
      </form>
    </div>
  )
}
