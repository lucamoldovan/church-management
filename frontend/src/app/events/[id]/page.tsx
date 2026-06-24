import Link from 'next/link'
import { Calendar, MapPin, Users, ArrowLeft, Clock } from 'lucide-react'
import { imageForEvent, formatPrice } from '@/lib/eventImages'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('*').eq('id', id).single()

  if (!event) {
    return (
      <div data-testid="event-not-found" className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold mb-4">Evenimentul nu a fost găsit</h1>
        <Link href="/events" className="text-primary hover:underline">Înapoi la evenimente</Link>
      </div>
    )
  }

  const { data: packages } = await supabase.from('event_packages').select('*').eq('event_id', id).order('price', { ascending: true })
  const dateLabel = event.date_label || (event.date ? new Date(event.date).toLocaleDateString('ro-RO') : 'TBA')

  return (
    <div data-testid="event-detail-page" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/events" data-testid="event-detail-back" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-7">
        <ArrowLeft className="h-4 w-4" /> Înapoi la evenimente
      </Link>

      <div className="relative rounded-3xl h-64 sm:h-80 overflow-hidden mb-10 soft-shadow-lg">
        <img src={imageForEvent(event)} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 p-7 sm:p-10">
          <span className="inline-flex w-fit items-center rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-medium px-3 py-1.5 mb-3">{event.category || 'Eveniment'}</span>
          <h1 className="font-heading text-3xl sm:text-5xl font-bold text-white max-w-2xl leading-tight">{event.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <p className="text-muted-foreground text-lg leading-relaxed mb-7">{event.description}</p>
          <div className="grid grid-cols-2 gap-3 mb-10">
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-xs text-muted-foreground">Data</div><div className="text-sm font-medium">{dateLabel}</div></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-xs text-muted-foreground">Ora</div><div className="text-sm font-medium">{event.time ? String(event.time).slice(0,5) : '—'}</div></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-xs text-muted-foreground">Locație</div><div className="text-sm font-medium">{event.location || '—'}</div></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-xs text-muted-foreground">Capacitate</div><div className="text-sm font-medium">{event.capacity || '—'}</div></div>
            </div>
          </div>
        </div>

        <div>
          <div className="bg-accent/40 border border-accent/50 rounded-3xl p-6 sticky top-24 soft-shadow">
            <h2 className="font-heading font-semibold text-lg mb-4">Pachete disponibile</h2>
            <div className="flex flex-col gap-3 mb-6">
              {(packages || []).length === 0 ? (
                <div className="bg-card/80 border border-border/60 rounded-2xl p-4 text-sm text-muted-foreground">{formatPrice(event.price)} — intrare standard</div>
              ) : (packages || []).map((pkg: { id: string; name: string; price: number; description: string }) => (
                <div key={pkg.id} className="bg-card/80 border border-border/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{pkg.name}</span>
                    <span className="font-heading font-bold text-sm text-primary">{formatPrice(pkg.price)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{pkg.description}</p>
                </div>
              ))}
            </div>
            <Link href={`/events/${event.id}/register`} data-testid="event-detail-register-button"
              className="w-full block text-center bg-primary text-primary-foreground px-4 py-3.5 rounded-full font-semibold hover:bg-primary/90 transition-all hover:-translate-y-0.5">
              Înregistrează-te
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
