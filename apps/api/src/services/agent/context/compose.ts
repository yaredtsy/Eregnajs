import { createServerClient } from "@repo/db/client";
import type { AgentContext, KnowledgeEntry } from "./types.js";
import { matchUrl } from "./util/matchUrl.js";

export interface ComposeContextOpts {
  agentPublicId: string;
  pageUrl: string;
  hostState: Record<string, unknown>;
  hostTools: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  hostKnowledge?: Array<{ title: string; content: string }>;
}

export async function composeContext(opts: ComposeContextOpts): Promise<AgentContext> {
  const db = createServerClient();

  // 1. Resolve agent by public_id
  const { data: agent, error: agentErr } = await db
    .from("agents")
    .select("*")
    .eq("public_id", opts.agentPublicId)
    .single();

  if (agentErr || !agent) {
    throw new Error(`Agent not found: ${opts.agentPublicId}`);
  }

  // 2. Find the best-matching page for the current URL
  const { data: pages } = await db
    .from("pages")
    .select("*")
    .eq("agent_id", agent.id)
    .order("sort_order");

  const page =
    pages?.find((p) => matchUrl(p.url_pattern, opts.pageUrl)) ??
    pages?.[0] ??
    null;

  // 3. Load all elements for this page
  const elements =
    page
      ? (
          await db
            .from("elements")
            .select("*")
            .eq("page_id", page.id)
            .order("sort_order")
        ).data ?? []
      : [];

  // 4. Agent-wide site facts. Tolerant of a database that predates the
  // knowledge_v2 migration (missing table → empty list, never a dead run).
  let siteFacts: KnowledgeEntry[] = [];
  try {
    const { data: facts } = await db
      .from("site_facts")
      .select("title, content, sort_order")
      .eq("agent_id", agent.id)
      .order("sort_order");
    siteFacts = (facts ?? []).map((f) => ({
      title: f.title,
      content: f.content,
      source: "dashboard" as const,
    }));
  } catch {
    siteFacts = [];
  }

  const hostKnowledge: KnowledgeEntry[] = (opts.hostKnowledge ?? []).map((k) => ({
    title: k.title,
    content: k.content,
    source: "page" as const,
  }));

  return {
    agent,
    page,
    elements,
    siteFacts,
    hostState: opts.hostState,
    hostTools: opts.hostTools,
    hostKnowledge,
    conversationHistory: [],
  };
}
