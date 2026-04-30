import { useRouterState } from "@tanstack/react-router";
import Footer from "./Footer";
import Header from "./Header";

function isDashboardPath(pathname: string) {
	return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export default function AppChrome({ children }: { children: React.ReactNode }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const dashboard = isDashboardPath(pathname);

	return (
		<>
			{!dashboard ? <Header /> : null}
			<main
				className={
					dashboard
						? "flex h-dvh max-h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
						: "flex-1"
				}
			>
				{children}
			</main>
			{!dashboard ? <Footer /> : null}
		</>
	);
}
