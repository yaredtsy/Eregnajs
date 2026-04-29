import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '#/lib/auth'
import { supabase } from '#/lib/supabase'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: '/login' })
    }
  }, [user, loading, navigate])

  async function signOut() {
    await supabase.auth.signOut()
    navigate({ to: '/' })
  }

  if (loading || !user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-cream/70">
        {loading ? 'Loading…' : 'Redirecting…'}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-display text-4xl font-bold text-cream mb-2">Dashboard</h1>
      <p className="text-muted-foreground mb-8">
        Signed in as <span className="text-cream">{user.email ?? user.id}</span>
      </p>

      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-cream/80 text-sm mb-6">
          This is a protected page. Only authenticated users can see it.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition hover:opacity-90"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
