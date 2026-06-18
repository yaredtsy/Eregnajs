import { getRunsDb } from "../../../lib/sqlite.js";
import type { AgentRunListItem } from "./types.js";
import type { TokenUsageReport } from "@repo/walkthrough-core";

const STMT = `
  SELECT id, agent_id, query, status, started_at, completed_at, token_usage
  FROM agent_runs
  WHERE agent_id = $agentId AND owner_id = $ownerId
  ORDER BY started_at DESC
  LIMIT $limit OFFSET $offset
`;

interface RawListRow {
  id: string;
  agent_id: string;
  query: string;
  status: AgentRunListItem["status"];
  started_at: number;
  completed_at: number | null;
  token_usage: string | null;
}

export function listByAgent(
  agentId: string,
  ownerId: string,
  limit = 50,
  offset = 0,
): AgentRunListItem[] {
  const rows = getRunsDb()
    .prepare(STMT)
    .all({
      $agentId: agentId,
      $ownerId: ownerId,
      $limit: limit,
      $offset: offset,
    }) as RawListRow[];

  return rows.map((row) => ({
    id: row.id,
    agent_id: row.agent_id,
    query: row.query,
    status: row.status,
    started_at: row.started_at,
    completed_at: row.completed_at,
    token_totals: row.token_usage
      ? (JSON.parse(row.token_usage) as TokenUsageReport).totals
      : null,
  }));
}
