import type { AgentContext } from "../context/types.js";
import type { PromptSection } from "./types.js";
import { rulesSection } from "./sections/rules.js";
import { customerOverlaySection } from "./sections/customerOverlay.js";
import { pageContextSection } from "./sections/pageContext.js";
import { elementsTreeSection } from "./sections/elementsTree.js";
import { hostStateSection } from "./sections/hostStateBlock.js";
import { hostToolsSection } from "./sections/hostToolsBlock.js";

const DEFAULT_SECTIONS: PromptSection[] = [
  rulesSection,
  customerOverlaySection,
  pageContextSection,
  elementsTreeSection,
  hostStateSection,
  hostToolsSection,
];

export function composeSystemPrompt(
  ctx: AgentContext,
  sections: PromptSection[] = DEFAULT_SECTIONS,
): string {
  return sections
    .map((s) => s.render(ctx))
    .filter(Boolean)
    .join("\n\n");
}
