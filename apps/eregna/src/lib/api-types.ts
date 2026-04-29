/** Shapes returned by `apps/api` for the dashboard. */

export type AgentModel = 'gpt-4o-mini' | 'gpt-4o' | 'claude-3-5-haiku'

export type AgentListItem = {
  id: string
  owner_id: string
  name: string
  description: string | null
  website_url: string
  public_id: string
  secret_key: string
  model: string
  system_prompt: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  page_count: number
}

export type CreateAgentBody = {
  name: string
  website_url: string
  description?: string | null
  model?: AgentModel
  system_prompt?: string | null
}
