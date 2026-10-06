'use client'

import { useEffect, useState } from 'react'
import { Calendar, Search, Play, Radio } from 'lucide-react'
import { FaYoutube, FaFacebook } from 'react-icons/fa'

interface Sermon { id: string; title: string; speaker: string; date: string; description: string; youtube_url: string; category: string; tags: string[] }
interface LiveConfig { youtube_url: string; facebook_url: string; is_active: boolean; next_stream_date: string | null; next_stream_title: string }

export default function LivePage() {
  const [config, setConfig] = useState<LiveConfig | null>(null)
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Toate')
  const [loading, setLoading] = useState(true)
  const [autoLive, setAutoLive] = useState<{ id: string; title: string; url: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const [{ data: liveData }, { data: sermonData }] = await Promise.all([
        supabase.from('livestream_config').select('*').single(),
        supabase.from('sermons').select('*').eq('published', true).order('date', { ascending: false }),
      ])
      setConfig(liveData); setSermons(sermonData || []); setLoading(false)
    }
    load()
    let timer: ReturnType<typeof setInterval> | null = null
    const poll = async () => {
      try {
        const res = await fetch('/api/youtube/live', { cache: 'no-store' })
        if (res.ok) { const data = await res.json(); setAutoLive(data.live ? data.video : null) }
      } catch {}
    }
    void poll(); timer = setInterval(poll, 30000)
    return () => { if (timer) clearInterval(timer) }
  }, [])

  const categories = ['Toate', ...Array.from(new Set(sermons.map(s => s.category)))]
  const filtered = sermons.filter(s => {
    const q = search.toLowerCase().trim()
    return (activeCategory === 'Toate' || s.category === activeCategory) &&
      (!q || s.title.toLowerCase().includes(q) || s.speaker.toLowerCase().includes(q))
  })

  if (loading) return <div data-testid="live-loading" className="min-h-[80vh] flex items-center justify-center text-muted-foreground">Se încarcă...</div>

  const youtubeUrl = autoLive?.url || config?.youtube_url || ''
  const embedUrl = autoLive?.id ? `https://www.youtube.com/embed/${autoLive.id}?autoplay=1` : youtubeUrl.replace('watch?v=', 'embed/')
  const isLive = !!autoLive || !!config?.is_active
  const facebookUrl = config?.facebook_url || ''

  return (
    <div data-testid="live-page" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <header className="mb-10 sm:mb-12 animate-rise">
        <p className="text-xs sm:text-sm font-semibold tracking-[0.18em] uppercase text-primary mb-4">Watch · Ascultă · Crește</p>
        <h1 className="font-heading text-4xl sm:text-6xl font-bold tracking-tight leading-[1.02]">Rămâi aproape, oriunde ai fi.</h1>
        <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-2xl leading-relaxed">Urmărește serviciile live și redescoperă predicile de la Casa Pâinii.</p>
      </header>

      {isLive ? (
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-4">
            <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" /><span className="relative inline-flex rounded-full h-3 w-3 bg-primary" /></span>
            <span className="text-xs font-bold tracking-[0.16em] text-primary">LIVE ACUM</span>
            {autoLive?.title && <span className="text-sm text-muted-foreground">· {autoLive.title}</span>}
          </div>
          <div className="aspect-video w-full rounded-[2rem] overflow-hidden bg-black soft-shadow-lg border border-border/30">
            <iframe src={embedUrl} title="Casa Pâinii live" className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
          </div>
          <div className="flex flex-wrap gap-3 mt-5">
            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" data-testid="live-youtube-link" className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"><FaYoutube className="h-4 w-4" /> YouTube</a>
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer" data-testid="live-facebook-link" className="flex items-center gap-2 bg-card border border-border px-5 py-2.5 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors"><FaFacebook className="h-4 w-4" /> Facebook</a>
          </div>
        </section>
      ) : (
        <section data-testid="live-empty-state" className="mb-16 grid lg:grid-cols-[1fr_auto] items-center gap-8 rounded-[2rem] bg-accent/35 border border-accent/60 p-8 sm:p-10 soft-shadow">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-primary mb-5"><Radio className="h-3.5 w-3.5" /> NU SUNTEM LIVE</div>
            <h2 className="font-heading text-2xl sm:text-3xl font-semibold">Ne vedem duminică.</h2>
            <p className="text-muted-foreground mt-2 max-w-xl">{config?.next_stream_title ? `Următoarea transmisie: ${config.next_stream_title}` : 'Serviciile live au loc în fiecare Duminică la 10:00.'}</p>
            <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="h-4 w-4 text-primary" /> Duminică, 10:00 · Casa Pâinii</div>
          </div>
          <div className="flex lg:flex-col gap-3">
            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold"><FaYoutube className="h-4 w-4" /> YouTube</a>
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-card border border-border px-5 py-2.5 rounded-full text-sm font-medium"><FaFacebook className="h-4 w-4" /> Facebook</a>
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-7">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-2">Arhivă</p><h2 className="font-heading text-3xl sm:text-4xl font-semibold">Predici anterioare</h2></div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" data-testid="live-search-input" placeholder="Caută predici..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 border border-border/70 rounded-2xl bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mb-8">
          {categories.map(cat => <button key={cat} data-testid={`live-filter-${cat}`} onClick={() => setActiveCategory(cat)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeCategory === cat ? 'bg-primary text-primary-foreground soft-shadow' : 'bg-card border border-border hover:bg-secondary/60'}`}>{cat}</button>)}
        </div>
        {filtered.length === 0 ? (
          <div data-testid="live-sermons-empty" className="rounded-3xl border border-dashed border-border p-16 text-center text-muted-foreground">Nu există predici disponibile momentan.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(sermon => (
              <article key={sermon.id} data-testid={`sermon-card-${sermon.id}`} className="rounded-3xl overflow-hidden bg-card border border-border/60 soft-shadow hover:soft-shadow-lg hover:-translate-y-1 transition-all">
                <div className="bg-secondary/50 h-44 flex items-center justify-center relative">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-card soft-shadow"><Play className="h-6 w-6 text-primary ml-0.5" /></span>
                </div>
                <div className="p-6">
                  <span className="text-xs font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full">{sermon.category}</span>
                  <h3 className="font-heading font-semibold text-lg mt-4 mb-1">{sermon.title}</h3>
                  <p className="text-sm text-muted-foreground mb-5 line-clamp-2 leading-relaxed">{sermon.description}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-4"><span>{sermon.speaker}</span><span>{new Date(sermon.date).toLocaleDateString('ro-RO')}</span></div>
                  <a href={sermon.youtube_url} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-3 py-2.5 rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors"><FaYoutube className="h-3.5 w-3.5" /> Urmărește</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
