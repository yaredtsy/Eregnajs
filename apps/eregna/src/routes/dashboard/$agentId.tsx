import { ExternalLink, FlaskConical } from "@repo/ui/lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CopyField } from "#/components/dashboard/CopyField";
import { DashboardBreadcrumbs } from "#/components/dashboard/DashboardBreadcrumbs";
import { useAgent, useUpdateAgent } from "#/hooks/useAgents";
import type { AgentModel } from "#/lib/api-types";

const MODELS: AgentModel[] = ["gpt-4o-mini", "gpt-4o", "claude-3-5-haiku"];

function modelLabel(m: string) {
	if (m === "gpt-4o-mini") return "gpt-4o-mini (Default)";
	return m;
}

function approxTokens(text: string) {
	return Math.max(0, Math.ceil(text.length / 4));
}

export const Route = createFileRoute("/dashboard/$agentId")({
	component: AgentDetailPage,
});

function AgentDetailPage() {
	const { agentId } = Route.useParams();
	const { data: agent, isLoading, error } = useAgent(agentId);
	const updateAgent = useUpdateAgent(agentId);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [model, setModel] = useState<AgentModel>("gpt-4o-mini");
	const [systemPrompt, setSystemPrompt] = useState("");
	const [isActive, setIsActive] = useState(true);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<string | null>(null);

	useEffect(() => {
		if (!agent) return;
		setName(agent.name);
		setDescription(agent.description ?? "");
		setModel((agent.model as AgentModel) ?? "gpt-4o-mini");
		setSystemPrompt(agent.system_prompt ?? "");
		setIsActive(agent.is_active);
	}, [agent]);

	const dirty = useMemo(() => {
		if (!agent) return false;
		return (
			name !== agent.name ||
			description !== (agent.description ?? "") ||
			model !== (agent.model as AgentModel) ||
			systemPrompt !== (agent.system_prompt ?? "") ||
			isActive !== agent.is_active
		);
	}, [agent, name, description, model, systemPrompt, isActive]);

	async function save() {
		if (!agent) return;
		setSaveError(null);
		setSavedAt(null);
		try {
			await updateAgent.mutateAsync({
				name,
				description: description.trim() || null,
				model,
				system_prompt: systemPrompt.trim() || null,
				is_active: isActive,
			});
			setSavedAt(new Date().toLocaleTimeString());
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : "Save failed");
		}
	}

	if (isLoading) {
		return <p className="text-sm text-muted-foreground">Loading agent…</p>;
	}

	if (error || !agent) {
		return (
			<div className="rounded-2xl border border-border bg-card p-8 text-center">
				<p className="text-destructive text-sm mb-4">
					{error instanceof Error ? error.message : "Agent not found."}
				</p>
				<Link
					to="/dashboard"
					className="text-sm font-medium text-blue-400 hover:underline"
				>
					Back to agents
				</Link>
			</div>
		);
	}

	const websiteHost = (() => {
		try {
			return new URL(agent.website_url).hostname;
		} catch {
			return agent.website_url;
		}
	})();

	return (
		<div className="mx-auto max-w-6xl">
			<DashboardBreadcrumbs
				items={[{ label: "Agents", to: "/dashboard" }, { label: agent.name }]}
			/>

			<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
							{agent.name}
						</h1>
						<span
							className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
								agent.is_active
									? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
									: "border-muted-foreground/40 text-muted-foreground"
							}`}
						>
							{agent.is_active ? "ACTIVE" : "INACTIVE"}
						</span>
					</div>
					<a
						href={agent.website_url}
						target="_blank"
						rel="noreferrer"
						className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline"
					>
						{websiteHost}
						<ExternalLink className="h-3.5 w-3.5" />
					</a>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() =>
							window.alert(
								"Test the agent from your site with the widget installed, or call the agent API using the public ID and secret key.",
							)
						}
						className="rounded-xl border border-border bg-transparent px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
					>
						<span className="inline-flex items-center gap-2">
							<FlaskConical className="h-4 w-4" />
							Test agent
						</span>
					</button>
					<button
						type="button"
						disabled={!dirty || updateAgent.isPending}
						onClick={() => void save()}
						className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
					>
						{updateAgent.isPending ? "Saving…" : "Save changes"}
					</button>
				</div>
			</div>

			{saveError ? (
				<p className="mb-4 text-sm text-destructive" role="alert">
					{saveError}
				</p>
			) : null}
			{savedAt && !saveError ? (
				<p className="mb-4 text-xs text-emerald-500/90">Saved at {savedAt}</p>
			) : null}

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="space-y-6">
					<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
						<h2 className="mb-4 text-sm font-semibold text-foreground">
							Configuration
						</h2>

						<div className="mb-5">
							<label
								htmlFor="edit-name"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Name
							</label>
							<input
								id="edit-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								minLength={2}
								maxLength={80}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
							/>
						</div>

						<div className="mb-5">
							<label
								htmlFor="edit-desc"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Description
							</label>
							<textarea
								id="edit-desc"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								maxLength={500}
								rows={2}
								className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground min-h-[72px]"
							/>
						</div>

						<div className="mb-5">
							<label
								htmlFor="edit-model"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Language model
							</label>
							<select
								id="edit-model"
								value={model}
								onChange={(e) => setModel(e.target.value as AgentModel)}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
							>
								{MODELS.map((m) => (
									<option key={m} value={m}>
										{modelLabel(m)}
									</option>
								))}
							</select>
						</div>

						<div className="relative mb-6">
							<div className="mb-1 flex items-center justify-between gap-2">
								<label
									htmlFor="edit-prompt"
									className="text-xs font-medium text-muted-foreground"
								>
									System prompt
								</label>
								<span className="text-[11px] tabular-nums text-muted-foreground">
									Tokens: ~{approxTokens(systemPrompt)}
								</span>
							</div>
							<textarea
								id="edit-prompt"
								value={systemPrompt}
								onChange={(e) => setSystemPrompt(e.target.value)}
								maxLength={2000}
								rows={12}
								className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm leading-relaxed text-foreground min-h-[200px]"
								placeholder="You are an assistant for…"
							/>
						</div>

						<div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/50 px-4 py-3">
							<div>
								<p className="text-sm font-medium text-foreground">
									Agent endpoint
								</p>
								<p className="mt-0.5 text-xs text-muted-foreground">
									Allow external applications to interact with this agent via
									API.
								</p>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={isActive}
								onClick={() => setIsActive((v) => !v)}
								className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
									isActive
										? "border-emerald-500/40 bg-emerald-600"
										: "border-border bg-input"
								}`}
							>
								<span
									className={`absolute top-0.5 left-0.5 block size-5 rounded-full bg-white shadow transition-transform ${
										isActive ? "translate-x-5" : "translate-x-0"
									}`}
								/>
							</button>
						</div>
					</section>
				</div>

				<aside className="space-y-6">
					<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
						<h2 className="mb-4 text-sm font-semibold text-foreground">
							Embed credentials
						</h2>
						<div className="space-y-4">
							<CopyField label="Public ID" value={agent.public_id} />
							<CopyField label="Secret key" value={agent.secret_key} masked />
						</div>
						<p className="mt-4 text-xs text-amber-500/90">
							Never expose the secret key in client-side code.
						</p>
					</section>

					<section className="rounded-2xl border border-dashed border-border bg-card/40 p-4 text-xs text-muted-foreground">
						<p className="font-medium text-foreground/90">Website URL</p>
						<p className="mt-1 break-all">{agent.website_url}</p>
						<p className="mt-2">
							URL is set at creation time. Contact support to change it.
						</p>
					</section>
				</aside>
			</div>
		</div>
	);
}
