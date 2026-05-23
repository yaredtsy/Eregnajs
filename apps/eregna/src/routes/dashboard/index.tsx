import { Plus } from "@repo/ui/lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AgentCard } from "#/components/agents/AgentCard";
import { AgentForm } from "#/components/agents/AgentForm";
import { useAgents, useCreateAgent } from "#/hooks/useAgents";

export const Route = createFileRoute("/dashboard/")({
	component: AgentsIndexPage,
});

function AgentsIndexPage() {
	const { data: agents, isLoading, error } = useAgents();
	const createAgent = useCreateAgent();
	const [showForm, setShowForm] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	return (
		<div className="mx-auto max-w-5xl">
			<div
				id="agents-page-hero"
				className="mb-8 flex items-end justify-between gap-4"
			>
				<div>
					<p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						Dashboard
					</p>
					<h1 className="text-2xl font-bold tracking-tight text-foreground">
						Agents
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Create and manage your embedded agents.
					</p>
				</div>

				<button
					id="new-agent-btn"
					type="button"
					onClick={() => {
						setShowForm((v) => !v);
						setFormError(null);
					}}
					className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
				>
					<Plus className="h-4 w-4" />
					{showForm ? "Cancel" : "New agent"}
				</button>
			</div>

			{showForm && (
				<div id="new-agent-form-section" className="mb-8">
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
								setShowForm(false);
							} catch (e) {
								setFormError(e instanceof Error ? e.message : "Create failed");
							}
						}}
					/>
				</div>
			)}

			<section id="agents-grid">
				{error ? (
					<p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
						{error instanceof Error ? error.message : "Could not load agents."}
					</p>
				) : null}

				{isLoading ? (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
								key={i}
								className="h-36 animate-pulse rounded-xl border border-border bg-card"
							/>
						))}
					</div>
				) : agents && agents.length > 0 ? (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{agents.map((a) => (
							<AgentCard key={a.id} agent={a} />
						))}
					</div>
				) : (
					<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-4 py-16 text-center">
						<p className="text-sm font-medium text-foreground">No agents yet</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Click &ldquo;New agent&rdquo; to create your first one.
						</p>
					</div>
				)}
			</section>
		</div>
	);
}
