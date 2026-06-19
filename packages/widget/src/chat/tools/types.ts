import type { ToolValidator } from "../../embed/hostTools.js";

export interface ClientToolDisplay {
  icon?: string;
  label?: string;
  showArgs?: boolean;
  showResult?: boolean;
}

/** Host-declared client tool (handler stays in the browser). */
export interface ClientToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  runsIn?: "client";
  handler: (args: Record<string, unknown>) => unknown | Promise<unknown>;
  display?: ClientToolDisplay;
  validate?: ToolValidator;
}

export interface RegisteredClientTool extends ClientToolSpec {
  runsIn: "client";
}

/** Wire shape sent to POST /agent/run (no handler). */
export interface ClientToolWireDescriptor {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  runsIn: "client";
  display?: ClientToolDisplay;
}

export type ToolCallStatus = "pending" | "running" | "done" | "error";

export interface ToolCallUiState {
  toolCallId: string;
  messageId: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
  elapsedMs?: number;
  display?: ClientToolDisplay;
}
