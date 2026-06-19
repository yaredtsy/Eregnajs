import type { ToolSpec } from "./hostTools.js";
import type { ClientToolSpec } from "../chat/tools/types.js";
import type { PlaybackMode } from "./hostConfig.js";

export interface KnowledgeInput {
  id?: string;
  title: string;
  content: string;
}

export interface HostApi {
  setState(partial: Record<string, unknown>): void;
  registerTool(spec: ToolSpec): () => void;
  /** Register a client-side tool (v2 — runs in the browser, `runsIn: "client"`). */
  registerClientTool(spec: ClientToolSpec): () => void;
  addKnowledge(entry: KnowledgeInput): () => void;
  configure(opts: {
    redactKeys?: string[];
    defaultPlayback?: PlaybackMode;
  }): void;
  ask(query: string): Promise<void>;
  open(): void;
  close(): void;
  stop(): void;
  readonly ready: boolean;
  onReady(cb: () => void): () => void;
  __debugResolve(
    keyOrQuery: string | { kind: "dom-id" | "css" | "text"; value: string; tag?: string },
  ): Element | null;
}
