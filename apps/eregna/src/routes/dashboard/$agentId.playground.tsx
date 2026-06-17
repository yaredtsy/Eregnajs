import { createFileRoute } from "@tanstack/react-router";
import { initWidget } from "@repo/widget";
import { useEffect } from "react";
import { useAgent } from "#/hooks/useAgents";
import { PlaygroundShell } from "#/playground/PlaygroundShell";

export const Route = createFileRoute("/dashboard/$agentId/playground")({
	component: PlaygroundPage,
});

function PlaygroundPage() {
	const { agentId } = Route.useParams();
	const { data: agent, isLoading } = useAgent(agentId);

	useEffect(() => {
		if (!agent?.public_id) return;
		const apiBase = import.meta.env.VITE_EREGNA_API_URL ?? "http://localhost:4000";
		const { unmount } = initWidget({
			agentPublicId: agent.public_id,
			apiBase,
		});
		return unmount;
	}, [agent?.public_id]);

	if (isLoading || !agent) {
		return <p className="text-sm text-muted-foreground">Loading agent…</p>;
	}

	return (
		<div className="max-w-none">
			<div className="mb-4">
				<h1 className="font-display text-xl font-bold text-foreground">Playground</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Fake host site with the production widget — inject context, isolate subsystems, run
					the acceptance matrix.
				</p>
			</div>
			<PlaygroundShell agent={agent} />
		</div>
	);
}
