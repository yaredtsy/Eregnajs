import { validateToolArgs, type ToolSpec } from "../../embed/hostTools.js";
import { getClientTool } from "./registry.js";

export interface ExecuteResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  elapsedMs: number;
}

function asToolSpec(tool: NonNullable<ReturnType<typeof getClientTool>>): ToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    validate: tool.validate,
    kind: "fn",
    run: tool.handler,
  };
}

/** Run a registered client tool handler; measure wall time; catch errors. */
export async function executeClientTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ExecuteResult> {
  const started = performance.now();
  const tool = getClientTool(name);
  if (!tool) {
    return {
      ok: false,
      error: `unknown client tool: ${name}`,
      elapsedMs: Math.round(performance.now() - started),
    };
  }

  const invalid = await validateToolArgs(asToolSpec(tool), args);
  if (invalid) {
    return {
      ok: false,
      error: invalid,
      elapsedMs: Math.round(performance.now() - started),
    };
  }

  try {
    const value = await tool.handler(args);
    return {
      ok: true,
      value,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      elapsedMs: Math.round(performance.now() - started),
    };
  }
}
