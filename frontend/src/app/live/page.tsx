'use client'

import { useEffect, useState } from 'react'
import { Calendar, Search, Play } from 'lucide-react'
import { FaYoutube, FaFacebook } from 'react-icons/fa'

interface Sermon {
  id: string
  title: string
  speaker: string
  date: string
  description: string
  youtube_url: string
  category: string
  tags: string[]
}

interface LiveConfig {
  youtube_url: string
  facebook_url: string
  is_active: boolean
  next_stream_date: string | null
  next_stream_title: string
}

export default function LivePage() {
  const [config, setConfig] = useState<LiveConfig | null>(null)
  const [sermons, setSermons] = useState<Sermon[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Toate')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const [{ data: liveData }, { data: sermonData }] = await Promise.all([
        supabase.from('livestream_config').select('*').single(),
        supabase.from('sermons').select('*').eq('published', true).order('date', { ascending: false }),
      ])

      setConfig(liveData)
      setSermons(sermonData || [])
      setLoading(false)
    }

    load()
  }, [])

  const categories = ['Toate', ...Array.from(new Set(sermons.map(s => s.category)))]

  const filtered = sermons.filter(s => {
    const matchesCategory = activeCategory === 'Toate' || s.category === activeCategory
    const matchesSearch =
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.speaker.toLowerCase().includes(search.toLowerCase())

    return matchesCategory && matchesSearch
  })

  if (loading) {
    return (
      <div data-testid="live-loading" className="min-h-[80vh] flex items-center justify-center text-muted-foreground">
        Se încarcă...
      </div>
    )
  }

  const youtubeUrl = config?.youtube_url || ''
  const facebookUrl = config?.facebook_url || ''

  return (
    <div data-testid="live-page" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <div className="mb-10 animate-rise">
        <p className="text-sm font-medium tracking-wide uppercase text-primary mb-3">Transmisiuni</p>
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-3">Watch Live</h1>
        <p className="text-muted-foreground text-lg">
          Urmărește serviciile live și predici anterioare
        </p>
      </div>

      {config?.is_active ? (
        <div className="mb-14">
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/60" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
            </span>
            <span className="font-semibold text-primary tracking-wide">LIVE ACUM</span>
          </div>

          <div className="aspect-video w-full rounded-3xl overflow-hidden bg-black soft-shadow-lg">
            <iframe
              src={youtubeUrl.replace('watch?v=', 'embed/')}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>

          <div className="flex gap-3 mt-5">
            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" data-testid="live-youtube-link" className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">
              <FaYoutube className="h-4 w-4" /> Deschide pe YouTube
            </a>
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer" data-testid="live-facebook-link" className="flex items-center gap-2 bg-card border border-border px-5 py-2.5 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors">
              <FaFacebook className="h-4 w-4 text-blue-600" /> Deschide pe Facebook
            </a>
          </div>
        </div>
      ) : (
        <div data-testid="live-empty-state" className="mb-14 bg-accent/30 border border-accent/50 rounded-3xl p-10 text-center soft-shadow">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-card mb-5 soft-shadow">
            <Play className="h-7 w-7 text-primary" />
          </div>
          <h2 className="font-heading text-2xl font-semibold mb-2">
            Nu există transmisie live în acest moment
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {config?.next_stream_title
              ? `Următoarea transmisie: ${config.next_stream_title}`
              : 'Serviciile live au loc în fiecare Duminică la 10:00'}
          </p>
          <div className="flex gap-3 justify-center">
            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">
              <FaYoutube className="h-4 w-4" /> YouTube
            </a>
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-card border border-border px-5 py-2.5 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors">
              <FaFacebook className="h-4 w-4 text-blue-600" /> Facebook
            </a>
          </div>
          <div className="mt-7 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>În fiecare Duminică la 10:00 — Casa Pâinii, Ocna Mureș</span>
          </div>
        </div>
      )}

      <div>
        <h2 className="font-heading text-3xl font-semibold mb-6">Predici anterioare</h2>

        <div className="relative mb-5 max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            data-testid="live-search-input"
            placeholder="Caută predici..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 border border-border rounded-full bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow"
          />
        </div>

        <div className="flex gap-2 flex-wrap mb-8">
          {categories.map(cat => (
            <button
              key={cat}
              data-testid={`live-filter-${cat}`}
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
          <div data-testid="live-sermons-empty" className="text-center py-16 text-muted-foreground">Nu există predici disponibile momentan.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(sermon => (
              <div key={sermon.id} data-testid={`sermon-card-${sermon.id}`} className="rounded-3xl overflow-hidden bg-card border border-border/60 soft-shadow hover:soft-shadow-lg hover:-translate-y-1 transition-all">
                <div className="bg-secondary/50 h-44 flex items-center justify-center cursor-pointer group">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-card soft-shadow group-hover:scale-110 transition-transform">
                    <Play className="h-6 w-6 text-primary" />
                  </span>
                </div>
                <div className="p-5">
                  <span className="text-xs font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">{sermon.category}</span>
                  <h3 className="font-heading font-semibold mt-3 mb-1">{sermon.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{sermon.description}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span>{sermon.speaker}</span>
                    <span>{new Date(sermon.date).toLocaleDateString('ro-RO')}</span>
                  </div>
                  <a href={sermon.youtube_url} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-3 py-2.5 rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors">
                    <FaYoutube className="h-3.5 w-3.5" /> Urmărește pe YouTube
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
