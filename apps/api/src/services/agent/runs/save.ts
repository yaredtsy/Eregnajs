import { getRunsDb } from "../../../lib/sqlite.js";
import type { SaveOpts } from "./types.js";

const STMT = `
  INSERT INTO agent_runs (
    id, agent_id, owner_id, conversation_id, visitor_id, page_url, query,
    state_snapshot, patch_log, status, error_message,
    started_at, completed_at
  ) VALUES ($id, $agentId, $ownerId, $convId, $visId, $url, $query,
            $snap, $log, $status, $err,
            $startedAt, $completedAt)
`;

export function save(opts: SaveOpts): string {
  const db = getRunsDb();
  db.prepare(STMT).run({
    $id: opts.id,
    $agentId: opts.agentId,
    $ownerId: opts.ownerId,
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
  return opts.id;
}
