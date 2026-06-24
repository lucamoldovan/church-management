import Link from 'next/link'
import { Calendar, MapPin, ArrowRight, Heart, Users, BookOpen } from 'lucide-react'
import HeroCarousel from '@/components/HeroCarousel'
import { imageForEvent, formatPrice } from '@/lib/eventImages'
import { createClient } from '@/lib/supabase/server'

const values = [
  { icon: Heart, title: 'Comunitate', text: 'Un loc unde fiecare persoană este primită și prețuită.' },
  { icon: BookOpen, title: 'Cuvântul', text: 'Studiu biblic care ne ancorează în adevăr și speranță.' },
  { icon: Users, title: 'Părtășie', text: 'Grupuri mici și evenimente unde creștem împreună.' },
]

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(6)

  const list = events || []
  const slides = list.slice(0, 3).map((e, i) => ({
    id: e.id,
    title: e.title,
    date: e.date_label || (e.date ? new Date(e.date).toLocaleDateString('ro-RO') : ''),
    location: e.location || '',
    category: e.category || 'Eveniment',
    description: e.description || '',
    image: imageForEvent(e, i),
  }))

  return (
    <div data-testid="home-page" className="grain">
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-4">
        <div className="animate-rise">
          <p className="text-sm font-medium tracking-wide uppercase text-primary mb-4">
            Bine ai venit la Casa Pâinii
          </p>
          {slides.length > 0 ? (
            <HeroCarousel slides={slides} />
          ) : (
            <div className="rounded-3xl h-72 bg-secondary/50 flex items-center justify-center text-muted-foreground soft-shadow">
              Niciun eveniment publicat încă.
            </div>
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {values.map(v => {
            const Icon = v.icon
            return (
              <div key={v.title} data-testid={`value-card-${v.title}`} className="bg-card rounded-2xl p-6 border border-border/60 soft-shadow">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/60 text-accent-foreground mb-4">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-heading font-semibold text-lg mb-1">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="flex items-end justify-between mb-7">
          <div>
            <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight">Evenimente viitoare</h2>
            <p className="text-muted-foreground mt-2">Descoperă ce urmează în comunitatea noastră</p>
          </div>
          <Link href="/events" data-testid="home-view-all-events" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2.5 transition-all">
            Vezi toate <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {list.map((event, idx) => (
            <Link key={event.id} href={`/events/${event.id}`} data-testid={`home-event-card-${event.id}`}
              className="group rounded-3xl overflow-hidden bg-card border border-border/60 soft-shadow hover:soft-shadow-lg hover:-translate-y-1 transition-all">
              <div className="relative h-44 overflow-hidden">
                <img src={imageForEvent(event, idx)} alt={event.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <span className="absolute top-4 left-4 rounded-full bg-white/85 backdrop-blur-md text-foreground text-xs font-medium px-3 py-1.5">{event.category || 'Eveniment'}</span>
                <span className="absolute top-4 right-4 rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5">{formatPrice(event.price)}</span>
              </div>
              <div className="p-6">
                <h3 className="font-heading font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{event.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed line-clamp-2">{event.description}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{event.date_label || (event.date ? new Date(event.date).toLocaleDateString('ro-RO') : 'TBA')}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.location}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
