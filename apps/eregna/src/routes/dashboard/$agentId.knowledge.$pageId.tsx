import { Trash2 } from "@repo/ui/lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardBreadcrumbs } from "#/components/dashboard/DashboardBreadcrumbs";
import { useAgent } from "#/hooks/useAgents";
import {
	useCreateElement,
	useDeleteElement,
	useElements,
	useUpdateElement,
} from "#/hooks/useElements";
import { useDeletePage, usePages, useUpdatePage } from "#/hooks/usePages";
import type { ElementItem } from "#/lib/api-types";

export const Route = createFileRoute("/dashboard/$agentId/knowledge/$pageId")({
	component: PageEditorPage,
});

function PageEditorPage() {
	const { agentId, pageId } = Route.useParams();
	const navigate = useNavigate();
	const { data: agent, isLoading: agentLoading } = useAgent(agentId);
	const { data: pages, isLoading: pagesLoading } = usePages(agentId);
	const page = useMemo(
		() => pages?.find((p) => p.id === pageId),
		[pages, pageId],
	);

	const updatePage = useUpdatePage(agentId);
	const deletePage = useDeletePage(agentId);
	const { data: elements, isLoading: elLoading } = useElements(pageId);
	const createEl = useCreateElement(pageId);
	const updateEl = useUpdateElement(pageId);
	const deleteEl = useDeleteElement(pageId);

	const [title, setTitle] = useState("");
	const [urlPattern, setUrlPattern] = useState("");
	const [description, setDescription] = useState("");
	const [sortOrder, setSortOrder] = useState(0);
	const [pageErr, setPageErr] = useState<string | null>(null);
	const [pageSaved, setPageSaved] = useState<string | null>(null);

	useEffect(() => {
		if (!page) return;
		setTitle(page.title);
		setUrlPattern(page.url_pattern ?? "");
		setDescription(page.description ?? "");
		setSortOrder(page.sort_order);
	}, [page]);

	const pageDirty = useMemo(() => {
		if (!page) return false;
		return (
			title !== page.title ||
			urlPattern !== (page.url_pattern ?? "") ||
			description !== (page.description ?? "") ||
			sortOrder !== page.sort_order
		);
	}, [page, title, urlPattern, description, sortOrder]);

	async function savePage() {
		if (!page) return;
		setPageErr(null);
		setPageSaved(null);
		try {
			await updatePage.mutateAsync({
				pageId: page.id,
				body: {
					title,
					url_pattern: urlPattern.trim() || null,
					description: description.trim() || null,
					sort_order: sortOrder,
				},
			});
			setPageSaved(new Date().toLocaleTimeString());
		} catch (e) {
			setPageErr(e instanceof Error ? e.message : "Save failed");
		}
	}

	async function removePage() {
		if (!page) return;
		if (
			!window.confirm(
				`Delete page “${page.title}” and all its elements? This cannot be undone.`,
			)
		) {
			return;
		}
		try {
			await deletePage.mutateAsync(page.id);
			void navigate({
				to: "/dashboard/$agentId/knowledge",
				params: { agentId },
			});
		} catch (e) {
			setPageErr(e instanceof Error ? e.message : "Delete failed");
		}
	}

	if (agentLoading || pagesLoading) {
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

	if (!pagesLoading && pages && !page) {
		return (
			<div className="rounded-2xl border border-border bg-card p-8 text-center">
				<p className="text-sm text-muted-foreground mb-4">Page not found.</p>
				<Link
					to="/dashboard/$agentId/knowledge"
					params={{ agentId }}
					className="text-sm font-medium text-blue-400 hover:underline"
				>
					Back to knowledge
				</Link>
			</div>
		);
	}

	if (!page) {
		return null;
	}

	return (
		<div className="mx-auto max-w-5xl">
			<DashboardBreadcrumbs
				items={[
					{ label: "Agents", to: "/dashboard" },
					{ label: agent.name, to: "/dashboard/$agentId", params: { agentId } },
					{
						label: "Knowledge",
						to: "/dashboard/$agentId/knowledge",
						params: { agentId },
					},
					{ label: page.title },
				]}
			/>

			<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
						{page.title}
					</h1>
					<p className="mt-1 font-mono text-xs text-muted-foreground">
						{String(page.path)}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						onClick={() => void removePage()}
						disabled={deletePage.isPending}
						className="inline-flex items-center gap-2 rounded-xl border border-destructive/50 px-4 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
					>
						<Trash2 className="h-4 w-4" />
						Delete page
					</button>
					<button
						type="button"
						disabled={!pageDirty || updatePage.isPending}
						onClick={() => void savePage()}
						className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
					>
						{updatePage.isPending ? "Saving…" : "Save page"}
					</button>
				</div>
			</div>

			{pageErr ? (
				<p className="mb-4 text-sm text-destructive" role="alert">
					{pageErr}
				</p>
			) : null}
			{pageSaved ? (
				<p className="mb-4 text-xs text-emerald-500/90">Saved at {pageSaved}</p>
			) : null}

			<section className="mb-10 rounded-2xl border border-border bg-card p-6 shadow-sm">
				<h2 className="mb-4 text-sm font-semibold text-foreground">Page</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="sm:col-span-2">
						<label
							htmlFor="pg-title"
							className="mb-1 block text-xs font-medium text-muted-foreground"
						>
							Title
						</label>
						<input
							id="pg-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							maxLength={200}
							className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
						/>
					</div>
					<div className="sm:col-span-2">
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
							className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
							placeholder="/docs/*"
						/>
					</div>
					<div className="sm:col-span-2">
						<label
							htmlFor="pg-desc"
							className="mb-1 block text-xs font-medium text-muted-foreground"
						>
							Description
						</label>
						<textarea
							id="pg-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							maxLength={2000}
							rows={3}
							className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm min-h-[80px]"
						/>
					</div>
					<div>
						<label
							htmlFor="pg-order"
							className="mb-1 block text-xs font-medium text-muted-foreground"
						>
							Sort order
						</label>
						<input
							id="pg-order"
							type="number"
							value={sortOrder}
							onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
							className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
						/>
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
				<h2 className="mb-2 text-sm font-semibold text-foreground">Elements</h2>
				<p className="mb-6 text-xs text-muted-foreground">
					Map regions of this page with a label and either a DOM id or CSS
					selector.
				</p>

				{elLoading ? (
					<p className="text-sm text-muted-foreground">Loading elements…</p>
				) : (
					<div className="space-y-6">
						{(elements ?? []).map((el) => (
							<ElementBlock
								key={el.id}
								element={el}
								onSave={(body) =>
									updateEl.mutateAsync({ elementId: el.id, body })
								}
								onDelete={() => void deleteEl.mutateAsync(el.id)}
								busy={updateEl.isPending || deleteEl.isPending}
							/>
						))}
						<NewElementForm elements={elements ?? []} createEl={createEl} />
					</div>
				)}
			</section>
		</div>
	);
}

function ElementBlock({
	element: el,
	onSave,
	onDelete,
	busy,
}: {
	element: ElementItem;
	onSave: (body: {
		label: string;
		dom_id: string | null;
		css_selector: string | null;
		description: string | null;
		notes: string | null;
		sort_order: number;
	}) => Promise<unknown>;
	onDelete: () => void;
	busy: boolean;
}) {
	const [label, setLabel] = useState(el.label);
	const [domId, setDomId] = useState(el.dom_id ?? "");
	const [cssSel, setCssSel] = useState(el.css_selector ?? "");
	const [desc, setDesc] = useState(el.description ?? "");
	const [notes, setNotes] = useState(el.notes ?? "");
	const [order, setOrder] = useState(el.sort_order);
	const [err, setErr] = useState<string | null>(null);

	useEffect(() => {
		setLabel(el.label);
		setDomId(el.dom_id ?? "");
		setCssSel(el.css_selector ?? "");
		setDesc(el.description ?? "");
		setNotes(el.notes ?? "");
		setOrder(el.sort_order);
	}, [el]);

	const dirty =
		label !== el.label ||
		domId !== (el.dom_id ?? "") ||
		cssSel !== (el.css_selector ?? "") ||
		desc !== (el.description ?? "") ||
		notes !== (el.notes ?? "") ||
		order !== el.sort_order;

	const uid = `el-${el.id}`;
	return (
		<div className="rounded-xl border border-border bg-background/60 p-4">
			<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
				<p className="font-mono text-[11px] text-muted-foreground">
					{String(el.path)}
				</p>
				{el.has_embedding ? (
					<span className="text-[10px] font-medium uppercase tracking-wide text-emerald-500/90">
						Has embedding
					</span>
				) : null}
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="sm:col-span-2">
					<label
						htmlFor={`${uid}-label`}
						className="mb-1 block text-xs text-muted-foreground"
					>
						Label
					</label>
					<input
						id={`${uid}-label`}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label
						htmlFor={`${uid}-dom`}
						className="mb-1 block text-xs text-muted-foreground"
					>
						DOM id
					</label>
					<input
						id={`${uid}-dom`}
						value={domId}
						onChange={(e) => setDomId(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
						placeholder="hero"
					/>
				</div>
				<div>
					<label
						htmlFor={`${uid}-css`}
						className="mb-1 block text-xs text-muted-foreground"
					>
						CSS selector
					</label>
					<input
						id={`${uid}-css`}
						value={cssSel}
						onChange={(e) => setCssSel(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
						placeholder="#main article"
					/>
				</div>
				<div className="sm:col-span-2">
					<label
						htmlFor={`${uid}-desc`}
						className="mb-1 block text-xs text-muted-foreground"
					>
						Description
					</label>
					<textarea
						id={`${uid}-desc`}
						value={desc}
						onChange={(e) => setDesc(e.target.value)}
						rows={2}
						className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
				<div className="sm:col-span-2">
					<label
						htmlFor={`${uid}-notes`}
						className="mb-1 block text-xs text-muted-foreground"
					>
						Notes
					</label>
					<textarea
						id={`${uid}-notes`}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						rows={2}
						className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label
						htmlFor={`${uid}-order`}
						className="mb-1 block text-xs text-muted-foreground"
					>
						Sort order
					</label>
					<input
						id={`${uid}-order`}
						type="number"
						value={order}
						onChange={(e) => setOrder(Number(e.target.value) || 0)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
			</div>
			{err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					disabled={!dirty || busy}
					onClick={() => {
						setErr(null);
						if (!domId.trim() && !cssSel.trim()) {
							setErr("Provide DOM id or CSS selector.");
							return;
						}
						void onSave({
							label: label.trim(),
							dom_id: domId.trim() || null,
							css_selector: cssSel.trim() || null,
							description: desc.trim() || null,
							notes: notes.trim() || null,
							sort_order: order,
						}).catch((e: unknown) => {
							setErr(e instanceof Error ? e.message : "Update failed");
						});
					}}
					className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-45"
				>
					Save element
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => {
						if (window.confirm(`Delete element “${el.label}”?`)) onDelete();
					}}
					className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-45"
				>
					Delete
				</button>
			</div>
		</div>
	);
}

function NewElementForm({
	elements,
	createEl,
}: {
	elements: ElementItem[];
	createEl: ReturnType<typeof useCreateElement>;
}) {
	const [label, setLabel] = useState("");
	const [domId, setDomId] = useState("");
	const [cssSel, setCssSel] = useState("");
	const [desc, setDesc] = useState("");
	const [parentId, setParentId] = useState("");
	const [err, setErr] = useState<string | null>(null);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setErr(null);
		if (!label.trim()) {
			setErr("Label is required.");
			return;
		}
		if (!domId.trim() && !cssSel.trim()) {
			setErr("Provide DOM id or CSS selector.");
			return;
		}
		try {
			await createEl.mutateAsync({
				label: label.trim(),
				dom_id: domId.trim() || null,
				css_selector: cssSel.trim() || null,
				description: desc.trim() || null,
				parent_id: parentId || null,
			});
			setLabel("");
			setDomId("");
			setCssSel("");
			setDesc("");
			setParentId("");
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Create failed");
		}
	}

	return (
		<div className="rounded-xl border border-dashed border-border bg-background/40 p-4">
			<h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				New element
			</h3>
			<form
				onSubmit={(e) => void submit(e)}
				className="grid gap-3 sm:grid-cols-2"
			>
				<div className="sm:col-span-2">
					<label
						htmlFor="new-el-label"
						className="mb-1 block text-xs text-muted-foreground"
					>
						Label
					</label>
					<input
						id="new-el-label"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
						placeholder="Hero section"
					/>
				</div>
				<div>
					<label
						htmlFor="new-el-dom"
						className="mb-1 block text-xs text-muted-foreground"
					>
						DOM id
					</label>
					<input
						id="new-el-dom"
						value={domId}
						onChange={(e) => setDomId(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label
						htmlFor="new-el-css"
						className="mb-1 block text-xs text-muted-foreground"
					>
						CSS selector
					</label>
					<input
						id="new-el-css"
						value={cssSel}
						onChange={(e) => setCssSel(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
				<div className="sm:col-span-2">
					<label
						htmlFor="new-el-parent"
						className="mb-1 block text-xs text-muted-foreground"
					>
						Parent element (optional)
					</label>
					<select
						id="new-el-parent"
						value={parentId}
						onChange={(e) => setParentId(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
					>
						<option value="">— None —</option>
						{elements.map((el) => (
							<option key={el.id} value={el.id}>
								{el.label} ({String(el.path)})
							</option>
						))}
					</select>
				</div>
				<div className="sm:col-span-2">
					<label
						htmlFor="new-el-desc"
						className="mb-1 block text-xs text-muted-foreground"
					>
						Description
					</label>
					<textarea
						id="new-el-desc"
						value={desc}
						onChange={(e) => setDesc(e.target.value)}
						rows={2}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
					/>
				</div>
				{err ? (
					<p className="sm:col-span-2 text-xs text-destructive">{err}</p>
				) : null}
				<div className="sm:col-span-2">
					<button
						type="submit"
						disabled={createEl.isPending}
						className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
					>
						{createEl.isPending ? "Adding…" : "Add element"}
					</button>
				</div>
			</form>
		</div>
	);
}
