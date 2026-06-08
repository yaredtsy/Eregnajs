import type { AgentContext } from "../context/types.js";

export interface PromptSection {
  name: string;
  render(ctx: AgentContext): string;
}
