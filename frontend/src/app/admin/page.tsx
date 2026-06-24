'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Ticket, Users, Mic } from 'lucide-react'

export default function AdminOverview() {
  const [stats, setStats] = useState({ events: 0, registrations: 0, users: 0, sermons: 0 })

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const count = async (t: string) => (await supabase.from(t).select('id', { count: 'exact', head: true })).count || 0
      const [events, registrations, users, sermons] = await Promise.all([
        count('events'), count('registrations'), count('profiles'), count('sermons'),
      ])
      setStats({ events, registrations, users, sermons })
    }
    load()
  }, [])

  const cards = [
    { label: 'Evenimente', value: stats.events, icon: CalendarDays },
    { label: 'Înregistrări', value: stats.registrations, icon: Ticket },
    { label: 'Utilizatori', value: stats.users, icon: Users },
    { label: 'Predici', value: stats.sermons, icon: Mic },
  ]

  return (
    <div data-testid="admin-overview">
      <h1 className="font-heading text-3xl font-bold mb-2">Panou de administrare</h1>
      <p className="text-muted-foreground mb-8">Privire de ansamblu asupra platformei</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} data-testid={`admin-stat-${c.label}`} className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-4"><Icon className="h-5 w-5" /></span>
              <div className="font-heading text-3xl font-bold">{c.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{c.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
