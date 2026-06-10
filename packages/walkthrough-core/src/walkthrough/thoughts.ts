// Structured reasoning summaries (docs/v2/2-system/02-contracts.md §3).
// Subagents are asked to produce these — never raw chain-of-thought dumps.

export type ThoughtPhase = "plan" | "chapter" | "step" | "tool" | "system";

export interface Thought {
  id: string;
  phase: ThoughtPhase;
  label: string;        // one line, ticker-sized
  detail?: string;      // optional expansion, streamed via string-append
  chapterIndex?: number;
  ts: number;
}
