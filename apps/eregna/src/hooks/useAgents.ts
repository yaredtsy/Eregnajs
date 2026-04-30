import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import type {
	AgentListItem,
	CreateAgentBody,
	UpdateAgentBody,
} from "#/lib/api-types";

export const agentsQueryKey = ["agents"] as const;

export function agentQueryKey(id: string) {
	return ["agents", id] as const;
}

export function useAgents() {
	return useQuery({
		queryKey: agentsQueryKey,
		queryFn: () => api.get<AgentListItem[]>("/v1/agents"),
	});
}

export function useAgent(id: string | undefined) {
	return useQuery({
		queryKey: agentQueryKey(id ?? ""),
		queryFn: () => api.get<AgentListItem>(`/v1/agents/${id}`),
		enabled: Boolean(id),
	});
}

export function useCreateAgent() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: CreateAgentBody) =>
			api.post<AgentListItem>("/v1/agents", body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: agentsQueryKey });
		},
	});
}

export function useUpdateAgent(agentId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: UpdateAgentBody) =>
			api.patch<AgentListItem>(`/v1/agents/${agentId}`, body),
		onSuccess: (data) => {
			void qc.invalidateQueries({ queryKey: agentsQueryKey });
			void qc.setQueryData(agentQueryKey(agentId), data);
		},
	});
}
