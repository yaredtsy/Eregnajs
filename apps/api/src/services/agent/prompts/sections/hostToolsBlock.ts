import type { PromptSection } from "../types.js";
import { truncateText } from "../util/budget.js";

// ~1k tokens (docs/v2/3-server/01 §5)
const MAX_CHARS = 4000;

export const hostToolsSection: PromptSection = {
  name: "hostTools",
  render: (ctx) => {
    if (!ctx.hostTools.length) return "";
    const list = ctx.hostTools
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join("\n");
    const { text } = truncateText(list, MAX_CHARS);
    return `
## Available Host Tools
The host page registered these tools. **Call them with your tool-calling interface** when they can help — one at a time, then use the result in your reply. Do not tell the visitor to run tools manually.

${text}
`.trim();
  },
};
