import Link from 'next/link'
import { Calendar, MapPin, Users, ArrowLeft, Clock } from 'lucide-react'
import { eventImage } from '@/lib/eventImages'

const events: Record<number, {
  id: number
  title: string
  date: string
  time: string
  location: string
  description: string
  category: string
  spots: number
  price: number
  packages: { name: string; price: number; description: string }[]
  schedule: { time: string; activity: string }[]
}> = {
  1: {
    id: 1,
    title: 'Tabără de Vară 2026',
    date: '14-21 Iulie 2026',
    time: '09:00',
    location: 'Ocna Mureș',
    description: 'O săptămână de credință, distracție și părtășie pentru toate vârstele. Vino să experimentezi prezența lui Dumnezeu într-un cadru de neuitat, alături de frați și surori în credință.',
    category: 'Tabără',
    spots: 12,
    price: 150,
    packages: [
      { name: 'Tabără completă', price: 150, description: 'Toate zilele taberei, mese incluse' },
      { name: 'Weekend', price: 80, description: 'Vineri seară până Duminică' },
      { name: 'Primele 3 zile', price: 70, description: 'Luni până Miercuri' },
      { name: 'Ultimele 3 zile', price: 70, description: 'Joi până Sâmbătă' },
      { name: 'O zi', price: 30, description: 'O singură zi la alegere' },
    ],
    schedule: [
      { time: '08:00', activity: 'Mic dejun' },
      { time: '09:30', activity: 'Worship dimineață' },
      { time: '11:00', activity: 'Studiu biblic' },
      { time: '13:00', activity: 'Prânz' },
      { time: '15:00', activity: 'Activități și sport' },
      { time: '18:00', activity: 'Cină' },
      { time: '19:30', activity: 'Seară de worship' },
    ],
  },
  2: {
    id: 2,
    title: 'Conferință de Tineret',
    date: '3 August 2026',
    time: '10:00',
    location: 'Sala principală',
    description: 'Conferința anuală de tineret cu worship și predici inspiraționale. Un eveniment pentru tinerii care vor să crească în credință.',
    category: 'Conferință',
    spots: 45,
    price: 0,
    packages: [
      { name: 'Intrare liberă', price: 0, description: 'Eveniment gratuit pentru toți tinerii' },
    ],
    schedule: [
      { time: '10:00', activity: 'Înregistrare și cafea' },
      { time: '10:30', activity: 'Worship' },
      { time: '11:30', activity: 'Predică' },
      { time: '13:00', activity: 'Prânz împreună' },
      { time: '14:30', activity: 'Grupuri mici' },
      { time: '16:00', activity: 'Sesiune Q&A' },
      { time: '17:00', activity: 'Worship final' },
    ],
  },
  3: {
    id: 3,
    title: 'Serviciu Duminical',
    date: 'În fiecare Duminică',
    time: '10:00',
    location: 'Casa Pâinii',
    description: 'Vino alături de noi la worship și studiul Cuvântului în fiecare dimineață de Duminică. Toți sunt bineveniți.',
    category: 'Serviciu',
    spots: 200,
    price: 0,
    packages: [
      { name: 'Intrare liberă', price: 0, description: 'Toți sunt bineveniți' },
    ],
    schedule: [
      { time: '10:00', activity: 'Worship' },
      { time: '10:45', activity: 'Predică' },
      { time: '12:00', activity: 'Părtășie' },
    ],
  },
  4: {
    id: 4,
    title: 'Întâlnire de Tineret',
    date: 'În fiecare Vineri',
    time: '18:00',
    location: 'Casa Pâinii',
    description: 'Seară de worship, jocuri și părtășie pentru tineri. Un loc unde tinerii se pot întâlni și crește împreună.',
    category: 'Tineret',
    spots: 80,
    price: 0,
    packages: [
      { name: 'Intrare liberă', price: 0, description: 'Gratuit pentru toți tinerii' },
    ],
    schedule: [
      { time: '18:00', activity: 'Jocuri și socializare' },
      { time: '19:00', activity: 'Worship' },
      { time: '19:45', activity: 'Mesaj' },
      { time: '20:30', activity: 'Grupuri mici' },
    ],
  },
  5: {
    id: 5,
    title: 'Conferință de Familie',
    date: '15 Septembrie 2026',
    time: '10:00',
    location: 'Sala principală',
    description: 'Conferință dedicată familiilor creștine. Vino alături de familia ta să descoperi principii biblice pentru o familie sănătoasă.',
    category: 'Conferință',
    spots: 30,
    price: 50,
    packages: [
      { name: 'Familie', price: 50, description: 'Până la 4 membri de familie' },
      { name: 'Individual', price: 20, description: 'O persoană' },
    ],
    schedule: [
      { time: '10:00', activity: 'Înregistrare' },
      { time: '10:30', activity: 'Worship' },
      { time: '11:00', activity: 'Sesiunea 1' },
      { time: '13:00', activity: 'Prânz' },
      { time: '14:30', activity: 'Sesiunea 2' },
      { time: '16:30', activity: 'Panel de discuții' },
    ],
  },
  6: {
    id: 6,
    title: 'Tabără de Copii',
    date: '1-5 August 2026',
    time: '09:00',
    location: 'Ocna Mureș',
    description: 'Tabără pentru copii cu activități, jocuri și studiu biblic. O experiență de neuitat pentru cei mici.',
    category: 'Tabără',
    spots: 25,
    price: 100,
    packages: [
      { name: 'Tabără completă', price: 100, description: 'Toate zilele, mese incluse' },
      { name: 'Jumătate', price: 60, description: 'Primele sau ultimele 2 zile' },
    ],
    schedule: [
      { time: '08:30', activity: 'Mic dejun' },
      { time: '09:30', activity: 'Studiu biblic pentru copii' },
      { time: '11:00', activity: 'Activități creative' },
      { time: '13:00', activity: 'Prânz' },
      { time: '14:30', activity: 'Jocuri în aer liber' },
      { time: '18:00', activity: 'Cină' },
      { time: '19:00', activity: 'Seară de povești biblice' },
    ],
  },
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const event = events[Number(id)]

  if (!event) {
    return (
      <div data-testid="event-not-found" className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold mb-4">Evenimentul nu a fost găsit</h1>
        <Link href="/events" className="text-primary hover:underline">Înapoi la evenimente</Link>
      </div>
    )
  }

  return (
    <div data-testid="event-detail-page" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href="/events"
        data-testid="event-detail-back"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-7"
      >
        <ArrowLeft className="h-4 w-4" /> Înapoi la evenimente
      </Link>

      <div className="relative rounded-3xl h-64 sm:h-80 overflow-hidden mb-10 soft-shadow-lg">
        <img src={eventImage(event.id)} alt={event.title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-0 left-0 p-7 sm:p-10">
          <span className="inline-flex w-fit items-center rounded-full bg-white/15 backdrop-blur-md text-white text-xs font-medium px-3 py-1.5 mb-3">
            {event.category}
          </span>
          <h1 className="font-heading text-3xl sm:text-5xl font-bold text-white max-w-2xl leading-tight">{event.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <p className="text-muted-foreground text-lg leading-relaxed mb-7">{event.description}</p>

          <div className="grid grid-cols-2 gap-3 mb-10">
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-xs text-muted-foreground">Data</div><div className="text-sm font-medium">{event.date}</div></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-xs text-muted-foreground">Ora</div><div className="text-sm font-medium">{event.time}</div></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-xs text-muted-foreground">Locație</div><div className="text-sm font-medium">{event.location}</div></div>
            </div>
            <div className="bg-card border border-border/60 rounded-2xl p-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-primary shrink-0" />
              <div><div className="text-xs text-muted-foreground">Locuri</div><div className="text-sm font-medium">{event.spots} disponibile</div></div>
            </div>
          </div>

          <h2 className="font-heading text-2xl font-semibold mb-4">Program</h2>
          <div className="bg-card border border-border/60 rounded-2xl overflow-hidden soft-shadow">
            {event.schedule.map((item, i) => (
              <div key={i} className="flex gap-5 px-5 py-4 text-sm items-center border-b border-border/50 last:border-0">
                <span className="text-primary font-semibold font-heading w-14 shrink-0">{item.time}</span>
                <span className="text-foreground/90">{item.activity}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="bg-accent/40 border border-accent/50 rounded-3xl p-6 sticky top-24 soft-shadow">
            <h2 className="font-heading font-semibold text-lg mb-4">Pachete disponibile</h2>
            <div className="flex flex-col gap-3 mb-6">
              {event.packages.map((pkg, i) => (
                <div key={i} className="bg-card/80 border border-border/60 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{pkg.name}</span>
                    <span className="font-heading font-bold text-sm text-primary">{pkg.price === 0 ? 'Gratuit' : `${pkg.price} RON`}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{pkg.description}</p>
                </div>
              ))}
            </div>
            <Link
              href={`/events/${event.id}/register`}
              data-testid="event-detail-register-button"
              className="w-full block text-center bg-primary text-primary-foreground px-4 py-3.5 rounded-full font-semibold hover:bg-primary/90 transition-all hover:-translate-y-0.5"
            >
              Înregistrează-te
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
