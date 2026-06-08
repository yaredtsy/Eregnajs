import { useQuery } from "@tanstack/react-query";
import { api } from "#/lib/api";
import type { AgentRunListItem } from "#/lib/api-types";

export function agentRunsQueryKey(agentId: string) {
	return ["agent-runs", agentId] as const;
}

export function useAgentRuns(agentId: string | undefined) {
	return useQuery({
		queryKey: agentRunsQueryKey(agentId ?? ""),
		queryFn: () =>
			api.get<AgentRunListItem[]>(
				`/v1/agent/runs?agentId=${encodeURIComponent(agentId ?? "")}`,
			),
		enabled: Boolean(agentId),
		refetchInterval: 15_000,
	});
}
