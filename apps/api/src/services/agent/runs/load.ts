import { getRunsDb } from "../../../lib/sqlite.js";
import type { AgentRunRow } from "./types.js";
import type { TokenUsageReport } from "@repo/walkthrough-core";

interface RawRow {
  id: string;
  agent_id: string;
  owner_id: string | null;
  conversation_id: string | null;
  visitor_id: string | null;
  page_url: string | null;
  query: string;
  state_snapshot: string;
  patch_log: string;
  status: string;
  error_message: string | null;
  token_usage: string | null;
  started_at: number;
  completed_at: number | null;
}

// Ownership-scoped on purpose: there is no load-by-id-alone. Runs are only
// readable by the owner of the agent that produced them.
const STMT = "SELECT * FROM agent_runs WHERE id = $id AND owner_id = $ownerId";

export function load(id: string, ownerId: string): AgentRunRow | null {
  const row = getRunsDb()
    .prepare(STMT)
    .get({ $id: id, $ownerId: ownerId }) as RawRow | undefined;
  if (!row) return null;
  return {
    ...row,
    status: row.status as AgentRunRow["status"],
    state_snapshot: JSON.parse(row.state_snapshot) as AgentRunRow["state_snapshot"],
    patch_log: JSON.parse(row.patch_log) as AgentRunRow["patch_log"],
    token_usage: row.token_usage
      ? (JSON.parse(row.token_usage) as TokenUsageReport)
      : null,
  };
}
