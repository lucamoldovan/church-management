'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check, Loader2, XCircle } from 'lucide-react'

function SuccessInner() {
  const params = useSearchParams()
  const sessionId = params.get('session_id')
  const [state, setState] = useState<'checking' | 'paid' | 'failed'>('checking')
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    if (!sessionId) { setState('failed'); return }
    let active = true
    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/status/${sessionId}`)
        const data = await res.json()
        if (!active) return
        if (data.payment_status === 'paid') { setState('paid'); return }
        if (data.status === 'expired' || attempts > 10) { setState('failed'); return }
        setTimeout(() => setAttempts(a => a + 1), 2000)
      } catch {
        if (active && attempts > 10) setState('failed')
        else setTimeout(() => setAttempts(a => a + 1), 2000)
      }
    }
    poll()
    return () => { active = false }
  }, [sessionId, attempts])

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div data-testid="payment-success" className="text-center max-w-md bg-card border border-border/60 rounded-3xl p-10 soft-shadow-lg">
        {state === 'checking' && (<><Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-5" /><h1 className="font-heading text-2xl font-bold mb-2">Confirmăm plata...</h1><p className="text-muted-foreground">Te rugăm așteaptă câteva momente.</p></>)}
        {state === 'paid' && (<><div className="w-16 h-16 bg-primary/15 rounded-full flex items-center justify-center mx-auto mb-5"><Check className="h-8 w-8 text-primary" /></div><h1 className="font-heading text-2xl font-bold mb-2">Plată confirmată!</h1><p className="text-muted-foreground mb-7">Biletul tău este acum plătit. Vezi codul QR în dashboard.</p><Link href="/dashboard" className="bg-primary text-primary-foreground px-6 py-3 rounded-full text-sm font-semibold">Vezi dashboard</Link></>)}
        {state === 'failed' && (<><div className="w-16 h-16 bg-destructive/15 rounded-full flex items-center justify-center mx-auto mb-5"><XCircle className="h-8 w-8 text-destructive" /></div><h1 className="font-heading text-2xl font-bold mb-2">Plata nu a putut fi confirmată</h1><p className="text-muted-foreground mb-7">Dacă ai fost taxat, contactează-ne. Poți reîncerca din dashboard.</p><Link href="/dashboard" className="bg-card border border-border px-6 py-3 rounded-full text-sm font-medium">Înapoi la dashboard</Link></>)}
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center text-muted-foreground">Se încarcă...</div>}><SuccessInner /></Suspense>
}
