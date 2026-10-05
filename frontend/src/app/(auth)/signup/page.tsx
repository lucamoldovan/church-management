'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Wheat, MailCheck } from 'lucide-react'
import { authClient } from '@/lib/cloudflare/auth-client'

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { error } = await authClient.signUp.email({ email, password, name, callbackURL: '/dashboard' })
      if (error) throw new Error(error.message)
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare')
    } finally { setLoading(false) }
  }

  const appleEnabled = process.env.NEXT_PUBLIC_APPLE_SIGN_IN_ENABLED === 'true'

  const appleSignup = async () => {
    setError('')
    const { error } = await authClient.signIn.social({ provider: 'apple', callbackURL: '/dashboard' })
    if (error) setError(error.message)
  }

  const googleSignup = async () => {
    setError('')
    const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' })
    if (error) setError(error.message)
  }

  if (success) return (
    <div data-testid="signup-success" className="min-h-[85vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md bg-card border border-border/60 rounded-3xl p-10 soft-shadow-lg animate-rise">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary mb-5"><MailCheck className="h-8 w-8" /></span>
        <h1 className="font-heading text-2xl font-bold mb-2">Cont creat</h1>
        <p className="text-muted-foreground">Contul tău a fost creat. Verifică emailul pentru a confirma adresa înainte de autentificare.</p>
        <Link href="/login" className="mt-6 inline-block text-primary hover:underline font-medium">Mergi la login</Link>
      </div>
    </div>
  )

  return (
    <div data-testid="signup-page" className="relative min-h-[85vh] flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-accent/40 blur-3xl" />
      <div className="w-full max-w-md relative animate-rise">
        <div className="text-center mb-8"><span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4"><Wheat className="h-7 w-7" /></span><h1 className="font-heading text-3xl font-bold">Creează cont</h1><p className="text-muted-foreground mt-1.5">Alătură-te comunității Casa Pâinii</p></div>
        <div className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow-lg">
          {error && <div data-testid="signup-error" className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-2xl text-sm mb-5">{error}</div>}
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <div><label className="text-sm font-medium mb-1.5 block">Nume complet</label><input type="text" data-testid="signup-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ion Popescu" required className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow" /></div>
            <div><label className="text-sm font-medium mb-1.5 block">Email</label><input type="email" data-testid="signup-email-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplu.com" required className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow" /></div>
            <div><label className="text-sm font-medium mb-1.5 block">Parolă</label><div className="relative"><input type={showPassword ? 'text' : 'password'} data-testid="signup-password-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minim 8 caractere" required minLength={8} className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 transition-shadow pr-11" /><button type="button" data-testid="signup-toggle-password" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
            <button type="submit" disabled={loading} data-testid="signup-submit-button" className="w-full bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 mt-1">{loading ? 'Se încarcă...' : 'Creează cont'}</button>
          </form>
          <div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs text-muted-foreground"><span className="bg-card px-3">sau</span></div></div>
          <button data-testid="signup-google-button" onClick={googleSignup} className="w-full border border-border bg-background py-3 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors flex items-center justify-center gap-2"><span className="text-sm font-semibold">G</span> Continuă cu Google</button>
          {appleEnabled && <button data-testid="signup-apple-button" onClick={appleSignup} className="w-full border border-border bg-background py-3 rounded-full text-sm font-medium hover:bg-secondary/60 transition-colors flex items-center justify-center gap-2 mt-2">Continuă cu Apple</button>}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-5">Ai deja cont? <Link href="/login" data-testid="signup-login-link" className="text-primary hover:underline font-medium">Intră în cont</Link></p>
      </div>
    </div>
  )
}
