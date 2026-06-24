'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Calendar, MapPin, Search } from 'lucide-react'
import { eventImage } from '@/lib/eventImages'

const events = [
  { id: 1, title: 'Tabără de Vară 2026', date: '14-21 Iulie 2026', location: 'Ocna Mureș', description: 'O săptămână de credință, distracție și părtășie pentru toate vârstele.', category: 'Tabără', spots: 12, price: 150 },
  { id: 2, title: 'Conferință de Tineret', date: '3 August 2026', location: 'Sala principală', description: 'Conferința anuală de tineret cu worship și predici.', category: 'Conferință', spots: 45, price: 0 },
  { id: 3, title: 'Serviciu Duminical', date: 'În fiecare Duminică', location: 'Casa Pâinii', description: 'Vino alături de noi la worship și studiul Cuvântului.', category: 'Serviciu', spots: 200, price: 0 },
  { id: 4, title: 'Întâlnire de Tineret', date: 'În fiecare Vineri', location: 'Casa Pâinii', description: 'Seară de worship, jocuri și părtășie pentru tineri.', category: 'Tineret', spots: 80, price: 0 },
  { id: 5, title: 'Conferință de Familie', date: '15 Septembrie 2026', location: 'Sala principală', description: 'Conferință dedicată familiilor creștine.', category: 'Conferință', spots: 30, price: 50 },
  { id: 6, title: 'Tabără de Copii', date: '1-5 August 2026', location: 'Ocna Mureș', description: 'Tabără pentru copii cu activități, jocuri și studiu biblic.', category: 'Tabără', spots: 25, price: 100 },
]

const categories = ['Toate', 'Tabără', 'Conferință', 'Serviciu', 'Tineret']

export default function EventsPage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Toate')

  const filtered = events.filter(event => {
    const matchesCategory = activeCategory === 'Toate' || event.category === activeCategory
    const matchesSearch = event.title.toLowerCase().includes(search.toLowerCase()) ||
      event.description.toLowerCase().includes(search.toLowerCase())
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
        <input
          type="text"
          data-testid="events-search-input"
          placeholder="Caută evenimente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 border border-border rounded-full bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow"
        />
      </div>

      <div className="flex gap-2 flex-wrap mb-10">
        {categories.map(cat => (
          <button
            key={cat}
            data-testid={`events-filter-${cat}`}
            onClick={() => setActiveCategory(cat)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground soft-shadow'
                : 'bg-card border border-border hover:bg-secondary/60'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div data-testid="events-empty-state" className="text-center py-24 text-muted-foreground">Nu am găsit evenimente.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(event => (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              data-testid={`event-card-${event.id}`}
              className="group rounded-3xl overflow-hidden bg-card border border-border/60 soft-shadow hover:soft-shadow-lg hover:-translate-y-1 transition-all"
            >
              <div className="relative h-48 overflow-hidden">
                <img
                  src={eventImage(event.id)}
                  alt={event.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute top-4 left-4 rounded-full bg-white/85 backdrop-blur-md text-foreground text-xs font-medium px-3 py-1.5">
                  {event.category}
                </span>
                <span className="absolute top-4 right-4 rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5">
                  {event.price === 0 ? 'Gratuit' : `${event.price} RON`}
                </span>
              </div>
              <div className="p-6">
                <h3 className="font-heading font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{event.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed line-clamp-2">{event.description}</p>
                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{event.date}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.location}</span>
                </div>
                <div className="mt-4 inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                  {event.spots} locuri disponibile
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
