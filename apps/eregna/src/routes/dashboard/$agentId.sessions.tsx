import { createFileRoute } from "@tanstack/react-router";
import { useAgentRuns } from "#/hooks/useAgentRuns";
import type { RunStatus } from "#/lib/api-types";

export const Route = createFileRoute("/dashboard/$agentId/sessions")({
	component: AgentSessionsPage,
});

function statusBadge(status: RunStatus) {
	const styles: Record<RunStatus, string> = {
		complete: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
		streaming: "bg-blue-500/10 text-blue-400 border-blue-500/30",
		aborted: "bg-amber-500/10 text-amber-400 border-amber-500/30",
		error: "bg-red-500/10 text-red-400 border-red-500/30",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[status]}`}
		>
			{status}
		</span>
	);
}

function duration(startedAt: number, completedAt: number | null) {
	if (!completedAt) return "—";
	const ms = completedAt - startedAt;
	return ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60_000).toFixed(1)}m`;
}

function formatTokens(totals: { totalTokens: number } | null | undefined) {
	if (!totals || totals.totalTokens <= 0) return "—";
	if (totals.totalTokens < 1000) return String(totals.totalTokens);
	return `${(totals.totalTokens / 1000).toFixed(1)}k`;
}

function AgentSessionsPage() {
	const { agentId } = Route.useParams();
	const { data: runs, isLoading } = useAgentRuns(agentId);

	if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-semibold text-foreground">Agent runs</h2>
				{runs && runs.length > 0 && (
					<span className="text-xs text-muted-foreground">
						{runs.length} run{runs.length !== 1 ? "s" : ""}
					</span>
				)}
			</div>

			{!runs || runs.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-border p-10 text-center">
					<p className="text-sm text-muted-foreground">No runs yet.</p>
					<p className="mt-1 text-xs text-muted-foreground/60">
						Runs appear here once a visitor triggers the widget.
					</p>
				</div>
			) : (
				<div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
					<table className="w-full text-left text-xs">
						<thead>
							<tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
								<th className="px-4 py-3">Run ID</th>
								<th className="px-4 py-3">Query</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Duration</th>
								<th className="px-4 py-3">Tokens</th>
								<th className="px-4 py-3">Started</th>
							</tr>
						</thead>
						<tbody>
							{runs.map((run) => (
								<tr
									key={run.id}
									className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
								>
									<td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
										{run.id.slice(0, 8)}…
									</td>
									<td className="px-4 py-3 max-w-[320px] truncate text-foreground/80">
										{run.query}
									</td>
									<td className="px-4 py-3">{statusBadge(run.status)}</td>
									<td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
										{duration(run.started_at, run.completed_at)}
									</td>
									<td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-mono">
										{formatTokens(run.token_totals)}
									</td>
									<td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
										{new Date(run.started_at).toLocaleString()}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
