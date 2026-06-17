import type { Database } from "@repo/db/types";

export type AgentRow   = Database["public"]["Tables"]["agents"]["Row"];
export type PageRow    = Database["public"]["Tables"]["pages"]["Row"];
export type ElementRow = Database["public"]["Tables"]["elements"]["Row"];

export interface ToolDescriptor {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

// Free-text knowledge: dashboard "site facts" and runtime entries injected by
// the host script. Same shape, different origin — the prompt tags the source.
export interface KnowledgeEntry {
  title: string;
  content: string;
  source: "dashboard" | "page";
}

export interface AgentContext {
  agent:     AgentRow;
  page:      PageRow | null;
  elements:  ElementRow[];
  siteFacts: KnowledgeEntry[];
  hostState: Record<string, unknown>;
  hostTools: ToolDescriptor[];
  hostKnowledge: KnowledgeEntry[];
  conversationHistory: string;  // pre-serialised prior messages for the prompt
}

// A focused view of context for a single chapter, built by focusChapter().
export interface ChapterContext {
  targetElement: ElementRow | null;
  siblingElements: ElementRow[];
  parentElements: ElementRow[];
}
