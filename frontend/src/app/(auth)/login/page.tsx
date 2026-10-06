'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Wheat, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      window.location.href = '/dashboard'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare')
    } finally { setLoading(false) }
  }

  return (
    <div data-testid="login-page" className="relative min-h-[85vh] flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute -top-32 -right-20 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-accent/40 blur-3xl" />
      <div className="relative w-full max-w-5xl grid lg:grid-cols-[.9fr_1.1fr] gap-10 items-center animate-rise">
        <div className="hidden lg:block px-4">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-primary mb-5">Casa Pâinii</p>
          <h1 className="font-heading text-5xl xl:text-6xl font-bold tracking-tight leading-[1.02]">Bine ai revenit acasă.</h1>
          <p className="text-muted-foreground text-lg mt-5 max-w-md leading-relaxed">Intră în cont pentru a-ți gestiona înscrierile, evenimentele și comunitatea.</p>
        </div>

        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-7">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4"><Wheat className="h-7 w-7" /></span>
            <h2 className="font-heading text-3xl font-bold">Intră în cont</h2>
            <p className="text-muted-foreground mt-1.5">Continuă de unde ai rămas.</p>
          </div>

          <div className="bg-card border border-border/60 rounded-[2rem] p-7 sm:p-8 soft-shadow-lg">
            {error && <div data-testid="login-error" className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-2xl text-sm mb-5">{error}</div>}
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Email</label>
                <input type="email" data-testid="login-email-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplu.com" required className="w-full px-4 py-3.5 border border-border rounded-2xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Parolă</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} data-testid="login-password-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Parola ta" required className="w-full px-4 py-3.5 border border-border rounded-2xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 pr-11" />
                  <button type="button" data-testid="login-toggle-password" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
                <div className="text-right mt-2"><Link href="/reset-password" className="text-xs text-primary hover:underline">Ai uitat parola?</Link></div>
              </div>
              <button type="submit" disabled={loading} data-testid="login-submit-button" className="w-full bg-primary text-primary-foreground py-3.5 rounded-full font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-1">
                {loading ? 'Se încarcă...' : 'Intră în cont'} {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs text-muted-foreground"><span className="bg-card px-3">sau</span></div></div>

            <button data-testid="login-google-button" onClick={async () => {
              const { createClient } = await import('@/lib/supabase/client')
              const supabase = createClient()
              await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
            }} className="w-full border border-border bg-background py-3.5 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors flex items-center justify-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continuă cu Google
            </button>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-5">Nu ai cont? <Link href="/signup" data-testid="login-signup-link" className="text-primary hover:underline font-medium">Înregistrează-te</Link></p>
        </div>
      </div>
    </div>
  )
}
