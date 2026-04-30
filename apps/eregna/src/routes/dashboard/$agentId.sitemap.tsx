import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/$agentId/sitemap")({
	component: SitemapRedirect,
});

function SitemapRedirect() {
	const { agentId } = Route.useParams();
	return (
		<Navigate
			to="/dashboard/$agentId/knowledge"
			params={{ agentId }}
			replace
		/>
	);
}
