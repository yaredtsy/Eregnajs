import type { ToolSpec } from "./hostTools.js";
import type { PlaybackMode } from "./hostConfig.js";

export interface KnowledgeInput {
  id?: string;
  title: string;
  content: string;
}

export interface HostApi {
  setState(partial: Record<string, unknown>): void;
  registerTool(spec: ToolSpec): () => void;
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
