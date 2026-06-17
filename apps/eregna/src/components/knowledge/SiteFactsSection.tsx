import {
	useCreateSiteFact,
	useDeleteSiteFact,
	useSiteFacts,
	useUpdateSiteFact,
} from "#/hooks/useFacts";
import type { SiteFactItem } from "#/lib/api-types";
import { useState } from "react";

export function SiteFactsSection({ agentId }: { agentId: string }) {
	const { data: facts, isLoading, error } = useSiteFacts(agentId);
	const createFact = useCreateSiteFact(agentId);
	const updateFact = useUpdateSiteFact(agentId);
	const deleteFact = useDeleteSiteFact(agentId);

	return (
		<section className="mt-8 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
			<div className="border-b border-border px-5 py-3">
				<p className="text-sm font-semibold text-foreground">Site facts</p>
				<p className="text-xs text-muted-foreground mt-0.5">
					Agent-wide knowledge the planner sees on every page — policies,
					product facts, caveats.
				</p>
			</div>

			{error ? (
				<p className="p-5 text-sm text-destructive">
					{error instanceof Error ? error.message : "Could not load facts."}
				</p>
			) : isLoading ? (
				<p className="p-5 text-sm text-muted-foreground">Loading…</p>
			) : (
				<div className="space-y-4 p-5">
					{(facts ?? []).map((fact) => (
						<FactBlock
							key={fact.id}
							fact={fact}
							onSave={(body) =>
								updateFact.mutateAsync({ factId: fact.id, body })
							}
							onDelete={() => void deleteFact.mutateAsync(fact.id)}
							busy={updateFact.isPending || deleteFact.isPending}
						/>
					))}
					<NewFactForm createFact={createFact} />
				</div>
			)}
		</section>
	);
}

function FactBlock({
	fact,
	onSave,
	onDelete,
	busy,
}: {
	fact: SiteFactItem;
	onSave: (body: { title: string; content: string; sort_order: number }) => Promise<unknown>;
	onDelete: () => void;
	busy: boolean;
}) {
	const [title, setTitle] = useState(fact.title);
	const [content, setContent] = useState(fact.content);
	const [order, setOrder] = useState(fact.sort_order);
	const [err, setErr] = useState<string | null>(null);

	const dirty =
		title !== fact.title ||
		content !== fact.content ||
		order !== fact.sort_order;

	return (
		<div className="rounded-xl border border-border bg-background/60 p-4">
			<div className="grid gap-3">
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">
						Title
					</label>
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs text-muted-foreground">
						Content
					</label>
					<textarea
						value={content}
						onChange={(e) => setContent(e.target.value)}
						rows={3}
						className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[72px]"
					/>
				</div>
				<div className="w-32">
					<label className="mb-1 block text-xs text-muted-foreground">
						Sort order
					</label>
					<input
						type="number"
						value={order}
						onChange={(e) => setOrder(Number(e.target.value) || 0)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
			</div>
			{err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
			<div className="mt-3 flex gap-2">
				<button
					type="button"
					disabled={!dirty || busy}
					onClick={() => {
						setErr(null);
						void onSave({
							title: title.trim(),
							content: content.trim(),
							sort_order: order,
						}).catch((e: unknown) => {
							setErr(e instanceof Error ? e.message : "Save failed");
						});
					}}
					className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-45"
				>
					Save
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => {
						if (window.confirm(`Delete fact "${fact.title}"?`)) onDelete();
					}}
					className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
				>
					Delete
				</button>
			</div>
		</div>
	);
}

function NewFactForm({
	createFact,
}: {
	createFact: ReturnType<typeof useCreateSiteFact>;
}) {
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [err, setErr] = useState<string | null>(null);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setErr(null);
		if (!title.trim() || !content.trim()) {
			setErr("Title and content are required.");
			return;
		}
		try {
			await createFact.mutateAsync({
				title: title.trim(),
				content: content.trim(),
			});
			setTitle("");
			setContent("");
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Create failed");
		}
	}

	return (
		<div className="rounded-xl border border-dashed border-border bg-background/40 p-4">
			<h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				New site fact
			</h3>
			<form onSubmit={(e) => void submit(e)} className="grid gap-3">
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Fact title"
					className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
				/>
				<textarea
					value={content}
					onChange={(e) => setContent(e.target.value)}
					placeholder="What the agent should know about this site…"
					rows={2}
					className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
				/>
				{err ? <p className="text-xs text-destructive">{err}</p> : null}
				<button
					type="submit"
					disabled={createFact.isPending}
					className="justify-self-start rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
				>
					{createFact.isPending ? "Adding…" : "Add fact"}
				</button>
			</form>
		</div>
	);
}
