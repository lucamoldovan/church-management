'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check } from 'lucide-react'

const events: Record<number, {
  id: number
  title: string
  date: string
  location: string
  packages: { name: string; price: number; description: string }[]
}> = {
  1: {
    id: 1,
    title: 'Tabără de Vară 2026',
    date: '14-21 Iulie 2026',
    location: 'Ocna Mureș',
    packages: [
      { name: 'Tabără completă', price: 150, description: 'Toate zilele taberei, mese incluse' },
      { name: 'Weekend', price: 80, description: 'Vineri seară până Duminică' },
      { name: 'Primele 3 zile', price: 70, description: 'Luni până Miercuri' },
      { name: 'Ultimele 3 zile', price: 70, description: 'Joi până Sâmbătă' },
      { name: 'O zi', price: 30, description: 'O singură zi la alegere' },
    ],
  },
  2: {
    id: 2,
    title: 'Conferință de Tineret',
    date: '3 August 2026',
    location: 'Sala principală',
    packages: [
      { name: 'Intrare liberă', price: 0, description: 'Eveniment gratuit pentru toți tinerii' },
    ],
  },
  3: {
    id: 3,
    title: 'Serviciu Duminical',
    date: 'În fiecare Duminică',
    location: 'Casa Pâinii',
    packages: [
      { name: 'Intrare liberă', price: 0, description: 'Toți sunt bineveniți' },
    ],
  },
  4: {
    id: 4,
    title: 'Întâlnire de Tineret',
    date: 'În fiecare Vineri',
    location: 'Casa Pâinii',
    packages: [
      { name: 'Intrare liberă', price: 0, description: 'Gratuit pentru toți tinerii' },
    ],
  },
  5: {
    id: 5,
    title: 'Conferință de Familie',
    date: '15 Septembrie 2026',
    location: 'Sala principală',
    packages: [
      { name: 'Familie', price: 50, description: 'Până la 4 membri de familie' },
      { name: 'Individual', price: 20, description: 'O persoană' },
    ],
  },
  6: {
    id: 6,
    title: 'Tabără de Copii',
    date: '1-5 August 2026',
    location: 'Ocna Mureș',
    packages: [
      { name: 'Tabără completă', price: 100, description: 'Toate zilele, mese incluse' },
      { name: 'Jumătate', price: 60, description: 'Primele sau ultimele 2 zile' },
    ],
  },
}

export default function RegisterPage({ params }: { params: { id: string } }) {
  const [selectedPackage, setSelectedPackage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [eventId, setEventId] = useState<number>(0)

  useEffect(() => {
    const load = async () => {
      const id = Number((await params).id ?? params.id)
      setEventId(id)
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      setUser({ id: user.id, email: user.email ?? '' })
    }
    load()
  }, [params])

  const event = events[eventId]

  const handleRegister = async () => {
    if (!user || !event) return
    setLoading(true)
    setError('')

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const attendeeId = `ATT-${new Date().getFullYear()}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`

      const { error } = await supabase.from('registrations').insert({
        event_title: event.title,
        user_id: user.id,
        package_name: event.packages[selectedPackage].name,
        package_price: event.packages[selectedPackage].price,
        status: 'confirmed',
        payment_status: event.packages[selectedPackage].price === 0 ? 'paid' : 'unpaid',
        attendee_id: attendeeId,
      })

      if (error) throw error
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div data-testid="register-success" className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md bg-card border border-border/60 rounded-3xl p-10 soft-shadow-lg animate-rise">
          <div className="w-16 h-16 bg-primary/15 rounded-full flex items-center justify-center mx-auto mb-5">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h1 className="font-heading text-2xl font-bold mb-2">Înregistrare confirmată!</h1>
          <p className="text-muted-foreground mb-7">Te-ai înregistrat cu succes la <strong className="text-foreground">{event?.title}</strong>. Vei primi detalii pe email.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard" data-testid="register-success-dashboard" className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">
              Vezi dashboard
            </Link>
            <Link href="/events" data-testid="register-success-events" className="bg-card border border-border px-5 py-2.5 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors">
              Mai multe evenimente
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <p className="text-muted-foreground">Se încarcă...</p>
      </div>
    )
  }

  return (
    <div data-testid="register-page" className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <Link href={`/events/${eventId}`} data-testid="register-back" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-7">
        <ArrowLeft className="h-4 w-4" /> Înapoi la eveniment
      </Link>

      <h1 className="font-heading text-3xl font-bold mb-1.5">Înregistrare</h1>
      <p className="text-muted-foreground mb-9">{event.title} · {event.date} · {event.location}</p>

      {error && (
        <div data-testid="register-error" className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-2xl text-sm mb-6">
          {error}
        </div>
      )}

      <div className="mb-8">
        <h2 className="font-heading font-semibold text-lg mb-4">Alege pachetul</h2>
        <div className="flex flex-col gap-3">
          {event.packages.map((pkg, i) => (
            <button
              key={i}
              data-testid={`register-package-${i}`}
              onClick={() => setSelectedPackage(i)}
              className={`w-full text-left border rounded-2xl p-5 transition-all ${
                selectedPackage === i ? 'border-primary bg-primary/5 soft-shadow' : 'border-border bg-card hover:bg-secondary/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedPackage === i ? 'border-primary' : 'border-muted-foreground/50'
                  }`}>
                    {selectedPackage === i && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{pkg.name}</div>
                    <div className="text-xs text-muted-foreground">{pkg.description}</div>
                  </div>
                </div>
                <div className="font-heading font-bold text-sm text-primary">{pkg.price === 0 ? 'Gratuit' : `${pkg.price} RON`}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-accent/40 border border-accent/50 rounded-2xl p-6 mb-6">
        <h2 className="font-heading font-semibold mb-3">Sumar</h2>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">{event.packages[selectedPackage].name}</span>
          <span>{event.packages[selectedPackage].price === 0 ? 'Gratuit' : `${event.packages[selectedPackage].price} RON`}</span>
        </div>
        <div className="border-t border-border/60 pt-3 mt-2 flex justify-between font-heading font-semibold">
          <span>Total</span>
          <span className="text-primary">{event.packages[selectedPackage].price === 0 ? 'Gratuit' : `${event.packages[selectedPackage].price} RON`}</span>
        </div>
      </div>

      <button
        onClick={handleRegister}
        disabled={loading}
        data-testid="register-confirm-button"
        className="w-full bg-primary text-primary-foreground py-3.5 rounded-full font-semibold hover:bg-primary/90 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
      >
        {loading ? 'Se procesează...' : 'Confirmă înregistrarea'}
      </button>

      <p className="text-xs text-muted-foreground text-center mt-4">
        Prin înregistrare, ești de acord cu termenii și condițiile evenimentului.
      </p>
    </div>
  )
}
