import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "#/lib/api";
import type {
	CreateElementBody,
	ElementItem,
	UpdateElementBody,
} from "#/lib/api-types";

export function elementsQueryKey(pageId: string) {
	return ["elements", pageId] as const;
}

export function useElements(pageId: string | undefined) {
	return useQuery({
		queryKey: elementsQueryKey(pageId ?? ""),
		queryFn: () =>
			api.get<ElementItem[]>(
				`/v1/elements?pageId=${encodeURIComponent(pageId ?? "")}`,
			),
		enabled: Boolean(pageId),
	});
}

export function useCreateElement(pageId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: Omit<CreateElementBody, "page_id">) =>
			api.post<ElementItem>("/v1/elements", { page_id: pageId, ...body }),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: elementsQueryKey(pageId) });
		},
	});
}

export function useUpdateElement(pageId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			elementId,
			body,
		}: {
			elementId: string;
			body: UpdateElementBody;
		}) => api.patch<ElementItem>(`/v1/elements/${elementId}`, body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: elementsQueryKey(pageId) });
		},
	});
}

export function useDeleteElement(pageId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (elementId: string) => api.delete(`/v1/elements/${elementId}`),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: elementsQueryKey(pageId) });
		},
	});
}
