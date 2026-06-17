import { createFileRoute, Link } from "@tanstack/react-router";
import { CopyField } from "#/components/dashboard/CopyField";
import { useAgent } from "#/hooks/useAgents";
import { useSessions } from "#/hooks/useSessions";

export const Route = createFileRoute("/dashboard/$agentId/")({
	component: AgentEmbedPage,
});

const embedSnippet = (publicId: string) =>
	`<script\n  src="https://cdn.eregna.dev/embed.iife.js"\n  data-agent-id="${publicId}"\n  defer>\n</script>`;

function AgentEmbedPage() {
	const { agentId } = Route.useParams();
	const { data: agent, isLoading } = useAgent(agentId);
	const { data: sessions } = useSessions(agentId);

	if (isLoading)
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	if (!agent)
		return (
			<p className="text-sm text-destructive">
				Agent not found.{" "}
				<Link to="/dashboard" className="text-blue-400 hover:underline">
					Back
				</Link>
			</p>
		);

	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_300px]">
			<div className="space-y-6">
				{/* Embed snippet */}
				<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<h2 className="mb-1 text-sm font-semibold text-foreground">
						Embed snippet
					</h2>
					<p className="mb-4 text-xs text-muted-foreground">
						Paste this inside your site's{" "}
						<code className="font-mono text-foreground/70">&lt;body&gt;</code>{" "}
						to activate the widget.
					</p>
					<pre className="overflow-x-auto rounded-xl bg-[#0e0e1c] px-4 py-3 text-xs leading-relaxed text-indigo-200 font-mono border border-indigo-500/10">
						{embedSnippet(agent.public_id)}
					</pre>
				</section>

				{/* Sessions */}
				<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-sm font-semibold text-foreground">
							Recent sessions
						</h2>
						{sessions && sessions.length > 0 && (
							<span className="text-xs text-muted-foreground">
								{sessions.length} session{sessions.length !== 1 ? "s" : ""}
							</span>
						)}
					</div>
					{!sessions || sessions.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No sessions yet — embed the widget on your site to start.
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-xs">
								<thead>
									<tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
										<th className="pb-2 pr-4">Session</th>
										<th className="pb-2 pr-4">Page URL</th>
										<th className="pb-2">Started</th>
									</tr>
								</thead>
								<tbody>
									{sessions.map((s) => (
										<tr
											key={s.id}
											className="border-b border-border/50 last:border-0 hover:bg-muted/20"
										>
											<td className="py-2 pr-4 font-mono text-muted-foreground">
												{s.id.slice(0, 8)}…
											</td>
											<td className="py-2 pr-4 max-w-[220px] truncate text-foreground/80">
												{s.page_url ?? "—"}
											</td>
											<td className="py-2 text-muted-foreground whitespace-nowrap">
												{new Date(s.created_at).toLocaleString()}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</div>

			{/* Sidebar */}
			<aside className="space-y-4">
				<section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
					<p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Credentials
					</p>
					<div className="space-y-3">
						<CopyField label="Public ID" value={agent.public_id} />
						<CopyField label="Secret key" value={agent.secret_key} masked />
					</div>
					<p className="mt-3 text-[11px] text-amber-500/80">
						Never expose the secret key in client-side code.
					</p>
				</section>

				<section className="rounded-2xl border border-border bg-card p-5 shadow-sm text-xs">
					<p className="font-medium text-muted-foreground mb-1">Website</p>
					<p className="break-all text-foreground/80">{agent.website_url}</p>
				</section>

				<div className="rounded-2xl border border-dashed border-border p-5 text-xs space-y-1">
					<p className="font-medium text-foreground/70 mb-2">Configure</p>
					<Link
						to="/dashboard/$agentId/settings"
						params={{ agentId }}
						className="block text-blue-400 hover:underline"
					>
						Agent settings &amp; prompt →
					</Link>
					<Link
						to="/dashboard/$agentId/components"
						params={{ agentId }}
						className="block text-blue-400 hover:underline"
					>
						Components (player UI states) →
					</Link>
					<Link
						to="/dashboard/$agentId/knowledge"
						params={{ agentId }}
						className="block text-blue-400 hover:underline"
					>
						Page knowledge tree →
					</Link>
				</div>
			</aside>
		</div>
	);
}
