import { initWidget } from "@repo/widget";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardSidebar } from "#/components/dashboard/DashboardSidebar";
import { useAuth } from "#/lib/auth";

export const Route = createFileRoute("/dashboard")({
	component: DashboardShell,
});

function DashboardShell() {
	const { user, loading } = useAuth();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isPlayground = pathname.includes("/playground");

	useEffect(() => {
		if (!loading && !user) {
			navigate({ to: "/login" });
		}
	}, [user, loading, navigate]);

	useEffect(() => {
		if (loading || !user || isPlayground) return;
		return initWidget().unmount;
	}, [loading, user, isPlayground]);

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
