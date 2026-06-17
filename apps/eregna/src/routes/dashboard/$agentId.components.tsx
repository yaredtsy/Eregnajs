import { createFileRoute, Link } from "@tanstack/react-router";
import { ComponentGallery } from "#/widget-components";

export const Route = createFileRoute("/dashboard/$agentId/components")({
	component: ComponentsPage,
});

function ComponentsPage() {
	const { agentId } = Route.useParams();

	return (
		<div className="mx-auto max-w-6xl">
			<div className="mb-6">
				<Link
					to="/dashboard/$agentId"
					params={{ agentId }}
					className="text-xs text-muted-foreground hover:text-foreground no-underline"
				>
					← Back to embed
				</Link>
				<h1 className="mt-2 font-display text-2xl font-bold text-foreground">
					Components
				</h1>
				<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
					Visual state browser for the walkthrough player — static fixtures,
					no API. Like shadcn/MUI docs: pick a component, pick a variant, see
					how it looks.
				</p>
			</div>

			<ComponentGallery />
		</div>
	);
}
