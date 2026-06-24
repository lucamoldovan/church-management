'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, Wheat } from 'lucide-react'

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

  return (
    <nav
      data-testid="main-navbar"
      className="w-full border-b border-border/60 bg-background/80 backdrop-blur-xl sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 py-3">
          <Link
            href="/"
            data-testid="navbar-logo"
            className="flex items-center gap-2.5 group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
              <Wheat className="h-5 w-5" />
            </span>
            <span className="font-heading font-semibold text-lg tracking-tight leading-none">
              Casa Pâinii
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`navbar-link-${link.href.replace('/', '') || 'home'}`}
                className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-full hover:bg-secondary/60 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/login"
              data-testid="navbar-login-link"
              className="text-sm font-medium text-foreground/80 hover:text-foreground px-4 py-2 rounded-full hover:bg-secondary/60 transition-colors"
            >
              Intră în cont
            </Link>
            <Link
              href="/signup"
              data-testid="navbar-signup-link"
              className="text-sm font-semibold bg-primary text-primary-foreground px-5 py-2.5 rounded-full hover:bg-primary/90 transition-all soft-shadow hover:-translate-y-0.5"
            >
              Înregistrează-te
            </Link>
          </div>

          <button
            data-testid="navbar-mobile-toggle"
            className="md:hidden p-2 rounded-full hover:bg-secondary/60 transition-colors"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Meniu"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          data-testid="navbar-mobile-menu"
          className="md:hidden border-t border-border/60 px-4 py-5 flex flex-col gap-1 bg-background"
        >
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              data-testid={`navbar-mobile-link-${link.href.replace('/', '') || 'home'}`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2.5 rounded-xl hover:bg-secondary/60 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="h-px bg-border my-2" />
          <Link
            href="/login"
            className="text-sm font-medium px-3 py-2.5"
            onClick={() => setIsOpen(false)}
          >
            Intră în cont
          </Link>
          <Link
            href="/signup"
            className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-3 rounded-full text-center mt-1"
            onClick={() => setIsOpen(false)}
          >
            Înregistrează-te
          </Link>
        </div>
      )}
    </nav>
  )
}
