import { Bot, LayoutDashboard, LogOut } from "@repo/ui/lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "#/lib/auth";
import { supabase } from "#/lib/supabase";
import ThemeToggle from "../ThemeToggle";

const APP_VERSION = "v1.0.0";

export function DashboardSidebar() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	const agentsActive =
		pathname === "/dashboard" || pathname === "/dashboard/";

	async function signOut() {
		await supabase.auth.signOut();
		void navigate({ to: "/" });
	}

	return (
		<aside className="fixed top-0 left-0 z-40 flex h-dvh w-56 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
			<div className="shrink-0 border-b border-sidebar-border px-4 py-5">
				<Link to="/dashboard" className="flex items-center gap-2 no-underline">
					<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary/20">
						<LayoutDashboard className="h-4 w-4 text-sidebar-primary" />
					</span>
					<div className="min-w-0">
						<p className="font-semibold tracking-tight text-sidebar-foreground">
							Eregna
						</p>
						<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
							{APP_VERSION}
						</p>
					</div>
				</Link>
			</div>

			<nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3">
				<Link
					to="/dashboard"
					className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors ${
						agentsActive
							? "bg-sidebar-accent text-sidebar-accent-foreground"
							: "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
					}`}
				>
					<Bot className="h-4 w-4 shrink-0" />
					Agents
				</Link>
			</nav>

			<div className="shrink-0 border-t border-sidebar-border p-3">
				<p
					className="truncate px-3 pb-2 text-[11px] text-muted-foreground"
					title={user?.email ?? undefined}
				>
					{user?.email ?? "—"}
				</p>
				<div className="mb-2 px-3">
					<ThemeToggle />
				</div>
				<button
					type="button"
					onClick={() => void signOut()}
					className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
				>
					<LogOut className="h-4 w-4" />
					Logout
				</button>
			</div>
		</aside>
	);
}
