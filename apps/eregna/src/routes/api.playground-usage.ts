import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/playground-usage")({
	server: {
		handlers: {
			GET: async () =>
				Response.json({
					plan: "free",
					months: [
						{ month: "Apr", gb: 12 },
						{ month: "May", gb: 18 },
						{ month: "Jun", gb: 9 },
					],
					limitGb: 50,
				}),
		},
	},
});
