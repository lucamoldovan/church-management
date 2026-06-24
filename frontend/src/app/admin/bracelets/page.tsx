'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { Watch, Plus, Search, X, Power, History } from 'lucide-react'

interface Bracelet { id: string; code: string; label: string | null; active: boolean; created_at: string }
interface Assignment { bracelet_code: string; attendee_id: string; event_title: string | null; id: string; checked_in: boolean }
interface Hist { id: string; attendee_name: string | null; attendee_id: string | null; event_id: string | null; assigned_at: string; released_at: string | null }

const FILTERS = [
  { k: 'all', l: 'Toate' },
  { k: 'unassigned', l: 'Libere' },
  { k: 'assigned', l: 'Asignate' },
  { k: 'active', l: 'Active' },
  { k: 'deactivated', l: 'Dezactivate' },
] as const

export default function AdminBracelets() {
  const [bracelets, setBracelets] = useState<Bracelet[]>([])
  const [assigns, setAssigns] = useState<Record<string, Assignment>>({})
  const [history, setHistory] = useState<Record<string, Hist[]>>({})
  const [openHist, setOpenHist] = useState<string | null>(null)
  const [bulk, setBulk] = useState('')
  const [label, setLabel] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const [{ data: bands }, { data: regs }] = await Promise.all([
      supabase.from('bracelets').select('*').order('created_at', { ascending: false }),
      supabase.from('registrations').select('id, bracelet_code, attendee_id, event_title, checked_in').not('bracelet_code', 'is', null),
    ])
    setBracelets((bands as Bracelet[]) || [])
    const map: Record<string, Assignment> = {}
    ;((regs as Assignment[]) || []).forEach(r => { if (r.bracelet_code) map[r.bracelet_code] = r })
    setAssigns(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Derived state: deactivated > active(in use) > assigned > unassigned
  const stateOf = (b: Bracelet): { key: string; label: string; cls: string } => {
    if (!b.active) return { key: 'deactivated', label: 'Dezactivată', cls: 'bg-destructive/10 text-destructive' }
    const a = assigns[b.code]
    if (a && a.checked_in) return { key: 'active', label: 'Activă (în uz)', cls: 'bg-primary/15 text-primary' }
    if (a) return { key: 'assigned', label: 'Asignată', cls: 'bg-amber-100 text-amber-700' }
    return { key: 'unassigned', label: 'Liberă', cls: 'bg-secondary text-secondary-foreground' }
  }

  const addBracelets = async () => {
    const codes = bulk.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
    if (!codes.length) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const rows = Array.from(new Set(codes)).map(code => ({ code, label: label.trim() || null }))
    const { error } = await supabase.from('bracelets').upsert(rows, { onConflict: 'code', ignoreDuplicates: true })
    if (error) { setMsg(error.message); return }
    setBulk(''); setLabel(''); setMsg(`${rows.length} brățări procesate ✓`)
    load()
  }

  const release = async (b: Bracelet) => {
    const a = assigns[b.code]
    if (!a) return
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('registrations').update({ bracelet_code: null, bracelet_assigned_at: null }).eq('id', a.id)
    await supabase.from('bracelet_assignments').update({ released_at: new Date().toISOString() }).eq('registration_id', a.id).is('released_at', null)
    load()
  }

  const toggleActive = async (b: Bracelet) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('bracelets').update({ active: !b.active }).eq('id', b.id)
    setBracelets(prev => prev.map(x => x.id === b.id ? { ...x, active: !x.active } : x))
  }

  const loadHistory = async (b: Bracelet) => {
    if (openHist === b.code) { setOpenHist(null); return }
    setOpenHist(b.code)
    if (!history[b.code]) {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase.from('bracelet_assignments').select('*').eq('bracelet_code', b.code).order('assigned_at', { ascending: false })
      setHistory(prev => ({ ...prev, [b.code]: (data as Hist[]) || [] }))
    }
  }

  const filtered = bracelets.filter(b => {
    const st = stateOf(b).key
    const matchFilter = filter === 'all' || st === filter
    const term = q.trim().toLowerCase()
    const matchQ = !term || b.code.toLowerCase().includes(term) || (b.label || '').toLowerCase().includes(term)
    return matchFilter && matchQ
  })

  const counts = {
    all: bracelets.length,
    unassigned: bracelets.filter(b => stateOf(b).key === 'unassigned').length,
    assigned: bracelets.filter(b => stateOf(b).key === 'assigned').length,
    active: bracelets.filter(b => stateOf(b).key === 'active').length,
    deactivated: bracelets.filter(b => stateOf(b).key === 'deactivated').length,
  }

  return (
    <div data-testid="admin-bracelets">
      <div className="flex items-center gap-2 mb-6"><Watch className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Brățări NFC</h1></div>

      <div className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow mb-6">
        <h2 className="font-heading font-semibold mb-3">Adaugă brățări în inventar</h2>
        <p className="text-xs text-muted-foreground mb-3">Introdu codurile brățărilor pre-fabricate, câte unul pe linie (sau separate prin virgulă).</p>
        <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={3} placeholder={'NFC-001\nNFC-002\nNFC-003'} data-testid="bracelets-bulk-input"
          className="w-full px-4 py-3 border border-border rounded-2xl bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/40 mb-3" />
        <div className="flex flex-wrap gap-2">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Etichetă (opțional, ex. Lot 2026)" data-testid="bracelets-label-input"
            className="flex-1 min-w-[180px] px-4 py-2.5 border border-border rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
          <button onClick={addBracelets} data-testid="bracelets-add-button" className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90"><Plus className="h-4 w-4" /> Adaugă</button>
        </div>
        {msg && <p data-testid="bracelets-msg" className="text-sm text-primary mt-3">{msg}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {FILTERS.map(f => (
          <button key={f.k} data-testid={`bracelets-filter-${f.k}`} onClick={() => setFilter(f.k)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${filter === f.k ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-secondary/60'}`}>
            {f.l} <span className="opacity-70">({counts[f.k as keyof typeof counts]})</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Caută cod..." data-testid="bracelets-search"
            className="pl-9 pr-4 py-2 border border-border rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Se încarcă...</p>
      ) : filtered.length === 0 ? (
        <p data-testid="bracelets-empty" className="text-muted-foreground text-sm">Nicio brățară pentru acest filtru.</p>
      ) : (
        <div className="bg-card border border-border/60 rounded-3xl overflow-hidden soft-shadow">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">Cod</th><th className="px-4 py-3">Etichetă</th><th className="px-4 py-3">Stare</th><th className="px-4 py-3">Asignare</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const a = assigns[b.code]
                const st = stateOf(b)
                return (
                  <Fragment key={b.id}>
                    <tr data-testid={`bracelet-row-${b.id}`} className="border-t border-border/50">
                      <td className="px-4 py-3 font-mono font-medium">{b.code}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.label || '—'}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span></td>
                      <td className="px-4 py-3">{a ? <span className="text-xs"><span className="font-mono">{a.attendee_id}</span><span className="text-muted-foreground"> · {a.event_title}</span></span> : <span className="text-muted-foreground text-xs">Liberă</span>}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => loadHistory(b)} data-testid={`bracelet-history-${b.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mr-3"><History className="h-3.5 w-3.5" /> Istoric</button>
                        {a && <button onClick={() => release(b)} data-testid={`bracelet-release-${b.id}`} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline mr-3"><X className="h-3.5 w-3.5" /> Eliberează</button>}
                        <button onClick={() => toggleActive(b)} data-testid={`bracelet-toggle-${b.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Power className="h-3.5 w-3.5" /> {b.active ? 'Dezactivează' : 'Activează'}</button>
                      </td>
                    </tr>
                    {openHist === b.code && (
                      <tr data-testid={`bracelet-history-panel-${b.id}`} className="border-t border-border/30 bg-secondary/20">
                        <td colSpan={5} className="px-4 py-3">
                          {!history[b.code] ? <span className="text-xs text-muted-foreground">Se încarcă...</span>
                            : history[b.code].length === 0 ? <span className="text-xs text-muted-foreground">Niciun istoric de utilizare.</span>
                            : <div className="flex flex-col gap-1.5">{history[b.code].map(h => (
                                <div key={h.id} className="text-xs flex items-center gap-2"><span className="font-medium">{h.attendee_name || h.attendee_id || '—'}</span><span className="text-muted-foreground">· {new Date(h.assigned_at).toLocaleString('ro-RO')}{h.released_at ? ` → eliberată ${new Date(h.released_at).toLocaleDateString('ro-RO')}` : ' · în uz'}</span></div>
                              ))}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
