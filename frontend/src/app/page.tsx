import Link from 'next/link'
import { Calendar, MapPin, ArrowRight, Heart, Users, BookOpen, Play } from 'lucide-react'
import HeroCarousel from '@/components/HeroCarousel'
import { imageForEvent, formatPrice } from '@/lib/eventImages'
import { createClient } from '@/lib/supabase/server'

const values = [
  { icon: Heart, title: 'Comunitate', text: 'Un loc unde fiecare persoană este primită și prețuită.' },
  { icon: BookOpen, title: 'Cuvântul', text: 'Credință ancorată în Scriptură, speranță și adevăr.' },
  { icon: Users, title: 'Părtășie', text: 'Creștem împreună prin grupuri, întâlniri și evenimente.' },
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
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-8">
        <div className="mb-6 flex items-end justify-between gap-6 animate-rise">
          <div>
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-primary mb-3">Casa Pâinii · Ocna Mureș</p>
            <h1 className="font-heading text-3xl sm:text-5xl font-semibold tracking-tight">O familie. O credință. O casă.</h1>
          </div>
          <Link href="/live" data-testid="home-live-link" className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-primary/40 hover:text-primary transition-colors">
            <Play className="h-4 w-4 fill-current" /> Urmărește live
          </Link>
        </div>

        <div className="animate-rise">
          {slides.length > 0 ? (
            <HeroCarousel slides={slides} />
          ) : (
            <div className="rounded-3xl min-h-80 bg-secondary/60 flex flex-col items-center justify-center text-center p-8 soft-shadow">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-2">Casa Pâinii</p>
              <h2 className="font-heading text-2xl font-semibold">Niciun eveniment publicat încă.</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">Revino curând pentru următoarele întâlniri și evenimente.</p>
            </div>
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {values.map(v => {
            const Icon = v.icon
            return (
              <div key={v.title} data-testid={`value-card-${v.title}`} className="group bg-card rounded-3xl p-6 sm:p-7 border border-border/60 soft-shadow hover:-translate-y-1 transition-transform">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary mb-5">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-heading font-semibold text-xl mb-2">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-24">
        <div className="flex items-end justify-between mb-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-2">În comunitate</p>
            <h2 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight">Ce urmează</h2>
            <p className="text-muted-foreground mt-2">Descoperă următoarele evenimente de la Casa Pâinii.</p>
          </div>
          <Link href="/events" data-testid="home-view-all-events" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all">
            Vezi toate <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {list.slice(0, 3).map((event, idx) => (
            <Link key={event.id} href={`/events/${event.id}`} data-testid={`home-event-card-${event.id}`}
              className="group rounded-3xl overflow-hidden bg-card border border-border/60 soft-shadow hover:shadow-[0_18px_45px_rgb(0,0,0,0.09)] hover:-translate-y-1 transition-all">
              <div className="relative h-52 overflow-hidden">
                <img src={imageForEvent(event, idx)} alt={event.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                <span className="absolute top-4 left-4 rounded-full bg-white/90 backdrop-blur text-foreground text-xs font-semibold px-3 py-1.5">{event.category || 'Eveniment'}</span>
                <span className="absolute bottom-4 left-4 text-white text-sm font-medium">{event.date_label || (event.date ? new Date(event.date).toLocaleDateString('ro-RO') : 'TBA')}</span>
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-heading font-semibold text-xl group-hover:text-primary transition-colors">{event.title}</h3>
                  <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">{formatPrice(event.price)}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed line-clamp-2">{event.description}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.location || 'Casa Pâinii'}</span>
                  <ArrowRight className="h-4 w-4 ml-auto text-primary transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>
        <Link href="/events" data-testid="home-mobile-view-all-events" className="sm:hidden mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground py-3.5 font-semibold">
          Vezi toate evenimentele <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  )
}