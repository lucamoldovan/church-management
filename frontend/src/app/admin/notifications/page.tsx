'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bell, Send } from 'lucide-react'

interface N { id: string; title: string; body: string | null; created_at: string }

export default function AdminNotifications() {
  const [form, setForm] = useState({ title: '', body: '' })
  const [recent, setRecent] = useState<N[]>([])
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const { data } = await createClient().from('notifications').select('id, title, body, created_at').order('created_at', { ascending: false }).limit(15)
    setRecent((data as N[]) || [])
  }, [])
  useEffect(() => { load() }, [load])

  const broadcast = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: profiles } = await supabase.from('profiles').select('id')
    const rows = (profiles || []).map(p => ({ user_id: p.id, title: form.title, body: form.body, type: 'broadcast' }))
    if (rows.length === 0) { setMsg('Niciun utilizator.'); setLoading(false); return }
    const { error } = await supabase.from('notifications').insert(rows)
    setMsg(error ? `Eroare: ${error.message}` : `Trimis către ${rows.length} utilizatori ✓`)
    if (!error) { setForm({ title: '', body: '' }); load() }
    setLoading(false)
  }

  return (
    <div data-testid="admin-notifications" className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6"><Bell className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Notificări</h1></div>
      <form onSubmit={broadcast} className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow flex flex-col gap-4 mb-8">
        <h2 className="font-heading font-semibold">Trimite un anunț tuturor</h2>
        {msg && <div className={`px-4 py-3 rounded-2xl text-sm ${msg.startsWith('Eroare') ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{msg}</div>}
        <input required placeholder="Titlu" data-testid="notif-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="px-4 py-3 border border-border rounded-xl bg-background text-sm" />
        <textarea required placeholder="Mesaj" data-testid="notif-body" rows={3} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} className="px-4 py-3 border border-border rounded-xl bg-background text-sm" />
        <button type="submit" disabled={loading} data-testid="notif-send" className="self-start inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary/90 disabled:opacity-50"><Send className="h-4 w-4" /> {loading ? 'Se trimite...' : 'Trimite'}</button>
      </form>
      <h2 className="font-heading font-semibold mb-3">Recente</h2>
      <div className="flex flex-col gap-2">
        {recent.map(n => (
          <div key={n.id} className="bg-card border border-border/60 rounded-2xl p-4"><div className="font-medium text-sm">{n.title}</div><p className="text-sm text-muted-foreground">{n.body}</p><div className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('ro-RO')}</div></div>
        ))}
        {recent.length === 0 && <p className="text-sm text-muted-foreground">Nicio notificare trimisă.</p>}
      </div>
    </div>
  )
}
