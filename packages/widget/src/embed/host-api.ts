import type { ToolSpec } from "./hostTools.js";

export interface HostApi {
  /** Inject/update host page state that the agent can read. */
  setState(partial: Record<string, unknown>): void;

  /** Register a callable tool the agent can invoke during a walkthrough. */
  registerTool(spec: ToolSpec): void;

  /** Ask the agent a question; opens the widget and starts a live run. */
  ask(query: string): Promise<void>;

  /**
   * Debug helper for tuning selectors (docs/v2/4-client/04 §3): resolves a
   * component key (or a raw selector query) against the live page, flashes
   * the match, and returns it. Console use only — not part of the stable API.
   */
  __debugResolve(
    keyOrQuery: string | { kind: "dom-id" | "css" | "text"; value: string; tag?: string },
  ): Element | null;
}
