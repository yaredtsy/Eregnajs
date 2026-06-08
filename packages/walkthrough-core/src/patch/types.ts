import type { Operation } from "fast-json-patch";

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
