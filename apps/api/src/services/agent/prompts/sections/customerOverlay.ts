import type { PromptSection } from "../types.js";

export const customerOverlaySection: PromptSection = {
  name: "customerOverlay",
  render: (ctx) => {
    const prompt = ctx.agent.system_prompt?.trim();
    if (!prompt) return "";
    return `
## Agent Instructions (from operator)
${prompt}
`.trim();
  },
};
