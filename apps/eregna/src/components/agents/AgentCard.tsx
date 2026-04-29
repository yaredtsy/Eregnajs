import type { AgentListItem } from '#/lib/api-types'

type Props = {
  agent: AgentListItem
}

export function AgentCard({ agent }: Props) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-copper/40">
      <h2 className="font-display text-lg font-semibold text-cream">{agent.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground truncate">{agent.website_url}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          {agent.page_count} page{agent.page_count === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
            aria-hidden
          />
          {agent.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p className="mt-3 font-mono text-[11px] text-cream/60 break-all">public_id: {agent.public_id}</p>
    </article>
  )
}
