import { getRunsDb } from "../../../lib/sqlite.js";
import type { AgentRunListItem } from "./types.js";

const STMT = `
  SELECT id, agent_id, query, status, started_at, completed_at
  FROM agent_runs
  WHERE agent_id = $agentId AND owner_id = $ownerId
  ORDER BY started_at DESC
  LIMIT $limit OFFSET $offset
`;

export function listByAgent(
  agentId: string,
  ownerId: string,
  limit = 50,
  offset = 0,
): AgentRunListItem[] {
  return getRunsDb()
    .prepare(STMT)
    .all({
      $agentId: agentId,
      $ownerId: ownerId,
      $limit: limit,
      $offset: offset,
    }) as AgentRunListItem[];
}
