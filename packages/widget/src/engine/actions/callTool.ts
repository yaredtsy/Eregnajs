import { getTool, validateToolArgs } from "../../embed/hostTools.js";
import type { StepToolResult } from "../../types/conversation";

const TOOL_TIMEOUT_MS = 10_000;
const SUMMARY_MAX = 300;

function summarize(value: unknown): string {
  if (value === undefined) return "ok";
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length > SUMMARY_MAX ? `${s.slice(0, SUMMARY_MAX)}…` : s;
  } catch {
    return "ok";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error("tool timed out"), { code: "tool-timeout" })),
      ms,
    );
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Executes a host tool and records the outcome — never throws. The structured
// error contract ({code, hint}) feeds the notice card and, later, the
// tool-result round-trip (docs/v2 flows/02 §4).
export async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<StepToolResult> {
  const tool = getTool(toolName);
  if (!tool) {
    return { name: toolName, status: "error", summary: "unknown-tool" };
  }

  const invalid = await validateToolArgs(tool, args);
  if (invalid) {
    return { name: toolName, status: "error", summary: `invalid-args: ${invalid}`, hint: invalid };
  }

  try {
    const result = await withTimeout(Promise.resolve(tool.run(args)), TOOL_TIMEOUT_MS);
    return { name: toolName, status: "ok", summary: summarize(result) };
  } catch (err) {
    const e = err as { message?: string; code?: string; hint?: string };
    return {
      name: toolName,
      status: "error",
      summary: e.code ?? e.message ?? "tool failed",
      hint: e.hint,
    };
  }
}
