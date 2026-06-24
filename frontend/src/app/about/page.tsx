import Link from 'next/link'
import { Heart, BookOpen, Users, Target, Eye, HandHeart, Clock, MapPin } from 'lucide-react'
import { eventImage, breadImage } from '@/lib/eventImages'

const beliefs = [
  { title: 'Biblia', text: 'Credem că Scriptura este Cuvântul inspirat al lui Dumnezeu și autoritatea noastră supremă.' },
  { title: 'Mântuirea', text: 'Mântuirea este prin har, prin credința în Domnul Isus Hristos.' },
  { title: 'Duhul Sfânt', text: 'Credem în lucrarea și darurile Duhului Sfânt în viața credinciosului.' },
  { title: 'Biserica', text: 'Suntem o familie chemată să se închine, să crească și să slujească împreună.' },
]

const values = [
  { icon: Heart, title: 'Dragoste', text: 'Primim fiecare persoană cu dragostea lui Hristos.' },
  { icon: BookOpen, title: 'Adevăr', text: 'Trăim ancorați în Cuvântul lui Dumnezeu.' },
  { icon: Users, title: 'Comunitate', text: 'Creștem împreună în grupuri și părtășie.' },
  { icon: HandHeart, title: 'Slujire', text: 'Slujim orașul și pe cei în nevoie.' },
]

export default function AboutPage() {
  return (
    <div data-testid="about-page">
      <section className="relative h-[380px] overflow-hidden">
        <img src={eventImage(3)} alt="Casa Pâinii" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col justify-end pb-12">
          <p className="text-white/80 text-sm font-medium uppercase tracking-wide mb-3">Despre noi</p>
          <h1 className="font-heading text-4xl sm:text-6xl font-bold text-white max-w-3xl leading-tight">O familie a credinței în Ocna Mureș</h1>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="font-heading text-3xl font-bold mb-4">Cine suntem</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Biserica Creștină Penticostală <strong className="text-foreground">Casa Pâinii</strong> este o comunitate de oameni care Îl iubesc pe Dumnezeu și se iubesc unii pe alții. Ne adunăm pentru închinare, studiul Cuvântului și părtășie, dorind să fim „pâine" pentru orașul nostru.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Indiferent unde te afli în călătoria ta de credință, ai un loc aici. Te așteptăm cu drag!
            </p>
          </div>
          <div className="rounded-3xl overflow-hidden h-64 soft-shadow-lg">
            <img src={breadImage} alt="Casa Pâinii" className="h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="bg-secondary/30 py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-6">
          <div className="bg-card rounded-3xl p-8 border border-border/60 soft-shadow">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4"><Target className="h-6 w-6" /></span>
            <h3 className="font-heading text-xl font-bold mb-2">Misiunea noastră</h3>
            <p className="text-muted-foreground leading-relaxed">Să facem ucenici ai Domnului Isus, să creștem împreună în credință și să slujim comunitatea cu dragoste.</p>
          </div>
          <div className="bg-card rounded-3xl p-8 border border-border/60 soft-shadow">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4"><Eye className="h-6 w-6" /></span>
            <h3 className="font-heading text-xl font-bold mb-2">Viziunea noastră</h3>
            <p className="text-muted-foreground leading-relaxed">O biserică vie, unde fiecare generație Îl cunoaște pe Dumnezeu și Îl face cunoscut în Ocna Mureș și dincolo de ea.</p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="font-heading text-3xl font-bold mb-8 text-center">Valorile noastre</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {values.map(v => {
            const Icon = v.icon
            return (
              <div key={v.title} className="bg-card rounded-2xl p-6 border border-border/60 soft-shadow text-center">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent/60 text-accent-foreground mb-3"><Icon className="h-5 w-5" /></span>
                <h3 className="font-heading font-semibold mb-1">{v.title}</h3>
                <p className="text-sm text-muted-foreground">{v.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="bg-secondary/30 py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-heading text-3xl font-bold mb-8 text-center">Ce credem</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {beliefs.map(b => (
              <div key={b.title} className="bg-card rounded-2xl p-6 border border-border/60 soft-shadow">
                <h3 className="font-heading font-semibold mb-2 text-primary">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-card rounded-3xl p-8 border border-border/60 soft-shadow flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="font-heading text-2xl font-bold mb-3">Programul serviciilor</h2>
            <div className="space-y-2 text-muted-foreground text-sm">
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Duminică, 10:00 — Serviciu de închinare</p>
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Vineri, 18:00 — Întâlnire de tineret</p>
              <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Casa Pâinii, Ocna Mureș, jud. Alba</p>
            </div>
          </div>
          <Link href="/contact" className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap">Contactează-ne</Link>
        </div>
      </section>
    </div>
  )
}
