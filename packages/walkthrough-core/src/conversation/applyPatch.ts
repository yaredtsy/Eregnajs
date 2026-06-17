import { applyOperation } from "../lib/fastJsonPatch.js";
import type { Conversation } from "./types.js";
import type { WireOp, PatchFrame } from "../patch/types.js";
import { isStringAppend } from "../patch/types.js";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function parsePath(pointer: string): string[] {
  return pointer.split("/").filter(Boolean);
}

function getAtPath(root: unknown, path: string[]): unknown {
  let cur = root;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

// Structural sharing: returns a new root where only the nodes on `path` are
// cloned. Everything else is the same reference — React's reconciler can skip
// unchanged subtrees by reference equality.
function setAtPath<T>(root: T, path: string[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [key, ...rest] = path;
  if (Array.isArray(root)) {
    // RFC 6902: "-" means append to array
    const idx = key === "-" ? root.length : Number(key);
    const copy = root.slice() as unknown[];
    copy[idx] = rest.length === 0 ? value : setAtPath(root[idx], rest, value);
    return copy as unknown as T;
  }
  const obj = root as Record<string, unknown>;
  return {
    ...obj,
    [key!]:
      rest.length === 0 ? value : setAtPath(obj[key!], rest, value),
  } as T;
}

function removeAtPath<T>(root: T, path: string[]): T {
  if (path.length === 0) return root;
  const [key, ...rest] = path;
  if (Array.isArray(root)) {
    const idx = Number(key);
    if (rest.length === 0) {
      const copy = root.slice();
      copy.splice(idx, 1);
      return copy as unknown as T;
    }
    const copy = root.slice() as unknown[];
    copy[idx] = removeAtPath(root[idx], rest);
    return copy as unknown as T;
  }
  const obj = root as Record<string, unknown>;
  if (rest.length === 0) {
    const copy = { ...obj };
    delete copy[key!];
    return copy as T;
  }
  return { ...obj, [key!]: removeAtPath(obj[key!], rest) } as T;
}

// ---------------------------------------------------------------------------
// Server-side: mutating apply (used with fast-json-patch observe/generate)
// ---------------------------------------------------------------------------

// Applies ops in place. Caller owns the document and mutation is intentional
// (the server uses this on a dedicated mirror that the observer watches).
export function applyOps(conversation: Conversation, ops: WireOp[]): void {
  for (const op of ops) {
    if (isStringAppend(op)) {
      const path = parsePath(op.path);
      const current = getAtPath(conversation, path);
      const next = typeof current === "string" ? current + op.value : op.value;
      setByPathMutate(conversation, path, next);
    } else {
      applyOperation(conversation as unknown as object, op, false, true);
    }
  }
}

// Mutating path-set (for applyOps above, where mutation is intentional).
function setByPathMutate(doc: unknown, path: string[], value: unknown): void {
  let cur = doc as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur[path[i]!] as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (last !== undefined) cur[last] = value;
}

// ---------------------------------------------------------------------------
// Client-side: immutable apply (used in the React reducer)
// ---------------------------------------------------------------------------

// Applies a PatchFrame and returns a new Conversation via structural sharing.
// Only objects on the modified path are cloned; unchanged subtrees keep their
// reference so React can skip reconciliation for them.
export function applyPatchFrame(
  conversation: Conversation,
  frame: PatchFrame,
): Conversation {
  let result: Conversation = conversation;

  for (const op of frame.ops) {
    const path = parsePath(op.path);

    if (isStringAppend(op)) {
      const current = getAtPath(result, path);
      const next = typeof current === "string" ? current + op.value : op.value;
      result = setAtPath(result, path, next) as Conversation;
    } else if (op.op === "add" || op.op === "replace") {
      result = setAtPath(result, path, (op as { value: unknown }).value) as Conversation;
    } else if (op.op === "remove") {
      result = removeAtPath(result, path) as Conversation;
    }
    // move / copy / test are not emitted by our patcher — ignored.
  }

  return result;
}
