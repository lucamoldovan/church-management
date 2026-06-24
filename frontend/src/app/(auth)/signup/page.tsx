'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Wheat, MailCheck } from 'lucide-react'

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      })
      if (error) throw error
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div data-testid="signup-success" className="min-h-[85vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md bg-card border border-border/60 rounded-3xl p-10 soft-shadow-lg animate-rise">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary mb-5">
            <MailCheck className="h-8 w-8" />
          </span>
          <h1 className="font-heading text-2xl font-bold mb-2">Verifică emailul</h1>
          <p className="text-muted-foreground">Am trimis un link de confirmare la <strong className="text-foreground">{email}</strong>. Verifică inbox-ul și confirmă contul.</p>
          <Link href="/login" className="mt-6 inline-block text-primary hover:underline font-medium">Înapoi la login</Link>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="signup-page" className="relative min-h-[85vh] flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-accent/40 blur-3xl" />

      <div className="w-full max-w-md relative animate-rise">
        <div className="text-center mb-8">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
            <Wheat className="h-7 w-7" />
          </span>
          <h1 className="font-heading text-3xl font-bold">Creează cont</h1>
          <p className="text-muted-foreground mt-1.5">Alătură-te comunității Casa Pâinii</p>
        </div>

        <div className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow-lg">
          {error && (
            <div data-testid="signup-error" className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-2xl text-sm mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nume complet</label>
              <input
                type="text"
                data-testid="signup-name-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ion Popescu"
                required
                className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Email</label>
              <input
                type="email"
                data-testid="signup-email-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@exemplu.com"
                required
                className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Parolă</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  data-testid="signup-password-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minim 6 caractere"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow pr-11"
                />
                <button
                  type="button"
                  data-testid="signup-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="signup-submit-button"
              className="w-full bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 mt-1"
            >
              {loading ? 'Se încarcă...' : 'Creează cont'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs text-muted-foreground"><span className="bg-card px-3">sau</span></div>
          </div>

          <button
            data-testid="signup-google-button"
            onClick={async () => {
              const { createClient } = await import('@/lib/supabase/client')
              const supabase = createClient()
              await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
            }}
            className="w-full border border-border bg-background py-3 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continuă cu Google
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-5">
          Ai deja cont?{' '}
          <Link href="/login" data-testid="signup-login-link" className="text-primary hover:underline font-medium">Intră în cont</Link>
        </p>
      </div>
    </div>
  )
}
