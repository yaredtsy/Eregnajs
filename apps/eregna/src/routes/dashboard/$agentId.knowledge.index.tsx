import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageTreeView } from "#/components/pages/PageTreeView";
import { useCreatePage, useDeletePage, usePages } from "#/hooks/usePages";

export const Route = createFileRoute("/dashboard/$agentId/knowledge/")({
	component: KnowledgeIndexPage,
});

function KnowledgeIndexPage() {
	const { agentId } = Route.useParams();
	const { data: pages, isLoading, error } = usePages(agentId);
	const createPage = useCreatePage(agentId);
	const deletePage = useDeletePage(agentId);

	const [title, setTitle] = useState("");
	const [parentId, setParentId] = useState("");
	const [urlPattern, setUrlPattern] = useState("");
	const [formError, setFormError] = useState<string | null>(null);
	const [showForm, setShowForm] = useState(false);

	async function addPage(e: React.FormEvent) {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		setFormError(null);
		try {
			await createPage.mutateAsync({
				title: t,
				parent_id: parentId || null,
				url_pattern: urlPattern.trim() || null,
			});
			setTitle("");
			setParentId("");
			setUrlPattern("");
			setShowForm(false);
		} catch (err) {
			setFormError(err instanceof Error ? err.message : "Could not create page");
		}
	}

	async function handleDelete(pageId: string, pageTitle: string) {
		if (
			!window.confirm(
				`Delete "${pageTitle}" and all its elements? This cannot be undone.`,
			)
		)
			return;
		try {
			await deletePage.mutateAsync(pageId);
		} catch (e) {
			alert(e instanceof Error ? e.message : "Delete failed");
		}
	}

	return (
		<div className="space-y-6">
			{/* Tree panel */}
			<section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
				<div className="flex items-center justify-between border-b border-border px-5 py-3">
					<div>
						<p className="text-sm font-semibold text-foreground">Page tree</p>
						{pages && (
							<p className="text-xs text-muted-foreground">
								{pages.length} page{pages.length !== 1 ? "s" : ""}
							</p>
						)}
					</div>
					<button
						type="button"
						onClick={() => setShowForm((v) => !v)}
						className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
					>
						{showForm ? "Cancel" : "+ Add page"}
					</button>
				</div>

				{error ? (
					<p className="p-5 text-sm text-destructive">
						{error instanceof Error ? error.message : "Could not load pages."}
					</p>
				) : isLoading ? (
					<p className="p-5 text-sm text-muted-foreground">Loading…</p>
				) : (
					<PageTreeView
						pages={pages ?? []}
						agentId={agentId}
						onDelete={handleDelete}
					/>
				)}
			</section>

			{/* Add page form */}
			{showForm && (
				<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<h2 className="mb-4 text-sm font-semibold text-foreground">
						Add page
					</h2>
					{formError && (
						<p className="mb-3 text-sm text-destructive" role="alert">
							{formError}
						</p>
					)}
					<form
						onSubmit={(e) => void addPage(e)}
						className="grid gap-4 sm:grid-cols-2"
					>
						<div className="sm:col-span-2">
							<label
								htmlFor="pg-title"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Title *
							</label>
							<input
								id="pg-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								required
								maxLength={200}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
								placeholder="Documentation"
								autoFocus
							/>
						</div>
						<div>
							<label
								htmlFor="pg-url"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								URL pattern
							</label>
							<input
								id="pg-url"
								value={urlPattern}
								onChange={(e) => setUrlPattern(e.target.value)}
								maxLength={500}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
								placeholder="/docs/*"
							/>
						</div>
						<div>
							<label
								htmlFor="pg-parent"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Parent page
							</label>
							<select
								id="pg-parent"
								value={parentId}
								onChange={(e) => setParentId(e.target.value)}
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
							>
								<option value="">— Root level —</option>
								{(pages ?? []).map((p) => (
									<option key={p.id} value={p.id}>
										{p.title}
									</option>
								))}
							</select>
						</div>
						<div className="sm:col-span-2 flex gap-2">
							<button
								type="submit"
								disabled={createPage.isPending}
								className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
							>
								{createPage.isPending ? "Creating…" : "Create page"}
							</button>
							<button
								type="button"
								onClick={() => setShowForm(false)}
								className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
							>
								Cancel
							</button>
						</div>
					</form>
				</section>
			)}
		</div>
	);
}
