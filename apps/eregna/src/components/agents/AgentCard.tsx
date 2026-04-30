import { ChevronRight } from "@repo/ui/lucide-react";
import { Link } from "@tanstack/react-router";
import type { AgentListItem } from "#/lib/api-types";

type Props = {
	agent: AgentListItem;
};

export function AgentCard({ agent }: Props) {
	return (
		<Link
			to="/dashboard/$agentId"
			params={{ agentId: agent.id }}
			className="group block rounded-2xl border border-border bg-card p-5 shadow-sm no-underline transition hover:border-blue-500/40 hover:shadow-md"
		>
			<div className="flex items-start justify-between gap-2">
				<h2 className="font-display text-lg font-semibold text-foreground">
					{agent.name}
				</h2>
				<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
			</div>
			<p className="mt-1 truncate text-sm text-muted-foreground">
				{agent.website_url}
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
				<span>
					{agent.page_count} page{agent.page_count === 1 ? "" : "s"}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						className={`h-2 w-2 rounded-full ${agent.is_active ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
						aria-hidden
					/>
					{agent.is_active ? "Active" : "Inactive"}
				</span>
			</div>
			<p className="mt-3 break-all font-mono text-[11px] text-muted-foreground/80">
				public_id: {agent.public_id}
			</p>
		</Link>
	);
}
