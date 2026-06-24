'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Search, Wallet, Check } from 'lucide-react'

interface Reg {
  id: string
  event_title: string | null
  package_name: string | null
  package_price: number
  payment_status: string
  payment_method: string | null
  checked_in: boolean
  attendee_id: string
  created_at: string
}

const FILTERS = [
  { k: 'all', l: 'Toate' },
  { k: 'paid', l: 'Plătit' },
  { k: 'pending', l: 'La eveniment' },
  { k: 'unpaid', l: 'Neplătit' },
] as const

export default function AdminAttendees() {
  const [regs, setRegs] = useState<Reg[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase.from('registrations').select('*').order('created_at', { ascending: false })
    setRegs((data as Reg[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const markPaid = async (r: Reg) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('registrations').update({
      payment_status: 'paid', payment_method: 'cash', amount_paid: r.package_price,
      paid_at: new Date().toISOString(), paid_by: user?.id,
    }).eq('id', r.id)
    if (!error) setRegs(prev => prev.map(x => x.id === r.id ? { ...x, payment_status: 'paid', payment_method: 'cash' } : x))
  }

  const filtered = regs.filter(r => {
    const matchFilter = filter === 'all' || r.payment_status === filter
    const term = q.trim().toLowerCase()
    const matchQ = !term || [r.event_title, r.package_name, r.attendee_id].some(v => (v || '').toLowerCase().includes(term))
    return matchFilter && matchQ
  })

  const counts = {
    all: regs.length,
    paid: regs.filter(r => r.payment_status === 'paid').length,
    pending: regs.filter(r => r.payment_status === 'pending').length,
    unpaid: regs.filter(r => r.payment_status === 'unpaid').length,
  }

  const badge = (s: string) =>
    s === 'paid' ? 'bg-primary/10 text-primary' : s === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-secondary text-secondary-foreground'
  const label = (s: string) => (s === 'paid' ? 'Plătit' : s === 'pending' ? 'La eveniment' : s === 'partial' ? 'Parțial' : 'Neplătit')

  return (
    <div data-testid="admin-attendees">
      <div className="flex items-center gap-2 mb-6"><Users className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Participanți</h1></div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {FILTERS.map(f => (
          <button key={f.k} data-testid={`attendees-filter-${f.k}`} onClick={() => setFilter(f.k)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${filter === f.k ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:bg-secondary/60'}`}>
            {f.l} <span className="opacity-70">({counts[f.k as keyof typeof counts]})</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Caută..." data-testid="attendees-search"
            className="pl-9 pr-4 py-2 border border-border rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Se încarcă...</p>
      ) : filtered.length === 0 ? (
        <p data-testid="attendees-empty" className="text-muted-foreground text-sm">Niciun participant pentru acest filtru.</p>
      ) : (
        <div className="bg-card border border-border/60 rounded-3xl overflow-hidden soft-shadow">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">Eveniment</th><th className="px-4 py-3">Pachet</th><th className="px-4 py-3">Preț</th><th className="px-4 py-3">Plată</th><th className="px-4 py-3">Prezent</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} data-testid={`attendee-row-${r.id}`} className="border-t border-border/50">
                  <td className="px-4 py-3 font-medium">{r.event_title}<div className="text-xs text-muted-foreground font-mono">{r.attendee_id}</div></td>
                  <td className="px-4 py-3 text-muted-foreground">{r.package_name}</td>
                  <td className="px-4 py-3">{r.package_price} RON</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2.5 py-1 rounded-full ${badge(r.payment_status)}`}>{label(r.payment_status)}</span>{r.payment_method && <span className="ml-1 text-xs text-muted-foreground">{r.payment_method === 'cash' ? '· numerar' : '· online'}</span>}</td>
                  <td className="px-4 py-3">{r.checked_in ? <Check className="h-4 w-4 text-primary" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    {r.payment_status !== 'paid' && Number(r.package_price) > 0 && (
                      <button onClick={() => markPaid(r)} data-testid={`attendee-mark-paid-${r.id}`} className="inline-flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-amber-600"><Wallet className="h-3.5 w-3.5" /> Încasează</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
