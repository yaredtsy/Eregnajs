import type { PromptSection } from "../types.js";

export const pageElementsSummarySection: PromptSection = {
  name: "pageElementsSummary",
  render: (ctx) => {
    if (!ctx.elements.length) return "";
    const labels = ctx.elements
      .filter((e) => !!e.label)
      .map((e) => `"${e.label}"`)
      .join(", ");
    return `
## Elements on this page
The page has ${ctx.elements.length} registered elements: ${labels}.
Refer to them by these visible labels.
`.trim();
  },
};
