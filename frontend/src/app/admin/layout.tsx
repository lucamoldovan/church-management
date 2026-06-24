'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/hooks/useUser'
import { LayoutDashboard, CalendarDays, Users, ArrowLeft, Wheat, UsersRound, ScanLine, Mic, Radio, Share2, CheckSquare, TrendingUp, Bell, Ticket } from 'lucide-react'

const links = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/events', label: 'Evenimente', icon: CalendarDays },
  { href: '/admin/approvals', label: 'Aprobări', icon: CheckSquare },
  { href: '/admin/attendees', label: 'Participanți', icon: Ticket },
  { href: '/admin/groups', label: 'Grupuri', icon: UsersRound },
  { href: '/admin/checkin', label: 'Check-in', icon: ScanLine },
  { href: '/admin/sermons', label: 'Predici', icon: Mic },
  { href: '/admin/livestream', label: 'Live', icon: Radio },
  { href: '/admin/social', label: 'Social', icon: Share2 },
  { href: '/admin/notifications', label: 'Notificări', icon: Bell },
  { href: '/admin/analytics', label: 'Analize', icon: TrendingUp },
  { href: '/admin/users', label: 'Utilizatori', icon: Users },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, isStaff } = useUser()
  const pathname = usePathname()

  if (loading) return <div className="min-h-[70vh] flex items-center justify-center text-muted-foreground">Se încarcă...</div>
  if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return null }
  if (!isStaff) {
    return (
      <div data-testid="admin-denied" className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <Wheat className="h-10 w-10 text-primary mb-4" />
        <h1 className="font-heading text-2xl font-bold mb-2">Acces restricționat</h1>
        <p className="text-muted-foreground mb-6">Nu ai permisiuni de administrator.</p>
        <Link href="/" className="text-primary hover:underline">Înapoi acasă</Link>
      </div>
    )
  }

  return (
    <div data-testid="admin-layout" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
      <aside className="md:sticky md:top-24 h-fit">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5"><ArrowLeft className="h-4 w-4" /> Site</Link>
        <nav className="flex md:flex-col gap-1 flex-wrap">
          {links.map(l => {
            const Icon = l.icon
            const active = pathname === l.href
            return (
              <Link key={l.href} href={l.href} data-testid={`admin-nav-${l.label}`}
                className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary/60 text-foreground/80'}`}>
                <Icon className="h-4 w-4" /> {l.label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <div>{children}</div>
    </div>
  )
}
