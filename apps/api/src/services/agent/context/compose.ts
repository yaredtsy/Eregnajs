import { createServerClient } from "@repo/db/client";
import type { AgentContext } from "./types.js";
import { matchUrl } from "./util/matchUrl.js";

export interface ComposeContextOpts {
  agentPublicId: string;
  pageUrl: string;
  hostState: Record<string, unknown>;
  hostTools: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
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

  return {
    agent,
    page,
    elements,
    hostState: opts.hostState,
    hostTools: opts.hostTools,
    conversationHistory: "",  // MVP: fresh session each call
  };
}
