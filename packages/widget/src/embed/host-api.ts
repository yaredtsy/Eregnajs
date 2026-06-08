import type { ToolSpec } from "./hostTools.js";

export interface HostApi {
  /** Inject/update host page state that the agent can read. */
  setState(partial: Record<string, unknown>): void;

  /** Register a callable tool the agent can invoke during a walkthrough. */
  registerTool(spec: ToolSpec): void;

  /** Ask the agent a question; opens the widget and starts a live run. */
  ask(query: string): Promise<void>;
}
