import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AgentListItem, CreateAgentBody } from '#/lib/api-types'
import { api } from '#/lib/api'

export const agentsQueryKey = ['agents'] as const

export function useAgents() {
  return useQuery({
    queryKey: agentsQueryKey,
    queryFn: () => api.get<AgentListItem[]>('/v1/agents'),
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAgentBody) => api.post<AgentListItem>('/v1/agents', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentsQueryKey })
    },
  })
}
