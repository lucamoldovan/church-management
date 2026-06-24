'use client'

import { useEffect, useState } from 'react'
import { MapPin, Clock, Send, Check } from 'lucide-react'
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
    <div data-testid="contact-page" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <div className="mb-10 animate-rise">
        <p className="text-sm font-medium tracking-wide uppercase text-primary mb-3">Ia legătura</p>
        <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mb-3">Contact</h1>
        <p className="text-muted-foreground text-lg max-w-xl">Avem drag să auzim de tine. Scrie-ne sau vino la unul dintre serviciile noastre.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="flex flex-col gap-5">
          <div className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <h2 className="font-heading font-semibold text-lg mb-4">Informații</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="flex items-center gap-3"><MapPin className="h-5 w-5 text-primary shrink-0" /> Casa Pâinii, Ocna Mureș, jud. Alba</p>
              <p className="flex items-center gap-3"><Clock className="h-5 w-5 text-primary shrink-0" /> Duminică 10:00 · Vineri 18:00 (tineret)</p>
            </div>
            {links.length > 0 && (
              <div className="flex gap-3 mt-5">
                {links.map(l => {
                  const Icon = ICONS[l.platform.toLowerCase()]
                  return (
                    <a key={l.platform} href={l.url} target="_blank" rel="noopener noreferrer" data-testid={`contact-social-${l.platform}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors">
                      {Icon ? <Icon className="h-4 w-4" /> : l.platform[0]}
                    </a>
                  )
                })}
              </div>
            )}
          </div>
          <div className="rounded-3xl overflow-hidden h-64 soft-shadow border border-border/60">
            <iframe title="Hartă" className="w-full h-full" loading="lazy"
              src="https://www.google.com/maps?q=Ocna+Mure%C8%99,+Alba&output=embed" />
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow">
          {sent ? (
            <div data-testid="contact-sent" className="text-center py-10">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary mb-4"><Check className="h-7 w-7" /></span>
              <h3 className="font-heading text-xl font-bold mb-2">Mesaj trimis!</h3>
              <p className="text-muted-foreground text-sm">Îți mulțumim. Te vom contacta în curând.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <h2 className="font-heading font-semibold text-lg">Trimite-ne un mesaj</h2>
              {error && <div data-testid="contact-error" className="bg-destructive/10 text-destructive px-4 py-3 rounded-2xl text-sm">{error}</div>}
              <input required placeholder="Nume" data-testid="contact-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
              <input required type="email" placeholder="Email" data-testid="contact-email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
              <input placeholder="Subiect" data-testid="contact-subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
              <textarea required placeholder="Mesajul tău" data-testid="contact-message" rows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} className="px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
              <button type="submit" disabled={loading} data-testid="contact-submit" className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                <Send className="h-4 w-4" /> {loading ? 'Se trimite...' : 'Trimite mesajul'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
