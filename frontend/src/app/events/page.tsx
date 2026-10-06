'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Calendar, MapPin, Search, ArrowUpRight, SlidersHorizontal } from 'lucide-react'
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
    const q = search.toLowerCase().trim()
    return (activeCategory === 'Toate' || event.category === activeCategory) &&
      (!q || (event.title || '').toLowerCase().includes(q) || (event.description || '').toLowerCase().includes(q))
  })

  return (
    <div data-testid="events-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <header className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card px-6 py-10 sm:px-10 sm:py-14 mb-10 soft-shadow">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-2xl animate-rise">
          <p className="text-xs sm:text-sm font-semibold tracking-[0.18em] uppercase text-primary mb-4">Casa Pâinii · Comunitate</p>
          <h1 className="font-heading text-4xl sm:text-6xl font-bold tracking-tight leading-[1.02]">Lucruri bune de făcut împreună.</h1>
          <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-xl leading-relaxed">Descoperă întâlnirile, taberele și evenimentele prin care rămânem aproape unii de alții.</p>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-8">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" data-testid="events-search-input" placeholder="Caută un eveniment..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 border border-border/70 rounded-2xl bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" /> {filtered.length} {filtered.length === 1 ? 'eveniment' : 'evenimente'}
        </div>
      </div>

      {categories.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-10">
          {categories.map(cat => (
            <button key={cat} data-testid={`events-filter-${cat}`} onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeCategory === cat ? 'bg-primary text-primary-foreground soft-shadow' : 'bg-card border border-border/70 hover:bg-secondary/60'}`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-96 rounded-3xl bg-secondary/40 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div data-testid="events-empty-state" className="rounded-3xl border border-dashed border-border p-16 text-center">
          <p className="font-heading text-xl font-semibold">Nu am găsit evenimente.</p>
          <p className="text-sm text-muted-foreground mt-2">Încearcă un alt termen sau o altă categorie.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((event, idx) => (
            <Link key={event.id} href={`/events/${event.id}`} data-testid={`event-card-${event.id}`}
              className="group rounded-3xl overflow-hidden bg-card border border-border/60 soft-shadow hover:soft-shadow-lg hover:-translate-y-1 transition-all">
              <div className="relative h-52 overflow-hidden bg-secondary">
                <img src={imageForEvent(event, idx)} alt={event.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
                <span className="absolute top-4 left-4 rounded-full bg-white/90 backdrop-blur-md text-foreground text-xs font-semibold px-3 py-1.5">{event.category || 'Eveniment'}</span>
                <span className="absolute bottom-4 left-4 text-white text-xs font-medium">{event.date_label || (event.date ? new Date(event.date).toLocaleDateString('ro-RO') : 'Data urmează')}</span>
                <span className="absolute top-4 right-4 rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5">{formatPrice(event.price)}</span>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-heading font-semibold text-xl leading-tight group-hover:text-primary transition-colors">{event.title}</h3>
                  <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <p className="text-sm text-muted-foreground mt-2 mb-5 leading-relaxed line-clamp-2">{event.description || 'Mai multe detalii despre acest eveniment.'}</p>
                <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-primary" />{event.date_label || (event.date ? new Date(event.date).toLocaleDateString('ro-RO') : 'TBA')}</span>
                  <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" />{event.location || 'Locația urmează'}</span>
                </div>
                {!!event.capacity && <div className="mt-5 inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full">{event.capacity} locuri</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
