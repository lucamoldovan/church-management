'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, CreditCard, Wallet } from 'lucide-react'
import { formatPrice } from '@/lib/eventImages'

interface Pkg { id: string; name: string; price: number; description: string }
interface Ev { id: string; title: string; location: string | null; date: string | null; date_label?: string | null; price: number | null }

export default function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const [event, setEvent] = useState<Ev | null>(null)
  const [packages, setPackages] = useState<Pkg[]>([])
  const [selectedPackage, setSelectedPackage] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [eventId, setEventId] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const load = async () => {
      const id = (await params).id
      setEventId(id)
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      setUser({ id: user.id, email: user.email ?? '' })
      const [{ data: ev }, { data: pkgs }] = await Promise.all([
        supabase.from('events').select('*').eq('id', id).single(),
        supabase.from('event_packages').select('*').eq('event_id', id).order('price', { ascending: true }),
      ])
      setEvent(ev as Ev)
      const list = (pkgs as Pkg[]) || []
      setPackages(list.length ? list : [{ id: 'default', name: 'Intrare standard', price: Number((ev as Ev)?.price || 0), description: 'Acces la eveniment' }])
      setReady(true)
    }
    load()
  }, [params])

  const handleRegister = async () => {
    if (!user || !event) return
    setLoading(true); setError('')
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const pkg = packages[selectedPackage]
      const attendeeId = `ATT-${new Date().getFullYear()}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`
      const isFree = Number(pkg.price) === 0
      const method = isFree ? 'online' : paymentMethod
      const paymentStatus = isFree ? 'paid' : method === 'cash' ? 'pending' : 'unpaid'
      const { data: inserted, error } = await supabase.from('registrations').insert({
        event_title: event.title,
        user_id: user.id,
        event_id: event.id,
        package_id: pkg.id === 'default' ? null : pkg.id,
        package_name: pkg.name,
        package_price: pkg.price,
        status: 'confirmed',
        payment_method: method,
        payment_status: paymentStatus,
        amount_paid: isFree ? pkg.price : 0,
        attendee_id: attendeeId,
      }).select('id').single()
      if (error) throw error

      // Online paid ticket → redirect to Stripe checkout. Cash ("pay at event") skips payment.
      if (!isFree && method === 'online' && inserted?.id) {
        try {
          const res = await fetch('/api/payments/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ registration_id: inserted.id, origin: window.location.origin }),
          })
          const ct = res.headers.get('content-type') || ''
          if (res.ok && ct.includes('application/json')) {
            const data = await res.json()
            if (data.url) { window.location.href = data.url; return }
          }
          // payment backend unreachable (e.g. local dev) — ticket is created as 'unpaid'
        } catch {
          // ignore: registration already saved; payment can be completed later
        }
      }
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare')
    } finally { setLoading(false) }
  }

  if (success) {
    const wasCash = Number(packages[selectedPackage]?.price) > 0 && paymentMethod === 'cash'
    return (
      <div data-testid="register-success" className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md bg-card border border-border/60 rounded-3xl p-10 soft-shadow-lg animate-rise">
          <div className="w-16 h-16 bg-primary/15 rounded-full flex items-center justify-center mx-auto mb-5"><Check className="h-8 w-8 text-primary" /></div>
          <h1 className="font-heading text-2xl font-bold mb-2">Înregistrare confirmată!</h1>
          <p className="text-muted-foreground mb-4">Te-ai înregistrat cu succes la <strong className="text-foreground">{event?.title}</strong>. Vezi biletul și codul QR în dashboard.</p>
          {wasCash && (
            <div data-testid="register-success-cash-note" className="flex items-start gap-2 text-left bg-accent/40 border border-accent/50 rounded-2xl px-4 py-3 text-sm mb-6">
              <Wallet className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Plata de <strong>{formatPrice(packages[selectedPackage].price)}</strong> se va face <strong>la eveniment</strong>, la check-in. Bilet marcat ca „în așteptare”.</span>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard" data-testid="register-success-dashboard" className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">Vezi dashboard</Link>
            <Link href="/events" data-testid="register-success-events" className="bg-card border border-border px-5 py-2.5 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors">Mai multe evenimente</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!ready || !event) {
    return <div className="max-w-7xl mx-auto px-4 py-24 text-center text-muted-foreground">Se încarcă...</div>
  }

  return (
    <div data-testid="register-page" className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <Link href={`/events/${eventId}`} data-testid="register-back" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-7">
        <ArrowLeft className="h-4 w-4" /> Înapoi la eveniment
      </Link>
      <h1 className="font-heading text-3xl font-bold mb-1.5">Înregistrare</h1>
      <p className="text-muted-foreground mb-9">{event.title} · {event.date_label || (event.date ? new Date(event.date).toLocaleDateString('ro-RO') : '')} · {event.location}</p>

      {error && <div data-testid="register-error" className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-2xl text-sm mb-6">{error}</div>}

      <div className="mb-8">
        <h2 className="font-heading font-semibold text-lg mb-4">Alege pachetul</h2>
        <div className="flex flex-col gap-3">
          {packages.map((pkg, i) => (
            <button key={pkg.id} data-testid={`register-package-${i}`} onClick={() => setSelectedPackage(i)}
              className={`w-full text-left border rounded-2xl p-5 transition-all ${selectedPackage === i ? 'border-primary bg-primary/5 soft-shadow' : 'border-border bg-card hover:bg-secondary/40'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPackage === i ? 'border-primary' : 'border-muted-foreground/50'}`}>
                    {selectedPackage === i && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </div>
                  <div><div className="font-medium text-sm">{pkg.name}</div><div className="text-xs text-muted-foreground">{pkg.description}</div></div>
                </div>
                <div className="font-heading font-bold text-sm text-primary">{formatPrice(pkg.price)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {Number(packages[selectedPackage]?.price) > 0 && (
        <div className="mb-8" data-testid="register-payment-method">
          <h2 className="font-heading font-semibold text-lg mb-4">Metoda de plată</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" data-testid="payment-method-online" onClick={() => setPaymentMethod('online')}
              className={`flex items-start gap-3 text-left border rounded-2xl p-5 transition-all ${paymentMethod === 'online' ? 'border-primary bg-primary/5 soft-shadow' : 'border-border bg-card hover:bg-secondary/40'}`}>
              <CreditCard className={`h-5 w-5 mt-0.5 ${paymentMethod === 'online' ? 'text-primary' : 'text-muted-foreground'}`} />
              <div><div className="font-medium text-sm">Plătește online</div><div className="text-xs text-muted-foreground">Card bancar, securizat prin Stripe</div></div>
            </button>
            <button type="button" data-testid="payment-method-cash" onClick={() => setPaymentMethod('cash')}
              className={`flex items-start gap-3 text-left border rounded-2xl p-5 transition-all ${paymentMethod === 'cash' ? 'border-primary bg-primary/5 soft-shadow' : 'border-border bg-card hover:bg-secondary/40'}`}>
              <Wallet className={`h-5 w-5 mt-0.5 ${paymentMethod === 'cash' ? 'text-primary' : 'text-muted-foreground'}`} />
              <div><div className="font-medium text-sm">Plătește la eveniment</div><div className="text-xs text-muted-foreground">Numerar, la check-in</div></div>
            </button>
          </div>
        </div>
      )}

      <div className="bg-accent/40 border border-accent/50 rounded-2xl p-6 mb-6">
        <h2 className="font-heading font-semibold mb-3">Sumar</h2>
        <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">{packages[selectedPackage].name}</span><span>{formatPrice(packages[selectedPackage].price)}</span></div>
        <div className="border-t border-border/60 pt-3 mt-2 flex justify-between font-heading font-semibold"><span>Total</span><span className="text-primary">{formatPrice(packages[selectedPackage].price)}</span></div>
      </div>

      <button onClick={handleRegister} disabled={loading} data-testid="register-confirm-button"
        className="w-full bg-primary text-primary-foreground py-3.5 rounded-full font-semibold hover:bg-primary/90 transition-all hover:-translate-y-0.5 disabled:opacity-50">
        {loading ? 'Se procesează...' : Number(packages[selectedPackage]?.price) > 0 && paymentMethod === 'online' ? 'Continuă spre plată' : 'Confirmă înregistrarea'}
      </button>
      <p className="text-xs text-muted-foreground text-center mt-4">Prin înregistrare, ești de acord cu termenii și condițiile evenimentului.</p>
    </div>
  )
}
