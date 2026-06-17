/** Shapes returned by `apps/api` for the dashboard. */

export type AgentModel = "gpt-4o-mini" | "gpt-4o" | "claude-3-5-haiku";

export type AgentListItem = {
	id: string;
	owner_id: string;
	name: string;
	description: string | null;
	website_url: string;
	public_id: string;
	secret_key: string;
	model: string;
	system_prompt: string | null;
	is_active: boolean;
	allowed_origins: string[];
	created_at: string;
	updated_at: string;
	page_count: number;
};

export type CreateAgentBody = {
	name: string;
	website_url: string;
	description?: string | null;
	model?: AgentModel;
	system_prompt?: string | null;
};

export type UpdateAgentBody = {
	name?: string;
	description?: string | null;
	model?: AgentModel;
	system_prompt?: string | null;
	is_active?: boolean;
	allowed_origins?: string[];
};

export type PageItem = {
	id: string;
	agent_id: string;
	path: string;
	parent_id: string | null;
	title: string;
	url_pattern: string | null;
	description: string | null;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

export type UpdatePageBody = {
	title?: string;
	url_pattern?: string | null;
	description?: string | null;
	sort_order?: number;
};

export type SelectorQuery = {
	kind: "dom-id" | "css" | "text";
	value: string;
	tag?: string;
};

export type ElementItem = {
	id: string;
	page_id: string;
	path: string;
	parent_id: string | null;
	label: string;
	key: string;
	selectors: SelectorQuery[];
	dom_id: string | null;
	css_selector: string | null;
	xpath: string | null;
	description: string | null;
	notes: string | null;
	sort_order: number;
	has_embedding: boolean;
	created_at: string;
	updated_at: string;
};

export type CreateElementBody = {
	page_id: string;
	parent_id?: string | null;
	label: string;
	key?: string;
	selectors?: SelectorQuery[];
	dom_id?: string | null;
	css_selector?: string | null;
	description?: string | null;
	notes?: string | null;
	sort_order?: number;
};

export type UpdateElementBody = {
	label?: string;
	key?: string;
	selectors?: SelectorQuery[];
	dom_id?: string | null;
	css_selector?: string | null;
	description?: string | null;
	notes?: string | null;
	sort_order?: number;
};

export type SiteFactItem = {
	id: string;
	agent_id: string;
	title: string;
	content: string;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

export type CreateSiteFactBody = {
	agent_id: string;
	title: string;
	content: string;
	sort_order?: number;
};

export type UpdateSiteFactBody = {
	title?: string;
	content?: string;
	sort_order?: number;
};

export type RunStatus = "streaming" | "complete" | "aborted" | "error";

export type AgentRunListItem = {
	id: string;
	agent_id: string;
	query: string;
	status: RunStatus;
	started_at: number;
	completed_at: number | null;
};
