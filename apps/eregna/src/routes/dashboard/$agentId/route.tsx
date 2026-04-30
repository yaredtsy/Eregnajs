import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/$agentId")({
	component: AgentIdLayout,
});

function AgentIdLayout() {
	return <Outlet />;
}
