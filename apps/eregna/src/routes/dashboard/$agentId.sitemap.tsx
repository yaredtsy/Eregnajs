import { FileText, Folder, Home, Plus } from "@repo/ui/lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DashboardBreadcrumbs } from "#/components/dashboard/DashboardBreadcrumbs";
import { useAgent } from "#/hooks/useAgents";
import { useCreatePage, usePages } from "#/hooks/usePages";
import type { PageItem } from "#/lib/api-types";

export const Route = createFileRoute("/dashboard/$agentId/sitemap")({
	component: SitemapPage,
});

function PageIcon({
	isRoot,
	isBranch,
}: {
	isRoot: boolean;
	isBranch: boolean;
}) {
	if (isRoot)
		return <Home className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />;
	return isBranch ? (
		<Folder className="h-4 w-4 shrink-0 text-amber-400/90" aria-hidden />
	) : (
		<FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
	);
}

function buildRows(pages: PageItem[]): { page: PageItem; depth: number }[] {
	const byParent = new Map<string | null, PageItem[]>();
	for (const p of pages) {
		const key = p.parent_id;
		const arr = byParent.get(key) ?? [];
		arr.push(p);
		byParent.set(key, arr);
	}
	for (const arr of byParent.values()) {
		arr.sort(
			(a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
		);
	}
	const out: { page: PageItem; depth: number }[] = [];
	function walk(parentId: string | null, depth: number) {
		for (const p of byParent.get(parentId) ?? []) {
			out.push({ page: p, depth });
			walk(p.id, depth + 1);
		}
	}
	walk(null, 0);
	return out;
}

function SitemapPage() {
	const { agentId } = Route.useParams();
	const { data: agent, isLoading: agentLoading } = useAgent(agentId);
	const { data: pages, isLoading: pagesLoading, error } = usePages(agentId);
	const createPage = useCreatePage(agentId);
	const [title, setTitle] = useState("");
	const [parentId, setParentId] = useState<string>("");
	const [formError, setFormError] = useState<string | null>(null);

	const rows = useMemo(() => (pages ? buildRows(pages) : []), [pages]);
	const parentIdsWithChildren = useMemo(() => {
		const s = new Set<string>();
		for (const p of pages ?? []) {
			if (p.parent_id) s.add(p.parent_id);
		}
		return s;
	}, [pages]);

	async function addPage(e: React.FormEvent) {
		e.preventDefault();
		const t = title.trim();
		if (!t) return;
		setFormError(null);
		try {
			await createPage.mutateAsync({
				title: t,
				parent_id: parentId || null,
			});
			setTitle("");
			setParentId("");
		} catch (err) {
			setFormError(
				err instanceof Error ? err.message : "Could not create page",
			);
		}
	}

	if (agentLoading) {
		return <p className="text-sm text-muted-foreground">Loading…</p>;
	}

	if (!agent) {
		return (
			<p className="text-sm text-destructive">
				Agent not found.{" "}
				<Link to="/dashboard" className="text-blue-400 hover:underline">
					Back
				</Link>
			</p>
		);
	}

	return (
		<div className="mx-auto max-w-5xl">
			<DashboardBreadcrumbs
				items={[
					{ label: "Agents", to: "/dashboard" },
					{ label: agent.name, to: "/dashboard/$agentId", params: { agentId } },
					{ label: "Sitemap" },
				]}
			/>

			<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
						Page &amp; sitemap manager
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Hierarchical pages for{" "}
						<span className="text-foreground/90">{agent.name}</span>. Paths use
						ltree labels under your agent.
					</p>
				</div>
				<button
					type="button"
					onClick={() =>
						document
							.getElementById("add-page-panel")
							?.scrollIntoView({ behavior: "smooth" })
					}
					className="inline-flex items-center justify-center self-start rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
				>
					<Plus className="mr-2 h-4 w-4" />
					Add new page
				</button>
			</div>

			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
				<div className="border-b border-border px-4 py-3 sm:px-6">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						Page architecture
					</p>
				</div>
				{error ? (
					<p className="p-6 text-sm text-destructive">
						{error instanceof Error ? error.message : "Could not load pages."}
					</p>
				) : pagesLoading ? (
					<p className="p-6 text-sm text-muted-foreground">Loading pages…</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[520px] text-left text-sm">
							<thead>
								<tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
									<th className="px-4 py-3 sm:px-6">Page</th>
									<th className="px-4 py-3 sm:px-6 font-mono">Ltree path</th>
									<th className="px-4 py-3 sm:px-6 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{rows.length === 0 ? (
									<tr>
										<td
											colSpan={3}
											className="px-6 py-10 text-center text-muted-foreground"
										>
											No pages yet. Add a root page below.
										</td>
									</tr>
								) : (
									rows.map(({ page, depth }) => {
										const isRoot = page.path === "root" || depth === 0;
										const isBranch = parentIdsWithChildren.has(page.id);
										return (
											<tr
												key={page.id}
												className="border-b border-border/80 last:border-0 hover:bg-muted/30"
											>
												<td className="px-4 py-3 sm:px-6">
													<div
														className="flex items-center gap-2"
														style={{ paddingLeft: depth * 16 }}
													>
														<PageIcon isRoot={isRoot} isBranch={isBranch} />
														<span className="font-medium text-foreground">
															{page.title}
														</span>
													</div>
												</td>
												<td className="px-4 py-3 font-mono text-xs text-muted-foreground sm:px-6">
													{String(page.path)}
												</td>
												<td className="px-4 py-3 text-right sm:px-6">
													<span className="text-xs text-muted-foreground">
														—
													</span>
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				)}
			</div>

			<section
				id="add-page-panel"
				className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm"
			>
				<h2 className="mb-4 font-display text-lg font-semibold text-foreground">
					Add page
				</h2>
				{formError ? (
					<p className="mb-3 text-sm text-destructive" role="alert">
						{formError}
					</p>
				) : null}
				<form
					onSubmit={(e) => void addPage(e)}
					className="grid gap-4 sm:grid-cols-2"
				>
					<div className="sm:col-span-2">
						<label
							htmlFor="page-title"
							className="mb-1 block text-xs font-medium text-muted-foreground"
						>
							Title
						</label>
						<input
							id="page-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
							maxLength={200}
							className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
							placeholder="Documentation"
						/>
					</div>
					<div className="sm:col-span-2">
						<label
							htmlFor="page-parent"
							className="mb-1 block text-xs font-medium text-muted-foreground"
						>
							Parent page (optional)
						</label>
						<select
							id="page-parent"
							value={parentId}
							onChange={(e) => setParentId(e.target.value)}
							className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
						>
							<option value="">— Root level —</option>
							{(pages ?? []).map((p) => (
								<option key={p.id} value={p.id}>
									{p.title} ({String(p.path)})
								</option>
							))}
						</select>
					</div>
					<div className="sm:col-span-2">
						<button
							type="submit"
							disabled={createPage.isPending}
							className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
						>
							{createPage.isPending ? "Creating…" : "Create page"}
						</button>
					</div>
				</form>
			</section>
		</div>
	);
}
