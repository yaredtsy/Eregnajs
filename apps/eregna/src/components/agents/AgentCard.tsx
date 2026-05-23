import { BookOpen, ChevronRight, Code2 } from "@repo/ui/lucide-react";
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
				<div className="min-w-0">
					<h2 className="font-display text-base font-semibold text-foreground truncate">
						{agent.name}
					</h2>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{agent.website_url}
					</p>
				</div>
				<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100 mt-0.5" />
			</div>

			{agent.description && (
				<p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
					{agent.description}
				</p>
			)}

			<div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1">
					<BookOpen className="h-3 w-3" />
					{agent.page_count} page{agent.page_count === 1 ? "" : "s"}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						className={`h-1.5 w-1.5 rounded-full ${agent.is_active ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
						aria-hidden
					/>
					{agent.is_active ? "Active" : "Inactive"}
				</span>
				<span className="ml-auto inline-flex items-center gap-1 font-mono opacity-60">
					<Code2 className="h-3 w-3" />
					{agent.public_id.slice(0, 12)}…
				</span>
			</div>
		</Link>
	);
}
