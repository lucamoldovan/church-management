'use client'

import { useEffect, useState } from 'react'
import { authClient } from '@/lib/cloudflare/auth-client'
import { User, Save, Shield, Trash2 } from 'lucide-react'

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ full_name: '', phone: '', department: '', date_of_birth: '', emergency_contact: '' })
  const [meta, setMeta] = useState({ email: '', role: 'member', nfc_id: '' })

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/cloudflare/browser-db')
      const db = createClient()
      const { data: { user } } = await db.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: p } = await db.from('profiles').select('*').eq('id', user.id).single()
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
    const { createClient } = await import('@/lib/cloudflare/browser-db')
    const db = createClient()
    const { data: { user } } = await db.auth.getUser()
    const { error } = await db.from('profiles').update({
      full_name: form.full_name, phone: form.phone, department: form.department,
      date_of_birth: form.date_of_birth || null, emergency_contact: form.emergency_contact,
    }).eq('id', user!.id)
    setMsg(error ? `Eroare: ${error.message}` : 'Profil salvat!')
    setSaving(false)
  }

  const deleteAccount = async () => {
    if (!window.confirm('Sigur vrei să ștergi definitiv contul? Această acțiune nu poate fi anulată.')) return
    setSaving(true)
    setMsg('')
    const { error } = await authClient.deleteUser()
    if (error) {
      setMsg(`Eroare: ${error.message}`)
      setSaving(false)
      return
    }
    window.location.href = '/'
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

      <div className="mt-6 border border-destructive/30 bg-destructive/5 rounded-3xl p-6">
        <div className="flex items-start gap-3">
          <Trash2 className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1">
            <h2 className="font-heading font-semibold">Șterge contul</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Ștergerea contului elimină datele personale asociate contului. Înregistrările și datele care trebuie păstrate pentru obligații legale sau contabile pot fi păstrate conform politicii de retenție.</p>
            <button type="button" onClick={deleteAccount} disabled={saving}
              className="inline-flex items-center gap-2 border border-destructive/40 text-destructive px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-destructive/10 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Șterge definitiv contul
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
