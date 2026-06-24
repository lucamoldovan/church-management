'use client'

import { useState } from 'react'
import { ScanLine, Check, AlertCircle, Utensils, LogIn } from 'lucide-react'

interface Reg { id: string; event_title: string | null; package_name: string | null; payment_status: string; checked_in: boolean; attendee_id: string; event_id: string | null }

export default function AdminCheckin() {
  const [code, setCode] = useState('')
  const [reg, setReg] = useState<Reg | null>(null)
  const [status, setStatus] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setReg(null); setStatus(null)
    if (!code.trim()) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const c = code.trim()
    const { data } = await supabase.from('registrations').select('*').or(`qr_token.eq.${c},attendee_id.eq.${c}`).maybeSingle()
    if (!data) { setStatus({ type: 'err', text: 'Bilet negăsit sau cod invalid.' }); return }
    setReg(data as Reg)
    setStatus({ type: 'info', text: (data as Reg).checked_in ? 'Atenție: deja a făcut check-in la intrare.' : 'Bilet valid.' })
  }

  const checkInEntry = async () => {
    if (!reg) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error: ce } = await supabase.from('checkins').insert({ registration_id: reg.id, event_id: reg.event_id, scanned_by: user?.id, type: 'entry', day_date: new Date().toISOString().slice(0, 10) })
    if (ce && ce.code === '23505') { setStatus({ type: 'err', text: 'Intrarea a fost deja validată azi.' }); return }
    if (ce) { setStatus({ type: 'err', text: ce.message }); return }
    await supabase.from('registrations').update({ checked_in: true, checked_in_at: new Date().toISOString() }).eq('id', reg.id)
    setReg({ ...reg, checked_in: true })
    setStatus({ type: 'ok', text: 'Check-in intrare reușit ✓' })
  }

  const checkMeal = async (meal: string) => {
    if (!reg) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('checkins').insert({ registration_id: reg.id, event_id: reg.event_id, scanned_by: user?.id, type: 'meal', meal, day_date: new Date().toISOString().slice(0, 10) })
    if (error && error.code === '23505') { setStatus({ type: 'err', text: `Masa "${meal}" a fost deja folosită azi.` }); return }
    if (error) { setStatus({ type: 'err', text: error.message }); return }
    setStatus({ type: 'ok', text: `Masă validată: ${meal} ✓` })
  }

  const meals = [{ k: 'breakfast', l: 'Mic dejun' }, { k: 'lunch', l: 'Prânz' }, { k: 'dinner', l: 'Cină' }]

  return (
    <div data-testid="admin-checkin" className="max-w-lg">
      <div className="flex items-center gap-2 mb-6"><ScanLine className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Check-in</h1></div>
      <p className="text-muted-foreground text-sm mb-5">Scanează codul QR de pe telefon sau introdu manual codul biletului / ID-ul NFC al participantului.</p>

      <form onSubmit={lookup} className="flex gap-2 mb-5">
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Cod QR / ID participant" data-testid="checkin-code-input"
          className="flex-1 px-4 py-3 border border-border rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
        <button type="submit" data-testid="checkin-validate-button" className="bg-primary text-primary-foreground px-6 py-3 rounded-full text-sm font-semibold hover:bg-primary/90">Validează</button>
      </form>

      {status && (
        <div data-testid="checkin-status" className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm mb-5 ${status.type === 'ok' ? 'bg-primary/10 text-primary' : status.type === 'err' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}>
          {status.type === 'ok' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {status.text}
        </div>
      )}

      {reg && (
        <div data-testid="checkin-result" className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
          <h2 className="font-heading font-semibold text-lg">{reg.event_title}</h2>
          <p className="text-sm text-muted-foreground mb-1">{reg.package_name}</p>
          <div className="flex gap-2 mb-5 mt-2">
            <span className={`text-xs px-3 py-1 rounded-full ${reg.payment_status === 'paid' ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>Plată: {reg.payment_status}</span>
            <span className={`text-xs px-3 py-1 rounded-full ${reg.checked_in ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>{reg.checked_in ? 'Prezent' : 'Neînregistrat'}</span>
          </div>
          <button onClick={checkInEntry} data-testid="checkin-entry-button" className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 mb-4"><LogIn className="h-4 w-4" /> Check-in intrare</button>
          <div className="text-sm font-medium mb-2 flex items-center gap-1.5"><Utensils className="h-4 w-4 text-primary" /> Masă (azi)</div>
          <div className="grid grid-cols-3 gap-2">
            {meals.map(m => (
              <button key={m.k} onClick={() => checkMeal(m.k)} data-testid={`checkin-meal-${m.k}`} className="bg-card border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-secondary/60 transition-colors">{m.l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
