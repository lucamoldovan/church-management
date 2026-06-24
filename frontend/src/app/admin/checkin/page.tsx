'use client'

import { useState, useRef } from 'react'
import { ScanLine, Check, AlertCircle, Utensils, LogIn, Wallet, Watch, Link2, Search, User } from 'lucide-react'

interface Profile { full_name: string | null; email: string | null }
interface Reg {
  id: string; event_title: string | null; package_name: string | null; package_price: number
  payment_status: string; payment_method?: string | null; checked_in: boolean; attendee_id: string
  event_id: string | null; bracelet_code?: string | null; user_id?: string | null; profiles?: Profile | null
}

export default function AdminCheckin() {
  const [code, setCode] = useState('')
  const [reg, setReg] = useState<Reg | null>(null)
  const [freeBracelet, setFreeBracelet] = useState('')      // scanned available bracelet awaiting assignment
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Reg[]>([])
  const [searching, setSearching] = useState(false)
  const [braceletInput, setBraceletInput] = useState('')    // reassign field on attendee card
  const [status, setStatus] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sb = async () => (await import('@/lib/supabase/client')).createClient()
  const name = (r: Reg | null) => r?.profiles?.full_name || r?.attendee_id || '—'

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setReg(null); setStatus(null); setFreeBracelet(''); setBraceletInput(''); setResults([]); setSearch('')
    const c = code.trim()
    if (!c) return
    const supabase = await sb()

    // 1) attendee by digital ticket (QR / attendee id) or an already-assigned bracelet
    const { data } = await supabase.from('registrations').select('*, profiles(full_name,email)')
      .or(`qr_token.eq.${c},attendee_id.eq.${c},bracelet_code.eq.${c}`).maybeSingle()
    if (data) {
      const r = data as Reg
      setReg(r); setBraceletInput(r.bracelet_code || '')
      setStatus({ type: 'info', text: r.bracelet_code ? `Brățară activă: ${r.bracelet_code}` : 'Participant găsit. Caută/scanează pentru a asigna o brățară.' })
      return
    }

    // 2) maybe a pre-made bracelet from inventory → enter assign mode (search by name)
    const { data: band } = await supabase.from('bracelets').select('*').eq('code', c).maybeSingle()
    if (band) {
      if (!band.active) { setStatus({ type: 'err', text: 'Brățară dezactivată (pierdută/deteriorată).' }); return }
      setFreeBracelet(c)
      setStatus({ type: 'info', text: `Brățară liberă „${c}". Caută participantul după nume pentru a o asigna.` })
      return
    }

    setStatus({ type: 'err', text: 'Cod negăsit (nici participant, nici brățară).' })
  }

  const doSearch = (term: string) => {
    setSearch(term)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (term.trim().length < 2) { setResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      const supabase = await sb()
      const { data } = await supabase.from('registrations')
        .select('*, profiles!inner(full_name,email)')
        .ilike('profiles.full_name', `%${term.trim()}%`)
        .order('created_at', { ascending: false }).limit(15)
      setResults((data as Reg[]) || [])
      setSearching(false)
    }, 300)
  }

  const logHistory = async (supabase: Awaited<ReturnType<typeof sb>>, r: Reg, c: string, userId?: string) => {
    await supabase.from('bracelet_assignments').insert({
      bracelet_code: c, registration_id: r.id, event_id: r.event_id, attendee_id: r.attendee_id,
      attendee_name: r.profiles?.full_name || null, assigned_by: userId,
    })
  }

  const assignAndCheckIn = async (target: Reg, bcode: string, alsoCheckIn: boolean) => {
    const c = bcode.trim()
    if (!c) { setStatus({ type: 'err', text: 'Introdu/scanează un cod de brățară.' }); return }
    const supabase = await sb()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: band } = await supabase.from('bracelets').select('*').eq('code', c).maybeSingle()
    if (!band) { setStatus({ type: 'err', text: 'Brățară inexistentă în inventar.' }); return }
    if (!band.active) { setStatus({ type: 'err', text: 'Brățară dezactivată.' }); return }

    const { data: clash } = await supabase.from('registrations').select('id, attendee_id')
      .eq('event_id', target.event_id).eq('bracelet_code', c).maybeSingle()
    if (clash && clash.id !== target.id) { setStatus({ type: 'err', text: `Brățara este deja asignată (${clash.attendee_id}).` }); return }

    // close any open history for this registration's previous bracelet
    if (target.bracelet_code && target.bracelet_code !== c) {
      await supabase.from('bracelet_assignments').update({ released_at: new Date().toISOString() })
        .eq('registration_id', target.id).is('released_at', null)
    }

    const upd: Record<string, unknown> = { bracelet_code: c, bracelet_assigned_at: new Date().toISOString() }
    if (alsoCheckIn && !target.checked_in) { upd.checked_in = true; upd.checked_in_at = new Date().toISOString() }
    const { error } = await supabase.from('registrations').update(upd).eq('id', target.id)
    if (error) { setStatus({ type: 'err', text: error.code === '23505' ? 'Brățara este deja asignată altui participant.' : error.message }); return }

    await logHistory(supabase, target, c, user?.id)
    if (alsoCheckIn && !target.checked_in) {
      await supabase.from('checkins').insert({ registration_id: target.id, event_id: target.event_id, scanned_by: user?.id, type: 'entry', day_date: new Date().toISOString().slice(0, 10) })
    }

    setReg({ ...target, bracelet_code: c, checked_in: alsoCheckIn ? true : target.checked_in })
    setFreeBracelet(''); setResults([]); setSearch(''); setBraceletInput(c)
    setStatus({ type: 'ok', text: `Brățară ${c} asignată lui ${name(target)} ✓${alsoCheckIn ? ' (check-in făcut)' : ''}` })
  }

  const checkInEntry = async () => {
    if (!reg) return
    const supabase = await sb()
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
    const supabase = await sb()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('checkins').insert({ registration_id: reg.id, event_id: reg.event_id, scanned_by: user?.id, type: 'meal', meal, day_date: new Date().toISOString().slice(0, 10) })
    if (error && error.code === '23505') { setStatus({ type: 'err', text: `Masa "${meal}" a fost deja folosită azi.` }); return }
    if (error) { setStatus({ type: 'err', text: error.message }); return }
    setStatus({ type: 'ok', text: `Masă validată: ${meal} ✓` })
  }

  const markPaid = async () => {
    if (!reg) return
    const supabase = await sb()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('registrations').update({
      payment_status: 'paid', payment_method: 'cash', amount_paid: reg.package_price,
      paid_at: new Date().toISOString(), paid_by: user?.id,
    }).eq('id', reg.id)
    if (error) { setStatus({ type: 'err', text: error.message }); return }
    setReg({ ...reg, payment_status: 'paid', payment_method: 'cash' })
    setStatus({ type: 'ok', text: 'Plată numerar înregistrată ✓' })
  }

  const meals = [{ k: 'breakfast', l: 'Mic dejun' }, { k: 'lunch', l: 'Prânz' }, { k: 'dinner', l: 'Cină' }]
  const payBadge = (s: string) => s === 'paid' ? 'bg-primary/10 text-primary' : s === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-secondary text-secondary-foreground'
  const payLabel = (s: string) => s === 'paid' ? 'plătit' : s === 'pending' ? 'la eveniment' : 'neplătit'

  return (
    <div data-testid="admin-checkin" className="max-w-lg">
      <div className="flex items-center gap-2 mb-6"><ScanLine className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Check-in</h1></div>
      <p className="text-muted-foreground text-sm mb-5">Scanează o brățară (QR/NFC) <strong>sau</strong> codul QR al participantului. Brățara liberă → caută participantul după nume pentru a o asigna.</p>

      <form onSubmit={lookup} className="flex gap-2 mb-5">
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Scanează brățară / QR participant" data-testid="checkin-code-input"
          className="flex-1 px-4 py-3 border border-border rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" autoFocus />
        <button type="submit" data-testid="checkin-validate-button" className="bg-primary text-primary-foreground px-6 py-3 rounded-full text-sm font-semibold hover:bg-primary/90">Scanează</button>
      </form>

      {status && (
        <div data-testid="checkin-status" className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm mb-5 ${status.type === 'ok' ? 'bg-primary/10 text-primary' : status.type === 'err' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}>
          {status.type === 'ok' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {status.text}
        </div>
      )}

      {/* Assign mode: free bracelet scanned → search attendee by name */}
      {freeBracelet && !reg && (
        <div data-testid="checkin-assign-panel" className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow mb-5">
          <div className="flex items-center gap-2 mb-3"><Watch className="h-5 w-5 text-primary" /><h2 className="font-heading font-semibold">Asignează brățara <span className="font-mono">{freeBracelet}</span></h2></div>
          <div className="relative mb-3">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={e => doSearch(e.target.value)} placeholder="Caută participant după nume..." data-testid="checkin-name-search" autoFocus
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          </div>
          {searching && <p className="text-xs text-muted-foreground">Se caută...</p>}
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {results.map(r => (
              <button key={r.id} data-testid={`checkin-search-result-${r.id}`} onClick={() => assignAndCheckIn(r, freeBracelet, true)}
                className="text-left border border-border rounded-2xl p-3 hover:bg-secondary/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-primary" /> {r.profiles?.full_name || '(fără nume)'}</span>
                  {r.checked_in && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Prezent</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{r.event_title} · {r.package_name}</div>
                <div className="flex gap-1.5 mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${payBadge(r.payment_status)}`}>{payLabel(r.payment_status)}</span>
                  {r.bracelet_code && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">deja are: {r.bracelet_code}</span>}
                </div>
              </button>
            ))}
            {search.trim().length >= 2 && !searching && results.length === 0 && <p data-testid="checkin-search-empty" className="text-xs text-muted-foreground">Niciun participant găsit.</p>}
          </div>
        </div>
      )}

      {/* Attendee card */}
      {reg && (
        <div data-testid="checkin-result" className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
          <h2 className="font-heading font-semibold text-lg flex items-center gap-2"><User className="h-4 w-4 text-primary" /> {name(reg)}</h2>
          <p className="text-sm text-muted-foreground mb-1">{reg.event_title} · {reg.package_name} · <span className="font-mono">{reg.attendee_id}</span></p>
          <div className="flex flex-wrap gap-2 mb-5 mt-2">
            <span className={`text-xs px-3 py-1 rounded-full ${payBadge(reg.payment_status)}`}>Plată: {payLabel(reg.payment_status)}</span>
            {reg.payment_method && <span className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">{reg.payment_method === 'cash' ? 'Numerar' : 'Online'}</span>}
            <span className={`text-xs px-3 py-1 rounded-full ${reg.checked_in ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>{reg.checked_in ? 'Prezent' : 'Neînregistrat'}</span>
            {reg.bracelet_code && <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1"><Watch className="h-3 w-3" /> {reg.bracelet_code}</span>}
          </div>

          <div className="border border-border/60 rounded-2xl p-4 mb-4 bg-secondary/20">
            <div className="text-sm font-medium mb-2 flex items-center gap-1.5"><Watch className="h-4 w-4 text-primary" /> {reg.bracelet_code ? 'Reasignează brățară' : 'Asignează brățară'}</div>
            <div className="flex gap-2">
              <input value={braceletInput} onChange={e => setBraceletInput(e.target.value)} placeholder="Scanează / introdu codul brățării" data-testid="checkin-bracelet-input"
                className="flex-1 px-3 py-2.5 border border-border rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
              <button onClick={() => assignAndCheckIn(reg, braceletInput, false)} data-testid="checkin-assign-bracelet-button" className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90"><Link2 className="h-4 w-4" /> Asignează</button>
            </div>
          </div>

          {reg.payment_status !== 'paid' && Number(reg.package_price) > 0 && (
            <button onClick={markPaid} data-testid="checkin-mark-paid-button" className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 text-white py-3 rounded-full font-semibold hover:bg-amber-600 mb-4"><Wallet className="h-4 w-4" /> Încasează numerar ({reg.package_price} RON)</button>
          )}
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
