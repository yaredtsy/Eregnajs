import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
	ChevronRight,
	FileText,
	Folder,
	Globe,
	Pencil,
	Plus,
	Trash2,
} from "@repo/ui/lucide-react";
import type { PageItem } from "#/lib/api-types";
import { AddElementModal } from "#/components/elements/AddElementModal";

interface TreeNode {
	page: PageItem;
	children: TreeNode[];
}

function buildTree(pages: PageItem[]): TreeNode[] {
	const map = new Map<string, TreeNode>();
	pages.forEach((p) => map.set(p.id, { page: p, children: [] }));

	const roots: TreeNode[] = [];
	pages.forEach((p) => {
		const node = map.get(p.id)!;
		if (p.parent_id && map.has(p.parent_id)) {
			map.get(p.parent_id)!.children.push(node);
		} else {
			roots.push(node);
		}
	});

	return roots;
}

interface TreeNodeRowProps {
	node: TreeNode;
	depth: number;
	agentId: string;
	onDelete: (pageId: string, title: string) => void;
	onAddElement: (page: PageItem) => void;
}

function TreeNodeRow({
	node,
	depth,
	agentId,
	onDelete,
	onAddElement,
}: TreeNodeRowProps) {
	const [expanded, setExpanded] = useState(true);
	const hasChildren = node.children.length > 0;
	const isRoot = !node.page.parent_id;

	const Icon = isRoot ? Globe : hasChildren ? Folder : FileText;
	const iconColor = isRoot
		? "text-blue-400"
		: hasChildren
			? "text-amber-400"
			: "text-muted-foreground";

	return (
		<>
			<div
				className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
				style={{ paddingLeft: 8 + depth * 20 }}
			>
				{/* Expand toggle */}
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform ${
						hasChildren ? "hover:bg-muted" : "invisible"
					} ${expanded ? "rotate-90" : ""}`}
				>
					{hasChildren && <ChevronRight className="h-3.5 w-3.5" />}
				</button>

				<Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />

				<Link
					to="/dashboard/$agentId/knowledge/$pageId"
					params={{ agentId, pageId: node.page.id }}
					className="min-w-0 flex-1 truncate text-sm font-medium text-foreground no-underline hover:text-blue-400"
				>
					{node.page.title}
				</Link>

				{node.page.url_pattern && (
					<span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground group-hover:inline">
						{node.page.url_pattern}
					</span>
				)}

				<div className="ml-auto hidden shrink-0 items-center gap-1 group-hover:flex">
					<button
						type="button"
						onClick={() => onAddElement(node.page)}
						title="Add element"
						className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
					>
						<Plus className="h-3 w-3" />
					</button>
					<Link
						to="/dashboard/$agentId/knowledge/$pageId"
						params={{ agentId, pageId: node.page.id }}
						title="Edit page"
						className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
					>
						<Pencil className="h-3 w-3" />
					</Link>
					<button
						type="button"
						onClick={() => onDelete(node.page.id, node.page.title)}
						title="Delete page"
						className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
					>
						<Trash2 className="h-3 w-3" />
					</button>
				</div>
			</div>

			{hasChildren &&
				expanded &&
				node.children.map((child) => (
					<TreeNodeRow
						key={child.page.id}
						node={child}
						depth={depth + 1}
						agentId={agentId}
						onDelete={onDelete}
						onAddElement={onAddElement}
					/>
				))}
		</>
	);
}

interface PageTreeViewProps {
	pages: PageItem[];
	agentId: string;
	onDelete: (pageId: string, title: string) => void;
}

export function PageTreeView({ pages, agentId, onDelete }: PageTreeViewProps) {
	const roots = buildTree(pages);
	const [addElementPage, setAddElementPage] = useState<PageItem | null>(null);

	if (roots.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<Plus className="mb-2 h-8 w-8 text-muted-foreground/40" />
				<p className="text-sm text-muted-foreground">
					No pages yet. Add a root page to get started.
				</p>
			</div>
		);
	}

	return (
		<>
			<div className="py-1">
				{roots.map((root) => (
					<TreeNodeRow
						key={root.page.id}
						node={root}
						depth={0}
						agentId={agentId}
						onDelete={onDelete}
						onAddElement={setAddElementPage}
					/>
				))}
			</div>

			{addElementPage && (
				<AddElementModal
					pageId={addElementPage.id}
					pageTitle={addElementPage.title}
					onClose={() => setAddElementPage(null)}
				/>
			)}
		</>
	);
}
