import type { Operation } from "../lib/fastJsonPatch.js";

export type JsonPatchOp = Operation;

// Custom op that appends to a string field instead of replacing it.
// The server emits this for streamable paths (text parts, popover body).
export interface StringAppendOp {
  op: "string-append";
  path: string;
  value: string;
}

// Everything that can appear in a PatchFrame over the wire.
export type WireOp = JsonPatchOp | StringAppendOp;

export interface PatchFrame {
  seq: number;
  ops: WireOp[];
}

export function isStringAppend(op: WireOp): op is StringAppendOp {
  return (op as StringAppendOp).op === "string-append";
}

// ---------------------------------------------------------------------------
// Run envelope — the three NDJSON frame kinds (docs/v2/2-system/02-contracts.md §5)
// ---------------------------------------------------------------------------

import type { Conversation } from "../conversation/types.js";

export const WIRE_PROTOCOL = 2;

// Always the first line: gives the client the document patches apply onto.
export interface HelloFrame {
  kind: "hello";
  runId: string;
  protocol: number;
  conversation: Conversation;
}

export interface PatchRunFrame extends PatchFrame {
  kind: "patch";
}

// Always the last line, even on failure — the client must never hang.
export interface EndFrame {
  kind: "end";
  seq: number;
  status: "complete" | "error";
  message?: string;
}

export type RunFrame = HelloFrame | PatchRunFrame | EndFrame;
