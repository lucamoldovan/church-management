'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plug, Calendar, Share2, CheckCircle2, XCircle, Camera, MessageCircle, Mail, Bell } from 'lucide-react'

interface Status {
  google: { configured: boolean; connected: boolean; calendar_id: string }
  facebook: { configured: boolean; page_id: string | null }
}

export default function AdminIntegrations() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* backend unreachable locally */ }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // surface ?google=connected|error after OAuth redirect
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const googleFlag = params?.get('google')

  const connectGoogle = async () => {
    const res = await fetch('/api/integrations/google/connect')
    const data = await res.json()
    if (data.authorization_url) window.location.href = data.authorization_url
  }

  const Pill = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full ${ok ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {label}
    </span>
  )

  const future = [
    { icon: Camera, label: 'Instagram' },
    { icon: MessageCircle, label: 'WhatsApp' },
    { icon: Mail, label: 'Email' },
    { icon: Bell, label: 'Push' },
  ]

  return (
    <div data-testid="admin-integrations">
      <div className="flex items-center gap-2 mb-6"><Plug className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Integrări</h1></div>
      <p className="text-muted-foreground text-sm mb-6">Conectează canale pentru publicarea automată a evenimentelor aprobate.</p>

      {googleFlag === 'connected' && <div className="bg-primary/10 text-primary px-4 py-3 rounded-2xl text-sm mb-4">Google Calendar conectat ✓</div>}
      {googleFlag === 'error' && <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-2xl text-sm mb-4">Conectarea Google a eșuat. Verifică credențialele.</div>}

      {loading ? <p className="text-muted-foreground text-sm">Se încarcă...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Google Calendar */}
          <div data-testid="integration-google" className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <div className="flex items-center gap-3 mb-4"><span className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Calendar className="h-5 w-5" /></span><div><h2 className="font-heading font-semibold">Google Calendar</h2><p className="text-xs text-muted-foreground">Sincronizează evenimentele aprobate</p></div></div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Pill ok={!!status?.google.configured} label={status?.google.configured ? 'Credențiale OK' : 'Lipsesc credențiale'} />
              <Pill ok={!!status?.google.connected} label={status?.google.connected ? 'Conectat' : 'Neconectat'} />
            </div>
            {status?.google.configured ? (
              <button onClick={connectGoogle} data-testid="integration-google-connect" className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90">{status?.google.connected ? 'Reconectează' : 'Conectează Google Calendar'}</button>
            ) : (
              <p className="text-xs text-muted-foreground">Adaugă GOOGLE_CLIENT_ID și GOOGLE_CLIENT_SECRET în backend pentru a activa.</p>
            )}
          </div>

          {/* Facebook */}
          <div data-testid="integration-facebook" className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <div className="flex items-center gap-3 mb-4"><span className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Share2 className="h-5 w-5" /></span><div><h2 className="font-heading font-semibold">Facebook Page</h2><p className="text-xs text-muted-foreground">Postează posterul + linkul de înscriere</p></div></div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Pill ok={!!status?.facebook.configured} label={status?.facebook.configured ? `Pagină: ${status?.facebook.page_id}` : 'Lipsesc credențiale'} />
            </div>
            {!status?.facebook.configured && <p className="text-xs text-muted-foreground">Adaugă FB_PAGE_ID și FB_PAGE_ACCESS_TOKEN în backend pentru a activa.</p>}
          </div>

          {/* Future channels */}
          <div className="md:col-span-2 bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <h2 className="font-heading font-semibold mb-3">În curând</h2>
            <div className="flex flex-wrap gap-3">
              {future.map(f => { const Icon = f.icon; return (
                <span key={f.label} className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 px-4 py-2 rounded-full"><Icon className="h-4 w-4" /> {f.label}</span>
              ) })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
