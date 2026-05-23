import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAgent, useUpdateAgent } from "#/hooks/useAgents";
import type { AgentModel } from "#/lib/api-types";

export const Route = createFileRoute("/dashboard/$agentId/settings")({
	component: AgentSettingsPage,
});

const MODELS: AgentModel[] = ["gpt-4o-mini", "gpt-4o", "claude-3-5-haiku"];

function approxTokens(text: string) {
	return Math.ceil(text.length / 4);
}

function AgentSettingsPage() {
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
		setSaveError(null);
		setSavedAt(null);
		try {
			await updateAgent.mutateAsync({
				name: name.trim(),
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

	if (isLoading)
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	if (error || !agent)
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
				{/* Basic config */}
				<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<h2 className="mb-4 text-sm font-semibold text-foreground">
						Basic info
					</h2>
					<div className="space-y-4">
						<div>
							<label
								htmlFor="s-name"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Name
							</label>
							<input
								id="s-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								minLength={2}
								maxLength={80}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
							/>
						</div>
						<div>
							<label
								htmlFor="s-desc"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Description
							</label>
							<textarea
								id="s-desc"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								maxLength={500}
								rows={2}
								className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground min-h-[64px]"
							/>
						</div>
						<div>
							<label
								htmlFor="s-model"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Language model
							</label>
							<select
								id="s-model"
								value={model}
								onChange={(e) => setModel(e.target.value as AgentModel)}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
							>
								{MODELS.map((m) => (
									<option key={m} value={m}>
										{m === "gpt-4o-mini" ? "gpt-4o-mini (Default)" : m}
									</option>
								))}
							</select>
						</div>
					</div>
				</section>

				{/* System prompt */}
				<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div className="mb-3 flex items-center justify-between">
						<h2 className="text-sm font-semibold text-foreground">
							System prompt
						</h2>
						<span className="text-[11px] tabular-nums text-muted-foreground">
							~{approxTokens(systemPrompt)} tokens
						</span>
					</div>
					<p className="mb-3 text-xs text-muted-foreground">
						Instruct the agent how to behave, what tone to use, and any
						domain-specific context it should know.
					</p>
					<textarea
						id="s-prompt"
						value={systemPrompt}
						onChange={(e) => setSystemPrompt(e.target.value)}
						maxLength={2000}
						rows={14}
						placeholder="You are a helpful guide for…"
						className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm leading-relaxed text-foreground min-h-[220px]"
					/>
				</section>
			</div>

			{/* Sidebar: active toggle + save */}
			<aside className="space-y-4">
				<section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium text-foreground">
								Agent endpoint
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Disable to pause all widget requests.
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
									isActive ? "translate-x-5" : ""
								}`}
							/>
						</button>
					</div>
				</section>

				<div className="space-y-2">
					{saveError && (
						<p className="text-sm text-destructive" role="alert">
							{saveError}
						</p>
					)}
					{savedAt && !saveError && (
						<p className="text-xs text-emerald-500/90">Saved at {savedAt}</p>
					)}
					<button
						type="button"
						disabled={!dirty || updateAgent.isPending}
						onClick={() => void save()}
						className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{updateAgent.isPending ? "Saving…" : "Save changes"}
					</button>
				</div>
			</aside>
		</div>
	);
}
