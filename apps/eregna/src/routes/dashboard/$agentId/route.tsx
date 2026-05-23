import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Code2, LayoutList, Settings2 } from "@repo/ui/lucide-react";
import { useAgent } from "#/hooks/useAgents";

export const Route = createFileRoute("/dashboard/$agentId")({
	component: AgentLayout,
});

function AgentLayout() {
	const { agentId } = Route.useParams();
	const { data: agent } = useAgent(agentId);
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	const tabs = [
		{
			label: "Embed",
			to: `/dashboard/${agentId}`,
			icon: Code2,
			active:
				pathname === `/dashboard/${agentId}` ||
				pathname === `/dashboard/${agentId}/`,
		},
		{
			label: "Settings",
			to: `/dashboard/${agentId}/settings`,
			icon: Settings2,
			active: pathname.startsWith(`/dashboard/${agentId}/settings`),
		},
		{
			label: "Knowledge",
			to: `/dashboard/${agentId}/knowledge`,
			icon: LayoutList,
			active: pathname.startsWith(`/dashboard/${agentId}/knowledge`),
		},
	];

	return (
		<div className="mx-auto max-w-6xl">
			{/* Agent header */}
			<div className="mb-6 flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<Link
						to="/dashboard"
						className="text-xs text-muted-foreground hover:text-foreground no-underline"
					>
						Agents
					</Link>
					<span className="text-xs text-muted-foreground">/</span>
					<span className="text-xs text-foreground font-medium truncate max-w-[220px]">
						{agent?.name ?? agentId}
					</span>
				</div>
				{agent && (
					<div className="flex items-center gap-3 mt-1">
						<h1 className="font-display text-2xl font-bold text-foreground">
							{agent.name}
						</h1>
						<span
							className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
								agent.is_active
									? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
									: "border-border text-muted-foreground"
							}`}
						>
							{agent.is_active ? "Active" : "Inactive"}
						</span>
					</div>
				)}
			</div>

			{/* Tabs */}
			<div className="mb-6 flex gap-1 border-b border-border">
				{tabs.map(({ label, to, icon: Icon, active }) => (
					<Link
						key={label}
						to={to}
						className={`no-underline inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
							active
								? "border-blue-500 text-blue-400"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						<Icon className="h-3.5 w-3.5" />
						{label}
					</Link>
				))}
			</div>

			<Outlet />
		</div>
	);
}
