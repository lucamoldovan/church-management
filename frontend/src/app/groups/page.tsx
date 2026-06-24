'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Users, Calendar, MapPin, Clock } from 'lucide-react'

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
    <div data-testid="groups-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <div className="mb-10 animate-rise">
        <p className="text-sm font-medium tracking-wide uppercase text-primary mb-3">Părtășie</p>
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-3">Grupuri de studiu</h1>
        <p className="text-muted-foreground text-lg max-w-xl">Alătură-te unui grup mic și crește în credință alături de alții</p>
      </div>

      {loading ? (
        <div className="text-center py-24 text-muted-foreground">Se încarcă...</div>
      ) : groups.length === 0 ? (
        <div data-testid="groups-empty" className="text-center py-24 text-muted-foreground">Niciun grup disponibil momentan.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map(g => (
            <Link key={g.id} href={`/groups/${g.id}`} data-testid={`group-card-${g.id}`}
              className="group bg-card border border-border/60 rounded-3xl p-6 soft-shadow hover:soft-shadow-lg hover:-translate-y-1 transition-all">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4"><Users className="h-6 w-6" /></span>
              <h3 className="font-heading font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{g.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2 leading-relaxed">{g.description}</p>
              <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                {g.meeting_day && <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{g.meeting_day}</span>}
                {g.meeting_time && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{String(g.meeting_time).slice(0,5)}</span>}
                {g.meeting_location && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{g.meeting_location}</span>}
              </div>
              <div className="mt-4 inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                {g.member_count || 0}{g.capacity ? `/${g.capacity}` : ''} membri
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
