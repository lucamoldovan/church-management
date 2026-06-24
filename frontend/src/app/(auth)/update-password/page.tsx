'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Wheat, Eye, EyeOff, Check } from 'lucide-react'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare')
    } finally { setLoading(false) }
  }

  return (
    <div data-testid="update-password-page" className="relative min-h-[85vh] flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-accent/40 blur-3xl" />
      <div className="w-full max-w-md relative animate-rise">
        <div className="text-center mb-8">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4"><Wheat className="h-7 w-7" /></span>
          <h1 className="font-heading text-3xl font-bold">Parolă nouă</h1>
          <p className="text-muted-foreground mt-1.5">Alege o parolă nouă pentru contul tău</p>
        </div>
        <div className="bg-card border border-border/60 rounded-3xl p-7 soft-shadow-lg">
          {done ? (
            <div data-testid="update-done" className="text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary mb-4"><Check className="h-7 w-7" /></span>
              <p className="text-muted-foreground mb-5">Parola a fost actualizată cu succes.</p>
              <Link href="/login" className="inline-block bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-semibold">Intră în cont</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              {error && <div data-testid="update-error" className="bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-2xl text-sm">{error}</div>}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Parolă nouă</label>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} data-testid="update-password-input" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="Minim 6 caractere"
                    className="w-full px-4 py-3 border border-border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 pr-11" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
              </div>
              <button type="submit" disabled={loading} data-testid="update-submit-button"
                className="w-full bg-primary text-primary-foreground py-3 rounded-full font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                {loading ? 'Se salvează...' : 'Salvează parola'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
