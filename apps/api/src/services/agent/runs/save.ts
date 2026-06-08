import { nanoid } from "nanoid";
import { getRunsDb } from "../../../lib/sqlite.js";
import type { SaveOpts } from "./types.js";

const STMT = `
  INSERT INTO agent_runs (
    id, agent_id, conversation_id, visitor_id, page_url, query,
    state_snapshot, patch_log, status, error_message,
    started_at, completed_at
  ) VALUES ($id, $agentId, $convId, $visId, $url, $query,
            $snap, $log, $status, $err,
            $startedAt, $completedAt)
`;

export function save(opts: SaveOpts): string {
  const db = getRunsDb();
  const id = nanoid(10);
  db.prepare(STMT).run({
    $id: id,
    $agentId: opts.agentId,
    $convId: opts.conversationId ?? null,
    $visId: opts.visitorId ?? null,
    $url: opts.pageUrl ?? null,
    $query: opts.query,
    $snap: JSON.stringify(opts.conversation),
    $log: JSON.stringify(opts.patchLog),
    $status: opts.status,
    $err: opts.errorMessage ?? null,
    $startedAt: opts.startedAt,
    $completedAt: Date.now(),
  });
  return id;
}
