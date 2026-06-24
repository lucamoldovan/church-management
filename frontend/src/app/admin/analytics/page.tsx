'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Users, Ticket, DollarSign, CheckCircle2, UsersRound } from 'lucide-react'

export default function AdminAnalytics() {
  const [data, setData] = useState({ revenue: 0, paid: 0, unpaid: 0, checkins: 0, members: 0, byEvent: [] as { title: string; count: number }[] })

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const [{ data: regs }, { count: checkins }, { count: members }] = await Promise.all([
        supabase.from('registrations').select('event_title, package_price, payment_status'),
        supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('type', 'entry'),
        supabase.from('group_memberships').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      ])
      const list = regs || []
      const revenue = list.filter(r => r.payment_status === 'paid').reduce((s, r) => s + Number(r.package_price || 0), 0)
      const paid = list.filter(r => r.payment_status === 'paid').length
      const unpaid = list.filter(r => r.payment_status !== 'paid').length
      const map: Record<string, number> = {}
      list.forEach(r => { const t = r.event_title || '—'; map[t] = (map[t] || 0) + 1 })
      const byEvent = Object.entries(map).map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).slice(0, 8)
      setData({ revenue, paid, unpaid, checkins: checkins || 0, members: members || 0, byEvent })
    }
    load()
  }, [])

  const max = Math.max(1, ...data.byEvent.map(e => e.count))
  const cards = [
    { label: 'Venit total (plătit)', value: `${data.revenue} RON`, icon: DollarSign },
    { label: 'Bilete plătite', value: data.paid, icon: Ticket },
    { label: 'Bilete neplătite', value: data.unpaid, icon: Ticket },
    { label: 'Check-in-uri intrare', value: data.checkins, icon: CheckCircle2 },
    { label: 'Membri grupuri', value: data.members, icon: UsersRound },
  ]

  return (
    <div data-testid="admin-analytics">
      <div className="flex items-center gap-2 mb-6"><TrendingUp className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Analize</h1></div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} data-testid={`analytics-${c.label}`} className="bg-card border border-border/60 rounded-3xl p-5 soft-shadow">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary mb-3"><Icon className="h-4 w-4" /></span>
              <div className="font-heading text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
            </div>
          )
        })}
      </div>

      <div className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
        <h2 className="font-heading font-semibold text-lg mb-5 flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Înregistrări per eveniment</h2>
        {data.byEvent.length === 0 ? <p className="text-sm text-muted-foreground">Nicio înregistrare încă.</p> : (
          <div className="flex flex-col gap-4">
            {data.byEvent.map(e => (
              <div key={e.title}>
                <div className="flex justify-between text-sm mb-1.5"><span className="truncate pr-3">{e.title}</span><span className="font-semibold text-primary">{e.count}</span></div>
                <div className="h-2.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${(e.count / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
