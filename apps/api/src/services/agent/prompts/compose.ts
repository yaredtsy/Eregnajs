import type { AgentContext } from "../context/types.js";
import type { PromptSection } from "./types.js";
import { rulesSection } from "./sections/rules.js";
import { customerOverlaySection } from "./sections/customerOverlay.js";
import { pageContextSection } from "./sections/pageContext.js";
import { elementsTreeSection } from "./sections/elementsTree.js";
import { hostStateSection } from "./sections/hostStateBlock.js";
import { hostToolsSection } from "./sections/hostToolsBlock.js";
import { knowledgeSection } from "./sections/knowledgeBlock.js";
import { estimateTokens } from "./util/budget.js";

const DEFAULT_SECTIONS: PromptSection[] = [
  rulesSection,
  customerOverlaySection,
  pageContextSection,
  elementsTreeSection,
  knowledgeSection,
  hostStateSection,
  hostToolsSection,
];

export interface PromptSectionInfo {
  name: string;
  text: string;
  charCount: number;
  tokenEstimate: number;
}

export function composeSystemPrompt(
  ctx: AgentContext,
  sections: PromptSection[] = DEFAULT_SECTIONS,
): string {
  return sections
    .map((s) => s.render(ctx))
    .filter(Boolean)
    .join("\n\n");
}

export function inspectPrompt(
  ctx: AgentContext,
  sections: PromptSection[] = DEFAULT_SECTIONS,
): { prompt: string; sections: PromptSectionInfo[]; charCount: number; tokenEstimate: number } {
  const sectionInfos: PromptSectionInfo[] = sections
    .map((s) => {
      const text = s.render(ctx);
      if (!text) return null;
      return {
        name: s.name,
        text,
        charCount: text.length,
        tokenEstimate: estimateTokens(text.length),
      };
    })
    .filter((s): s is PromptSectionInfo => s !== null);

  const prompt = sectionInfos.map((s) => s.text).join("\n\n");
  return {
    prompt,
    sections: sectionInfos,
    charCount: prompt.length,
    tokenEstimate: estimateTokens(prompt.length),
  };
}
