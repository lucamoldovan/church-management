'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, MapPin, QrCode, User, LogOut, Check, Clock } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

interface Profile {
  full_name: string
  email: string
  role: string
  nfc_id: string | null
}

interface Registration {
  id: string
  event_title: string
  package_name: string
  package_price: number
  status: string
  payment_status: string
  attendee_id: string
  qr_token: string | null
  checked_in: boolean
  created_at: string
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const [{ data: profileData }, { data: regData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('registrations').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])

      setProfile(profileData)
      setRegistrations(regData || [])
      setLoading(false)
    }

    loadData()
  }, [])

  const handleLogout = async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div data-testid="dashboard-loading" className="min-h-[80vh] flex items-center justify-center">
        <div className="text-muted-foreground">Se încarcă...</div>
      </div>
    )
  }

  const totalPaid = registrations.reduce((sum, r) => sum + (r.payment_status === 'paid' ? 0 : r.package_price), 0)

  const stats = [
    { value: registrations.length, label: 'Evenimente înregistrate', tint: 'bg-primary/10 text-primary' },
    { value: registrations.filter(r => r.checked_in).length, label: 'Evenimente participare', tint: 'bg-accent/50 text-accent-foreground' },
    { value: `${totalPaid} RON`, label: 'Total de plătit', tint: 'bg-secondary text-secondary-foreground' },
  ]

  return (
    <div data-testid="dashboard-page" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Bună, {profile?.full_name || 'utilizator'}!</h1>
          <p className="text-muted-foreground text-sm mt-1.5">{profile?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          data-testid="dashboard-logout-button"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground bg-card border border-border px-4 py-2.5 rounded-full transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Ieși din cont
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {stats.map((s, i) => (
          <div key={i} data-testid={`dashboard-stat-${i}`} className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <div className={`inline-flex items-center justify-center h-10 w-10 rounded-full mb-4 ${s.tint}`}>
              <span className="font-heading font-bold text-sm">{i + 1}</span>
            </div>
            <div className="font-heading text-3xl font-bold">{s.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <h2 className="font-heading text-xl font-semibold mb-4">Evenimentele mele</h2>
          {registrations.length === 0 ? (
            <div data-testid="dashboard-empty-events" className="bg-card border border-border/60 rounded-3xl p-10 text-center text-muted-foreground soft-shadow">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nu ești înregistrat la niciun eveniment</p>
              <Link href="/events" className="mt-5 inline-block bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">
                Explorează evenimente
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {registrations.map(reg => (
                <div key={reg.id} data-testid={`dashboard-registration-${reg.id}`} className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
                  <div className="flex items-start justify-between mb-3 gap-3">
                    <div>
                      <h3 className="font-heading font-semibold">{reg.event_title}</h3>
                      <p className="text-sm text-muted-foreground">{reg.package_name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                        reg.payment_status === 'paid'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-secondary text-secondary-foreground'
                      }`}>
                        {reg.payment_status === 'paid' ? 'Plătit' : reg.package_price === 0 ? 'Gratuit' : `${reg.package_price} RON`}
                      </span>
                      {reg.checked_in && (
                        <span className="text-xs px-3 py-1 rounded-full font-medium bg-accent/60 text-accent-foreground flex items-center gap-1">
                          <Check className="h-3 w-3" /> Prezent
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(reg.created_at).toLocaleDateString('ro-RO')}
                    </span>
                    <span className="font-mono">{reg.attendee_id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-medium text-sm">{profile?.full_name}</div>
                <div className="text-xs text-muted-foreground capitalize">{profile?.role}</div>
              </div>
            </div>
            <Link href="/profile" data-testid="dashboard-edit-profile" className="w-full block text-center bg-card border border-border px-3 py-2.5 rounded-full text-sm hover:bg-secondary/60 transition-colors">
              Editează profilul
            </Link>
          </div>

          <div className="rounded-3xl p-6 bg-gradient-to-br from-primary to-primary/70 text-primary-foreground soft-shadow-lg">
            <div className="flex items-center gap-2 mb-4 text-primary-foreground/90">
              <QrCode className="h-5 w-5" />
              <span className="font-medium text-sm">ID Participant</span>
            </div>
            {registrations.length > 0 ? (
              <div className="flex flex-col items-center">
                <div className="bg-white rounded-2xl p-3 mb-3" data-testid="dashboard-qr-code">
                  <QRCodeSVG value={registrations[0].qr_token || registrations[0].attendee_id} size={132} level="M" />
                </div>
                <div className="text-xs text-primary-foreground/70 mb-1 self-start">Cardul tău digital</div>
                <div className="w-full text-sm font-mono font-bold tracking-wide bg-white/15 rounded-xl px-3 py-2.5 backdrop-blur-sm text-center">{registrations[0].attendee_id}</div>
              </div>
            ) : (
              <p className="text-xs text-primary-foreground/80">ID-ul tău va apărea după înregistrarea la primul eveniment.</p>
            )}
          </div>

          <div className="bg-card border border-border/60 rounded-3xl p-6 soft-shadow">
            <h3 className="font-heading font-medium text-sm mb-3">Linkuri rapide</h3>
            <div className="flex flex-col gap-3">
              <Link href="/events" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-2 transition-colors">
                <Calendar className="h-4 w-4" /> Evenimente
              </Link>
              <Link href="/profile" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-2 transition-colors">
                <User className="h-4 w-4" /> Profilul meu
              </Link>
              <Link href="/contact" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-2 transition-colors">
                <MapPin className="h-4 w-4" /> Contact
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
