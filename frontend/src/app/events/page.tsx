'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Calendar, MapPin, Search } from 'lucide-react'
import { imageForEvent, formatPrice } from '@/lib/eventImages'

interface Ev {
  id: string; title: string; description: string | null; location: string | null
  date: string | null; date_label?: string | null; category: string | null
  price: number | null; capacity: number | null; poster_url: string | null; event_type: string | null
}

export default function EventsPage() {
  const [events, setEvents] = useState<Ev[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Toate')

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase.from('events').select('*').eq('status', 'published').order('created_at', { ascending: false })
      setEvents((data as Ev[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const categories = ['Toate', ...Array.from(new Set(events.map(e => e.category).filter(Boolean) as string[]))]

  const filtered = events.filter(event => {
    const matchesCategory = activeCategory === 'Toate' || event.category === activeCategory
    const matchesSearch = (event.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (event.description || '').toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div data-testid="events-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <div className="mb-10 animate-rise">
        <p className="text-sm font-medium tracking-wide uppercase text-primary mb-3">Comunitate</p>
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-3">Evenimente</h1>
        <p className="text-muted-foreground text-lg max-w-xl">Descoperă evenimentele și activitățile de la Casa Pâinii</p>
      </div>

      <div className="relative mb-6 max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input type="text" data-testid="events-search-input" placeholder="Caută evenimente..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-border rounded-full bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow" />
      </div>

      <div className="flex gap-2 flex-wrap mb-10">
        {categories.map(cat => (
          <button key={cat} data-testid={`events-filter-${cat}`} onClick={() => setActiveCategory(cat)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeCategory === cat ? 'bg-primary text-primary-foreground soft-shadow' : 'bg-card border border-border hover:bg-secondary/60'}`}>
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-24 text-muted-foreground">Se încarcă...</div>
      ) : filtered.length === 0 ? (
        <div data-testid="events-empty-state" className="text-center py-24 text-muted-foreground">Nu am găsit evenimente.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((event, idx) => (
            <Link key={event.id} href={`/events/${event.id}`} data-testid={`event-card-${event.id}`}
              className="group rounded-3xl overflow-hidden bg-card border border-border/60 soft-shadow hover:soft-shadow-lg hover:-translate-y-1 transition-all">
              <div className="relative h-48 overflow-hidden">
                <img src={imageForEvent(event, idx)} alt={event.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <span className="absolute top-4 left-4 rounded-full bg-white/85 backdrop-blur-md text-foreground text-xs font-medium px-3 py-1.5">{event.category || 'Eveniment'}</span>
                <span className="absolute top-4 right-4 rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5">{formatPrice(event.price)}</span>
              </div>
              <div className="p-6">
                <h3 className="font-heading font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{event.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed line-clamp-2">{event.description}</p>
                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{event.date_label || (event.date ? new Date(event.date).toLocaleDateString('ro-RO') : 'TBA')}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.location}</span>
                </div>
                {!!event.capacity && <div className="mt-4 inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full">{event.capacity} locuri</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
