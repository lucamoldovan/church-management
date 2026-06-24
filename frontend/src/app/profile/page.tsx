'use client'

import { useEffect, useState } from 'react'
import { User, Save, Shield } from 'lucide-react'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ full_name: '', phone: '', department: '', date_of_birth: '', emergency_contact: '' })
  const [meta, setMeta] = useState({ email: '', role: 'member', nfc_id: '' })

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (p) {
        setForm({
          full_name: p.full_name || '', phone: p.phone || '', department: p.department || '',
          date_of_birth: p.date_of_birth || '', emergency_contact: p.emergency_contact || '',
        })
        setMeta({ email: p.email || user.email || '', role: p.role || 'member', nfc_id: p.nfc_id || '' })
      }
      setLoading(false)
    }
    load()
  }, [])

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setMsg('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name, phone: form.phone, department: form.department,
      date_of_birth: form.date_of_birth || null, emergency_contact: form.emergency_contact,
    }).eq('id', user!.id)
    setMsg(error ? `Eroare: ${error.message}` : 'Profil salvat!')
    setSaving(false)
  }

  if (loading) return <div className="min-h-[70vh] flex items-center justify-center text-muted-foreground">Se încarcă...</div>

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div>
      <label className="text-sm font-medium mb-1.5 block">{label}</label>
      <input type={type} data-testid={`profile-${key}`} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
        className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
    </div>
  )

  return (
    <div data-testid="profile-page" className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center gap-4 mb-8">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><User className="h-7 w-7" /></span>
        <div>
          <h1 className="font-heading text-3xl font-bold">Profilul meu</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">{meta.email} · <span className="inline-flex items-center gap-1 text-primary"><Shield className="h-3.5 w-3.5" />{meta.role}</span></p>
        </div>
      </div>

      <form onSubmit={save} className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow flex flex-col gap-4">
        {msg && <div data-testid="profile-message" className={`px-4 py-3 rounded-2xl text-sm ${msg.startsWith('Eroare') ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{msg}</div>}
        {field('Nume complet', 'full_name')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Telefon', 'phone')}
          {field('Data nașterii', 'date_of_birth', 'date')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Departament', 'department')}
          {field('Contact de urgență', 'emergency_contact')}
        </div>
        {meta.nfc_id && <div className="text-xs text-muted-foreground">ID NFC: <span className="font-mono">{meta.nfc_id}</span></div>}
        <button type="submit" disabled={saving} data-testid="profile-save-button"
          className="self-start inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 mt-2">
          <Save className="h-4 w-4" /> {saving ? 'Se salvează...' : 'Salvează'}
        </button>
      </form>
    </div>
  )
}
