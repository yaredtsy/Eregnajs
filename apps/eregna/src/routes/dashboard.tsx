import { initWidget } from '@repo/widget'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AgentCard } from '#/components/agents/AgentCard'
import { AgentForm } from '#/components/agents/AgentForm'
import { useAgents, useCreateAgent } from '#/hooks/useAgents'
import { useAuth } from '#/lib/auth'
import { supabase } from '#/lib/supabase'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const { data: agents, isLoading, error, refetch, isFetching } = useAgents()
  const createAgent = useCreateAgent()
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: '/login' })
    }
  }, [user, loading, navigate])

  useEffect(() => {
    if (loading || !user) return
    return initWidget().unmount
  }, [loading, user])

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
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-10">
        <div>
          <h1 className="font-display text-4xl font-bold text-cream mb-2">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as <span className="text-cream">{user.email ?? user.id}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="self-start rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Sign out
        </button>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-xl font-semibold text-cream">My agents</h2>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-xs font-medium text-gold hover:underline disabled:opacity-50"
              disabled={isFetching}
            >
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {error ? (
            <p className="text-destructive text-sm mb-4">
              {error instanceof Error ? error.message : 'Could not load agents.'} Is the API running (
              <code className="text-cream/80">pnpm dev:api</code>) and{' '}
              <code className="text-cream/80">VITE_EREGNA_API_URL</code> set?
            </p>
          ) : null}

          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading agents…</p>
          ) : agents && agents.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {agents.map((a) => (
                <AgentCard key={a.id} agent={a} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm rounded-2xl border border-dashed border-border bg-card/50 px-4 py-8 text-center">
              No agents yet. Create one with the form.
            </p>
          )}
        </section>

        <aside className="lg:pt-8">
          {formError ? (
            <p className="text-destructive text-sm mb-3" role="alert">
              {formError}
            </p>
          ) : null}
          <AgentForm
            submitting={createAgent.isPending}
            onSubmit={async (body) => {
              setFormError(null)
              try {
                await createAgent.mutateAsync(body)
              } catch (e) {
                setFormError(e instanceof Error ? e.message : 'Create failed')
              }
            }}
          />
        </aside>
      </div>
    </div>
  )
}
