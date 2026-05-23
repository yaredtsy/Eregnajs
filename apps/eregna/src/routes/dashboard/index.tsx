import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AgentCard } from "#/components/agents/AgentCard";
import { AgentForm } from "#/components/agents/AgentForm";
import { useAgents, useCreateAgent } from "#/hooks/useAgents";

export const Route = createFileRoute("/dashboard/")({
	component: AgentsIndexPage,
});

function AgentsIndexPage() {
	const { data: agents, isLoading, error, refetch, isFetching } = useAgents();
	const createAgent = useCreateAgent();
	const [formError, setFormError] = useState<string | null>(null);

	return (
		<div className="mx-auto max-w-6xl">
			<div id="agents-page-hero" className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						Agents
					</p>
					<h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						My agents
					</h1>
					<p className="mt-2 max-w-xl text-sm text-muted-foreground">
						Create and manage agents, then open an agent to edit prompts, embed
						keys, and sitemap structure.
					</p>
				</div>
				<button
					id="new-agent-btn"
					type="button"
					onClick={() =>
						document
							.getElementById("new-agent-form-section")
							?.scrollIntoView({ behavior: "smooth", block: "start" })
					}
					className="inline-flex items-center justify-center self-start rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
				>
					+ New agent
				</button>
			</div>

			<div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
				<section id="agents-grid">
					<div className="mb-4 flex items-center justify-between gap-4">
						<h2 className="text-sm font-semibold text-muted-foreground">
							All agents
						</h2>
						<button
							type="button"
							onClick={() => void refetch()}
							className="text-xs font-medium text-blue-400 hover:underline disabled:opacity-50"
							disabled={isFetching}
						>
							{isFetching ? "Refreshing…" : "Refresh"}
						</button>
					</div>

					{error ? (
						<p className="mb-4 text-sm text-destructive">
							{error instanceof Error
								? error.message
								: "Could not load agents."}{" "}
							Is the API running (
							<code className="text-foreground/80">pnpm dev:api</code>) and{" "}
							<code className="text-foreground/80">VITE_EREGNA_API_URL</code>{" "}
							set?
						</p>
					) : null}

					{isLoading ? (
						<p className="text-sm text-muted-foreground">Loading agents…</p>
					) : agents && agents.length > 0 ? (
						<div className="grid gap-4 sm:grid-cols-2">
							{agents.map((a) => (
								<AgentCard key={a.id} agent={a} />
							))}
						</div>
					) : (
						<p className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
							No agents yet. Create one with the form.
						</p>
					)}
				</section>

				<aside id="new-agent-form-section" className="lg:pt-2">
					{formError ? (
						<p className="mb-3 text-sm text-destructive" role="alert">
							{formError}
						</p>
					) : null}
					<AgentForm
						submitting={createAgent.isPending}
						onSubmit={async (body) => {
							setFormError(null);
							try {
								await createAgent.mutateAsync(body);
							} catch (e) {
								setFormError(e instanceof Error ? e.message : "Create failed");
							}
						}}
					/>
				</aside>
			</div>
		</div>
	);
}
