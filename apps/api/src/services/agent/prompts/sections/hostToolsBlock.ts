import type { PromptSection } from "../types.js";

export const hostToolsSection: PromptSection = {
  name: "hostTools",
  render: (ctx) => {
    if (!ctx.hostTools.length) return "";
    const list = ctx.hostTools
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join("\n");
    return `
## Available Host Tools
The following tools are callable via the \`call-tool\` action:
${list}
`.trim();
  },
};
