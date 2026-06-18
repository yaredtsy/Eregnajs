import { initWidget } from "@repo/widget";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { DashboardSidebar } from "#/components/dashboard/DashboardSidebar";
import { useAuth } from "#/lib/auth";

export const Route = createFileRoute("/dashboard")({
	component: DashboardShell,
});

function isAgentsListPath(pathname: string): boolean {
	return pathname === "/dashboard" || pathname === "/dashboard/";
}

function DashboardShell() {
	const { user, loading } = useAuth();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isPlayground = pathname.includes("/playground");
	const isAgentsList = isAgentsListPath(pathname);

	const guideAgentId = import.meta.env.VITE_EREGNA_GUIDE_AGENT_ID as string | undefined;
	const apiBase = import.meta.env.VITE_EREGNA_API_URL ?? "http://localhost:4000";

	const widgetOptions = useMemo(() => {
		if (!isAgentsList) return null;
		if (guideAgentId?.trim()) {
			return { agentPublicId: guideAgentId.trim(), apiBase };
		}
		return {};
	}, [isAgentsList, guideAgentId, apiBase]);

	useEffect(() => {
		if (!loading && !user) {
			navigate({ to: "/login" });
		}
	}, [user, loading, navigate]);

	useEffect(() => {
		if (loading || !user || isPlayground || !widgetOptions) return;
		return initWidget(widgetOptions).unmount;
	}, [loading, user, isPlayground, widgetOptions]);

	if (loading || !user) {
		return (
			<div className="flex min-h-dvh flex-1 items-center justify-center pl-56 text-muted-foreground">
				{loading ? "Loading…" : "Redirecting…"}
			</div>
		);
	}

	return (
		<div className="relative flex min-h-0 flex-1 overflow-hidden">
			<DashboardSidebar />
			<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background pl-56">
				<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-8 lg:px-10">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
