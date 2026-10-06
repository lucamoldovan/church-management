import Link from 'next/link'
import { ArrowRight, CalendarDays, MapPin, Play, Users } from 'lucide-react'
import HeroCarousel from '@/components/HeroCarousel'
import { imageForEvent, formatPrice } from '@/lib/eventImages'
import { createClient } from '@/lib/supabase/server'

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
    <div data-testid="home-page" className="overflow-hidden">
      <section className="relative min-h-[calc(100svh-4.5rem)] flex items-end bg-black text-white">
        {slides.length > 0 ? (
          <HeroCarousel slides={slides} />
        ) : (
          <div className="min-h-[75svh] w-full flex items-center justify-center px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/60 mb-5">Casa Pâinii · Ocna Mureș</p>
              <h1 className="font-heading text-5xl sm:text-7xl lg:text-8xl font-semibold tracking-[-0.05em] max-w-5xl">
                O familie.<br />O credință.<br /><span className="text-white/45">O casă.</span>
              </h1>
            </div>
          </div>
        )}
        <div className="absolute top-8 left-6 sm:left-10 lg:left-16 z-10 pointer-events-none">
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.32em] text-white/70">Casa Pâinii / Ocna Mureș</p>
        </div>
      </section>

      <section className="bg-white text-black px-6 sm:px-10 lg:px-16 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-12 lg:gap-24 items-end">
            <h2 className="font-heading text-5xl sm:text-7xl lg:text-8xl font-semibold tracking-[-0.055em] leading-[0.9]">
              Biserica nu este<br />
              <span className="text-[#102b52]">un loc.</span>
            </h2>
            <div className="max-w-md pb-2">
              <p className="text-lg sm:text-xl leading-relaxed text-black/65">
                Este o familie care crește împreună. Un loc pentru credință, întrebări, prietenie și o viață trăită cu Dumnezeu.
              </p>
              <Link href="/about" className="mt-8 inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.16em] group">
                Descoperă-ne <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          <div className="mt-20 border-t border-black/15">
            <div className="grid sm:grid-cols-3">
              {[
                ['01', 'Comunitate', 'Un loc unde fiecare persoană este primită și prețuită.'],
                ['02', 'Cuvântul', 'Credință ancorată în Scriptură, speranță și adevăr.'],
                ['03', 'Părtășie', 'Creștem împreună prin grupuri, întâlniri și evenimente.'],
              ].map(([number, title, text]) => (
                <div key={number} className="py-7 sm:py-9 sm:pr-10 border-b sm:border-b-0 sm:border-r last:border-r-0 border-black/15">
                  <span className="text-xs font-semibold tracking-[0.2em] text-[#102b52]">{number}</span>
                  <h3 className="font-heading text-2xl sm:text-3xl font-semibold mt-8">{title}</h3>
                  <p className="text-sm leading-relaxed text-black/55 mt-3 max-w-xs">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0b1d35] text-white px-6 sm:px-10 lg:px-16 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-8 border-b border-white/15 pb-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-white/45 mb-4">În comunitate</p>
              <h2 className="font-heading text-5xl sm:text-7xl font-semibold tracking-[-0.05em] leading-none">Ce urmează.</h2>
            </div>
            <Link href="/events" className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.15em] group">
              Toate evenimentele <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="divide-y divide-white/15">
            {list.slice(0, 4).map((event, idx) => (
              <Link key={event.id} href={`/events/${event.id}`} className="group grid md:grid-cols-[100px_1fr_220px_40px] gap-5 md:gap-8 items-center py-7 sm:py-9">
                <span className="text-sm text-white/40 font-medium">{String(idx + 1).padStart(2, '0')}</span>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-white/45">{event.category || 'Eveniment'}</span>
                  <h3 className="font-heading text-2xl sm:text-3xl font-semibold mt-1 group-hover:text-white/65 transition-colors">{event.title}</h3>
                </div>
                <div className="text-sm text-white/55 md:text-right">
                  <p className="flex md:justify-end items-center gap-2"><CalendarDays className="h-4 w-4" />{event.date_label || (event.date ? new Date(event.date).toLocaleDateString('ro-RO') : 'TBA')}</p>
                  <p className="flex md:justify-end items-center gap-2 mt-2"><MapPin className="h-4 w-4" />{event.location || 'Casa Pâinii'}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-white/40 transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>

          {list.length === 0 && (
            <p className="py-12 text-white/55">Nu există încă evenimente publicate.</p>
          )}
        </div>
      </section>

      <section className="bg-white text-black px-6 sm:px-10 lg:px-16 py-20 sm:py-28">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[.8fr_1.2fr] gap-12 lg:gap-24 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[#102b52] mb-5">Live & împreună</p>
            <h2 className="font-heading text-5xl sm:text-7xl font-semibold tracking-[-0.05em] leading-[0.9]">Fii cu noi.<br /><span className="text-black/35">Oriunde ai fi.</span></h2>
          </div>
          <div className="border-t border-black/15 pt-8">
            <p className="text-lg sm:text-2xl leading-relaxed max-w-2xl text-black/65">
              Urmărește serviciile noastre, descoperă mesajele și rămâi conectat cu ceea ce se întâmplă la Casa Pâinii.
            </p>
            <Link href="/live" className="mt-8 inline-flex items-center gap-3 bg-[#102b52] text-white px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] group">
              <Play className="h-4 w-4 fill-current" /> Urmărește live <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-black text-white px-6 sm:px-10 lg:px-16 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-10">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-white/40 mb-5">Casa Pâinii</p>
            <h2 className="font-heading text-5xl sm:text-7xl lg:text-8xl font-semibold tracking-[-0.06em] leading-[0.85]">Vino așa<br />cum ești.</h2>
          </div>
          <Link href="/contact" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.16em] border-b border-white/35 pb-3 group">
            Hai să ne cunoaștem <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </div>
  )
}
