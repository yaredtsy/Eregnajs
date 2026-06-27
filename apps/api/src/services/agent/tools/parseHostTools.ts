import { ToolValidationError, validateTools } from "./validate.js";
import type { ToolDescriptor, WireToolDescriptor } from "./types.js";

export interface HostToolInput {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  runsIn?: "client" | "server";
  display?: WireToolDescriptor["display"];
}

export function isV2Tool(tool: HostToolInput): boolean {
  return (
    typeof tool.parameters === "object" &&
    tool.parameters !== null &&
    tool.parameters.type === "object"
  );
}

function toWire(tool: HostToolInput): WireToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as WireToolDescriptor["parameters"],
    runsIn: tool.runsIn ?? "client",
    display: tool.display,
  };
}

/** Map validated host tools to ToolDescriptor v2 for agent binding. */
export function extractToolSpecs(tools: HostToolInput[] | undefined): ToolDescriptor[] {
  if (!tools?.length) return [];
  return tools.filter(isV2Tool).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as ToolDescriptor["parameters"],
    runsIn: t.runsIn ?? "client",
    display: t.display,
  }));
}

/**
 * Validates v2 tool specs (JSON Schema parameters). Legacy prompt-only tools
 * without a parameters object pass through unchanged.
 */
export function parseHostTools(tools: HostToolInput[] | undefined): HostToolInput[] {
  if (!tools?.length) return [];

  const v2 = tools.filter(isV2Tool);
  if (!v2.length) return tools;

  try {
    validateTools(v2.map(toWire));
  } catch (err) {
    if (err instanceof ToolValidationError) throw err;
    throw err;
  }

  return tools;
}
