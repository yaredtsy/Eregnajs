import { ToolValidationError, validateTools } from "./validate.js";
import type { WireToolDescriptor } from "./types.js";

export interface HostToolInput {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  runsIn?: "client" | "server";
  display?: WireToolDescriptor["display"];
}

function isV2Tool(tool: HostToolInput): boolean {
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
    runsIn: tool.runsIn,
    display: tool.display,
  };
}

/**
 * Validates v2 tool specs (JSON Schema parameters). Legacy prompt-only tools
 * without a parameters object pass through unchanged. M2: validated specs are
 * not yet bound to the agent.
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
