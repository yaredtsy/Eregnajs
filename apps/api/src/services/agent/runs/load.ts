import { getRunsDb } from "../../../lib/sqlite.js";
import type { AgentRunRow } from "./types.js";

interface RawRow {
  id: string;
  agent_id: string;
  conversation_id: string | null;
  visitor_id: string | null;
  page_url: string | null;
  query: string;
  state_snapshot: string;
  patch_log: string;
  status: string;
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
}

const STMT = "SELECT * FROM agent_runs WHERE id = $id";

export function load(id: string): AgentRunRow | null {
  const row = getRunsDb().prepare(STMT).get({ $id: id }) as RawRow | undefined;
  if (!row) return null;
  return {
    ...row,
    status: row.status as AgentRunRow["status"],
    state_snapshot: JSON.parse(row.state_snapshot) as AgentRunRow["state_snapshot"],
    patch_log: JSON.parse(row.patch_log) as AgentRunRow["patch_log"],
  };
}
