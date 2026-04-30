import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import type { PageItem, UpdatePageBody } from "#/lib/api-types";

export function pagesQueryKey(agentId: string) {
	return ["pages", agentId] as const;
}

export function usePages(agentId: string | undefined) {
	return useQuery({
		queryKey: pagesQueryKey(agentId ?? ""),
		queryFn: () =>
			api.get<PageItem[]>(
				`/v1/pages?agentId=${encodeURIComponent(agentId ?? "")}`,
			),
		enabled: Boolean(agentId),
	});
}

type CreatePageBody = {
	agent_id: string;
	parent_id?: string | null;
	title: string;
	url_pattern?: string | null;
	description?: string | null;
	sort_order?: number;
};

export function useCreatePage(agentId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: Omit<CreatePageBody, "agent_id">) =>
			api.post<PageItem>("/v1/pages", { agent_id: agentId, ...body }),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: pagesQueryKey(agentId) });
		},
	});
}

export function useUpdatePage(agentId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			pageId,
			body,
		}: {
			pageId: string;
			body: UpdatePageBody;
		}) => api.patch<PageItem>(`/v1/pages/${pageId}`, body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: pagesQueryKey(agentId) });
		},
	});
}

export function useDeletePage(agentId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (pageId: string) => api.delete(`/v1/pages/${pageId}`),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: pagesQueryKey(agentId) });
		},
	});
}
