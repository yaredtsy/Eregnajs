import { ChevronRight } from "@repo/ui/lucide-react";
import { Link } from "@tanstack/react-router";

type Crumb = {
	label: string;
	to?: string;
	params?: Record<string, string>;
};

export function DashboardBreadcrumbs({ items }: { items: Crumb[] }) {
	return (
		<nav className="mb-2 flex flex-wrap items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
			{items.map((c, i) => (
				<span key={c.label} className="flex items-center gap-1">
					{i > 0 ? (
						<ChevronRight className="h-3 w-3 opacity-50" aria-hidden />
					) : null}
					{c.to ? (
						<Link
							to={c.to}
							{...(c.params ? { params: c.params } : {})}
							className="text-muted-foreground no-underline hover:text-foreground"
						>
							{c.label}
						</Link>
					) : (
						<span className="text-foreground/90">{c.label}</span>
					)}
				</span>
			))}
		</nav>
	);
}
