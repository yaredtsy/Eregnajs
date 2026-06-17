import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import type {
	CreateSiteFactBody,
	SiteFactItem,
	UpdateSiteFactBody,
} from "#/lib/api-types";

export function factsQueryKey(agentId: string) {
	return ["facts", agentId] as const;
}

export function useSiteFacts(agentId: string | undefined) {
	return useQuery({
		queryKey: factsQueryKey(agentId ?? ""),
		queryFn: () =>
			api.get<SiteFactItem[]>(
				`/v1/facts?agentId=${encodeURIComponent(agentId ?? "")}`,
			),
		enabled: Boolean(agentId),
	});
}

export function useCreateSiteFact(agentId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: Omit<CreateSiteFactBody, "agent_id">) =>
			api.post<SiteFactItem>("/v1/facts", { agent_id: agentId, ...body }),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: factsQueryKey(agentId) });
		},
	});
}

export function useUpdateSiteFact(agentId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			factId,
			body,
		}: {
			factId: string;
			body: UpdateSiteFactBody;
		}) => api.patch<SiteFactItem>(`/v1/facts/${factId}`, body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: factsQueryKey(agentId) });
		},
	});
}

export function useDeleteSiteFact(agentId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (factId: string) => api.delete(`/v1/facts/${factId}`),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: factsQueryKey(agentId) });
		},
	});
}
