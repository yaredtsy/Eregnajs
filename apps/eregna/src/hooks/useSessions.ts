import { useQuery } from "@tanstack/react-query";
import { api } from "#/lib/api";

export type SessionItem = {
	id: string;
	agent_id: string;
	visitor_id: string | null;
	page_url: string | null;
	created_at: string;
	last_active_at: string;
};

export function sessionsQueryKey(agentId: string) {
	return ["sessions", agentId] as const;
}

export function useSessions(agentId: string | undefined) {
	return useQuery({
		queryKey: sessionsQueryKey(agentId ?? ""),
		queryFn: () =>
			api.get<SessionItem[]>(
				`/v1/sessions?agentId=${encodeURIComponent(agentId ?? "")}`,
			),
		enabled: Boolean(agentId),
	});
}
