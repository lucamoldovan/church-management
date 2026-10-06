'use client'

import { useEffect, useState } from 'react'
import { MapPin, Clock, Send, Check, ArrowUpRight } from 'lucide-react'
import { FaYoutube, FaFacebook, FaInstagram, FaTiktok, FaWhatsapp } from 'react-icons/fa'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  youtube: FaYoutube, facebook: FaFacebook, instagram: FaInstagram, tiktok: FaTiktok, whatsapp: FaWhatsapp,
}

export default function ContactPage() {
  const [links, setLinks] = useState<{ platform: string; url: string }[]>([])
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase.from('social_media').select('platform, url').eq('is_active', true).order('display_order')
      setLinks((data || []).filter(l => l.url))
    }
    load()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.from('contact_messages').insert(form)
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div data-testid="contact-page" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <header className="mb-10 sm:mb-14 animate-rise">
        <p className="text-xs sm:text-sm font-semibold tracking-[0.18em] uppercase text-primary mb-4">Ia legătura</p>
        <h1 className="font-heading text-4xl sm:text-6xl font-bold tracking-tight leading-[1.02]">Hai să ne cunoaștem.</h1>
        <p className="text-muted-foreground text-base sm:text-lg mt-5 max-w-2xl leading-relaxed">Avem drag să auzim de tine. Scrie-ne, urmărește-ne online sau vino la Casa Pâinii.</p>
      </header>

      <div className="grid lg:grid-cols-[.85fr_1.15fr] gap-6 lg:gap-8">
        <div className="flex flex-col gap-6">
          <div className="bg-primary text-primary-foreground rounded-[2rem] p-7 sm:p-8 soft-shadow">
            <p className="text-xs font-semibold tracking-[0.16em] uppercase opacity-75 mb-6">Casa Pâinii</p>
            <h2 className="font-heading text-2xl sm:text-3xl font-semibold leading-tight">Un loc unde poți să vii exact așa cum ești.</h2>
            <div className="mt-8 space-y-4 text-sm">
              <p className="flex items-start gap-3"><MapPin className="h-5 w-5 shrink-0 mt-0.5" /> Casa Pâinii, Ocna Mureș, jud. Alba</p>
              <p className="flex items-start gap-3"><Clock className="h-5 w-5 shrink-0" /> Duminică 10:00 · Vineri 18:00 (tineret)</p>
            </div>
            {links.length > 0 && (
              <div className="flex gap-2 mt-7">
                {links.map(l => {
                  const Icon = ICONS[l.platform.toLowerCase()]
                  return (
                    <a key={l.platform} href={l.url} target="_blank" rel="noopener noreferrer" data-testid={`contact-social-${l.platform}`}
                      aria-label={l.platform} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 hover:bg-white hover:text-primary transition-colors">
                      {Icon ? <Icon className="h-4 w-4" /> : l.platform[0]}
                    </a>
                  )
                })}
              </div>
            )}
          </div>
          <div className="rounded-[2rem] overflow-hidden h-72 soft-shadow border border-border/60 bg-secondary">
            <iframe title="Hartă" className="w-full h-full" loading="lazy"
              src="https://www.google.com/maps?q=Ocna+Mure%C8%99,+Alba&output=embed" />
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-[2rem] p-7 sm:p-9 soft-shadow">
          {sent ? (
            <div data-testid="contact-sent" className="text-center py-16">
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary mb-5"><Check className="h-7 w-7" /></span>
              <h3 className="font-heading text-2xl font-bold mb-2">Mesaj trimis.</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">Îți mulțumim. Am primit mesajul tău și te vom contacta în curând.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-5">
              <div className="mb-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-2">Scrie-ne</p>
                <h2 className="font-heading text-2xl font-semibold">Cum te putem ajuta?</h2>
              </div>
              {error && <div data-testid="contact-error" className="bg-destructive/10 text-destructive px-4 py-3 rounded-2xl text-sm">{error}</div>}
              <div className="grid sm:grid-cols-2 gap-4">
                <input required placeholder="Nume" data-testid="contact-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-4 py-3.5 border border-border rounded-2xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
                <input required type="email" placeholder="Email" data-testid="contact-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-4 py-3.5 border border-border rounded-2xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
              </div>
              <input placeholder="Subiect" data-testid="contact-subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="px-4 py-3.5 border border-border rounded-2xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
              <textarea required placeholder="Mesajul tău" data-testid="contact-message" rows={7} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} className="px-4 py-3.5 border border-border rounded-2xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none" />
              <button type="submit" disabled={loading} data-testid="contact-submit" className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-full font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                <Send className="h-4 w-4" /> {loading ? 'Se trimite...' : 'Trimite mesajul'} <ArrowUpRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
