import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Modal } from "#/components/ui/Modal";
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

	const [showAddPage, setShowAddPage] = useState(false);
	const [title, setTitle] = useState("");
	const [parentId, setParentId] = useState("");
	const [urlPattern, setUrlPattern] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	function openAddPage() {
		setTitle("");
		setParentId("");
		setUrlPattern("");
		setFormError(null);
		setShowAddPage(true);
	}

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
			setShowAddPage(false);
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
		<>
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
						onClick={openAddPage}
						className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
					>
						+ Add page
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

			{showAddPage && (
				<Modal title="Add page" onClose={() => setShowAddPage(false)}>
					{formError && (
						<p className="mb-3 text-sm text-destructive" role="alert">
							{formError}
						</p>
					)}
					<form onSubmit={(e) => void addPage(e)} className="space-y-4">
						<div>
							<label
								htmlFor="pg-title"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								Title <span className="text-destructive">*</span>
							</label>
							<input
								id="pg-title"
								autoFocus
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								required
								maxLength={200}
								placeholder="Documentation"
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
								placeholder="/docs/*"
								className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
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

						<div className="flex justify-end gap-2 pt-1">
							<button
								type="button"
								onClick={() => setShowAddPage(false)}
								className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={createPage.isPending}
								className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
							>
								{createPage.isPending ? "Creating…" : "Create page"}
							</button>
						</div>
					</form>
				</Modal>
			)}
		</>
	);
}
