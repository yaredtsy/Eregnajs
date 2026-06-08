import type { Operation } from "fast-json-patch";
import type { StringAppendOp } from "@repo/walkthrough-core";
import { isStreamablePath } from "./streamablePaths.js";

export type { StringAppendOp };
export type WireOp = Operation | StringAppendOp;

// Stateful transformer: converts "replace" ops on streamable paths into
// "string-append" ops by tracking the previous string value per path.
export function makeTransformer(conv: object) {
  const prevValues = new Map<string, string>();

  return function transform(op: Operation): WireOp {
    if (
      op.op === "replace" &&
      typeof (op as { value?: unknown }).value === "string" &&
      isStreamablePath(op.path)
    ) {
      const newVal = (op as { value: string }).value;
      const prev = prevValues.get(op.path) ?? "";
      prevValues.set(op.path, newVal);
      if (newVal.startsWith(prev)) {
        return { op: "string-append", path: op.path, value: newVal.slice(prev.length) };
      }
    }
    return op;
  };
}
