import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '#/lib/auth'
import { supabase } from '#/lib/supabase'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

type Mode = 'sign-in' | 'sign-up'

function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: '/dashboard' })
    }
  }, [user, loading, navigate])

  async function signInWithGoogle() {
    setError(null)
    setInfo(null)
    setBusy(true)
    const origin = window.location.origin
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    })
    setBusy(false)
    if (oauthError) {
      setError(oauthError.message)
    }
  }

  async function submitEmailAuth() {
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'sign-up') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (signUpError) throw signUpError
        setInfo('Check your email to confirm your account, then sign in.')
        setPassword('')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
        navigate({ to: '/dashboard' })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-cream/70">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-3xl font-semibold text-cream mb-2 text-center">
          {mode === 'sign-in' ? 'Log in' : 'Create account'}
        </h1>
        <p className="text-muted-foreground text-sm text-center mb-6">
          Use email and password, or continue with Google.
        </p>

        <div className="flex rounded-xl border border-border p-1 mb-6 bg-background/50">
          <button
            type="button"
            onClick={() => {
              setMode('sign-in')
              setError(null)
              setInfo(null)
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === 'sign-in' ? 'bg-card text-cream shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('sign-up')
              setError(null)
              setInfo(null)
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              mode === 'sign-up' ? 'bg-card text-cream shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Sign up
          </button>
        </div>

        <form
          className="space-y-4 mb-6"
          onSubmit={(e) => {
            e.preventDefault()
            void submitEmailAuth()
          }}
        >
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-muted-foreground mb-1">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-muted-foreground mb-1">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="text-emerald-600 dark:text-emerald-400 text-sm" role="status">
              {info}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-copper to-copper-dark px-4 py-2.5 text-sm font-semibold text-charcoal transition hover:opacity-95 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wide">
            <span className="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void signInWithGoogle()}
          className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {busy ? 'Redirecting…' : 'Continue with Google'}
        </button>
      </div>
    </div>
  )
}
