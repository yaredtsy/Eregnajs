import { lookupRun } from "../runs/cache.js";
import { ResumeError } from "./errors.js";

export interface ResumeBody {
  runId: string;
  toolCallId: string;
  result?: unknown;
  error?: string;
  elapsedMs?: number;
}

/** Pre-stream validation for POST /agent/resume. */
export function validateResumeRequest(body: ResumeBody): void {
  const cached = lookupRun(body.runId);
  if (!cached) {
    throw new ResumeError("no-such-run", "no-such-run");
  }
  if (!cached.pendingToolCallId || cached.pendingToolCallId !== body.toolCallId) {
    throw new ResumeError("no-matching-pause", "no-matching-pause");
  }
}
