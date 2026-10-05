/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { Radio, ChevronLeft, ChevronRight, Play, Square, RefreshCw, ExternalLink, ListMusic } from 'lucide-react'

type ProState = { connected: boolean; version?: string; current?: any; error?: string }

export default function ServicesPage() {
  const [host, setHost] = useState('http://127.0.0.1:50001')
  const [password, setPassword] = useState('')
  const [pro, setPro] = useState<ProState>({ connected: false })
  const [busy, setBusy] = useState(false)
  const [plans, setPlans] = useState<any[]>([])
  const [servicesConfigured, setServicesConfigured] = useState<boolean | null>(null)

  const proRequest = async (endpoint: string, options?: RequestInit) => {
    const base = host.replace(/\/$/, '')
    setBusy(true)
    try {
      const res = await fetch(base + endpoint, { ...options, headers: { Accept: 'application/json', ...(options?.headers || {}) } })
      const text = await res.text()
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch { data = text }
      if (!res.ok) throw new Error(typeof data === 'string' ? data : data?.error || 'ProPresenter a răspuns cu eroare.')
      setPro({ connected: true, version: pro.version, current: data })
      return data
    } catch (e) {
      setPro({ connected: false, error: e instanceof Error ? e.message : 'Conexiunea a eșuat.' })
      return null
    } finally { setBusy(false) }
  }

  const connect = async () => {
    const data = await proRequest('/version')
    if (data) setPro({ connected: true, version: data.version || data.majorVersion ? String(data.version || data.majorVersion) : 'Conectat', current: data })
  }

  const trigger = (path: string) => proRequest(path)
  const loadPlans = async () => {
    const res = await fetch('/api/services/plans')
    const data = await res.json()
    setServicesConfigured(!!data.configured)
    setPlans(data.plans || [])
  }

  return (
    <div data-testid="admin-services">
      <div className="flex items-center gap-2 mb-2"><Radio className="h-6 w-6 text-primary" /><h1 className="font-heading text-3xl font-bold">Services</h1></div>
      <p className="text-muted-foreground text-sm mb-7">Servicii, Planning Center și control ProPresenter din același loc.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
          <div className="flex items-center justify-between mb-5">
            <div><h2 className="font-heading font-semibold">Planning Center Services</h2><p className="text-xs text-muted-foreground mt-1">Planuri și servicii programate</p></div>
            <ListMusic className="h-5 w-5 text-primary" />
          </div>
          <button onClick={loadPlans} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold">Încarcă servicii</button>
          {servicesConfigured === false && <p className="text-xs text-muted-foreground mt-4">Adaugă PLANNING_CENTER_TOKEN în Cloudflare pentru a activa integrarea.</p>}
          {plans.length > 0 && <div className="mt-5 flex flex-col gap-2">{plans.map(p => <div key={p.id} className="border border-border/60 rounded-2xl p-3"><div className="font-medium text-sm">{p.title}</div><div className="text-xs text-muted-foreground mt-1">{p.dates || 'Fără dată'}{p.service_type ? ' · ' + p.service_type : ''}</div></div>)}</div>}
        </section>

        <section className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
          <div className="flex items-center justify-between mb-5">
            <div><h2 className="font-heading font-semibold">ProPresenter</h2><p className="text-xs text-muted-foreground mt-1">Control de bază, similar cu ProPresenter Remote</p></div>
            <Radio className="h-5 w-5 text-primary" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-3">
            <input value={host} onChange={e => setHost(e.target.value)} placeholder="http://192.168.1.100:50001" className="px-4 py-2.5 border border-border rounded-full bg-background text-sm" />
            <button onClick={connect} disabled={busy} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold">{busy ? '...' : 'Conectează'}</button>
          </div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Parolă Remote (opțional)" className="w-full px-4 py-2.5 border border-border rounded-full bg-background text-sm mb-4" />
          <p className="text-xs text-muted-foreground mb-4">ProPresenter trebuie să aibă Network/API activ. Conexiunea directă din browser funcționează doar dacă dispozitivul poate ajunge la calculatorul ProPresenter și browserul permite conexiunea locală.</p>

          <div className="flex items-center gap-2 mb-4">
            <span className={`h-2.5 w-2.5 rounded-full ${pro.connected ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
            <span className="text-sm">{pro.connected ? 'Conectat' : 'Neconectat'}</span>
            {pro.version && <span className="text-xs text-muted-foreground">· {pro.version}</span>}
          </div>

          {pro.error && <div className="bg-destructive/10 text-destructive p-3 rounded-2xl text-xs mb-4">{pro.error}</div>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button onClick={() => trigger('/v1/trigger/previous')} disabled={busy} className="inline-flex items-center justify-center gap-1 bg-secondary py-3 rounded-xl text-sm font-semibold"><ChevronLeft className="h-4 w-4" /> Înapoi</button>
            <button onClick={() => trigger('/v1/trigger/next')} disabled={busy} className="inline-flex items-center justify-center gap-1 bg-primary text-primary-foreground py-3 rounded-xl text-sm font-semibold"><ChevronRight className="h-4 w-4" /> Următor</button>
            <button onClick={() => trigger('/v1/presentation/active/trigger')} disabled={busy} className="inline-flex items-center justify-center gap-1 bg-secondary py-3 rounded-xl text-sm font-semibold"><Play className="h-4 w-4" /> Retrigger</button>
            <button onClick={() => trigger('/v1/clear/layer/slide')} disabled={busy} className="inline-flex items-center justify-center gap-1 bg-secondary py-3 rounded-xl text-sm font-semibold"><Square className="h-4 w-4" /> Clear</button>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={() => proRequest('/v1/presentation/active')} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" /> Citește prezentarea activă</button>
            <a href="https://openapi.propresenter.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /> API docs</a>
          </div>
        </section>
      </div>
    </div>
  )
}
