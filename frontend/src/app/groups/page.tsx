'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Users, Calendar, MapPin, Clock, ArrowUpRight } from 'lucide-react'

interface Group {
  id: string; name: string; description: string | null
  meeting_day: string | null; meeting_time: string | null; meeting_location: string | null
  capacity: number | null; member_count: number | null; is_active: boolean
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase.from('study_groups').select('*').eq('is_active', true).order('name')
      setGroups((data as Group[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div data-testid="groups-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <header className="grid lg:grid-cols-[1.3fr_.7fr] gap-8 items-end mb-12">
        <div className="animate-rise">
          <p className="text-xs sm:text-sm font-semibold tracking-[0.18em] uppercase text-primary mb-4">Părtășie · Creștere</p>
          <h1 className="font-heading text-4xl sm:text-6xl font-bold tracking-tight leading-[1.02]">Nu trebuie să mergi singur.</h1>
          <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-2xl leading-relaxed">Grupurile mici sunt locul în care ne cunoaștem mai bine, ne rugăm unii pentru alții și creștem împreună.</p>
        </div>
        <div className="hidden lg:block rounded-3xl bg-primary text-primary-foreground p-7 soft-shadow">
          <Users className="h-7 w-7 mb-8" />
          <p className="font-heading text-2xl font-semibold">Un grup mic. O comunitate reală.</p>
        </div>
      </header>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">{[1,2,3].map(i => <div key={i} className="h-72 rounded-3xl bg-secondary/40 animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <div data-testid="groups-empty" className="rounded-3xl border border-dashed border-border p-16 text-center">
          <p className="font-heading text-xl font-semibold">Niciun grup disponibil momentan.</p>
          <p className="text-sm text-muted-foreground mt-2">Revino în curând pentru noi grupuri.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map(g => (
            <Link key={g.id} href={`/groups/${g.id}`} data-testid={`group-card-${g.id}`}
              className="group bg-card border border-border/60 rounded-3xl p-7 soft-shadow hover:soft-shadow-lg hover:-translate-y-1 transition-all">
              <div className="flex items-start justify-between gap-4 mb-7">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Users className="h-6 w-6" /></span>
                <ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="font-heading font-semibold text-xl mb-2 group-hover:text-primary transition-colors">{g.name}</h3>
              <p className="text-sm text-muted-foreground mb-6 line-clamp-3 leading-relaxed">{g.description || 'Un loc pentru conversații, rugăciune și creștere împreună.'}</p>
              <div className="pt-5 border-t border-border/70 flex flex-col gap-2.5 text-xs text-muted-foreground">
                {g.meeting_day && <span className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-primary" />{g.meeting_day}</span>}
                {g.meeting_time && <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-primary" />{String(g.meeting_time).slice(0,5)}</span>}
                {g.meeting_location && <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" />{g.meeting_location}</span>}
              </div>
              <div className="mt-5 inline-flex items-center text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                {g.member_count || 0}{g.capacity ? `/${g.capacity}` : ''} membri
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
