import { getTool, validateToolArgs, type ApiToolSpec, type FnToolSpec } from "../../embed/hostTools.js";
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

function isFnTool(spec: FnToolSpec | ApiToolSpec): spec is FnToolSpec {
  return spec.kind !== "api";
}

function interpolate(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const v = args[key];
    return v === undefined || v === null ? "" : encodeURIComponent(String(v));
  });
}

function interpolateObject(
  obj: Record<string, unknown>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      out[k] = v.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
        const val = args[key];
        return val === undefined || val === null ? "" : String(val);
      });
    } else {
      out[k] = v;
    }
  }
  return out;
}

function assertSameOrigin(url: string): string {
  const resolved = new URL(url, window.location.href);
  if (resolved.origin !== window.location.origin) {
    throw Object.assign(new Error("api tool URL must be same-origin"), { code: "cross-origin" });
  }
  return resolved.toString();
}

async function runApiTool(spec: ApiToolSpec, args: Record<string, unknown>): Promise<unknown> {
  const url = assertSameOrigin(interpolate(spec.endpoint.url, args));
  const method = spec.endpoint.method;
  const headers = spec.endpoint.headers ?? {};
  const init: RequestInit = { method, headers };

  if (method === "POST" && spec.endpoint.bodyTemplate) {
    init.headers = { "Content-Type": "application/json", ...headers };
    init.body = JSON.stringify(interpolateObject(spec.endpoint.bodyTemplate, args));
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    throw Object.assign(new Error(`HTTP ${res.status}`), { code: `http-${res.status}` });
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

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
    const result = isFnTool(tool)
      ? await withTimeout(Promise.resolve(tool.run(args)), TOOL_TIMEOUT_MS)
      : await withTimeout(runApiTool(tool, args), TOOL_TIMEOUT_MS);
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
