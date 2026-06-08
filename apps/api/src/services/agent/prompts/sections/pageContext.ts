import type { PromptSection } from "../types.js";

export const pageContextSection: PromptSection = {
  name: "pageContext",
  render: (ctx) => {
    if (!ctx.page) return "";
    return `
## Current Page
- Title: ${ctx.page.title}
- Path: ${ctx.page.path}
${ctx.page.description ? `- Description: ${ctx.page.description}` : ""}
`.trim();
  },
};
