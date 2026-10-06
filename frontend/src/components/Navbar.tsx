'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, Wheat, LayoutDashboard, User, Shield, LogOut } from 'lucide-react'
import { useUser } from '@/hooks/useUser'

const navLinks = [
  { label: 'Acasă', href: '/' },
  { label: 'Evenimente', href: '/events' },
  { label: 'Watch Live', href: '/live' },
  { label: 'Grupuri', href: '/groups' },
  { label: 'Despre noi', href: '/about' },
  { label: 'Contact', href: '/contact' },
]

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const { user, isStaff, loading } = useUser()

  const logout = async () => {
    const { createClient } = await import('@/lib/supabase/client')
    await createClient().auth.signOut()
    window.location.href = '/'
  }

  return (
    <nav data-testid="main-navbar" className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[72px]">
          <Link href="/" data-testid="navbar-logo" className="flex items-center gap-3 group">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
              <Wheat className="h-5 w-5" />
            </span>
            <div className="leading-none">
              <span className="block font-heading font-semibold text-lg tracking-tight">Casa Pâinii</span>
              <span className="hidden sm:block text-[10px] uppercase tracking-[0.16em] text-muted-foreground mt-1">Ocna Mureș</span>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-0.5 rounded-full border border-border/60 bg-card/70 p-1 shadow-sm">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href} data-testid={`navbar-link-${link.href.replace('/', '') || 'home'}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground px-3.5 py-2 rounded-full hover:bg-secondary/70 transition-colors">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex lg:hidden items-center gap-1">
            {navLinks.slice(0, 3).map(link => (
              <Link key={link.href} href={link.href} data-testid={`navbar-link-${link.href.replace('/', '') || 'home'}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-full hover:bg-secondary/70">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            {loading ? null : user ? (
              <>
                {isStaff && <Link href="/admin" data-testid="navbar-admin-link" className="text-sm font-semibold text-primary px-3 py-2 rounded-full hover:bg-accent transition-colors"><Shield className="h-4 w-4 inline mr-1.5" />Admin</Link>}
                <Link href="/dashboard" data-testid="navbar-dashboard-link" className="text-sm font-medium px-3 py-2 rounded-full hover:bg-secondary transition-colors"><LayoutDashboard className="h-4 w-4 inline mr-1.5" />Dashboard</Link>
                <Link href="/profile" data-testid="navbar-profile-link" className="p-2.5 rounded-full hover:bg-secondary transition-colors" aria-label="Profil"><User className="h-5 w-5" /></Link>
                <button onClick={logout} data-testid="navbar-logout-button" className="p-2.5 rounded-full hover:bg-secondary transition-colors" aria-label="Ieși"><LogOut className="h-5 w-5" /></button>
              </>
            ) : (
              <>
                <Link href="/login" data-testid="navbar-login-link" className="text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-secondary transition-colors">Intră în cont</Link>
                <Link href="/signup" data-testid="navbar-signup-link" className="text-sm font-semibold bg-primary text-primary-foreground px-5 py-2.5 rounded-full hover:bg-primary/90 transition-all shadow-sm hover:-translate-y-0.5">Înregistrează-te</Link>
              </>
            )}
          </div>

          <button data-testid="navbar-mobile-toggle" className="md:hidden p-2.5 rounded-full hover:bg-secondary transition-colors" onClick={() => setIsOpen(!isOpen)} aria-label="Meniu">
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div data-testid="navbar-mobile-menu" className="md:hidden border-t border-border/60 px-4 py-5 bg-background/95 backdrop-blur-xl">
          <div className="flex flex-col gap-1">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href} data-testid={`mobile-navbar-link-${link.href.replace('/', '') || 'home'}`} className="text-sm font-medium px-4 py-3 rounded-2xl hover:bg-secondary transition-colors" onClick={() => setIsOpen(false)}>{link.label}</Link>
            ))}
            <div className="h-px bg-border my-2" />
            {user ? (
              <>
                {isStaff && <Link href="/admin" data-testid="mobile-navbar-admin-link" className="text-sm font-semibold px-4 py-3 text-primary" onClick={() => setIsOpen(false)}>Admin</Link>}
                <Link href="/dashboard" data-testid="mobile-navbar-dashboard-link" className="text-sm font-medium px-4 py-3 rounded-2xl" onClick={() => setIsOpen(false)}>Dashboard</Link>
                <Link href="/profile" data-testid="mobile-navbar-profile-link" className="text-sm font-medium px-4 py-3 rounded-2xl" onClick={() => setIsOpen(false)}>Profil</Link>
                <button onClick={logout} data-testid="mobile-navbar-logout-button" className="text-sm font-medium px-4 py-3 text-left text-destructive rounded-2xl">Ieși din cont</button>
              </>
            ) : (
              <>
                <Link href="/login" data-testid="mobile-navbar-login-link" className="text-sm font-medium px-4 py-3 rounded-2xl" onClick={() => setIsOpen(false)}>Intră în cont</Link>
                <Link href="/signup" data-testid="mobile-navbar-signup-link" className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-3.5 rounded-full text-center mt-1" onClick={() => setIsOpen(false)}>Înregistrează-te</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}