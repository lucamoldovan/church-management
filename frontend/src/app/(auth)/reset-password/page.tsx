'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Wheat, MailCheck } from 'lucide-react'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/update-password` })
      if (error) throw error
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare')
    } finally { setLoading(false) }
  }

  return (
    <div data-testid="reset-password-page" className="relative min-h-[85vh] flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="w-full max-w-md relative animate-rise">
        <div className="text-center mb-8">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4"><Wheat className="h-7 w-7" /></span>
          <h1 className="font-heading text-3xl font-bold">Resetează parola</h1>
          <p className="text-muted-foreground mt-1.5">Îți trimitem un link de resetare pe email</p>
        </div>
        <div className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow-lg">
          {sent ? (
            <div data-testid="reset-sent" className="text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary mb-4"><MailCheck className="h-7 w-7" /></span>
              <p className="text-muted-foreground">Am trimis un link de resetare la <strong className="text-foreground">{email}</strong>.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              {error && <div data-testid="reset-error" className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-2xl text-sm">{error}</div>}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Email</label>
                <input type="email" data-testid="reset-email-input" value={email} onChange={e => setEmail(e.target.value)} required placeholder="email@exemplu.com"
                  className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
              </div>
              <button type="submit" disabled={loading} data-testid="reset-submit-button"
                className="w-full bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                {loading ? 'Se trimite...' : 'Trimite linkul'}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-5">
          <Link href="/login" className="text-primary hover:underline font-medium">Înapoi la login</Link>
        </p>
      </div>
    </div>
  )
}
