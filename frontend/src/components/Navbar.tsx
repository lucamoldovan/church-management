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
    <nav data-testid="main-navbar" className="w-full border-b border-border/60 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 py-3">
          <Link href="/" data-testid="navbar-logo" className="flex items-center gap-2.5 group">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105"><Wheat className="h-5 w-5" /></span>
            <span className="font-heading font-semibold text-lg tracking-tight leading-none">Casa Pâinii</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href} data-testid={`navbar-link-${link.href.replace('/', '') || 'home'}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-full hover:bg-secondary/60 transition-colors">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            {loading ? null : user ? (
              <>
                {isStaff && (
                  <Link href="/admin" data-testid="navbar-admin-link" className="text-sm font-medium text-primary inline-flex items-center gap-1.5 px-3 py-2 rounded-full hover:bg-primary/10 transition-colors">
                    <Shield className="h-4 w-4" /> Admin
                  </Link>
                )}
                <Link href="/dashboard" data-testid="navbar-dashboard-link" className="text-sm font-medium text-foreground/80 hover:text-foreground inline-flex items-center gap-1.5 px-3 py-2 rounded-full hover:bg-secondary/60 transition-colors">
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </Link>
                <Link href="/profile" data-testid="navbar-profile-link" className="p-2 rounded-full hover:bg-secondary/60 transition-colors" aria-label="Profil"><User className="h-5 w-5" /></Link>
                <button onClick={logout} data-testid="navbar-logout-button" className="p-2 rounded-full hover:bg-secondary/60 transition-colors" aria-label="Ieși"><LogOut className="h-5 w-5" /></button>
              </>
            ) : (
              <>
                <Link href="/login" data-testid="navbar-login-link" className="text-sm font-medium text-foreground/80 hover:text-foreground px-4 py-2 rounded-full hover:bg-secondary/60 transition-colors">Intră în cont</Link>
                <Link href="/signup" data-testid="navbar-signup-link" className="text-sm font-semibold bg-primary text-primary-foreground px-5 py-2.5 rounded-full hover:bg-primary/90 transition-all soft-shadow hover:-translate-y-0.5">Înregistrează-te</Link>
              </>
            )}
          </div>

          <button data-testid="navbar-mobile-toggle" className="md:hidden p-2 rounded-full hover:bg-secondary/60 transition-colors" onClick={() => setIsOpen(!isOpen)} aria-label="Meniu">
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div data-testid="navbar-mobile-menu" className="md:hidden border-t border-border/60 px-4 py-5 flex flex-col gap-1 bg-background">
          {navLinks.map(link => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2.5 rounded-xl hover:bg-secondary/60 transition-colors" onClick={() => setIsOpen(false)}>{link.label}</Link>
          ))}
          <div className="h-px bg-border my-2" />
          {user ? (
            <>
              {isStaff && <Link href="/admin" className="text-sm font-medium px-3 py-2.5 text-primary" onClick={() => setIsOpen(false)}>Admin</Link>}
              <Link href="/dashboard" className="text-sm font-medium px-3 py-2.5" onClick={() => setIsOpen(false)}>Dashboard</Link>
              <Link href="/profile" className="text-sm font-medium px-3 py-2.5" onClick={() => setIsOpen(false)}>Profil</Link>
              <button onClick={logout} className="text-sm font-medium px-3 py-2.5 text-left text-destructive">Ieși din cont</button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium px-3 py-2.5" onClick={() => setIsOpen(false)}>Intră în cont</Link>
              <Link href="/signup" className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-3 rounded-full text-center mt-1" onClick={() => setIsOpen(false)}>Înregistrează-te</Link>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
