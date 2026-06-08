import type { PromptSection } from "../types.js";

export const hostStateSection: PromptSection = {
  name: "hostState",
  render: (ctx) => {
    if (!Object.keys(ctx.hostState).length) return "";
    return `
## Host Page State
The host page has injected the following state for context:
\`\`\`json
${JSON.stringify(ctx.hostState, null, 2)}
\`\`\`
`.trim();
  },
};
